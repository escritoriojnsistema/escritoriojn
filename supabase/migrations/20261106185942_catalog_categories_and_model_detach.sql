-- Catalog associations are current metadata; archived services, offerings,
-- immutable commands, request/document snapshots and prices remain stored.
CREATE TABLE private.document_offering_detachments (
 office_id uuid NOT NULL,template_id uuid NOT NULL,service_id uuid NOT NULL,
 offer_revision integer NOT NULL CHECK(offer_revision>0),detached_at timestamptz NOT NULL,
 offering_snapshot jsonb NOT NULL CHECK(jsonb_typeof(offering_snapshot)='object'),
 PRIMARY KEY(office_id,template_id,offer_revision),
 FOREIGN KEY(office_id,template_id) REFERENCES public.templates(office_id,id) ON DELETE RESTRICT,
 FOREIGN KEY(office_id,service_id) REFERENCES public.services(office_id,id) ON DELETE RESTRICT
);
CREATE INDEX document_offering_detachments_service_idx ON private.document_offering_detachments(office_id,service_id);
ALTER TABLE private.document_offering_detachments ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON private.document_offering_detachments FROM PUBLIC,anon,authenticated,service_role;
CREATE TRIGGER document_offering_detachments_immutable BEFORE UPDATE OR DELETE ON private.document_offering_detachments
 FOR EACH ROW EXECUTE FUNCTION private.templates_immutable20();
-- Serialize service archival across backfill and trigger installation.
-- The migration transaction must not miss an archive between these operations.
LOCK TABLE public.services IN SHARE ROW EXCLUSIVE MODE;
-- Repair current metadata for already archived services without restoring them.
INSERT INTO private.document_offering_detachments
 SELECT o.office_id,o.template_id,o.service_id,o.revision,s.archived_at,to_jsonb(o)
 FROM private.document_offerings o JOIN public.services s ON s.office_id=o.office_id AND s.id=o.service_id
 WHERE s.archived_at IS NOT NULL;
CREATE FUNCTION private.document_offer_is_linked(o private.document_offerings) RETURNS boolean
LANGUAGE sql STABLE SECURITY INVOKER SET search_path='' AS $$
 SELECT o.template_id IS NOT NULL AND NOT EXISTS(SELECT FROM private.document_offering_detachments d
 WHERE d.office_id=o.office_id AND d.template_id=o.template_id AND d.offer_revision=o.revision)
 AND EXISTS(SELECT FROM public.services s WHERE s.office_id=o.office_id AND s.id=o.service_id AND s.archived_at IS NULL);
$$;
CREATE FUNCTION private.document_offerings_detach_archived_service() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
BEGIN
 INSERT INTO private.document_offering_detachments
 SELECT o.office_id,o.template_id,o.service_id,o.revision,NEW.archived_at,to_jsonb(o)
 FROM private.document_offerings o WHERE o.office_id=NEW.office_id AND o.service_id=NEW.id
 ON CONFLICT DO NOTHING;
 RETURN NEW;
END $$;
CREATE TRIGGER document_offerings_detach_archived_service AFTER UPDATE OF archived_at ON public.services
 FOR EACH ROW WHEN(NEW.archived_at IS NOT NULL AND OLD.archived_at IS NULL)
 EXECUTE FUNCTION private.document_offerings_detach_archived_service();
REVOKE ALL ON FUNCTION private.document_offer_is_linked(private.document_offerings),private.document_offerings_detach_archived_service() FROM PUBLIC,anon,authenticated,service_role;

DO $m$ DECLARE n text;s text;updated text;BEGIN
 -- Both forms/catalogs and the booking transaction consume these gates.
 FOREACH n IN ARRAY ARRAY['document_offer_projection','document_staff_offer_projection'] LOOP
 SELECT pg_get_functiondef(p.oid) INTO s FROM pg_proc p WHERE p.pronamespace='private'::regnamespace AND p.proname=n;
 updated:=replace(s,'BEGIN','BEGIN IF NOT private.document_offer_is_linked(o) THEN RETURN NULL;END IF;');
 updated:=replace(updated,'IF tv.id IS NULL OR sv.id IS NULL',
 'IF NOT EXISTS(SELECT FROM private.service_categories c WHERE c.office_id=o.office_id AND c.id=private.service_category_id(o.office_id,sv.id) AND c.archived_at IS NULL) OR tv.id IS NULL OR sv.id IS NULL');
 IF updated=s THEN RAISE EXCEPTION 'offer projection patch missing';END IF;EXECUTE updated;
 END LOOP;
 SELECT pg_get_functiondef('private.document_offer_manage(uuid,uuid,jsonb,integer,uuid)'::regprocedure) INTO s;
 updated:=replace(s,'IF t.id IS NULL OR s.id IS NULL THEN','IF t.id IS NULL OR s.id IS NULL OR s.archived_at IS NOT NULL THEN');
 IF updated=s THEN RAISE EXCEPTION 'offer service lifecycle patch missing';END IF;EXECUTE updated;
 SELECT pg_get_functiondef('private.model_commercial_state(uuid,uuid)'::regprocedure) INTO s;
 updated:=replace(s,'''offer'',CASE WHEN o.template_id IS NULL THEN NULL',
 '''offer_revision'',coalesce(o.revision,0),''offer'',CASE WHEN NOT private.document_offer_is_linked(o) THEN NULL');
 IF updated=s THEN RAISE EXCEPTION 'model commercial association patch missing';END IF;EXECUTE updated;
 -- Catalog categories use only central, active records, including zero counts.
 SELECT pg_get_functiondef('private.document_offers_page(uuid,uuid,boolean,text,integer,integer,text)'::regprocedure) INTO s;
 updated:=replace(s,'WHERE office_id=p_office_id AND id=chosen)', 'WHERE office_id=p_office_id AND id=chosen AND archived_at IS NULL)');
 updated:=replace(updated,'WHERE c.office_id=p_office_id)', 'WHERE c.office_id=p_office_id AND c.archived_at IS NULL)');
 IF updated=s THEN RAISE EXCEPTION 'catalog category lifecycle patch missing';END IF;EXECUTE updated;
END$m$;

-- Attaching a detached model uses its retained revision, so earlier booking
-- payloads cannot become valid again. Existing links require explicit editing.
CREATE OR REPLACE FUNCTION private.document_offer_attach(p_office_id uuid,p_service_id uuid,p_template_id uuid,p_idempotency_key uuid) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE actor uuid;t public.templates;s public.services;o private.document_offerings;c private.document_offering_commands;expected integer;item jsonb;BEGIN
 actor:=private.templates_actor20(p_office_id,'templates.manage');
 IF NOT EXISTS(SELECT FROM public.memberships WHERE office_id=p_office_id AND user_id=actor AND active AND role_code IN('owner','admin')) OR NOT private.current_permissions(p_office_id) @> ARRAY['services.read','services.manage'] THEN RAISE EXCEPTION 'TEMPLATES_FORBIDDEN' USING ERRCODE='PT403';END IF;
 IF p_service_id IS NULL OR p_template_id IS NULL OR p_idempotency_key IS NULL THEN RAISE EXCEPTION 'TEMPLATES_VALIDATION' USING ERRCODE='PT422';END IF;
 SELECT * INTO t FROM public.templates WHERE office_id=p_office_id AND id=p_template_id FOR UPDATE;
 SELECT * INTO s FROM public.services WHERE office_id=p_office_id AND id=p_service_id FOR SHARE;
 IF s.id IS NULL OR s.archived_at IS NOT NULL OR t.id IS NULL THEN RAISE EXCEPTION 'TEMPLATE_NOT_FOUND' USING ERRCODE='PT404';END IF;
 SELECT * INTO o FROM private.document_offerings WHERE office_id=p_office_id AND template_id=p_template_id FOR UPDATE;
 SELECT * INTO c FROM private.document_offering_commands WHERE office_id=p_office_id AND actor_id=actor AND idempotency_key=p_idempotency_key;
 IF c.idempotency_key IS NULL AND private.document_offer_is_linked(o) THEN RAISE EXCEPTION 'TEMPLATE_CONFLICT' USING ERRCODE='PT409';END IF;
 expected:=CASE WHEN c.idempotency_key IS NOT NULL THEN c.expected_revision ELSE coalesce(o.revision,0) END;
 PERFORM private.document_offer_manage(p_office_id,p_template_id,jsonb_build_object('service_id',p_service_id,'instructions','','execution_level',1,'portal_enabled',true,'intake_keys','[]'::jsonb,'required_intake_keys','[]'::jsonb,'allow_self_approval',false),expected,p_idempotency_key);
 SELECT private.document_offer_projection(v,clock_timestamp()) INTO item FROM private.document_offerings v WHERE v.office_id=p_office_id AND v.template_id=p_template_id;
 IF item IS NULL OR item->>'service_id'<>p_service_id::text THEN RAISE EXCEPTION 'TEMPLATE_CONFLICT' USING ERRCODE='PT409';END IF;
 RETURN item;
END $$;

-- Archived category rows remain editable to maintain historical references;
-- only authorized managers receive them, separate from active pickers.
DO $m$ DECLARE s text;updated text;BEGIN
 SELECT pg_get_functiondef('private.service_categories_state(uuid)'::regprocedure) INTO s;
 updated:=replace(s,'''can_manage'',manageable)',
 '''archived_items'',CASE WHEN manageable THEN coalesce((SELECT jsonb_agg(jsonb_build_object(''id'',c.id,''name'',c.name,''revision'',c.revision,''execution_level'',c.execution_level,''is_documents'',coalesce(c.system_key=''documents'',false),''archived_at'',c.archived_at,''created_at'',c.created_at,''services'',(SELECT count(DISTINCT v.service_id) FROM private.service_version_categories v WHERE v.office_id=c.office_id AND v.category_id=c.id)) ORDER BY c.name,c.id) FROM private.service_categories c WHERE c.office_id=p_office_id AND c.archived_at IS NOT NULL),''[]''::jsonb) ELSE ''[]''::jsonb END,''can_manage'',manageable)');
 IF updated=s THEN RAISE EXCEPTION 'category management archive patch missing';END IF;EXECUTE updated;
END$m$;
NOTIFY pgrst,'reload schema';
