-- Etapa Smart Documents Engine: universal dynamic forms, multi-party PT-BR agreement,
-- non-blocking pendencies, conference workflow, post-completion client corrections,
-- authorized courtesy (zero fake cash revenue), and presencial manual reading logs.

-- 1. Align DB input & multi-party limits with shared/documents.ts
CREATE OR REPLACE FUNCTION private.documents_input21(i jsonb,d jsonb) RETURNS void LANGUAGE plpgsql IMMUTABLE SECURITY INVOKER SET search_path='' AS $$
BEGIN
 IF jsonb_typeof(i) IS DISTINCT FROM 'object' OR NOT i ?& ARRAY['content','overrides','money_in_words'] OR (i-'content'-'overrides'-'money_in_words')<>'{}' OR jsonb_typeof(i->'content') IS DISTINCT FROM 'string' OR char_length(i->>'content')>30000 OR translate(i->>'content',E'\t\r\n','')~'[[:cntrl:]]' OR jsonb_typeof(i->'money_in_words') IS DISTINCT FROM 'boolean' OR jsonb_typeof(i->'overrides') IS DISTINCT FROM 'object' THEN RAISE EXCEPTION 'DOCUMENTS_VALIDATION' USING ERRCODE='PT422';END IF;
 IF (SELECT count(*) FROM jsonb_object_keys(i->'overrides'))>80 OR EXISTS(SELECT FROM jsonb_each(i->'overrides')e WHERE jsonb_typeof(e.value)<>'string' OR char_length(e.value#>>'{}')>CASE WHEN e.key LIKE 'documento.%' THEN 2000 ELSE 500 END OR translate(e.value#>>'{}',E'\t\r\n','')~'[[:cntrl:]]' OR NOT EXISTS(SELECT FROM jsonb_array_elements(d->'variables')v WHERE v->>'key'=e.key)) THEN RAISE EXCEPTION 'DOCUMENTS_VALIDATION' USING ERRCODE='PT422';END IF;
END$$;

CREATE OR REPLACE FUNCTION private.documents_parties21(o uuid,p jsonb,d jsonb) RETURNS jsonb LANGUAGE plpgsql SECURITY INVOKER SET search_path='' AS $$
DECLARE x jsonb;c public.customers;result jsonb:='[]';prefix text;actor uuid:=private.team_require_identity();
BEGIN
 IF jsonb_typeof(p) IS DISTINCT FROM 'array' THEN RAISE EXCEPTION 'DOCUMENTS_VALIDATION' USING ERRCODE='PT422';END IF;
 IF jsonb_array_length(p)>20 THEN RAISE EXCEPTION 'DOCUMENTS_VALIDATION' USING ERRCODE='PT422';END IF;
 FOR x IN SELECT e FROM jsonb_array_elements(p)e LOOP
  IF jsonb_typeof(x) IS DISTINCT FROM 'object' OR NOT x ?& ARRAY['role','label','customer_id'] OR x-'role'-'label'-'customer_id'<>'{}' OR jsonb_typeof(x->'role') IS DISTINCT FROM 'string' OR x->>'role' NOT IN('buyer','seller','representative','guardian','other') OR jsonb_typeof(x->'label') IS DISTINCT FROM 'string' OR char_length(x->>'label') NOT BETWEEN 1 AND 80 OR NOT private.templates_has_text20(x->>'label') OR x->>'label'~'[[:cntrl:]]' OR jsonb_typeof(x->'customer_id') IS DISTINCT FROM 'string' OR x->>'customer_id'!~*'^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$' THEN RAISE EXCEPTION 'DOCUMENTS_VALIDATION' USING ERRCODE='PT422';END IF;
 END LOOP;
 IF EXISTS(SELECT FROM jsonb_array_elements(p)e GROUP BY e->>'role',(e->>'customer_id')::uuid HAVING count(*)>1)
  OR EXISTS(SELECT FROM jsonb_array_elements(p)e WHERE e->>'role' IN('buyer','seller') GROUP BY e->>'role' HAVING count(*)>10)
  OR EXISTS(SELECT FROM jsonb_array_elements(p)a JOIN jsonb_array_elements(p)b ON (a->>'customer_id')::uuid=(b->>'customer_id')::uuid WHERE a->>'role'='buyer' AND b->>'role'='seller')
 THEN RAISE EXCEPTION 'DOCUMENTS_VALIDATION' USING ERRCODE='PT422';END IF;
 PERFORM c1.id FROM public.customers c1 WHERE c1.office_id=o AND c1.id IN(SELECT(e->>'customer_id')::uuid FROM jsonb_array_elements(p)e) ORDER BY c1.id FOR SHARE;
 FOR x IN SELECT e FROM jsonb_array_elements(p)e LOOP
  SELECT * INTO c FROM public.customers WHERE office_id=o AND id=(x->>'customer_id')::uuid;
  IF c.id IS NULL OR private.customer_in_scope(c,actor) IS NOT TRUE THEN RAISE EXCEPTION 'DOCUMENTS_FORBIDDEN' USING ERRCODE='PT403';END IF;
  prefix:=CASE x->>'role' WHEN 'buyer' THEN 'participante.comprador.cpf' WHEN 'seller' THEN 'participante.vendedor.cpf' ELSE '' END;
  result:=result||jsonb_build_array(private.documents_person21(c,EXISTS(SELECT FROM jsonb_array_elements(d->'variables')v WHERE v->>'key'=prefix))||jsonb_build_object('role',x->>'role','label',x->>'label'));
 END LOOP;
 PERFORM private.team_require_identity();
 RETURN result;
END$$;

-- 2. Smart template configs (separate from template_approvals so draft testing never alters approval)
CREATE TABLE private.template_smart_configs (
 office_id uuid NOT NULL,
 template_id uuid NOT NULL,
 revision integer NOT NULL DEFAULT 1 CHECK(revision>0),
 config jsonb NOT NULL,
 updated_by uuid NOT NULL REFERENCES auth.users(id) ON DELETE RESTRICT,
 updated_at timestamptz NOT NULL DEFAULT clock_timestamp(),
 PRIMARY KEY(office_id,template_id),
 FOREIGN KEY(office_id,template_id) REFERENCES public.templates(office_id,id) ON DELETE RESTRICT
);
CREATE INDEX template_smart_configs_user_idx ON private.template_smart_configs(updated_by);

-- 3. Smart filling sessions (progressive autosave, non-blocking pendencies, multi-party JSON, conference tracking)
CREATE TABLE private.document_smart_sessions (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 office_id uuid NOT NULL REFERENCES public.offices(id) ON DELETE RESTRICT,
 request_id uuid,
 request_item_id uuid,
 document_id uuid,
 template_id uuid NOT NULL,
 template_version_id uuid NOT NULL,
 origin text NOT NULL CHECK(origin IN('portal','presencial','whatsapp')),
 channel text NOT NULL DEFAULT 'web' CHECK(char_length(channel) BETWEEN 1 AND 60),
 current_step text NOT NULL CHECK(current_step IN('contexto','partes','objeto','pagamento','documentos','revisao')),
 initial_answers jsonb NOT NULL DEFAULT '{}'::jsonb,
 answers jsonb NOT NULL DEFAULT '{}'::jsonb,
 parties jsonb NOT NULL DEFAULT '[]'::jsonb,
 pending_fields jsonb NOT NULL DEFAULT '[]'::jsonb,
 conference_status text NOT NULL DEFAULT 'nao_iniciada' CHECK(conference_status IN('nao_iniciada','em_conferencia','aguardando_complementacao','conferencia_concluida')),
 conference_notes text NOT NULL DEFAULT '' CHECK(char_length(conference_notes)<=2000),
 revision integer NOT NULL DEFAULT 1 CHECK(revision>0),
 autosaved_at timestamptz,
 submitted_at timestamptz,
 created_by uuid NOT NULL REFERENCES auth.users(id) ON DELETE RESTRICT,
 updated_by uuid NOT NULL REFERENCES auth.users(id) ON DELETE RESTRICT,
 created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
 updated_at timestamptz NOT NULL DEFAULT clock_timestamp(),
 UNIQUE(office_id,id),
 FOREIGN KEY(office_id,template_id,template_version_id) REFERENCES public.template_versions(office_id,template_id,id) ON DELETE RESTRICT
);
CREATE UNIQUE INDEX document_smart_sessions_request_uidx ON private.document_smart_sessions(office_id,request_id) WHERE request_id IS NOT NULL;
CREATE INDEX document_smart_sessions_doc_idx ON private.document_smart_sessions(office_id,document_id);
CREATE INDEX document_smart_sessions_actor_idx ON private.document_smart_sessions(created_by);

-- 4. Post-completion client correction requests (available even after completed / prior corrections)
CREATE TABLE private.document_correction_requests (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 office_id uuid NOT NULL REFERENCES public.offices(id) ON DELETE RESTRICT,
 request_id uuid NOT NULL,
 document_id uuid NOT NULL,
 publication_id uuid,
 section_key text NOT NULL CHECK(char_length(section_key) BETWEEN 1 AND 120),
 incorrect_value text NOT NULL CHECK(char_length(incorrect_value)<=1000),
 corrected_value text NOT NULL CHECK(char_length(corrected_value) BETWEEN 1 AND 1000),
 description text NOT NULL CHECK(char_length(description) BETWEEN 5 AND 2000),
 attachment_ids jsonb NOT NULL DEFAULT '[]'::jsonb,
 status text NOT NULL DEFAULT 'aguardando_conferencia' CHECK(status IN('aguardando_conferencia','em_conferencia','aguardando_complementacao','aprovada','recusada','nova_versao_liberada')),
 review_reason text,
 new_revision integer CHECK(new_revision IS NULL OR new_revision>0),
 new_publication_id uuid,
 was_signed_before boolean NOT NULL DEFAULT false,
 requires_resignature boolean NOT NULL DEFAULT false,
 zero_charge_linked_payment_id uuid,
 zero_charge_label text NOT NULL DEFAULT 'Correção de documento — sem nova cobrança',
 requested_by uuid NOT NULL REFERENCES auth.users(id) ON DELETE RESTRICT,
 requested_by_name text NOT NULL,
 reviewed_by uuid REFERENCES auth.users(id) ON DELETE RESTRICT,
 reviewed_by_name text,
 created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
 updated_at timestamptz NOT NULL DEFAULT clock_timestamp(),
 FOREIGN KEY(office_id,request_id) REFERENCES public.requests(office_id,id) ON DELETE RESTRICT,
 FOREIGN KEY(office_id,document_id) REFERENCES public.documents(office_id,id) ON DELETE RESTRICT
);
CREATE INDEX document_correction_requests_doc_idx ON private.document_correction_requests(office_id,document_id,created_at DESC);
CREATE INDEX document_correction_requests_req_idx ON private.document_correction_requests(office_id,request_id);
CREATE INDEX document_correction_requests_requester_idx ON private.document_correction_requests(requested_by);

-- 5. Authorized courtesies (append-only, waives obligation without inserting fake cash revenue)
CREATE TABLE private.document_courtesies (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 office_id uuid NOT NULL REFERENCES public.offices(id) ON DELETE RESTRICT,
 request_id uuid NOT NULL,
 charge_id uuid,
 waived_cents bigint NOT NULL CHECK(waived_cents>=0),
 reason text NOT NULL CHECK(char_length(reason) BETWEEN 5 AND 500 AND reason=btrim(reason)),
 authorized_by uuid NOT NULL REFERENCES auth.users(id) ON DELETE RESTRICT,
 authorized_by_name text NOT NULL,
 idempotency_key uuid NOT NULL,
 created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
 UNIQUE(office_id,authorized_by,idempotency_key),
 FOREIGN KEY(office_id,request_id) REFERENCES public.requests(office_id,id) ON DELETE RESTRICT
);
CREATE INDEX document_courtesies_req_idx ON private.document_courtesies(office_id,request_id);
CREATE TRIGGER document_courtesies_immutable BEFORE UPDATE OR DELETE ON private.document_courtesies FOR EACH ROW EXECUTE FUNCTION private.wf_immutable();

-- 6. Presencial manual reading log (never equivalent to signature)
CREATE TABLE private.document_manual_readings (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 office_id uuid NOT NULL REFERENCES public.offices(id) ON DELETE RESTRICT,
 document_id uuid NOT NULL,
 revision integer NOT NULL CHECK(revision>0),
 actor_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE RESTRICT,
 actor_name text NOT NULL,
 clauses_reviewed jsonb NOT NULL DEFAULT '[]'::jsonb,
 customer_confirmed boolean NOT NULL DEFAULT false,
 notes text NOT NULL DEFAULT '' CHECK(char_length(notes)<=500),
 created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
 FOREIGN KEY(office_id,document_id) REFERENCES public.documents(office_id,id) ON DELETE RESTRICT
);
CREATE INDEX document_manual_readings_doc_idx ON private.document_manual_readings(office_id,document_id,created_at DESC);
CREATE TRIGGER document_manual_readings_immutable BEFORE UPDATE OR DELETE ON private.document_manual_readings FOR EACH ROW EXECUTE FUNCTION private.wf_immutable();

ALTER TABLE private.template_smart_configs ENABLE ROW LEVEL SECURITY;
ALTER TABLE private.document_smart_sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE private.document_correction_requests ENABLE ROW LEVEL SECURITY;
ALTER TABLE private.document_courtesies ENABLE ROW LEVEL SECURITY;
ALTER TABLE private.document_manual_readings ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON private.template_smart_configs,private.document_smart_sessions,private.document_correction_requests,private.document_courtesies,private.document_manual_readings FROM PUBLIC,anon,authenticated,service_role;

-- 7. Extend internal notifications safely for smart document lifecycle events
DO $m$ DECLARE body text;BEGIN
 SELECT pg_get_constraintdef(oid) INTO body FROM pg_constraint WHERE conrelid='private.internal_notifications'::regclass AND conname='internal_notifications_kind_check';
 body:=replace(body,'''handoff''::text','''smart_submission''::text,''conference_done''::text,''charge_released''::text,''correction_requested''::text,''correction_resolved''::text,''handoff''::text');
 ALTER TABLE private.internal_notifications DROP CONSTRAINT internal_notifications_kind_check;
 EXECUTE 'ALTER TABLE private.internal_notifications ADD CONSTRAINT internal_notifications_kind_check '||body;
END $m$;

ALTER FUNCTION private.notification_visible(private.internal_notifications,public.requests,public.memberships) RENAME TO notification_visible_before_smart;
CREATE FUNCTION private.notification_visible(n private.internal_notifications,r public.requests,m public.memberships) RETURNS boolean LANGUAGE sql STABLE SECURITY INVOKER SET search_path='' AS $$
 SELECT CASE WHEN n.kind IN('smart_submission','conference_done','charge_released','correction_requested','correction_resolved')
  THEN n.office_id=m.office_id AND n.recipient_id=m.id AND private.request_in_scope(r,m) IS TRUE
   AND CASE WHEN m.role_code='client'
    THEN n.kind IN('conference_done','charge_released','correction_resolved') AND r.origin='portal' AND r.created_by=m.user_id
    ELSE private.current_permissions(m.office_id) @> ARRAY['requests.read']
   END
  ELSE private.notification_visible_before_smart(n,r,m) END;
$$;

DO $m$ DECLARE body text;updated text;name text;BEGIN
 FOREACH name IN ARRAY ARRAY['notifications_page','notifications_summary'] LOOP
  SELECT pg_get_functiondef(oid) INTO body FROM pg_proc WHERE pronamespace='private'::regnamespace AND proname=name;
  updated:=replace(body,'''document_withdrawn''','''document_withdrawn'',''smart_submission'',''conference_done'',''charge_released'',''correction_requested'',''correction_resolved''');
  IF updated=body THEN RAISE EXCEPTION 'Smart notification target absent: %',name;END IF;
  EXECUTE updated;
 END LOOP;
END $m$;

-- 8. RPC: Get & Save Smart Template Config
CREATE FUNCTION private.smart_template_config_get(p_office_id uuid,p_template_id uuid) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE m public.memberships;t public.templates;cfg private.template_smart_configs;
BEGIN
 PERFORM private.team_require_identity();
 SELECT * INTO m FROM public.memberships WHERE office_id=p_office_id AND user_id=auth.uid() AND active FOR SHARE;
 IF m.id IS NULL OR NOT private.team_user_active(m.user_id,p_office_id) THEN RAISE EXCEPTION 'TEMPLATES_FORBIDDEN' USING ERRCODE='PT403';END IF;
 SELECT * INTO t FROM public.templates WHERE office_id=p_office_id AND id=p_template_id;
 IF t.id IS NULL THEN RAISE EXCEPTION 'TEMPLATE_NOT_FOUND' USING ERRCODE='PT404';END IF;
 SELECT * INTO cfg FROM private.template_smart_configs WHERE office_id=p_office_id AND template_id=p_template_id;
 IF cfg.template_id IS NULL THEN RETURN jsonb_build_object('template_id',p_template_id,'revision',0,'config',NULL,'updated_at',NULL);END IF;
 RETURN jsonb_build_object('template_id',cfg.template_id,'revision',cfg.revision,'config',cfg.config,'updated_at',cfg.updated_at);
END$$;

CREATE FUNCTION private.smart_template_config_save(p_office_id uuid,p_template_id uuid,p_config jsonb,p_expected_revision integer) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE actor uuid;m public.memberships;cur private.template_smart_configs;
BEGIN
 actor:=private.templates_actor20(p_office_id,'templates.manage');
 SELECT * INTO m FROM public.memberships WHERE office_id=p_office_id AND user_id=actor AND active;
 IF m.role_code NOT IN('owner','admin') THEN RAISE EXCEPTION 'TEMPLATES_FORBIDDEN' USING ERRCODE='PT403';END IF;
 IF jsonb_typeof(p_config) IS DISTINCT FROM 'object' OR p_expected_revision IS NULL OR p_expected_revision<0 THEN RAISE EXCEPTION 'TEMPLATES_VALIDATION' USING ERRCODE='PT422';END IF;
 PERFORM 1 FROM public.templates WHERE office_id=p_office_id AND id=p_template_id FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'TEMPLATE_NOT_FOUND' USING ERRCODE='PT404';END IF;
 SELECT * INTO cur FROM private.template_smart_configs WHERE office_id=p_office_id AND template_id=p_template_id FOR UPDATE;
 IF coalesce(cur.revision,0)<>p_expected_revision THEN RAISE EXCEPTION 'TEMPLATE_CONFLICT' USING ERRCODE='PT409';END IF;
 INSERT INTO private.template_smart_configs(office_id,template_id,revision,config,updated_by,updated_at)
 VALUES(p_office_id,p_template_id,1,p_config,actor,clock_timestamp())
 ON CONFLICT(office_id,template_id) DO UPDATE SET revision=private.template_smart_configs.revision+1,config=EXCLUDED.config,updated_by=EXCLUDED.updated_by,updated_at=EXCLUDED.updated_at
 RETURNING * INTO cur;
 RETURN jsonb_build_object('template_id',cur.template_id,'revision',cur.revision,'config',cur.config,'updated_at',cur.updated_at);
END$$;

-- 9. RPC: Smart Session Get / Upsert
CREATE FUNCTION private.smart_session_get(p_office_id uuid,p_request_id uuid,p_document_id uuid) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE m public.memberships;r public.requests;s private.document_smart_sessions;
BEGIN
 PERFORM private.team_require_identity();
 SELECT * INTO m FROM public.memberships WHERE office_id=p_office_id AND user_id=auth.uid() AND active FOR SHARE;
 IF m.id IS NULL OR NOT private.team_user_active(m.user_id,p_office_id) THEN RAISE EXCEPTION 'DOCUMENTS_FORBIDDEN' USING ERRCODE='PT403';END IF;
 IF p_request_id IS NOT NULL THEN
  SELECT * INTO r FROM public.requests WHERE office_id=p_office_id AND id=p_request_id;
  IF r.id IS NULL THEN RAISE EXCEPTION 'DOCUMENT_NOT_FOUND' USING ERRCODE='PT404';END IF;
  IF NOT private.request_in_scope(r,m) THEN RAISE EXCEPTION 'DOCUMENTS_FORBIDDEN' USING ERRCODE='PT403';END IF;
  SELECT * INTO s FROM private.document_smart_sessions WHERE office_id=p_office_id AND request_id=p_request_id;
 ELSIF p_document_id IS NOT NULL THEN
  SELECT * INTO s FROM private.document_smart_sessions WHERE office_id=p_office_id AND document_id=p_document_id ORDER BY updated_at DESC LIMIT 1;
  IF s.id IS NOT NULL AND s.request_id IS NOT NULL THEN
   SELECT * INTO r FROM public.requests WHERE office_id=p_office_id AND id=s.request_id;
   IF NOT private.request_in_scope(r,m) THEN RAISE EXCEPTION 'DOCUMENTS_FORBIDDEN' USING ERRCODE='PT403';END IF;
  END IF;
 END IF;
 IF s.id IS NULL THEN RETURN NULL;END IF;
 RETURN to_jsonb(s);
END$$;

CREATE FUNCTION private.smart_session_upsert(p_office_id uuid,p_payload jsonb) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE m public.memberships;r public.requests;cur private.document_smart_sessions;expected integer;req_id uuid;doc_id uuid;tid uuid;tvid uuid;
BEGIN
 PERFORM private.team_require_identity();
 SELECT * INTO m FROM public.memberships WHERE office_id=p_office_id AND user_id=auth.uid() AND active FOR SHARE;
 IF m.id IS NULL OR NOT private.team_user_active(m.user_id,p_office_id) THEN RAISE EXCEPTION 'DOCUMENTS_FORBIDDEN' USING ERRCODE='PT403';END IF;
 req_id:=NULLIF(p_payload->>'request_id','')::uuid;
 doc_id:=NULLIF(p_payload->>'document_id','')::uuid;
 tid:=(p_payload->>'template_id')::uuid;
 tvid:=(p_payload->>'template_version_id')::uuid;
 expected:=coalesce((p_payload->>'expected_revision')::integer,0);
 IF req_id IS NOT NULL THEN
  SELECT * INTO r FROM public.requests WHERE office_id=p_office_id AND id=req_id FOR SHARE;
  IF r.id IS NULL THEN RAISE EXCEPTION 'DOCUMENT_NOT_FOUND' USING ERRCODE='PT404';END IF;
  IF NOT private.request_in_scope(r,m) THEN RAISE EXCEPTION 'DOCUMENTS_FORBIDDEN' USING ERRCODE='PT403';END IF;
  IF m.role_code='client' AND r.created_by<>m.user_id THEN RAISE EXCEPTION 'DOCUMENTS_FORBIDDEN' USING ERRCODE='PT403';END IF;
  SELECT * INTO cur FROM private.document_smart_sessions WHERE office_id=p_office_id AND request_id=req_id FOR UPDATE;
 END IF;
 IF cur.id IS NOT NULL AND expected>0 AND cur.revision<>expected THEN RAISE EXCEPTION 'DOCUMENT_CONFLICT' USING ERRCODE='PT409';END IF;
 IF cur.id IS NULL THEN
  INSERT INTO private.document_smart_sessions(
   office_id,request_id,request_item_id,document_id,template_id,template_version_id,origin,channel,current_step,
   initial_answers,answers,parties,pending_fields,conference_status,conference_notes,revision,autosaved_at,submitted_at,created_by,updated_by
  ) VALUES(
   p_office_id,req_id,NULLIF(p_payload->>'request_item_id','')::uuid,doc_id,tid,tvid,
   coalesce(p_payload->>'origin',CASE WHEN m.role_code='client' THEN 'portal' ELSE 'presencial' END),
   coalesce(p_payload->>'channel','web'),coalesce(p_payload->>'current_step','contexto'),
   coalesce(p_payload->'initial_answers','{}'::jsonb),coalesce(p_payload->'answers','{}'::jsonb),
   coalesce(p_payload->'parties','[]'::jsonb),coalesce(p_payload->'pending_fields','[]'::jsonb),
   CASE WHEN m.role_code='client' THEN 'nao_iniciada' ELSE coalesce(p_payload->>'conference_status','nao_iniciada') END,
   CASE WHEN m.role_code='client' THEN '' ELSE coalesce(p_payload->>'conference_notes','') END,
   1,clock_timestamp(),CASE WHEN (p_payload->>'submit')::boolean THEN clock_timestamp() ELSE NULL END,m.user_id,m.user_id
  ) RETURNING * INTO cur;
 ELSE
  UPDATE private.document_smart_sessions SET
   document_id=coalesce(doc_id,document_id),
   current_step=coalesce(p_payload->>'current_step',current_step),
   initial_answers=coalesce(p_payload->'initial_answers',initial_answers),
   answers=coalesce(p_payload->'answers',answers),
   parties=coalesce(p_payload->'parties',parties),
   pending_fields=coalesce(p_payload->'pending_fields',pending_fields),
   conference_status=CASE WHEN m.role_code='client' THEN conference_status ELSE coalesce(p_payload->>'conference_status',conference_status) END,
   conference_notes=CASE WHEN m.role_code='client' THEN conference_notes ELSE coalesce(p_payload->>'conference_notes',conference_notes) END,
   revision=revision+1,
   autosaved_at=clock_timestamp(),
   submitted_at=CASE WHEN (p_payload->>'submit')::boolean THEN coalesce(submitted_at,clock_timestamp()) ELSE submitted_at END,
   updated_by=m.user_id,
   updated_at=clock_timestamp()
  WHERE id=cur.id RETURNING * INTO cur;
 END IF;
 RETURN to_jsonb(cur);
END$$;

-- 10. RPC: Smart Request Context for "Conferir documento contratado"
CREATE FUNCTION private.smart_request_context(p_office_id uuid,p_request_id uuid,p_request_item_id uuid) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE m public.memberships;r public.requests;d public.documents;i private.document_intakes;s private.document_smart_sessions;ch private.charges;ca record;cfg private.template_smart_configs;courtesies jsonb;
BEGIN
 m:=private.documents_access21(p_office_id,p_request_id);
 SELECT * INTO r FROM public.requests WHERE office_id=p_office_id AND id=p_request_id;
 SELECT * INTO i FROM private.document_intakes WHERE office_id=p_office_id AND request_id=p_request_id AND request_item_id=p_request_item_id;
 SELECT * INTO d FROM public.documents WHERE office_id=p_office_id AND request_id=p_request_id AND request_item_id=p_request_item_id ORDER BY created_at DESC LIMIT 1;
 SELECT * INTO s FROM private.document_smart_sessions WHERE office_id=p_office_id AND request_id=p_request_id LIMIT 1;
 IF i.id IS NOT NULL THEN SELECT * INTO cfg FROM private.template_smart_configs WHERE office_id=p_office_id AND template_id=i.template_id; END IF;
 SELECT * INTO ch FROM private.charges WHERE office_id=p_office_id AND request_id=p_request_id;
 IF ch.id IS NOT NULL THEN SELECT * INTO ca FROM private.charges_amounts(p_office_id,ch.id); END IF;
 SELECT coalesce(jsonb_agg(to_jsonb(c) ORDER BY c.created_at DESC),'[]'::jsonb) INTO courtesies FROM private.document_courtesies c WHERE c.office_id=p_office_id AND c.request_id=p_request_id;
 RETURN jsonb_build_object(
  'request_id',p_request_id,'request_item_id',p_request_item_id,'request_protocol',r.protocol,'request_status',r.status,'origin',r.origin,
  'has_intake',i.id IS NOT NULL,'intake',CASE WHEN i.id IS NULL THEN NULL ELSE jsonb_build_object('model_name',i.model_name,'template_id',i.template_id,'template_version_id',i.template_version_id,'answers',i.answers) END,
  'document_id',d.id,'document_status',d.status,'document_revision',d.revision,'document_protocol',d.protocol,
  'smart_session',CASE WHEN s.id IS NULL THEN NULL ELSE to_jsonb(s) END,
  'smart_config',CASE WHEN cfg.template_id IS NULL THEN NULL ELSE cfg.config END,
  'financial',CASE WHEN ch.id IS NULL THEN NULL ELSE jsonb_build_object('charge_id',ch.id,'due_cents',ca.due_cents,'allocated_cents',ca.allocated_cents,'balance_cents',ca.balance_cents,'cancelled',ca.cancelled) END,
  'courtesies',courtesies
 );
END$$;

-- 11. RPC: Smart Conference Operate (saves status, optional notification to client)
CREATE FUNCTION private.smart_conference_operate(p_office_id uuid,p_payload jsonb) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE m public.memberships;r public.requests;d public.documents;tv public.template_versions;s private.document_smart_sessions;req_id uuid;doc_id uuid;next_status text;notes text;notify_client boolean;notice_kind text;evt_id uuid;
BEGIN
 req_id:=(p_payload->>'request_id')::uuid;
 doc_id:=NULLIF(p_payload->>'document_id','')::uuid;
 next_status:=p_payload->>'conference_status';
 notes:=coalesce(p_payload->>'conference_notes','');
 notify_client:=coalesce((p_payload->>'notify_client')::boolean,false);
 IF req_id IS NULL OR next_status NOT IN('nao_iniciada','em_conferencia','aguardando_complementacao','conferencia_concluida') OR char_length(notes)>2000 THEN
  RAISE EXCEPTION 'DOCUMENTS_VALIDATION' USING ERRCODE='PT422';
 END IF;
 m:=private.documents_access21(p_office_id,req_id,'documents.update');
 SELECT * INTO r FROM public.requests WHERE office_id=p_office_id AND id=req_id FOR UPDATE;
 SELECT * INTO s FROM private.document_smart_sessions WHERE office_id=p_office_id AND request_id=req_id FOR UPDATE;
 IF s.id IS NOT NULL THEN
  UPDATE private.document_smart_sessions SET
   conference_status=next_status,
   conference_notes=notes,
   document_id=coalesce(doc_id,document_id),
   updated_by=m.user_id,
   updated_at=clock_timestamp()
  WHERE id=s.id RETURNING * INTO s;
 ELSIF doc_id IS NOT NULL THEN
  SELECT * INTO d FROM public.documents WHERE office_id=p_office_id AND id=doc_id;
  IF d.id IS NOT NULL THEN
   SELECT * INTO tv FROM public.template_versions WHERE office_id=p_office_id AND id=d.template_version_id;
   IF tv.id IS NOT NULL THEN
    INSERT INTO private.document_smart_sessions(
     office_id,request_id,request_item_id,document_id,template_id,template_version_id,origin,channel,current_step,
     conference_status,conference_notes,revision,created_by,updated_by
    ) VALUES(
     p_office_id,req_id,d.request_item_id,d.id,tv.template_id,tv.id,
     CASE WHEN r.origin IN('portal','presencial','whatsapp') THEN r.origin ELSE 'presencial' END,
     'web','revisao',next_status,notes,1,m.user_id,m.user_id
    ) RETURNING * INTO s;
   END IF;
  END IF;
 END IF;
 IF notify_client AND r.origin='portal' THEN
  notice_kind:=CASE WHEN coalesce((p_payload->>'release_charge')::boolean,false) THEN 'charge_released' ELSE 'conference_done' END;
  evt_id:=gen_random_uuid();
  INSERT INTO private.internal_notifications(office_id,request_id,recipient_id,kind,event_id)
  SELECT p_office_id,r.id,cm.id,notice_kind,evt_id FROM public.memberships cm
  WHERE cm.office_id=p_office_id AND cm.user_id=r.created_by AND cm.role_code='client' AND cm.active
  ON CONFLICT(office_id,recipient_id,kind,event_id) DO NOTHING;
 END IF;
 RETURN jsonb_build_object('request_id',req_id,'conference_status',next_status,'conference_notes',notes,'updated_at',clock_timestamp());
END$$;

-- 12. RPC: Authorized Courtesy (Zero fake cash revenue, records authorizer & reason, sets open balance to 0)
CREATE FUNCTION private.smart_courtesy_authorize(p_office_id uuid,p_request_id uuid,p_charge_id uuid,p_reason text,p_idempotency_key uuid) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE m public.memberships;r public.requests;ch private.charges;ca record;existing private.document_courtesies;actor_name text;waived bigint:=0;caps text[];ver integer;
BEGIN
 m:=private.documents_access21(p_office_id,p_request_id);
 caps:=private.current_permissions(p_office_id);
 IF NOT (caps @> ARRAY['charges.adjust'] OR caps @> ARRAY['services.courtesy']) OR m.role_code='client' THEN
  RAISE EXCEPTION 'DOCUMENTS_FORBIDDEN' USING ERRCODE='PT403';
 END IF;
 IF p_idempotency_key IS NULL OR p_reason IS NULL OR char_length(btrim(p_reason)) NOT BETWEEN 5 AND 500 OR btrim(p_reason)~'[[:cntrl:]]' THEN
  RAISE EXCEPTION 'DOCUMENTS_VALIDATION' USING ERRCODE='PT422';
 END IF;
 SELECT * INTO existing FROM private.document_courtesies WHERE office_id=p_office_id AND authorized_by=m.user_id AND idempotency_key=p_idempotency_key;
 IF existing.id IS NOT NULL THEN RETURN to_jsonb(existing);END IF;
 SELECT * INTO r FROM public.requests WHERE office_id=p_office_id AND id=p_request_id FOR UPDATE;
 SELECT coalesce(private.customer_relation_display_label(display_name),'Integrante da equipe') INTO actor_name FROM public.profiles WHERE id=m.user_id;
 SELECT * INTO ch FROM private.charges WHERE office_id=p_office_id AND request_id=p_request_id AND (p_charge_id IS NULL OR id=p_charge_id) FOR UPDATE;
 IF ch.id IS NOT NULL THEN
  SELECT * INTO ca FROM private.charges_amounts(p_office_id,ch.id);
  IF ca.cancelled THEN RAISE EXCEPTION 'DOCUMENT_CONFLICT' USING ERRCODE='PT409';END IF;
  waived:=ca.balance_cents;
  IF waived>0 THEN
   SELECT coalesce(max(version),1) INTO ver FROM private.charge_events WHERE office_id=p_office_id AND charge_id=ch.id;
   PERFORM private.charges_mutate(p_office_id,ch.id,ver,jsonb_build_object(
    'kind','adjust',
    'delta_cents',-waived,
    'reason','Cortesia autorizada: '||btrim(p_reason),
    'installments',jsonb_build_array(jsonb_build_object('due_date',(clock_timestamp() AT TIME ZONE 'UTC')::date::text,'amount_cents',ca.allocated_cents))
   ),p_idempotency_key);
  END IF;
 END IF;
 INSERT INTO private.document_courtesies(office_id,request_id,charge_id,waived_cents,reason,authorized_by,authorized_by_name,idempotency_key)
 VALUES(p_office_id,p_request_id,ch.id,waived,btrim(p_reason),m.user_id,coalesce(actor_name,'Equipe'),p_idempotency_key)
 RETURNING * INTO existing;
 RETURN to_jsonb(existing);
END$$;

-- 13. RPC: Post-Completion Client Correction Requests (available even after request completion or previous corrections)
CREATE FUNCTION private.smart_correction_list(p_office_id uuid,p_document_id uuid) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE m public.memberships;d public.documents;p private.document_publications;r public.requests;items jsonb;
BEGIN
 PERFORM private.team_require_identity();
 SELECT * INTO m FROM public.memberships WHERE office_id=p_office_id AND user_id=auth.uid() AND active FOR SHARE;
 IF m.id IS NULL OR NOT private.team_user_active(m.user_id,p_office_id) THEN RAISE EXCEPTION 'DOCUMENTS_FORBIDDEN' USING ERRCODE='PT403';END IF;
 SELECT * INTO d FROM public.documents WHERE office_id=p_office_id AND id=p_document_id;
 IF d.id IS NULL THEN
  SELECT * INTO p FROM private.document_publications WHERE office_id=p_office_id AND id=p_document_id;
  IF p.id IS NOT NULL THEN SELECT * INTO d FROM public.documents WHERE office_id=p_office_id AND id=p.document_id; END IF;
 END IF;
 IF d.id IS NULL THEN RAISE EXCEPTION 'DOCUMENT_NOT_FOUND' USING ERRCODE='PT404';END IF;
 SELECT * INTO r FROM public.requests WHERE office_id=p_office_id AND id=d.request_id;
 IF m.role_code='client' THEN
  IF p.id IS NULL THEN SELECT * INTO p FROM private.document_publications WHERE office_id=p_office_id AND document_id=d.id ORDER BY revision DESC,created_at DESC LIMIT 1; END IF;
  IF private.wf_recipient(r,m) IS NOT TRUE AND (p.id IS NULL OR private.portal_recipient_customer32(p,m) IS NULL) THEN RAISE EXCEPTION 'DOCUMENTS_FORBIDDEN' USING ERRCODE='PT403';END IF;
 ELSE
  PERFORM private.documents_access21(p_office_id,d.request_id,NULL,d.id);
 END IF;
 SELECT coalesce(jsonb_agg(to_jsonb(c) ORDER BY c.created_at DESC,c.id DESC),'[]'::jsonb) INTO items
 FROM private.document_correction_requests c WHERE c.office_id=p_office_id AND c.document_id=d.id;
 RETURN jsonb_build_object('items',items);
END$$;

CREATE FUNCTION private.smart_correction_request(p_office_id uuid,p_payload jsonb) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE m public.memberships;d public.documents;r public.requests;p private.document_publications;actor_name text;was_signed boolean:=false;paid_payment uuid;rec private.document_correction_requests;evt_id uuid;target_id uuid;pub_id uuid;
BEGIN
 PERFORM private.team_require_identity();
 SELECT * INTO m FROM public.memberships WHERE office_id=p_office_id AND user_id=auth.uid() AND active FOR SHARE;
 IF m.id IS NULL OR NOT private.team_user_active(m.user_id,p_office_id) THEN RAISE EXCEPTION 'DOCUMENTS_FORBIDDEN' USING ERRCODE='PT403';END IF;
 target_id:=(p_payload->>'document_id')::uuid;
 pub_id:=NULLIF(p_payload->>'publication_id','')::uuid;
 SELECT * INTO d FROM public.documents WHERE office_id=p_office_id AND id=target_id;
 IF d.id IS NULL THEN
  SELECT * INTO p FROM private.document_publications WHERE office_id=p_office_id AND id=coalesce(pub_id,target_id);
  IF p.id IS NOT NULL THEN SELECT * INTO d FROM public.documents WHERE office_id=p_office_id AND id=p.document_id; END IF;
 END IF;
 IF d.id IS NULL THEN RAISE EXCEPTION 'DOCUMENT_NOT_FOUND' USING ERRCODE='PT404';END IF;
 SELECT * INTO r FROM public.requests WHERE office_id=p_office_id AND id=d.request_id;
 IF p.id IS NULL THEN SELECT * INTO p FROM private.document_publications WHERE office_id=p_office_id AND document_id=d.id AND (pub_id IS NULL OR id=pub_id) ORDER BY revision DESC,created_at DESC LIMIT 1; END IF;
 IF m.role_code='client' THEN
  IF private.wf_recipient(r,m) IS NOT TRUE AND (p.id IS NULL OR private.portal_recipient_customer32(p,m) IS NULL) THEN RAISE EXCEPTION 'DOCUMENTS_FORBIDDEN' USING ERRCODE='PT403';END IF;
 ELSE
  PERFORM private.documents_access21(p_office_id,d.request_id,NULL,d.id);
 END IF;
 IF p.id IS NOT NULL THEN was_signed:=private.wf_signed(p) AND p.signature_policy<>'none'; END IF;
 SELECT pa.payment_id INTO paid_payment FROM private.payment_allocations pa JOIN private.charges c ON c.office_id=pa.office_id AND c.id=pa.charge_id WHERE c.office_id=p_office_id AND c.request_id=r.id ORDER BY pa.created_at DESC LIMIT 1;
 SELECT coalesce(private.customer_relation_display_label(display_name),'Cliente') INTO actor_name FROM public.profiles WHERE id=m.user_id;
 INSERT INTO private.document_correction_requests(
  office_id,request_id,document_id,publication_id,section_key,incorrect_value,corrected_value,description,attachment_ids,
  was_signed_before,requires_resignature,zero_charge_linked_payment_id,requested_by,requested_by_name
 ) VALUES(
  p_office_id,r.id,d.id,coalesce(pub_id,p.id),
  btrim(p_payload->>'section_key'),coalesce(p_payload->>'incorrect_value',''),btrim(p_payload->>'corrected_value'),btrim(p_payload->>'description'),
  coalesce(p_payload->'attachment_ids','[]'::jsonb),was_signed,was_signed,paid_payment,m.user_id,coalesce(actor_name,'Cliente')
 ) RETURNING * INTO rec;
 evt_id:=gen_random_uuid();
 INSERT INTO private.internal_notifications(office_id,request_id,recipient_id,kind,event_id)
 SELECT p_office_id,r.id,sm.id,'correction_requested',evt_id FROM public.memberships sm
 WHERE sm.office_id=p_office_id AND sm.role_code<>'client' AND sm.active AND (r.assignee_id IS NULL OR sm.id=r.assignee_id OR sm.role_code IN('owner','admin'))
 ON CONFLICT(office_id,recipient_id,kind,event_id) DO NOTHING;
 RETURN to_jsonb(rec);
END$$;

CREATE FUNCTION private.smart_correction_decide(p_office_id uuid,p_correction_id uuid,p_status text,p_reason text,p_new_revision integer,p_new_publication_id uuid) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE m public.memberships;rec private.document_correction_requests;r public.requests;actor_name text;evt_id uuid;
BEGIN
 m:=private.documents_access21(p_office_id,NULL,'documents.update');
 SELECT * INTO rec FROM private.document_correction_requests WHERE office_id=p_office_id AND id=p_correction_id FOR UPDATE;
 IF rec.id IS NULL THEN RAISE EXCEPTION 'DOCUMENT_NOT_FOUND' USING ERRCODE='PT404';END IF;
 IF p_status NOT IN('em_conferencia','aguardando_complementacao','aprovada','recusada','nova_versao_liberada') THEN
  RAISE EXCEPTION 'DOCUMENTS_VALIDATION' USING ERRCODE='PT422';
 END IF;
 SELECT * INTO r FROM public.requests WHERE office_id=p_office_id AND id=rec.request_id;
 SELECT coalesce(private.customer_relation_display_label(display_name),'Integrante da equipe') INTO actor_name FROM public.profiles WHERE id=m.user_id;
 UPDATE private.document_correction_requests SET
  status=p_status,
  review_reason=NULLIF(btrim(coalesce(p_reason,'')),''),
  new_revision=coalesce(p_new_revision,new_revision),
  new_publication_id=coalesce(p_new_publication_id,new_publication_id),
  reviewed_by=m.user_id,
  reviewed_by_name=coalesce(actor_name,'Equipe'),
  updated_at=clock_timestamp()
 WHERE id=rec.id RETURNING * INTO rec;
 IF p_status IN('aguardando_complementacao','aprovada','recusada','nova_versao_liberada') AND r.origin='portal' THEN
  evt_id:=gen_random_uuid();
  INSERT INTO private.internal_notifications(office_id,request_id,recipient_id,kind,event_id)
  SELECT p_office_id,r.id,cm.id,'correction_resolved',evt_id FROM public.memberships cm
  WHERE cm.office_id=p_office_id AND cm.user_id=r.created_by AND cm.role_code='client' AND cm.active
  ON CONFLICT(office_id,recipient_id,kind,event_id) DO NOTHING;
 END IF;
 RETURN to_jsonb(rec);
END$$;

-- 14. RPC: Presencial Manual Reading Log
CREATE FUNCTION private.smart_manual_reading_record(p_office_id uuid,p_document_id uuid,p_revision integer,p_clauses jsonb,p_customer_confirmed boolean,p_notes text) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE m public.memberships;d public.documents;actor_name text;rec private.document_manual_readings;
BEGIN
 SELECT * INTO d FROM public.documents WHERE office_id=p_office_id AND id=p_document_id;
 IF d.id IS NULL THEN RAISE EXCEPTION 'DOCUMENT_NOT_FOUND' USING ERRCODE='PT404';END IF;
 m:=private.documents_access21(p_office_id,d.request_id,NULL,d.id);
 SELECT coalesce(private.customer_relation_display_label(display_name),'Integrante da equipe') INTO actor_name FROM public.profiles WHERE id=m.user_id;
 INSERT INTO private.document_manual_readings(office_id,document_id,revision,actor_id,actor_name,clauses_reviewed,customer_confirmed,notes)
 VALUES(p_office_id,p_document_id,p_revision,m.user_id,coalesce(actor_name,'Equipe'),coalesce(p_clauses,'[]'::jsonb),coalesce(p_customer_confirmed,false),coalesce(p_notes,''))
 RETURNING * INTO rec;
 RETURN to_jsonb(rec);
END$$;

-- 15. Public SECURITY INVOKER wrappers & permissions
CREATE FUNCTION public.smart_template_config_get(p_office_id uuid,p_template_id uuid) RETURNS jsonb LANGUAGE sql SECURITY INVOKER SET search_path='' AS $$SELECT private.smart_template_config_get(p_office_id,p_template_id);$$;
CREATE FUNCTION public.smart_template_config_save(p_office_id uuid,p_template_id uuid,p_config jsonb,p_expected_revision integer) RETURNS jsonb LANGUAGE sql SECURITY INVOKER SET search_path='' AS $$SELECT private.smart_template_config_save(p_office_id,p_template_id,p_config,p_expected_revision);$$;
CREATE FUNCTION public.smart_session_get(p_office_id uuid,p_request_id uuid,p_document_id uuid) RETURNS jsonb LANGUAGE sql SECURITY INVOKER SET search_path='' AS $$SELECT private.smart_session_get(p_office_id,p_request_id,p_document_id);$$;
CREATE FUNCTION public.smart_session_upsert(p_office_id uuid,p_payload jsonb) RETURNS jsonb LANGUAGE sql SECURITY INVOKER SET search_path='' AS $$SELECT private.smart_session_upsert(p_office_id,p_payload);$$;
CREATE FUNCTION public.smart_request_context(p_office_id uuid,p_request_id uuid,p_request_item_id uuid) RETURNS jsonb LANGUAGE sql SECURITY INVOKER SET search_path='' AS $$SELECT private.smart_request_context(p_office_id,p_request_id,p_request_item_id);$$;
CREATE FUNCTION public.smart_conference_operate(p_office_id uuid,p_payload jsonb) RETURNS jsonb LANGUAGE sql SECURITY INVOKER SET search_path='' AS $$SELECT private.smart_conference_operate(p_office_id,p_payload);$$;
CREATE FUNCTION public.smart_courtesy_authorize(p_office_id uuid,p_request_id uuid,p_charge_id uuid,p_reason text,p_idempotency_key uuid) RETURNS jsonb LANGUAGE sql SECURITY INVOKER SET search_path='' AS $$SELECT private.smart_courtesy_authorize(p_office_id,p_request_id,p_charge_id,p_reason,p_idempotency_key);$$;
CREATE FUNCTION public.smart_correction_list(p_office_id uuid,p_document_id uuid) RETURNS jsonb LANGUAGE sql SECURITY INVOKER SET search_path='' AS $$SELECT private.smart_correction_list(p_office_id,p_document_id);$$;
CREATE FUNCTION public.smart_correction_request(p_office_id uuid,p_payload jsonb) RETURNS jsonb LANGUAGE sql SECURITY INVOKER SET search_path='' AS $$SELECT private.smart_correction_request(p_office_id,p_payload);$$;
CREATE FUNCTION public.smart_correction_decide(p_office_id uuid,p_correction_id uuid,p_status text,p_reason text,p_new_revision integer,p_new_publication_id uuid) RETURNS jsonb LANGUAGE sql SECURITY INVOKER SET search_path='' AS $$SELECT private.smart_correction_decide(p_office_id,p_correction_id,p_status,p_reason,p_new_revision,p_new_publication_id);$$;
CREATE FUNCTION public.smart_manual_reading_record(p_office_id uuid,p_document_id uuid,p_revision integer,p_clauses jsonb,p_customer_confirmed boolean,p_notes text) RETURNS jsonb LANGUAGE sql SECURITY INVOKER SET search_path='' AS $$SELECT private.smart_manual_reading_record(p_office_id,p_document_id,p_revision,p_clauses,p_customer_confirmed,p_notes);$$;

DO $m$ DECLARE r record;BEGIN
 FOR r IN SELECT oid::regprocedure sig,proname FROM pg_proc WHERE pronamespace IN('private'::regnamespace,'public'::regnamespace) AND (proname LIKE 'smart_%' OR proname='notification_visible') LOOP
  EXECUTE format('REVOKE ALL ON FUNCTION %s FROM PUBLIC,anon,authenticated,service_role',r.sig);
  IF r.proname LIKE 'smart_%' THEN EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO authenticated',r.sig); END IF;
 END LOOP;
END $m$;

NOTIFY pgrst,'reload schema';
