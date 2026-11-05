-- Etapa25: immutable financial exceptions, exact releases, existing24 gates/bytes retained.
INSERT INTO public.permissions(code,name) VALUES('documents.exceptions.request','Solicitar exceção financeira documental'),('documents.exceptions.decide','Decidir exceção financeira documental') ON CONFLICT DO NOTHING;
INSERT INTO public.role_permissions SELECT 'owner',x FROM unnest(ARRAY['documents.exceptions.request','documents.exceptions.decide'])x ON CONFLICT DO NOTHING;
DO $m$ DECLARE r record;s text;BEGIN
 FOR r IN SELECT conrelid::regclass tbl,conname,pg_get_constraintdef(oid) def FROM pg_constraint WHERE conrelid IN('private.team_member_permissions'::regclass,'private.team_delegations'::regclass,'private.team_invitations'::regclass) AND contype='c' AND pg_get_constraintdef(oid) LIKE '%documents.signatures.manage%' LOOP
 s:=replace(r.def,'''documents.signatures.manage''::text','''documents.signatures.manage''::text,''documents.exceptions.request''::text,''documents.exceptions.decide''::text');EXECUTE format('ALTER TABLE %s DROP CONSTRAINT %I',r.tbl,r.conname);EXECUTE format('ALTER TABLE %s ADD CONSTRAINT %I %s',r.tbl,r.conname,s);END LOOP;
 FOR r IN SELECT oid FROM pg_proc WHERE pronamespace='private'::regnamespace AND proname IN('team_scope_for_member','team_validate_assignment','safe_audit_changes') LOOP s:=replace(pg_get_functiondef(r.oid),'''documents.signatures.manage''','''documents.signatures.manage'',''documents.exceptions.request'',''documents.exceptions.decide''');EXECUTE s;END LOOP;
END$m$;
-- Epoch prevents revoke/regrant from resurrecting a previous authorization.
CREATE TABLE private.release_authority25(membership_id uuid PRIMARY KEY REFERENCES public.memberships(id),epoch uuid NOT NULL DEFAULT gen_random_uuid());
CREATE FUNCTION private.release_authority_changed25() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE mid uuid;BEGIN
 IF TG_TABLE_NAME='memberships' THEN mid:=NEW.id;ELSE mid:=coalesce(NEW.membership_id,OLD.membership_id);END IF;
 INSERT INTO private.release_authority25(membership_id)VALUES(mid)ON CONFLICT(membership_id)DO UPDATE SET epoch=gen_random_uuid();RETURN NULL;
END$$;
CREATE TRIGGER release_member_epoch25 AFTER UPDATE ON public.memberships FOR EACH ROW EXECUTE FUNCTION private.release_authority_changed25();
CREATE TRIGGER release_permission_epoch25 AFTER INSERT OR UPDATE OR DELETE ON private.team_member_permissions FOR EACH ROW EXECUTE FUNCTION private.release_authority_changed25();
CREATE TRIGGER release_delegation_epoch25 AFTER INSERT OR UPDATE OR DELETE ON private.team_delegations FOR EACH ROW EXECUTE FUNCTION private.release_authority_changed25();
CREATE TABLE private.document_exception_events25(
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),office_id uuid NOT NULL,publication_id uuid NOT NULL,actor_id uuid NOT NULL REFERENCES auth.users(id),membership_id uuid NOT NULL REFERENCES public.memberships(id),
 kind text NOT NULL CHECK(kind IN('request','authorize','reject','revoke')),reason text NOT NULL CHECK(char_length(reason) BETWEEN 5 AND 500 AND reason=btrim(reason) AND reason!~'[[:cntrl:]]'),
 expires_at timestamptz NOT NULL,scope jsonb NOT NULL,authority_epoch uuid,created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
 FOREIGN KEY(office_id,publication_id) REFERENCES private.document_publications(office_id,id) ON DELETE RESTRICT
);
CREATE INDEX exception_events25_pub_idx ON private.document_exception_events25(office_id,publication_id,created_at DESC,id DESC);
CREATE INDEX exception_events25_actor_idx ON private.document_exception_events25(actor_id);
CREATE INDEX exception_events25_member_idx ON private.document_exception_events25(membership_id);
CREATE TABLE private.document_release_commands25(
 office_id uuid NOT NULL,actor_id uuid NOT NULL REFERENCES auth.users(id),idempotency_key uuid NOT NULL,digest text NOT NULL,publication_id uuid NOT NULL,
 PRIMARY KEY(office_id,actor_id,idempotency_key),FOREIGN KEY(office_id,publication_id) REFERENCES private.document_publications(office_id,id)
);
CREATE INDEX release_commands25_pub_idx ON private.document_release_commands25(office_id,publication_id);
CREATE INDEX release_commands25_actor_idx ON private.document_release_commands25(actor_id);
CREATE TABLE private.document_releases25(
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),office_id uuid NOT NULL,publication_id uuid NOT NULL,revision integer NOT NULL,
 actor_id uuid NOT NULL REFERENCES auth.users(id),session_id uuid NOT NULL,recipient_customer_id uuid REFERENCES public.customers(id),
 file_id uuid,sha256 text NOT NULL CHECK(sha256~'^[a-f0-9]{64}$'),size_bytes bigint NOT NULL CHECK(size_bytes BETWEEN 8 AND 3145728),
 exception_event_id uuid REFERENCES private.document_exception_events25(id),financial_fingerprint text NOT NULL,created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
 FOREIGN KEY(office_id,publication_id) REFERENCES private.document_publications(office_id,id),FOREIGN KEY(office_id,file_id) REFERENCES public.files(office_id,id)
);
CREATE INDEX releases25_pub_idx ON private.document_releases25(office_id,publication_id,created_at DESC);
CREATE INDEX releases25_actor_idx ON private.document_releases25(actor_id);
CREATE INDEX releases25_customer_idx ON private.document_releases25(recipient_customer_id);
CREATE INDEX releases25_file_idx ON private.document_releases25(office_id,file_id);
CREATE INDEX releases25_exception_idx ON private.document_releases25(exception_event_id);
CREATE FUNCTION private.release_finance25(p private.document_publications) RETURNS jsonb LANGUAGE sql STABLE SECURITY INVOKER SET search_path='' AS $$
 WITH f AS(SELECT c.id charge_id,a.* FROM public.documents d JOIN private.charges c ON c.office_id=d.office_id AND c.request_id=d.request_id CROSS JOIN LATERAL private.charges_amounts(c.office_id,c.id)a WHERE d.office_id=p.office_id AND d.id=p.document_id),v AS(
 SELECT coalesce((SELECT jsonb_build_object('charge_id',charge_id,'due_cents',due_cents,'allocated_cents',allocated_cents,'balance_cents',balance_cents,'version',version,'cancelled',cancelled) FROM f),jsonb_build_object('charge_id',NULL,'due_cents',0,'allocated_cents',0,'balance_cents',0,'version',NULL,'cancelled',true))data)
 SELECT data||jsonb_build_object('fingerprint',encode(extensions.digest((data||jsonb_build_object(
 'allocations',(SELECT coalesce(jsonb_agg(a.id ORDER BY a.id),'[]') FROM private.payment_allocations a WHERE a.office_id=p.office_id AND a.charge_id=(data->>'charge_id')::uuid),
 'reversals',(SELECT coalesce(jsonb_agg(r.id ORDER BY r.id),'[]') FROM private.payment_reversals r JOIN private.payment_allocations a ON a.office_id=r.office_id AND a.id=r.allocation_id WHERE a.office_id=p.office_id AND a.charge_id=(data->>'charge_id')::uuid)))::text,'sha256'),'hex')) FROM v;
$$;
CREATE FUNCTION private.release_scope25(p private.document_publications) RETURNS jsonb LANGUAGE sql STABLE SECURITY INVOKER SET search_path='' AS $$
 SELECT jsonb_build_object('revision',p.revision,'customer_id',r.customer_id,'request_version',r.version,'current_revision',d.revision,'financial',private.release_finance25(p),'file_id',s->'file_id',
 'sha256',CASE WHEN s->>'mode'='external' THEN s->>'sha256' ELSE j.sha256 END,'size_bytes',CASE WHEN s->>'mode'='external' THEN(s->>'size_bytes')::bigint ELSE j.size_bytes END,
 'signature_event_id',(SELECT id FROM private.document_signature_events24 WHERE office_id=p.office_id AND publication_id=p.id AND kind<>'exit' ORDER BY created_at DESC,id DESC LIMIT 1))
 FROM public.documents d JOIN public.requests r ON r.office_id=d.office_id AND r.id=d.request_id CROSS JOIN LATERAL(SELECT private.signature_snapshot24(p)s)x LEFT JOIN private.document_artifact_jobs j ON j.office_id=p.office_id AND j.publication_id=p.id AND j.completed_at IS NOT NULL WHERE d.office_id=p.office_id AND d.id=p.document_id;
$$;
CREATE FUNCTION private.release_exception_valid25(p private.document_publications) RETURNS boolean LANGUAGE sql STABLE SECURITY INVOKER SET search_path='' AS $$
 SELECT coalesce((SELECT e.kind='authorize' AND e.expires_at>clock_timestamp() AND e.scope=private.release_scope25(p) AND m.active AND m.role_code<>'client'
 AND e.authority_epoch IS NOT DISTINCT FROM(SELECT epoch FROM private.release_authority25 WHERE membership_id=m.id)
 AND private.team_user_active(m.user_id,m.office_id) AND private.team_permissions_for_member(m.id) @> ARRAY['foundation.access','documents.read','requests.read','customers.read','documents.exceptions.decide']
 AND private.request_in_scope(r,m) AND private.request_can_work(r,m) IS TRUE
 FROM private.document_exception_events25 e JOIN public.memberships m ON m.office_id=e.office_id AND m.id=e.membership_id JOIN public.documents d ON d.office_id=p.office_id AND d.id=p.document_id JOIN public.requests r ON r.office_id=d.office_id AND r.id=d.request_id
 WHERE e.office_id=p.office_id AND e.publication_id=p.id ORDER BY e.created_at DESC,e.id DESC LIMIT 1),false);
$$;
ALTER FUNCTION private.wf_gate(private.document_publications,public.memberships) RENAME TO wf_gate_before25;
CREATE FUNCTION private.avaliar_liberacao25(p private.document_publications,m public.memberships DEFAULT NULL) RETURNS text[] LANGUAGE plpgsql STABLE SECURITY INVOKER SET search_path='' AS $$
DECLARE b text[];BEGIN
 b:=private.wf_gate_before25(p,m);
 IF p.id IS NULL OR NOT EXISTS(SELECT FROM public.documents d JOIN public.requests r ON r.office_id=d.office_id AND r.id=d.request_id WHERE d.office_id=p.office_id AND d.id=p.document_id AND d.revision=p.revision) THEN b:=array_append(b,'superseded');END IF;
 IF 'payment'=ANY(b) AND private.release_exception_valid25(p) THEN b:=array_remove(b,'payment');END IF;
 RETURN b;
END$$;
CREATE FUNCTION private.wf_gate(p private.document_publications,m public.memberships DEFAULT NULL) RETURNS text[] LANGUAGE sql STABLE SECURITY INVOKER SET search_path='' AS $$SELECT private.avaliar_liberacao25(p,m);$$;
-- Signing has its own policy; exception25 applies only to final release.
CREATE OR REPLACE FUNCTION private.signature_exit_blockers24(p private.document_publications) RETURNS text[] LANGUAGE sql STABLE SECURITY INVOKER SET search_path='' AS $$
 SELECT ARRAY(SELECT x FROM unnest(private.wf_gate_before25(p))x WHERE x NOT IN('signature','handoff') AND(x<>'payment' OR private.signature_snapshot24(p)->>'exit_policy'='after_settlement')) || CASE WHEN private.signature_snapshot24(p)->>'mode'='none' OR jsonb_array_length(private.signature_snapshot24(p)->'expected_signers')=0 THEN ARRAY['signature_setup'] ELSE ARRAY[]::text[] END;
$$;
CREATE FUNCTION private.document_release_state(p_office_id uuid,p_publication_id uuid,p_page integer DEFAULT 1) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE p private.document_publications;d public.documents;r public.requests;m public.memberships;e private.document_exception_events25;b text[];h jsonb;n bigint;caps text[];work boolean;status text;BEGIN
 SELECT * INTO p FROM private.document_publications WHERE office_id=p_office_id AND id=p_publication_id;IF p.id IS NULL THEN RAISE EXCEPTION 'DOCUMENT_NOT_FOUND' USING ERRCODE='PT404';END IF;
 SELECT * INTO d FROM public.documents WHERE office_id=p_office_id AND id=p.document_id;
 m:=private.documents_access21(p_office_id,d.request_id,NULL,d.id);
 IF p_page IS NULL OR p_page NOT BETWEEN 1 AND 100000 THEN RAISE EXCEPTION 'DOCUMENTS_VALIDATION' USING ERRCODE='PT422';END IF;
 SELECT * INTO r FROM public.requests WHERE office_id=d.office_id AND id=d.request_id;
 SELECT * INTO e FROM private.document_exception_events25 WHERE office_id=p_office_id AND publication_id=p.id ORDER BY created_at DESC,id DESC LIMIT 1;
 SELECT count(*) INTO n FROM private.document_exception_events25 WHERE office_id=p_office_id AND publication_id=p.id;
 SELECT coalesce(jsonb_agg(v ORDER BY created_at DESC,id DESC),'[]') INTO h FROM(SELECT x.id,x.kind,x.reason,x.created_at,x.expires_at,coalesce(private.customer_relation_display_label(pr.display_name),'Integrante da equipe') actor_name FROM private.document_exception_events25 x JOIN public.profiles pr ON pr.id=x.actor_id WHERE x.office_id=p_office_id AND x.publication_id=p.id ORDER BY x.created_at DESC,x.id DESC LIMIT 5 OFFSET(p_page-1)*5)v;
 b:=private.avaliar_liberacao25(p);caps:=private.current_permissions(p_office_id);work:=d.revision=p.revision AND r.status NOT IN('concluido','cancelado') AND private.request_can_work(r,m) IS TRUE;
 status:=CASE e.kind WHEN 'request' THEN 'requested' WHEN 'authorize' THEN 'authorized' WHEN 'reject' THEN 'rejected' ELSE 'revoked' END;
 IF e.kind IN('request','authorize') THEN IF e.expires_at<=clock_timestamp() THEN status:='expired';ELSIF e.scope IS DISTINCT FROM private.release_scope25(p) OR e.kind='authorize' AND NOT private.release_exception_valid25(p) THEN status:='invalidated';END IF;END IF;
 PERFORM private.documents_access21(p_office_id,d.request_id,NULL,d.id);
 RETURN jsonb_build_object('publication_id',p.id,'revision',p.revision,'last_event_id',e.id,'can_request',work AND caps @> ARRAY['documents.exceptions.request'],'can_decide',work AND caps @> ARRAY['documents.exceptions.decide'],'ready',cardinality(b)=0,'blockers',to_jsonb(b),'approved',private.wf_approved(p),'signed',private.wf_signed(p),'financial',private.release_finance25(p)-'version'-'cancelled','exception',CASE WHEN e.id IS NULL THEN NULL ELSE jsonb_build_object('status',status,'reason',e.reason,'expires_at',e.expires_at,'revision',(e.scope->>'revision')::int,'sha256',e.scope->>'sha256','balance_cents',(e.scope#>>'{financial,balance_cents}')::bigint,'charge_id',e.scope#>>'{financial,charge_id}') END,'history',h,'history_total',n,'page',p_page,'page_size',5);
END$$;
CREATE FUNCTION private.document_release_command(p_office_id uuid,p_publication_id uuid,p_command jsonb,p_idempotency_key uuid) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE p private.document_publications;d public.documents;m public.memberships;e private.document_exception_events25;k text;why text;exp timestamptz;h text;old private.document_release_commands25;scope jsonb;cap text;BEGIN
 PERFORM 1 FROM public.offices WHERE id=p_office_id FOR NO KEY UPDATE;
 SELECT * INTO p FROM private.document_publications WHERE office_id=p_office_id AND id=p_publication_id;IF p.id IS NULL THEN RAISE EXCEPTION 'DOCUMENT_NOT_FOUND' USING ERRCODE='PT404';END IF;
 SELECT * INTO d FROM public.documents WHERE office_id=p_office_id AND id=p.document_id;
 k:=p_command->>'kind';cap:=CASE WHEN k='request' THEN 'documents.exceptions.request' ELSE 'documents.exceptions.decide' END;
 m:=private.documents_access21(p_office_id,d.request_id,cap,d.id);
 IF p_idempotency_key IS NULL OR jsonb_typeof(p_command) IS DISTINCT FROM 'object' OR NOT p_command ?& ARRAY['kind','expected_revision','expected_event_id','reason'] OR k IS NULL OR k NOT IN('request','authorize','reject','revoke') OR p_command-ARRAY['kind','expected_revision','expected_event_id','reason','expires_at']<>'{}' OR(k='request') IS DISTINCT FROM(p_command ? 'expires_at') OR jsonb_typeof(p_command->'reason') IS DISTINCT FROM 'string' OR jsonb_typeof(p_command->'expected_revision') IS DISTINCT FROM 'number' OR p_command->>'expected_revision'!~'^[1-9][0-9]{0,9}$' OR(p_command->>'expected_revision')::numeric>2147483646 OR NOT(p_command->'expected_event_id'='null'::jsonb OR jsonb_typeof(p_command->'expected_event_id')='string' AND p_command->>'expected_event_id'~*'^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$') THEN RAISE EXCEPTION 'DOCUMENTS_VALIDATION' USING ERRCODE='PT422';END IF;
 why:=p_command->>'reason';IF char_length(why) NOT BETWEEN 5 AND 500 OR why<>btrim(why) OR why~'[[:cntrl:]]' THEN RAISE EXCEPTION 'DOCUMENTS_VALIDATION' USING ERRCODE='PT422';END IF;
 h:=encode(extensions.digest(jsonb_build_object('publication',p.id,'command',p_command)::text,'sha256'),'hex');
 SELECT * INTO old FROM private.document_release_commands25 WHERE office_id=p_office_id AND actor_id=m.user_id AND idempotency_key=p_idempotency_key;
 IF old.idempotency_key IS NOT NULL THEN IF old.digest<>h OR old.publication_id<>p.id THEN RAISE EXCEPTION 'DOCUMENT_CONFLICT' USING ERRCODE='PT409';END IF;RETURN private.document_release_state(p_office_id,p.id,1);END IF;
 SELECT * INTO e FROM private.document_exception_events25 WHERE office_id=p_office_id AND publication_id=p.id ORDER BY created_at DESC,id DESC LIMIT 1;
 IF (p_command->>'expected_revision')::int<>p.revision OR d.revision<>p.revision OR e.id IS DISTINCT FROM(p_command->>'expected_event_id')::uuid THEN RAISE EXCEPTION 'DOCUMENT_CONFLICT' USING ERRCODE='PT409';END IF;
 scope:=private.release_scope25(p);
 IF k='request' THEN
 BEGIN exp:=(p_command->>'expires_at')::timestamptz;EXCEPTION WHEN OTHERS THEN RAISE EXCEPTION 'DOCUMENTS_VALIDATION' USING ERRCODE='PT422';END;
 IF jsonb_typeof(p_command->'expires_at') IS DISTINCT FROM 'string' OR exp IS NULL OR NOT isfinite(exp) OR exp<=clock_timestamp() OR exp>clock_timestamp()+interval '30 days' OR scope#>>'{financial,charge_id}' IS NULL OR(scope#>>'{financial,cancelled}')::boolean OR(scope#>>'{financial,balance_cents}')::bigint<=0 OR scope->>'sha256' IS NULL OR scope->>'customer_id' IS NULL THEN RAISE EXCEPTION 'DOCUMENTS_VALIDATION' USING ERRCODE='PT422';END IF;
 ELSE exp:=e.expires_at;
 IF e.id IS NULL OR(k IN('authorize','reject') AND(e.kind<>'request' OR e.expires_at<=clock_timestamp() OR e.scope IS DISTINCT FROM scope)) OR(k='revoke' AND e.kind<>'authorize') THEN RAISE EXCEPTION 'DOCUMENT_CONFLICT' USING ERRCODE='PT409';END IF;
 END IF;
 -- All source waits completed; revalidate session, capability, scope and time now.
 m:=private.documents_access21(p_office_id,d.request_id,cap,d.id);
 IF k IN('request','authorize','reject') AND exp<=clock_timestamp() THEN RAISE EXCEPTION 'DOCUMENT_CONFLICT' USING ERRCODE='PT409';END IF;
 INSERT INTO private.document_exception_events25(office_id,publication_id,actor_id,membership_id,kind,reason,expires_at,scope,authority_epoch)VALUES(p_office_id,p.id,m.user_id,m.id,k,why,exp,scope,(SELECT epoch FROM private.release_authority25 WHERE membership_id=m.id));
 INSERT INTO private.document_release_commands25 VALUES(p_office_id,m.user_id,p_idempotency_key,h,p.id);
 RETURN private.document_release_state(p_office_id,p.id,1);
END$$;
-- Extend trusted24 authorization; worker already reauthorizes after reading exact bytes.
DO $m$ DECLARE s text;BEGIN
 SELECT pg_get_functiondef('private.document_artifact_authorize(uuid,uuid,boolean)'::regprocedure) INTO s;
 s:=replace(s,'IF p_receipt IS TRUE THEN INSERT INTO private.document_publication_events', $code$IF p_receipt IS TRUE THEN
 INSERT INTO private.document_releases25(office_id,publication_id,revision,actor_id,session_id,recipient_customer_id,file_id,sha256,size_bytes,exception_event_id,financial_fingerprint)
 VALUES(p_office_id,p.id,p.revision,m.user_id,(auth.jwt()->>'session_id')::uuid,r.customer_id,(result->>'file_id')::uuid,result->>'sha256',(result->>'size_bytes')::bigint,
 CASE WHEN private.release_exception_valid25(p) THEN(SELECT id FROM private.document_exception_events25 WHERE office_id=p_office_id AND publication_id=p.id ORDER BY created_at DESC,id DESC LIMIT 1) END,private.release_finance25(p)->>'fingerprint');
 INSERT INTO private.document_publication_events$code$);
 EXECUTE s;
END$m$;
DO $m$ DECLARE n text;r record;BEGIN
 FOREACH n IN ARRAY ARRAY['release_authority25','document_exception_events25','document_release_commands25','document_releases25'] LOOP
 EXECUTE format('ALTER TABLE private.%I ENABLE ROW LEVEL SECURITY',n);EXECUTE format('REVOKE ALL ON private.%I FROM PUBLIC,anon,authenticated,service_role',n);
 IF n<>'release_authority25' THEN EXECUTE format('CREATE TRIGGER %I BEFORE UPDATE OR DELETE ON private.%I FOR EACH ROW EXECUTE FUNCTION private.wf_immutable()',n||'_immutable',n);END IF;END LOOP;
 EXECUTE 'CREATE FUNCTION public.document_release_state(p_office_id uuid,p_publication_id uuid,p_page integer DEFAULT 1) RETURNS jsonb LANGUAGE sql SECURITY INVOKER SET search_path='''' AS $f$SELECT private.document_release_state(p_office_id,p_publication_id,p_page);$f$';
 EXECUTE 'CREATE FUNCTION public.document_release_command(p_office_id uuid,p_publication_id uuid,p_command jsonb,p_idempotency_key uuid) RETURNS jsonb LANGUAGE sql SECURITY INVOKER SET search_path='''' AS $f$SELECT private.document_release_command(p_office_id,p_publication_id,p_command,p_idempotency_key);$f$';
 FOR r IN SELECT oid::regprocedure p,proname FROM pg_proc WHERE pronamespace IN('public'::regnamespace,'private'::regnamespace) AND proname IN('document_release_state','document_release_command','release_finance25','release_scope25','release_exception_valid25','avaliar_liberacao25','release_authority_changed25','wf_gate') LOOP
 EXECUTE format('REVOKE ALL ON FUNCTION %s FROM PUBLIC,anon,authenticated,service_role',r.p);IF r.proname IN('document_release_state','document_release_command') THEN EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO authenticated',r.p);END IF;END LOOP;
END$m$;
NOTIFY pgrst,'reload schema';
