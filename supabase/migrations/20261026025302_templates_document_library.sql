-- Etapa20: empty documentary template library. No Auth, individual grants or PDF history rewritten.
INSERT INTO public.permissions(code,name) VALUES('templates.read','Consultar modelos'),('templates.manage','Gerir modelos'),('templates.approve','Aprovar modelos') ON CONFLICT DO NOTHING;
INSERT INTO public.role_permissions(role_code,permission_code) SELECT 'owner',code FROM public.permissions WHERE code IN('templates.read','templates.manage','templates.approve') ON CONFLICT DO NOTHING;
-- Extend the existing live management allowlists without replacing historical audit/PDF bodies.
DO $migration$ DECLARE r record;d text;extra text:=', ''templates.read'', ''templates.manage'', ''templates.approve''';BEGIN
 FOR r IN SELECT conrelid::regclass tbl,conname,pg_get_constraintdef(oid) def FROM pg_constraint WHERE conrelid IN('private.team_member_permissions'::regclass,'private.team_delegations'::regclass,'private.team_invitations'::regclass) AND contype='c' AND pg_get_constraintdef(oid) LIKE '%cash.read%' LOOP
 d:=replace(r.def,'''cash.read''::text','''cash.read''::text'||replace(extra,', ','::text, ')||'::text');EXECUTE format('ALTER TABLE %s DROP CONSTRAINT %I',r.tbl,r.conname);EXECUTE format('ALTER TABLE %s ADD CONSTRAINT %I %s',r.tbl,r.conname,d);
 END LOOP;
 FOR r IN SELECT oid FROM pg_proc WHERE pronamespace='private'::regnamespace AND proname IN('team_scope_for_member','team_validate_assignment','safe_audit_changes') LOOP d:=pg_get_functiondef(r.oid);d:=replace(d,'''cash.read''','''cash.read'''||extra);EXECUTE d;END LOOP;
END $migration$;
-- ECMAScript String.trim whitespace: mirror the API/DTO without changing valid literal text.
CREATE FUNCTION private.templates_has_text20(value text) RETURNS boolean LANGUAGE sql IMMUTABLE SECURITY INVOKER SET search_path='' AS $$
 SELECT coalesce(length(btrim(value,U&'\0009\000A\000B\000C\000D\0020\00A0\1680\2000\2001\2002\2003\2004\2005\2006\2007\2008\2009\200A\2028\2029\202F\205F\3000\FEFF'))>0,false);
$$;
CREATE FUNCTION private.templates_validate20(d jsonb) RETURNS jsonb LANGUAGE plpgsql IMMUTABLE SECURITY INVOKER SET search_path='' AS $$
DECLARE k text;v jsonb;typ text;seen text[]:='{}';placeholders text[];at_from timestamptz;at_until timestamptz;remaining text;BEGIN
 IF jsonb_typeof(d) IS DISTINCT FROM 'object' THEN RAISE EXCEPTION 'TEMPLATES_VALIDATION' USING ERRCODE='PT422';END IF;
 IF NOT d ?& ARRAY['code','name','kind','content','demonstration','effective_from','effective_until','variables','signature_policy','review_required'] OR(SELECT count(*) FROM jsonb_object_keys(d))<>10 THEN RAISE EXCEPTION 'TEMPLATES_VALIDATION' USING ERRCODE='PT422';END IF;
 FOREACH k IN ARRAY ARRAY['code','name','kind','content','signature_policy'] LOOP IF jsonb_typeof(d->k) IS DISTINCT FROM 'string' THEN RAISE EXCEPTION 'TEMPLATES_VALIDATION' USING ERRCODE='PT422';END IF;END LOOP;
 IF d->>'code' !~ '^[A-Z0-9][A-Z0-9_-]{1,31}$' OR (char_length(d->>'name') NOT BETWEEN 1 AND 120 OR NOT private.templates_has_text20(d->>'name')) OR d->>'name' ~ '[[:cntrl:]]' OR (char_length(d->>'content') NOT BETWEEN 1 AND 30000 OR NOT private.templates_has_text20(d->>'content')) OR d->>'content' ~ '[\x01-\x08\x0B\x0C\x0E-\x1F\x7F]' OR d->>'kind' NOT IN('contract','declaration','application','official_letter') OR d->>'signature_policy' NOT IN('none','physical','external') OR jsonb_typeof(d->'demonstration') IS DISTINCT FROM 'boolean' OR jsonb_typeof(d->'review_required') IS DISTINCT FROM 'boolean' THEN RAISE EXCEPTION 'TEMPLATES_VALIDATION' USING ERRCODE='PT422';END IF;
 FOREACH k IN ARRAY ARRAY['effective_from','effective_until'] LOOP
 IF d->k<>'null'::jsonb THEN
 IF jsonb_typeof(d->k) IS DISTINCT FROM 'string' OR d->>k !~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}T[0-9]{2}:[0-9]{2}:[0-9]{2}\.[0-9]{3}Z$' THEN RAISE EXCEPTION 'TEMPLATES_VALIDATION' USING ERRCODE='PT422';END IF;
 BEGIN IF k='effective_from' THEN at_from:=(d->>k)::timestamptz;ELSE at_until:=(d->>k)::timestamptz;END IF;EXCEPTION WHEN datetime_field_overflow OR invalid_datetime_format THEN RAISE EXCEPTION 'TEMPLATES_VALIDATION' USING ERRCODE='PT422';END;
 IF to_char((d->>k)::timestamptz AT TIME ZONE 'UTC','YYYY-MM-DD"T"HH24:MI:SS.MS"Z"')<>d->>k THEN RAISE EXCEPTION 'TEMPLATES_VALIDATION' USING ERRCODE='PT422';END IF;
 END IF;END LOOP;
 IF at_from IS NOT NULL AND at_until IS NOT NULL AND at_until<=at_from THEN RAISE EXCEPTION 'TEMPLATES_VALIDATION' USING ERRCODE='PT422';END IF;
 IF jsonb_typeof(d->'variables') IS DISTINCT FROM 'array' THEN RAISE EXCEPTION 'TEMPLATES_VALIDATION' USING ERRCODE='PT422';END IF;
 IF jsonb_array_length(d->'variables')>20 THEN RAISE EXCEPTION 'TEMPLATES_VALIDATION' USING ERRCODE='PT422';END IF;
 FOR v IN SELECT x FROM jsonb_array_elements(d->'variables')x LOOP
 IF jsonb_typeof(v) IS DISTINCT FROM 'object' THEN RAISE EXCEPTION 'TEMPLATES_VALIDATION' USING ERRCODE='PT422';END IF;
 IF NOT v ?& ARRAY['key','label','type','required'] OR(SELECT count(*) FROM jsonb_object_keys(v))<>4 OR jsonb_typeof(v->'key') IS DISTINCT FROM 'string' OR jsonb_typeof(v->'label') IS DISTINCT FROM 'string' OR (char_length(v->>'label') NOT BETWEEN 1 AND 80 OR NOT private.templates_has_text20(v->>'label')) OR v->>'label' ~ '[[:cntrl:]]' OR jsonb_typeof(v->'type') IS DISTINCT FROM 'string' OR jsonb_typeof(v->'required') IS DISTINCT FROM 'boolean' OR v->>'key'=ANY(seen) THEN RAISE EXCEPTION 'TEMPLATES_VALIDATION' USING ERRCODE='PT422';END IF;
 typ:=CASE WHEN v->>'key' IN('cliente.nome','cliente.cpf','cliente.endereco','participante.vendedor.nome','participante.vendedor.cpf','participante.comprador.nome','participante.comprador.cpf','servico.descricao') THEN 'text' WHEN v->>'key' IN('datas.emissao','datas.inicio','datas.fim') THEN 'date' WHEN v->>'key' IN('valores.total','valores.parcela') THEN 'money' WHEN v->>'key'='servico.quantidade' THEN 'number' END;
 IF typ IS NULL OR v->>'type'<>typ THEN RAISE EXCEPTION 'TEMPLATES_VALIDATION' USING ERRCODE='PT422';END IF;seen:=array_append(seen,v->>'key');END LOOP;
 SELECT coalesce(array_agg(DISTINCT m[1]),'{}') INTO placeholders FROM regexp_matches(d->>'content','\{\{([a-z]+(\.[a-z]+)+)\}\}','g')m;
 remaining:=regexp_replace(d->>'content','\{\{([a-z]+(\.[a-z]+)+)\}\}','','g');
 IF strpos(remaining,'{{')>0 OR strpos(remaining,'}}')>0 OR NOT(seen @> placeholders AND seen <@ placeholders) THEN RAISE EXCEPTION 'TEMPLATES_VALIDATION' USING ERRCODE='PT422';END IF;
 RETURN d;
END $$;
CREATE TABLE public.templates(
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),office_id uuid NOT NULL REFERENCES public.offices(id) ON DELETE RESTRICT,code text NOT NULL CHECK(code ~ '^[A-Z0-9][A-Z0-9_-]{1,31}$'),latest_version integer NOT NULL CHECK(latest_version BETWEEN 1 AND 2147483646),created_by uuid NOT NULL REFERENCES auth.users(id) ON DELETE RESTRICT,created_at timestamptz NOT NULL DEFAULT clock_timestamp(),UNIQUE(office_id,id),UNIQUE(office_id,code)
);
CREATE INDEX templates_author_idx ON public.templates(created_by);
CREATE TABLE public.template_versions(
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),office_id uuid NOT NULL,template_id uuid NOT NULL,number integer NOT NULL CHECK(number BETWEEN 1 AND 2147483646),definition jsonb NOT NULL CHECK(definition=private.templates_validate20(definition)),created_by uuid NOT NULL REFERENCES auth.users(id) ON DELETE RESTRICT,created_by_name text NOT NULL,created_at timestamptz NOT NULL DEFAULT clock_timestamp(),reason text NOT NULL CHECK(char_length(reason) BETWEEN 1 AND 500 AND private.templates_has_text20(reason) AND reason !~ '[[:cntrl:]]'),FOREIGN KEY(office_id,template_id) REFERENCES public.templates(office_id,id) ON DELETE RESTRICT,UNIQUE(office_id,template_id,number),UNIQUE(office_id,template_id,id)
);
CREATE INDEX template_versions_author_idx ON public.template_versions(created_by);
CREATE TABLE private.template_approvals(
 office_id uuid NOT NULL,template_id uuid NOT NULL,version_id uuid NOT NULL,approved_by uuid NOT NULL REFERENCES auth.users(id) ON DELETE RESTRICT,approved_by_name text NOT NULL,approved_at timestamptz NOT NULL DEFAULT clock_timestamp(),reason text NOT NULL CHECK(char_length(reason) BETWEEN 1 AND 500 AND private.templates_has_text20(reason) AND reason !~ '[[:cntrl:]]'),PRIMARY KEY(office_id,template_id,version_id),FOREIGN KEY(office_id,template_id,version_id) REFERENCES public.template_versions(office_id,template_id,id) ON DELETE RESTRICT
);
CREATE INDEX template_approvals_author_idx ON private.template_approvals(approved_by);
CREATE TABLE private.template_commands(
 office_id uuid NOT NULL,actor_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE RESTRICT,idempotency_key uuid NOT NULL,payload_digest text NOT NULL CHECK(payload_digest ~ '^[0-9a-f]{64}$'),template_id uuid NOT NULL,created_at timestamptz NOT NULL DEFAULT clock_timestamp(),PRIMARY KEY(office_id,actor_id,idempotency_key),FOREIGN KEY(office_id,template_id) REFERENCES public.templates(office_id,id) ON DELETE RESTRICT
);
CREATE INDEX template_commands_author_idx ON private.template_commands(actor_id);
CREATE FUNCTION private.templates_immutable20() RETURNS trigger LANGUAGE plpgsql SECURITY INVOKER SET search_path='' AS $$BEGIN RAISE EXCEPTION 'TEMPLATE_CONFLICT' USING ERRCODE='PT409';END $$;
CREATE TRIGGER immutable BEFORE UPDATE OR DELETE ON public.template_versions FOR EACH ROW EXECUTE FUNCTION private.templates_immutable20();
CREATE TRIGGER immutable BEFORE UPDATE OR DELETE ON private.template_approvals FOR EACH ROW EXECUTE FUNCTION private.templates_immutable20();
CREATE TRIGGER immutable BEFORE UPDATE OR DELETE ON private.template_commands FOR EACH ROW EXECUTE FUNCTION private.templates_immutable20();
ALTER TABLE public.templates ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.template_versions ENABLE ROW LEVEL SECURITY;
ALTER TABLE private.template_approvals ENABLE ROW LEVEL SECURITY;
ALTER TABLE private.template_commands ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.templates,public.template_versions,private.template_approvals,private.template_commands FROM PUBLIC,anon,authenticated,service_role;
CREATE FUNCTION private.templates_actor20(p_office uuid,p_action text DEFAULT NULL) RETURNS uuid LANGUAGE plpgsql SECURITY INVOKER SET search_path='' AS $$
DECLARE actor uuid;member public.memberships;caps text[];BEGIN
 actor:=private.team_require_identity();IF p_action IS NULL THEN PERFORM 1 FROM public.offices WHERE id=p_office FOR SHARE;ELSE PERFORM 1 FROM public.offices WHERE id=p_office FOR UPDATE;END IF;
 actor:=private.team_require_identity();SELECT * INTO member FROM public.memberships WHERE office_id=p_office AND user_id=actor AND active AND role_code<>'client' FOR SHARE;
 actor:=private.team_require_identity();caps:=private.current_permissions(p_office);
 IF member.id IS NULL OR NOT caps @> ARRAY['foundation.access','templates.read'] OR(p_action IS NOT NULL AND NOT caps @> ARRAY[p_action]) OR(p_action='templates.approve' AND member.role_code NOT IN('owner','admin')) THEN RAISE EXCEPTION 'TEMPLATES_FORBIDDEN' USING ERRCODE='PT403';END IF;RETURN actor;
END $$;
CREATE FUNCTION private.template_version20(v public.template_versions) RETURNS jsonb LANGUAGE sql STABLE SECURITY INVOKER SET search_path='' AS $$
 SELECT v.definition||jsonb_build_object('id',v.id,'number',v.number,'created_by',v.created_by,'created_by_name',v.created_by_name,'created_at',v.created_at,'reason',v.reason,'approved_by',a.approved_by,'approved_by_name',a.approved_by_name,'approved_at',a.approved_at,'approval_reason',a.reason) FROM(SELECT 1)x LEFT JOIN private.template_approvals a ON a.office_id=v.office_id AND a.template_id=v.template_id AND a.version_id=v.id;
$$;
CREATE FUNCTION private.template_detail20(t public.templates,p_page integer) RETURNS jsonb LANGUAGE sql STABLE SECURITY INVOKER SET search_path='' AS $$
 SELECT jsonb_build_object('id',t.id,'code',t.code,'latest_version',t.latest_version,'can_manage',private.current_permissions(t.office_id) @> ARRAY['templates.manage'],'can_approve',private.current_permissions(t.office_id) @> ARRAY['templates.approve'] AND EXISTS(SELECT FROM public.memberships WHERE office_id=t.office_id AND user_id=auth.uid() AND active AND role_code IN('owner','admin')),'versions',coalesce((SELECT jsonb_agg(private.template_version20(v) ORDER BY v.number DESC) FROM(SELECT * FROM public.template_versions WHERE office_id=t.office_id AND template_id=t.id ORDER BY number DESC LIMIT 5 OFFSET(p_page-1)*5)v),'[]'::jsonb),'history_total',t.latest_version,'history_page',p_page);
$$;
CREATE FUNCTION private.templates_page(p_office_id uuid,p_query text,p_page integer,p_size integer) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE result jsonb;total bigint;at_time timestamptz;BEGIN
 PERFORM private.templates_actor20(p_office_id);IF p_query IS NULL OR char_length(p_query)>120 OR p_query ~ '[[:cntrl:]]' OR p_page IS NULL OR p_page NOT BETWEEN 1 AND 100000 OR p_size IS NULL OR p_size NOT IN(3,5) THEN RAISE EXCEPTION 'TEMPLATES_VALIDATION' USING ERRCODE='PT422';END IF;at_time:=clock_timestamp();
 WITH candidates AS(SELECT t.id,t.code,v.definition->>'name' name,v.definition->>'kind' kind,(v.definition->>'demonstration')::boolean demonstration,t.latest_version,(SELECT max(cv.number) FROM public.template_versions cv JOIN private.template_approvals a ON a.office_id=cv.office_id AND a.template_id=cv.template_id AND a.version_id=cv.id WHERE cv.office_id=t.office_id AND cv.template_id=t.id AND greatest(a.approved_at,(cv.definition->>'effective_from')::timestamptz)<=at_time AND((cv.definition->>'effective_until') IS NULL OR(cv.definition->>'effective_until')::timestamptz>at_time))current_version FROM public.templates t JOIN public.template_versions v ON v.office_id=t.office_id AND v.template_id=t.id AND v.number=t.latest_version WHERE t.office_id=p_office_id AND(btrim(p_query)='' OR strpos(lower(t.code||' '||(v.definition->>'name')),lower(btrim(p_query)))>0)),page AS(SELECT * FROM candidates ORDER BY code,id LIMIT p_size OFFSET(p_page-1)*p_size)
 SELECT(SELECT count(*) FROM candidates),coalesce((SELECT jsonb_agg(to_jsonb(page) ORDER BY code,id) FROM page),'[]') INTO total,result;
 RETURN jsonb_build_object('items',result,'total',total,'page',p_page,'page_size',p_size);END $$;
CREATE FUNCTION private.template_detail(p_office_id uuid,p_template_id uuid,p_page integer) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE t public.templates;BEGIN PERFORM private.templates_actor20(p_office_id);IF p_page IS NULL OR p_page NOT BETWEEN 1 AND 100000 THEN RAISE EXCEPTION 'TEMPLATES_VALIDATION' USING ERRCODE='PT422';END IF;SELECT * INTO t FROM public.templates WHERE office_id=p_office_id AND id=p_template_id;IF t.id IS NULL THEN RAISE EXCEPTION 'TEMPLATE_NOT_FOUND' USING ERRCODE='PT404';END IF;RETURN private.template_detail20(t,p_page);END $$;
CREATE FUNCTION private.template_save(p_office_id uuid,p_template_id uuid,p_definition jsonb,p_expected_version integer,p_reason text,p_idempotency_key uuid) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE actor uuid;t public.templates;cmd private.template_commands;digest text;actorname text;BEGIN
 actor:=private.templates_actor20(p_office_id,'templates.manage');PERFORM private.templates_validate20(p_definition);
 IF p_idempotency_key IS NULL OR p_expected_version IS NULL OR p_expected_version NOT BETWEEN 0 AND 2147483645 OR p_reason IS NULL OR (char_length(p_reason) NOT BETWEEN 1 AND 500 OR NOT private.templates_has_text20(p_reason)) OR p_reason ~ '[[:cntrl:]]' THEN RAISE EXCEPTION 'TEMPLATES_VALIDATION' USING ERRCODE='PT422';END IF;
 digest:=encode(extensions.digest(jsonb_build_object('operation','save','template_id',p_template_id,'definition',p_definition,'expected_version',p_expected_version,'reason',p_reason)::text,'sha256'),'hex');SELECT * INTO cmd FROM private.template_commands WHERE office_id=p_office_id AND actor_id=actor AND idempotency_key=p_idempotency_key;
 IF FOUND THEN IF cmd.payload_digest<>digest THEN RAISE EXCEPTION 'TEMPLATE_CONFLICT' USING ERRCODE='PT409';END IF;RETURN private.template_detail(p_office_id,cmd.template_id,1);END IF;
 IF p_template_id IS NULL THEN
 IF p_expected_version<>0 THEN RAISE EXCEPTION 'TEMPLATE_CONFLICT' USING ERRCODE='PT409';END IF;
 IF EXISTS(SELECT FROM public.templates WHERE office_id=p_office_id AND code=p_definition->>'code') THEN RAISE EXCEPTION 'TEMPLATE_DUPLICATE' USING ERRCODE='PT409';END IF;
 INSERT INTO public.templates(office_id,code,latest_version,created_by)VALUES(p_office_id,p_definition->>'code',1,actor) RETURNING * INTO t;
 ELSE SELECT * INTO t FROM public.templates WHERE office_id=p_office_id AND id=p_template_id FOR UPDATE;IF t.id IS NULL THEN RAISE EXCEPTION 'TEMPLATE_NOT_FOUND' USING ERRCODE='PT404';END IF;
 actor:=private.templates_actor20(p_office_id,'templates.manage');IF t.latest_version<>p_expected_version OR t.code<>p_definition->>'code' THEN RAISE EXCEPTION 'TEMPLATE_CONFLICT' USING ERRCODE='PT409';END IF;UPDATE public.templates SET latest_version=latest_version+1 WHERE id=t.id RETURNING * INTO t;END IF;
 SELECT coalesce(private.customer_relation_display_label(display_name),'Integrante da equipe') INTO actorname FROM public.profiles WHERE id=actor;actorname:=coalesce(actorname,'Integrante da equipe');
 INSERT INTO public.template_versions(office_id,template_id,number,definition,created_by,created_by_name,reason)VALUES(p_office_id,t.id,t.latest_version,p_definition,actor,actorname,p_reason);
 INSERT INTO private.template_commands(office_id,actor_id,idempotency_key,payload_digest,template_id)VALUES(p_office_id,actor,p_idempotency_key,digest,t.id);
 PERFORM private.emit_business_event(p_office_id,'templates.saved','template',t.id,p_idempotency_key,'{}');RETURN private.template_detail20(t,1);END $$;
CREATE FUNCTION private.template_approve(p_office_id uuid,p_template_id uuid,p_version_id uuid,p_expected_version integer,p_reason text,p_idempotency_key uuid) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE actor uuid;t public.templates;v public.template_versions;cmd private.template_commands;digest text;actorname text;approved_time timestamptz;BEGIN
 actor:=private.templates_actor20(p_office_id,'templates.approve');
 IF p_idempotency_key IS NULL OR p_version_id IS NULL OR p_expected_version IS NULL OR p_expected_version NOT BETWEEN 1 AND 2147483646 OR p_reason IS NULL OR (char_length(p_reason) NOT BETWEEN 1 AND 500 OR NOT private.templates_has_text20(p_reason)) OR p_reason ~ '[[:cntrl:]]' THEN RAISE EXCEPTION 'TEMPLATES_VALIDATION' USING ERRCODE='PT422';END IF;
 digest:=encode(extensions.digest(jsonb_build_object('operation','approve','template_id',p_template_id,'version_id',p_version_id,'expected_version',p_expected_version,'reason',p_reason)::text,'sha256'),'hex');SELECT * INTO cmd FROM private.template_commands WHERE office_id=p_office_id AND actor_id=actor AND idempotency_key=p_idempotency_key;
 IF FOUND THEN IF cmd.payload_digest<>digest THEN RAISE EXCEPTION 'TEMPLATE_CONFLICT' USING ERRCODE='PT409';END IF;RETURN private.template_detail(p_office_id,cmd.template_id,1);END IF;
 SELECT * INTO t FROM public.templates WHERE office_id=p_office_id AND id=p_template_id FOR UPDATE;SELECT * INTO v FROM public.template_versions WHERE office_id=p_office_id AND template_id=p_template_id AND id=p_version_id FOR SHARE;
 actor:=private.templates_actor20(p_office_id,'templates.approve');IF t.id IS NULL OR v.id IS NULL THEN RAISE EXCEPTION 'TEMPLATE_NOT_FOUND' USING ERRCODE='PT404';END IF;
 IF t.latest_version<>p_expected_version OR v.number<>p_expected_version OR EXISTS(SELECT FROM private.template_approvals WHERE office_id=p_office_id AND template_id=t.id AND version_id=v.id) THEN RAISE EXCEPTION 'TEMPLATE_CONFLICT' USING ERRCODE='PT409';END IF;
 approved_time:=clock_timestamp();IF(v.definition->>'effective_until')::timestamptz<=greatest(approved_time,(v.definition->>'effective_from')::timestamptz) THEN RAISE EXCEPTION 'TEMPLATE_CONFLICT' USING ERRCODE='PT409';END IF;
 SELECT coalesce(private.customer_relation_display_label(display_name),'Integrante da equipe') INTO actorname FROM public.profiles WHERE id=actor;actorname:=coalesce(actorname,'Integrante da equipe');
 INSERT INTO private.template_approvals(office_id,template_id,version_id,approved_by,approved_by_name,approved_at,reason)VALUES(p_office_id,t.id,v.id,actor,actorname,approved_time,p_reason);
 INSERT INTO private.template_commands(office_id,actor_id,idempotency_key,payload_digest,template_id)VALUES(p_office_id,actor,p_idempotency_key,digest,t.id);
 PERFORM private.emit_business_event(p_office_id,'templates.approved','template',t.id,p_idempotency_key,'{}');RETURN private.template_detail20(t,1);END $$;
CREATE FUNCTION public.templates_page(p_office_id uuid,p_query text,p_page integer,p_size integer) RETURNS jsonb LANGUAGE sql SECURITY INVOKER SET search_path='' AS $$SELECT private.templates_page(p_office_id,p_query,p_page,p_size);$$;
CREATE FUNCTION public.template_detail(p_office_id uuid,p_template_id uuid,p_page integer) RETURNS jsonb LANGUAGE sql SECURITY INVOKER SET search_path='' AS $$SELECT private.template_detail(p_office_id,p_template_id,p_page);$$;
CREATE FUNCTION public.template_save(p_office_id uuid,p_template_id uuid,p_definition jsonb,p_expected_version integer,p_reason text,p_idempotency_key uuid) RETURNS jsonb LANGUAGE sql SECURITY INVOKER SET search_path='' AS $$SELECT private.template_save(p_office_id,p_template_id,p_definition,p_expected_version,p_reason,p_idempotency_key);$$;
CREATE FUNCTION public.template_approve(p_office_id uuid,p_template_id uuid,p_version_id uuid,p_expected_version integer,p_reason text,p_idempotency_key uuid) RETURNS jsonb LANGUAGE sql SECURITY INVOKER SET search_path='' AS $$SELECT private.template_approve(p_office_id,p_template_id,p_version_id,p_expected_version,p_reason,p_idempotency_key);$$;
DO $$DECLARE r record;BEGIN FOR r IN SELECT oid::regprocedure signature,proname FROM pg_proc WHERE pronamespace IN('public'::regnamespace,'private'::regnamespace) AND(proname LIKE 'templates_%' OR proname LIKE 'template_%') LOOP EXECUTE format('REVOKE ALL ON FUNCTION %s FROM PUBLIC,anon,authenticated,service_role',r.signature);IF r.proname IN('templates_page','template_detail','template_save','template_approve') THEN EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO authenticated',r.signature);END IF;END LOOP;END $$;
-- Only new reports adopt presentation7; all existing snapshots and renderer bodies are retained.
ALTER TABLE private.audit_reports DROP CONSTRAINT audit_reports_renderer_version_check;
ALTER TABLE private.audit_reports ADD CONSTRAINT audit_reports_renderer_version_check CHECK(renderer_version IN(1,2,3,4,5,6,7));
ALTER TABLE private.audit_reports ALTER COLUMN renderer_version SET DEFAULT 7;
NOTIFY pgrst,'reload schema';
