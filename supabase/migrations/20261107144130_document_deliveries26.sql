-- Etapa26. Extends release25; all byte access retains worker24 reauthorization.
INSERT INTO public.permissions(code,name) VALUES('documents.deliver','Registrar entrega documental'),('documents.deliveries.revoke','Revogar acesso final documental') ON CONFLICT DO NOTHING;
INSERT INTO public.role_permissions SELECT 'owner',x FROM unnest(ARRAY['documents.deliver','documents.deliveries.revoke'])x ON CONFLICT DO NOTHING;
DO $m$ DECLARE r record;s text;BEGIN
 FOR r IN SELECT conrelid::regclass tbl,conname,pg_get_constraintdef(oid) def FROM pg_constraint WHERE conrelid IN('private.team_member_permissions'::regclass,'private.team_delegations'::regclass,'private.team_invitations'::regclass) AND contype='c' AND pg_get_constraintdef(oid) LIKE '%documents.exceptions.request%' LOOP
 s:=replace(r.def,'''documents.exceptions.request''::text','''documents.exceptions.request''::text,''documents.deliver''::text,''documents.deliveries.revoke''::text');EXECUTE format('ALTER TABLE %s DROP CONSTRAINT %I',r.tbl,r.conname);EXECUTE format('ALTER TABLE %s ADD CONSTRAINT %I %s',r.tbl,r.conname,s);END LOOP;
 FOR r IN SELECT oid FROM pg_proc WHERE pronamespace='private'::regnamespace AND proname IN('team_scope_for_member','team_validate_assignment','safe_audit_changes') LOOP s:=replace(pg_get_functiondef(r.oid),'''documents.exceptions.request''','''documents.exceptions.request'',''documents.deliver'',''documents.deliveries.revoke''');EXECUTE s;END LOOP;
END$m$;
CREATE TABLE private.deliveries(
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),office_id uuid NOT NULL,publication_id uuid NOT NULL,revision integer NOT NULL,
 recipient_customer_id uuid REFERENCES public.customers(id),recipient_name text NOT NULL,phone text,contact_position smallint,
 channel text NOT NULL CHECK(channel IN('download','print','whatsapp')),actor_id uuid NOT NULL REFERENCES auth.users(id),session_id uuid NOT NULL,
 sha256 text NOT NULL CHECK(sha256~'^[a-f0-9]{64}$'),size_bytes bigint NOT NULL CHECK(size_bytes BETWEEN 8 AND 3145728),file_id uuid,
 release_id uuid UNIQUE REFERENCES private.document_releases25(id),redacted boolean NOT NULL DEFAULT false,scope jsonb NOT NULL,created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
 FOREIGN KEY(office_id,publication_id) REFERENCES private.document_publications(office_id,id),FOREIGN KEY(office_id,file_id) REFERENCES public.files(office_id,id),
 CHECK((redacted AND phone IS NULL AND contact_position IS NULL) OR(channel='whatsapp' AND phone~'^55[0-9]{10,11}$' AND contact_position BETWEEN 0 AND 3) OR(channel<>'whatsapp' AND phone IS NULL AND contact_position IS NULL))
);
CREATE INDEX deliveries_pub26_idx ON private.deliveries(office_id,publication_id,created_at DESC,id DESC);
CREATE INDEX deliveries_recipient26_idx ON private.deliveries(recipient_customer_id);
CREATE INDEX deliveries_actor26_idx ON private.deliveries(actor_id);
CREATE INDEX deliveries_file26_idx ON private.deliveries(office_id,file_id);
CREATE TABLE private.delivery_events26(
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),delivery_id uuid NOT NULL REFERENCES private.deliveries(id),
 kind text NOT NULL CHECK(kind IN('attempt','available','confirmed','revoked')),release_id uuid REFERENCES private.document_releases25(id),actor_id uuid NOT NULL REFERENCES auth.users(id),reason text,
 created_at timestamptz NOT NULL DEFAULT clock_timestamp(),UNIQUE(delivery_id,kind),CHECK(reason IS NULL OR(char_length(reason) BETWEEN 5 AND 500 AND reason=btrim(reason) AND reason!~'[[:cntrl:]]'))
);
CREATE INDEX delivery_events26_order_idx ON private.delivery_events26(delivery_id,created_at DESC,id DESC);
CREATE INDEX delivery_events26_release_idx ON private.delivery_events26(release_id);
CREATE INDEX delivery_events26_actor_idx ON private.delivery_events26(actor_id);
CREATE TABLE private.delivery_commands26(
 office_id uuid NOT NULL,actor_id uuid NOT NULL REFERENCES auth.users(id),idempotency_key uuid NOT NULL,digest text NOT NULL,
 delivery_id uuid NOT NULL REFERENCES private.deliveries(id),PRIMARY KEY(office_id,actor_id,idempotency_key)
);
CREATE INDEX delivery_commands26_delivery_idx ON private.delivery_commands26(delivery_id);
CREATE INDEX delivery_commands26_actor_idx ON private.delivery_commands26(actor_id);
-- Immutable revocation is publication-wide for future final access; it never recalls acquired bytes.
ALTER FUNCTION private.avaliar_liberacao25(private.document_publications,public.memberships) RENAME TO avaliar_liberacao_before26;
CREATE FUNCTION private.avaliar_liberacao25(p private.document_publications,m public.memberships DEFAULT NULL) RETURNS text[] LANGUAGE sql STABLE SECURITY INVOKER SET search_path='' AS $$
 SELECT private.avaliar_liberacao_before26(p,m)||CASE WHEN EXISTS(SELECT FROM private.deliveries d JOIN private.delivery_events26 e ON e.delivery_id=d.id AND e.kind='revoked' WHERE d.office_id=p.office_id AND d.publication_id=p.id) THEN ARRAY['restriction'] ELSE ARRAY[]::text[] END;
$$;
CREATE FUNCTION private.delivery_download26() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE p private.document_publications;did uuid;label text;BEGIN
 SELECT * INTO p FROM private.document_publications WHERE office_id=NEW.office_id AND id=NEW.publication_id;
 SELECT c.name INTO label FROM public.customers c WHERE c.office_id=NEW.office_id AND c.id=NEW.recipient_customer_id;
 INSERT INTO private.deliveries(office_id,publication_id,revision,recipient_customer_id,recipient_name,channel,actor_id,session_id,sha256,size_bytes,file_id,release_id,scope)
 VALUES(NEW.office_id,NEW.publication_id,NEW.revision,NEW.recipient_customer_id,coalesce(label,'Acesso interno'),'download',NEW.actor_id,NEW.session_id,NEW.sha256,NEW.size_bytes,NEW.file_id,NEW.id,private.release_scope25(p)) RETURNING id INTO did;
 INSERT INTO private.delivery_events26(delivery_id,kind,actor_id,reason) VALUES(did,'available',NEW.actor_id,'Acesso privado aos bytes autorizado; não comprova leitura ou recebimento');RETURN NULL;
END$$;
CREATE TRIGGER delivery_download26 AFTER INSERT ON private.document_releases25 FOR EACH ROW EXECUTE FUNCTION private.delivery_download26();
-- Delivery does not edit the request/document: completion cannot strand an eligible final result.
CREATE FUNCTION private.delivery_actor26(o uuid,did uuid,cap text) RETURNS public.memberships LANGUAGE plpgsql SECURITY INVOKER SET search_path='' AS $$
DECLARE m public.memberships;d public.documents;r public.requests;BEGIN
 SELECT * INTO d FROM public.documents WHERE office_id=o AND id=did;
 m:=private.documents_access21(o,d.request_id,NULL,d.id);
 SELECT * INTO r FROM public.requests WHERE office_id=o AND id=d.request_id;
 IF NOT private.current_permissions(o) @> ARRAY[cap] OR private.request_can_work(r,m) IS NOT TRUE THEN RAISE EXCEPTION 'DOCUMENTS_FORBIDDEN' USING ERRCODE='PT403';END IF;
 RETURN m;
END$$;
CREATE FUNCTION private.document_delivery_state(p_office_id uuid,p_publication_id uuid,p_page integer DEFAULT 1) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE p private.document_publications;d public.documents;r public.requests;m public.memberships;caps text[];b text[];items jsonb;recipient jsonb;n bigint;work boolean;BEGIN
 SELECT * INTO p FROM private.document_publications WHERE office_id=p_office_id AND id=p_publication_id;IF p.id IS NULL THEN RAISE EXCEPTION 'DOCUMENT_NOT_FOUND' USING ERRCODE='PT404';END IF;
 SELECT * INTO d FROM public.documents WHERE office_id=p_office_id AND id=p.document_id;
 m:=private.documents_access21(p_office_id,d.request_id,NULL,d.id);
 IF p_page IS NULL OR p_page NOT BETWEEN 1 AND 100000 THEN RAISE EXCEPTION 'DOCUMENTS_VALIDATION' USING ERRCODE='PT422';END IF;
 SELECT * INTO r FROM public.requests WHERE office_id=p_office_id AND id=d.request_id;
 caps:=private.current_permissions(p_office_id);work:=private.request_can_work(r,m) IS TRUE;
 SELECT jsonb_build_object('id',c.id,'name',c.name,'contacts',(SELECT coalesce(jsonb_agg(jsonb_build_object('position',cc.position,'phone',CASE WHEN length(cc.value) IN(10,11) THEN '55'||cc.value ELSE cc.value END) ORDER BY cc.position),'[]') FROM public.customer_contacts cc WHERE cc.office_id=c.office_id AND cc.customer_id=c.id AND cc.kind='phone')) INTO recipient FROM public.customers c WHERE c.office_id=r.office_id AND c.id=r.customer_id;
 SELECT count(*) INTO n FROM private.deliveries WHERE office_id=p_office_id AND publication_id=p.id;
 SELECT coalesce(jsonb_agg(v ORDER BY created_at DESC,id DESC),'[]') INTO items FROM(
 SELECT x.id,x.channel,x.revision,x.sha256,x.recipient_name,x.recipient_customer_id,x.phone,x.created_at,coalesce(private.customer_relation_display_label(pr.display_name),'Integrante da equipe') actor_name,
 e.kind status,e.id last_event_id,(SELECT coalesce(jsonb_agg(jsonb_build_object('id',ev.id,'kind',ev.kind,'reason',ev.reason,'actor_name',coalesce(private.customer_relation_display_label(ep.display_name),'Integrante da equipe'),'created_at',ev.created_at) ORDER BY ev.created_at,ev.id),'[]') FROM private.delivery_events26 ev JOIN public.profiles ep ON ep.id=ev.actor_id WHERE ev.delivery_id=x.id) events
 FROM private.deliveries x JOIN public.profiles pr ON pr.id=x.actor_id CROSS JOIN LATERAL(SELECT * FROM private.delivery_events26 WHERE delivery_id=x.id ORDER BY created_at DESC,id DESC LIMIT 1)e
 WHERE x.office_id=p_office_id AND x.publication_id=p.id ORDER BY x.created_at DESC,x.id DESC LIMIT 5 OFFSET(p_page-1)*5)v;
 b:=private.wf_gate(p);PERFORM private.documents_access21(p_office_id,d.request_id,NULL,d.id);
 RETURN jsonb_build_object('publication_id',p.id,'revision',p.revision,'ready',cardinality(b)=0,'blockers',to_jsonb(b),'can_deliver',work AND caps @> ARRAY['documents.deliver'],'can_revoke',work AND m.role_code IN('owner','admin') AND caps @> ARRAY['documents.deliveries.revoke'],'recipient',recipient,'items',items,'total',n,'page',p_page,'page_size',5);
END$$;
CREATE FUNCTION private.document_delivery_access(p_office_id uuid,p_publication_id uuid,p_delivery_id uuid) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE x private.deliveries;p private.document_publications;d public.documents;m public.memberships;a jsonb;BEGIN
 PERFORM 1 FROM public.offices WHERE id=p_office_id FOR NO KEY UPDATE;
 SELECT * INTO x FROM private.deliveries WHERE office_id=p_office_id AND publication_id=p_publication_id AND id=p_delivery_id;
 IF x.id IS NULL THEN RAISE EXCEPTION 'DOCUMENT_NOT_FOUND' USING ERRCODE='PT404';END IF;
 SELECT * INTO p FROM private.document_publications WHERE office_id=p_office_id AND id=p_publication_id;SELECT * INTO d FROM public.documents WHERE office_id=p_office_id AND id=p.document_id;
 m:=private.delivery_actor26(p_office_id,d.id,'documents.deliver');
 IF x.actor_id<>m.user_id OR x.channel='download' OR x.scope IS DISTINCT FROM private.release_scope25(p) THEN RAISE EXCEPTION 'DOCUMENT_CONFLICT' USING ERRCODE='PT409';END IF;
 IF x.channel='whatsapp' AND NOT EXISTS(SELECT FROM public.customer_contacts cc WHERE cc.office_id=p_office_id AND cc.customer_id=x.recipient_customer_id AND cc.position=x.contact_position AND cc.kind='phone' AND(CASE WHEN length(cc.value) IN(10,11) THEN '55'||cc.value ELSE cc.value END)=x.phone) THEN RAISE EXCEPTION 'DOCUMENT_CONFLICT' USING ERRCODE='PT409';END IF;
 a:=private.document_artifact_authorize(p_office_id,p_publication_id,false);
 IF a->>'sha256' IS DISTINCT FROM x.sha256 OR(a->>'size_bytes')::bigint IS DISTINCT FROM x.size_bytes THEN RAISE EXCEPTION 'DOCUMENT_CONFLICT' USING ERRCODE='PT409';END IF;
 RETURN jsonb_build_object('sha256',x.sha256);
END$$;
CREATE FUNCTION private.document_delivery_command(p_office_id uuid,p_publication_id uuid,p_command jsonb,p_idempotency_key uuid) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE p private.document_publications;d public.documents;r public.requests;m public.memberships;x private.deliveries;e private.delivery_events26;old private.delivery_commands26;k text;cap text;digest text;did uuid;scope jsonb;phone text;contact_slot smallint;a jsonb;obtained uuid;BEGIN
 PERFORM 1 FROM public.offices WHERE id=p_office_id FOR NO KEY UPDATE;
 SELECT * INTO p FROM private.document_publications WHERE office_id=p_office_id AND id=p_publication_id;IF p.id IS NULL THEN RAISE EXCEPTION 'DOCUMENT_NOT_FOUND' USING ERRCODE='PT404';END IF;
 SELECT * INTO d FROM public.documents WHERE office_id=p_office_id AND id=p.document_id;
 k:=p_command->>'kind';cap:=CASE WHEN k='revoke' THEN 'documents.deliveries.revoke' ELSE 'documents.deliver' END;
 m:=private.delivery_actor26(p_office_id,d.id,cap);
 IF k='revoke' AND m.role_code NOT IN('owner','admin') THEN RAISE EXCEPTION 'DOCUMENTS_FORBIDDEN' USING ERRCODE='PT403';END IF;
 IF p_idempotency_key IS NULL OR jsonb_typeof(p_command) IS DISTINCT FROM 'object' OR k IS NULL OR k NOT IN('begin','available','confirm','revoke') THEN RAISE EXCEPTION 'DOCUMENTS_VALIDATION' USING ERRCODE='PT422';END IF;
 digest:=encode(extensions.digest(jsonb_build_object('publication',p.id,'command',p_command)::text,'sha256'),'hex');
 SELECT * INTO old FROM private.delivery_commands26 WHERE office_id=p_office_id AND actor_id=m.user_id AND idempotency_key=p_idempotency_key;
 IF old.idempotency_key IS NOT NULL THEN IF old.digest<>digest THEN RAISE EXCEPTION 'DOCUMENT_CONFLICT' USING ERRCODE='PT409';END IF;RETURN private.document_delivery_state(p_office_id,p.id,1);END IF;
 IF k='begin' THEN
 IF NOT p_command ?& ARRAY['kind','channel','expected_revision','recipient_customer_id','contact_position','expected_phone','recipient_checked'] OR p_command-ARRAY['kind','channel','expected_revision','recipient_customer_id','contact_position','expected_phone','recipient_checked']<>'{}' OR jsonb_typeof(p_command->'channel') IS DISTINCT FROM 'string' OR p_command->>'channel' NOT IN('print','whatsapp') OR p_command->'recipient_checked' IS DISTINCT FROM 'true'::jsonb OR jsonb_typeof(p_command->'expected_revision') IS DISTINCT FROM 'number' OR p_command->>'expected_revision'!~'^[1-9][0-9]{0,9}$' OR(p_command->>'expected_revision')::numeric>2147483646 OR jsonb_typeof(p_command->'recipient_customer_id') IS DISTINCT FROM 'string' OR p_command->>'recipient_customer_id'!~*'^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$' THEN RAISE EXCEPTION 'DOCUMENTS_VALIDATION' USING ERRCODE='PT422';END IF;
 SELECT * INTO r FROM public.requests WHERE office_id=p_office_id AND id=d.request_id;
 IF r.customer_id IS NULL OR r.customer_id IS DISTINCT FROM(p_command->>'recipient_customer_id')::uuid THEN RAISE EXCEPTION 'DOCUMENTS_FORBIDDEN' USING ERRCODE='PT403';END IF;
 IF(p_command->>'expected_revision')::integer<>p.revision THEN RAISE EXCEPTION 'DOCUMENT_CONFLICT' USING ERRCODE='PT409';END IF;
 IF p_command->>'channel'='whatsapp' THEN
 IF jsonb_typeof(p_command->'contact_position') IS DISTINCT FROM 'number' OR p_command->>'contact_position'!~'^[0-3]$' OR jsonb_typeof(p_command->'expected_phone') IS DISTINCT FROM 'string' OR p_command->>'expected_phone'!~'^55[0-9]{10,11}$' THEN RAISE EXCEPTION 'DOCUMENTS_VALIDATION' USING ERRCODE='PT422';END IF;
 contact_slot:=(p_command->>'contact_position')::smallint;
 SELECT CASE WHEN length(cc.value) IN(10,11) THEN '55'||cc.value ELSE cc.value END INTO phone FROM public.customer_contacts cc WHERE cc.office_id=p_office_id AND cc.customer_id=r.customer_id AND cc.kind='phone' AND cc.position=contact_slot;
 IF phone IS NULL OR phone IS DISTINCT FROM p_command->>'expected_phone' THEN RAISE EXCEPTION 'DOCUMENT_CONFLICT' USING ERRCODE='PT409';END IF;
 ELSE IF p_command->'contact_position' IS DISTINCT FROM 'null'::jsonb OR p_command->'expected_phone' IS DISTINCT FROM 'null'::jsonb THEN RAISE EXCEPTION 'DOCUMENTS_VALIDATION' USING ERRCODE='PT422';END IF;END IF;
 a:=private.document_artifact_authorize(p_office_id,p.id,false);scope:=private.release_scope25(p);
 m:=private.delivery_actor26(p_office_id,d.id,cap);
 INSERT INTO private.deliveries(office_id,publication_id,revision,recipient_customer_id,recipient_name,phone,contact_position,channel,actor_id,session_id,sha256,size_bytes,file_id,scope)
 SELECT p_office_id,p.id,p.revision,r.customer_id,c.name,phone,contact_slot,p_command->>'channel',m.user_id,(auth.jwt()->>'session_id')::uuid,a->>'sha256',(a->>'size_bytes')::bigint,(a->>'file_id')::uuid,scope FROM public.customers c WHERE c.office_id=p_office_id AND c.id=r.customer_id RETURNING id INTO did;
 INSERT INTO private.delivery_events26(delivery_id,kind,actor_id) VALUES(did,'attempt',m.user_id);
 ELSE
 IF NOT p_command ?& ARRAY['kind','delivery_id','expected_event_id','reason'] OR p_command-ARRAY['kind','delivery_id','expected_event_id','reason']<>'{}' OR jsonb_typeof(p_command->'reason') IS DISTINCT FROM 'string' OR char_length(p_command->>'reason') NOT BETWEEN 5 AND 500 OR p_command->>'reason'<>btrim(p_command->>'reason') OR p_command->>'reason'~'[[:cntrl:]]' OR p_command->>'delivery_id' IS NULL OR p_command->>'expected_event_id' IS NULL OR p_command->>'delivery_id'!~*'^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$' OR p_command->>'expected_event_id'!~*'^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$' THEN RAISE EXCEPTION 'DOCUMENTS_VALIDATION' USING ERRCODE='PT422';END IF;
 SELECT * INTO x FROM private.deliveries WHERE office_id=p_office_id AND publication_id=p.id AND id=(p_command->>'delivery_id')::uuid;IF x.id IS NULL THEN RAISE EXCEPTION 'DOCUMENT_NOT_FOUND' USING ERRCODE='PT404';END IF;
 SELECT * INTO e FROM private.delivery_events26 WHERE delivery_id=x.id ORDER BY created_at DESC,id DESC LIMIT 1;
 IF e.id IS DISTINCT FROM(p_command->>'expected_event_id')::uuid OR e.kind='revoked' OR(k='available' AND(e.kind<>'attempt' OR x.channel='download')) OR(k='confirm' AND e.kind<>'available') THEN RAISE EXCEPTION 'DOCUMENT_CONFLICT' USING ERRCODE='PT409';END IF;
 IF k='available' THEN
 PERFORM private.document_delivery_access(p_office_id,p.id,x.id);
 SELECT ar.id INTO obtained FROM private.document_releases25 ar WHERE ar.office_id=p_office_id AND ar.publication_id=p.id AND ar.actor_id=m.user_id AND ar.session_id=(auth.jwt()->>'session_id')::uuid AND ar.recipient_customer_id IS NOT DISTINCT FROM x.recipient_customer_id AND ar.sha256=x.sha256 AND ar.file_id IS NOT DISTINCT FROM x.file_id AND ar.size_bytes=x.size_bytes AND ar.created_at>x.created_at ORDER BY ar.created_at DESC,ar.id DESC LIMIT 1;
 IF obtained IS NULL THEN RAISE EXCEPTION 'DOCUMENT_CONFLICT' USING ERRCODE='PT409';END IF;
 END IF;
 m:=private.delivery_actor26(p_office_id,d.id,cap);did:=x.id;
 INSERT INTO private.delivery_events26(delivery_id,kind,actor_id,reason,release_id) VALUES(did,CASE k WHEN 'confirm' THEN 'confirmed' WHEN 'revoke' THEN 'revoked' ELSE 'available' END,m.user_id,p_command->>'reason',obtained);
 END IF;
 INSERT INTO private.delivery_commands26 VALUES(p_office_id,m.user_id,p_idempotency_key,digest,did);
 RETURN private.document_delivery_state(p_office_id,p.id,1);
END$$;
DO $m$ DECLARE n text;a text;r record;BEGIN
 FOREACH n IN ARRAY ARRAY['deliveries','delivery_events26','delivery_commands26'] LOOP
 EXECUTE format('ALTER TABLE private.%I ENABLE ROW LEVEL SECURITY',n);EXECUTE format('REVOKE ALL ON private.%I FROM PUBLIC,anon,authenticated,service_role',n);
 EXECUTE format('CREATE TRIGGER %I BEFORE UPDATE OR DELETE ON private.%I FOR EACH ROW EXECUTE FUNCTION private.wf_immutable()',n||'_immutable',n);END LOOP;
 FOR n,a IN SELECT * FROM(VALUES('document_delivery_state','p_office_id uuid,p_publication_id uuid,p_page integer DEFAULT 1'),('document_delivery_command','p_office_id uuid,p_publication_id uuid,p_command jsonb,p_idempotency_key uuid'),('document_delivery_access','p_office_id uuid,p_publication_id uuid,p_delivery_id uuid'))v(n,a) LOOP
 EXECUTE format('CREATE FUNCTION public.%I(%s) RETURNS jsonb LANGUAGE sql SECURITY INVOKER SET search_path='''' AS $f$SELECT private.%I(%s);$f$',n,a,n,CASE n WHEN 'document_delivery_state' THEN 'p_office_id,p_publication_id,p_page' WHEN 'document_delivery_command' THEN 'p_office_id,p_publication_id,p_command,p_idempotency_key' ELSE 'p_office_id,p_publication_id,p_delivery_id' END);END LOOP;
 FOR r IN SELECT oid::regprocedure p,proname FROM pg_proc WHERE pronamespace IN('private'::regnamespace,'public'::regnamespace) AND proname IN('document_delivery_state','document_delivery_command','document_delivery_access','delivery_download26','delivery_actor26','delivery_redaction26','avaliar_liberacao25','avaliar_liberacao_before26') LOOP
 EXECUTE format('REVOKE ALL ON FUNCTION %s FROM PUBLIC,anon,authenticated,service_role',r.p);IF r.proname IN('document_delivery_state','document_delivery_command','document_delivery_access') THEN EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO authenticated',r.p);END IF;END LOOP;
END$m$;
-- Same reserved, leased, hold-aware erasure context as the existing document engine.
CREATE FUNCTION private.delivery_redaction26() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE o uuid;doc uuid;BEGIN
 IF TG_OP<>'UPDATE' THEN RAISE EXCEPTION 'DOCUMENT_CONFLICT' USING ERRCODE='PT409';END IF;
 IF TG_TABLE_NAME='deliveries' THEN
 SELECT p.office_id,p.document_id INTO o,doc FROM private.document_publications p WHERE p.office_id=OLD.office_id AND p.id=OLD.publication_id;
 IF NEW.redacted IS NOT TRUE OR NEW.recipient_name<>'Registro preservado' OR NEW.phone IS NOT NULL OR NEW.contact_position IS NOT NULL OR(to_jsonb(NEW)-ARRAY['redacted','recipient_name','phone','contact_position']) IS DISTINCT FROM(to_jsonb(OLD)-ARRAY['redacted','recipient_name','phone','contact_position']) THEN RAISE EXCEPTION 'DOCUMENT_CONFLICT' USING ERRCODE='PT409';END IF;
 ELSE
 SELECT p.office_id,p.document_id INTO o,doc FROM private.deliveries x JOIN private.document_publications p ON p.office_id=x.office_id AND p.id=x.publication_id WHERE x.id=OLD.delivery_id;
 IF NEW.reason IS NOT NULL OR(to_jsonb(NEW)-'reason') IS DISTINCT FROM(to_jsonb(OLD)-'reason') THEN RAISE EXCEPTION 'DOCUMENT_CONFLICT' USING ERRCODE='PT409';END IF;
 END IF;
 IF private.retention_redaction_allowed(o,doc) IS NOT TRUE THEN RAISE EXCEPTION 'DOCUMENT_CONFLICT' USING ERRCODE='PT409';END IF;RETURN NEW;
END$$;
REVOKE ALL ON FUNCTION private.delivery_redaction26() FROM PUBLIC,anon,authenticated,service_role;
DROP TRIGGER deliveries_immutable ON private.deliveries;
CREATE TRIGGER deliveries_immutable BEFORE UPDATE OR DELETE ON private.deliveries FOR EACH ROW EXECUTE FUNCTION private.delivery_redaction26();
DROP TRIGGER delivery_events26_immutable ON private.delivery_events26;
CREATE TRIGGER delivery_events26_immutable BEFORE UPDATE OR DELETE ON private.delivery_events26 FOR EACH ROW EXECUTE FUNCTION private.delivery_redaction26();
DO $m$ DECLARE s text;original text;BEGIN
 SELECT pg_get_functiondef('private.retention_redact_document(uuid,uuid)'::regprocedure) INTO original;
 s:=replace(original,'DELETE FROM private.retention_redaction_context WHERE backend_pid=pg_backend_pid() AND transaction_id=txid_current();',$code$
 UPDATE private.deliveries x SET redacted=true,recipient_name='Registro preservado',phone=NULL,contact_position=NULL WHERE x.office_id=i.office_id AND x.publication_id IN(SELECT id FROM private.document_publications WHERE office_id=i.office_id AND document_id=i.target_id);
 UPDATE private.delivery_events26 e SET reason=NULL WHERE e.delivery_id IN(SELECT x.id FROM private.deliveries x JOIN private.document_publications p ON p.office_id=x.office_id AND p.id=x.publication_id WHERE p.office_id=i.office_id AND p.document_id=i.target_id);
 DELETE FROM private.retention_redaction_context WHERE backend_pid=pg_backend_pid() AND transaction_id=txid_current();$code$);
 IF s=original THEN RAISE EXCEPTION 'RETENTION_ADAPTER_MISMATCH';END IF;EXECUTE s;
END$m$;
NOTIFY pgrst,'reload schema';
