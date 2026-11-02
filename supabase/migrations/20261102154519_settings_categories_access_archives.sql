-- Configurações do escritório: categorias de serviço, política de tempo de
-- acesso, arquivamento de atendimentos e ajustes do catálogo de documentos.
-- Aditivo: nenhuma versão, aprovação, preço ou atendimento é reescrito.

-- 1. Categorias de serviço, com o mesmo ciclo de vida configurável das pastas.
CREATE TABLE private.service_categories (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 office_id uuid NOT NULL REFERENCES public.offices(id),
 name text NOT NULL CHECK(char_length(name) BETWEEN 1 AND 60 AND private.templates_has_text20(name) AND name !~ '[[:cntrl:]]'),
 revision integer NOT NULL DEFAULT 1 CHECK(revision>0),
 created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
 created_by uuid REFERENCES auth.users(id),
 UNIQUE(office_id,id), UNIQUE(office_id,name)
);
CREATE INDEX service_categories_office_idx ON private.service_categories(office_id,name);
ALTER TABLE private.service_categories ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON private.service_categories FROM PUBLIC,anon,authenticated,service_role;

CREATE TABLE private.service_category_commands (
 office_id uuid NOT NULL REFERENCES public.offices(id),
 actor_id uuid NOT NULL REFERENCES auth.users(id),
 idempotency_key uuid NOT NULL,
 command jsonb NOT NULL,
 created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
 PRIMARY KEY(office_id,actor_id,idempotency_key)
);
ALTER TABLE private.service_category_commands ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON private.service_category_commands FROM PUBLIC,anon,authenticated,service_role;
CREATE TRIGGER service_category_commands_immutable BEFORE UPDATE OR DELETE ON private.service_category_commands FOR EACH ROW EXECUTE FUNCTION private.templates_immutable20();

INSERT INTO private.service_categories(office_id,name)
SELECT o.id,v.name FROM public.offices o CROSS JOIN (VALUES
 ('Documentos'),('Certidões'),('Registros'),('Consultoria'),('Contabilidade'),
 ('Fiscal'),('Trabalhista'),('Jurídico'),('Atendimento'),('Outros')) v(name)
ON CONFLICT(office_id,name) DO NOTHING;
INSERT INTO private.service_categories(office_id,name)
SELECT DISTINCT v.office_id,btrim(v.definition->>'category')
FROM public.service_versions v
WHERE char_length(btrim(coalesce(v.definition->>'category',''))) BETWEEN 1 AND 60
 AND btrim(v.definition->>'category') !~ '[[:cntrl:]]'
ON CONFLICT(office_id,name) DO NOTHING;

CREATE FUNCTION private.service_categories_state(p_office_id uuid) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE actor uuid;m public.memberships;caps text[];manageable boolean;BEGIN
 actor:=private.team_require_identity();
 SELECT * INTO m FROM public.memberships WHERE office_id=p_office_id AND user_id=actor AND active;
 IF m.id IS NULL THEN RAISE EXCEPTION 'CATEGORIES_FORBIDDEN' USING ERRCODE='PT403';END IF;
 caps:=private.current_permissions(p_office_id);
 manageable:=m.role_code IN('owner','admin') AND caps @> ARRAY['services.manage'];
 RETURN jsonb_build_object(
  'items',coalesce((SELECT jsonb_agg(jsonb_build_object(
    'id',c.id,'name',c.name,'revision',c.revision,'created_at',c.created_at,
    'services',(SELECT count(*) FROM public.services s
      JOIN LATERAL(SELECT ver.definition FROM public.service_versions ver WHERE ver.office_id=s.office_id AND ver.service_id=s.id ORDER BY ver.effective_from DESC LIMIT 1)v ON true
      WHERE s.office_id=c.office_id AND btrim(v.definition->>'category')=c.name)
   ) ORDER BY c.name,c.id) FROM private.service_categories c WHERE c.office_id=p_office_id),'[]'::jsonb),
  'can_manage',coalesce(manageable,false));
END $$;

CREATE FUNCTION private.service_categories_command(p_office_id uuid,p_command jsonb,p_idempotency_key uuid) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE actor uuid;m public.memberships;caps text[];op text;nm text;cid uuid;expected integer;old_payload jsonb;current private.service_categories;BEGIN
 actor:=private.team_require_identity();
 IF p_idempotency_key IS NULL OR jsonb_typeof(p_command) IS DISTINCT FROM 'object' OR jsonb_typeof(p_command->'kind') IS DISTINCT FROM 'string' THEN RAISE EXCEPTION 'CATEGORIES_VALIDATION' USING ERRCODE='PT422';END IF;
 op:=p_command->>'kind';
 IF (op='create' AND (NOT p_command ?& ARRAY['kind','name'] OR (SELECT count(*) FROM jsonb_object_keys(p_command))<>2))
  OR (op='rename' AND (NOT p_command ?& ARRAY['kind','category_id','expected_revision','name'] OR (SELECT count(*) FROM jsonb_object_keys(p_command))<>4))
  OR (op='delete' AND (NOT p_command ?& ARRAY['kind','category_id','expected_revision'] OR (SELECT count(*) FROM jsonb_object_keys(p_command))<>3))
  OR op NOT IN('create','rename','delete') THEN RAISE EXCEPTION 'CATEGORIES_VALIDATION' USING ERRCODE='PT422';END IF;
 IF op IN('create','rename') THEN
  nm:=p_command->>'name';
  IF jsonb_typeof(p_command->'name') IS DISTINCT FROM 'string' OR char_length(btrim(nm)) NOT BETWEEN 1 AND 60 OR NOT private.templates_has_text20(btrim(nm)) OR btrim(nm) ~ '[[:cntrl:]]' THEN RAISE EXCEPTION 'CATEGORIES_VALIDATION' USING ERRCODE='PT422';END IF;
  nm:=btrim(nm);
 END IF;
 IF op IN('rename','delete') THEN
  IF jsonb_typeof(p_command->'expected_revision') IS DISTINCT FROM 'number' OR p_command->>'expected_revision' !~ '^(0|[1-9][0-9]{0,8})$' THEN RAISE EXCEPTION 'CATEGORIES_VALIDATION' USING ERRCODE='PT422';END IF;
  expected:=(p_command->>'expected_revision')::integer;
  BEGIN cid:=(p_command->>'category_id')::uuid;EXCEPTION WHEN invalid_text_representation THEN RAISE EXCEPTION 'CATEGORIES_VALIDATION' USING ERRCODE='PT422';END;
  IF cid IS NULL THEN RAISE EXCEPTION 'CATEGORIES_VALIDATION' USING ERRCODE='PT422';END IF;
 END IF;
 SELECT payload INTO old_payload FROM private.service_category_commands WHERE office_id=p_office_id AND actor_id=actor AND idempotency_key=p_idempotency_key;
 IF FOUND THEN
  actor:=private.team_require_identity();
  SELECT * INTO m FROM public.memberships WHERE office_id=p_office_id AND user_id=actor AND active;
  IF m.id IS NULL OR m.role_code NOT IN('owner','admin') OR NOT private.current_permissions(p_office_id) @> ARRAY['services.manage'] THEN RAISE EXCEPTION 'CATEGORIES_FORBIDDEN' USING ERRCODE='PT403';END IF;
  IF old_payload<>p_command THEN RAISE EXCEPTION 'CATEGORY_CONFLICT' USING ERRCODE='PT409';END IF;
  RETURN private.service_categories_state(p_office_id);
 END IF;
 SELECT * INTO m FROM public.memberships WHERE office_id=p_office_id AND user_id=actor AND active FOR UPDATE;
 IF m.id IS NULL OR m.role_code NOT IN('owner','admin') OR NOT private.current_permissions(p_office_id) @> ARRAY['services.manage'] THEN RAISE EXCEPTION 'CATEGORIES_FORBIDDEN' USING ERRCODE='PT403';END IF;
 IF op='create' THEN
  INSERT INTO private.service_categories(office_id,name,created_by) VALUES(p_office_id,nm,actor);
 ELSIF op='rename' THEN
  SELECT * INTO current FROM private.service_categories WHERE office_id=p_office_id AND id=cid FOR UPDATE;
  IF current.id IS NULL THEN RAISE EXCEPTION 'CATEGORY_NOT_FOUND' USING ERRCODE='PT404';END IF;
  IF current.revision<>expected THEN RAISE EXCEPTION 'CATEGORY_CONFLICT' USING ERRCODE='PT409';END IF;
  UPDATE private.service_categories SET name=nm,revision=revision+1 WHERE id=cid;
 ELSE
  SELECT * INTO current FROM private.service_categories WHERE office_id=p_office_id AND id=cid FOR UPDATE;
  IF current.id IS NULL THEN RAISE EXCEPTION 'CATEGORY_NOT_FOUND' USING ERRCODE='PT404';END IF;
  IF current.revision<>expected THEN RAISE EXCEPTION 'CATEGORY_CONFLICT' USING ERRCODE='PT409';END IF;
  IF EXISTS(SELECT FROM public.services s JOIN LATERAL(SELECT ver.definition FROM public.service_versions ver WHERE ver.office_id=s.office_id AND ver.service_id=s.id ORDER BY ver.effective_from DESC LIMIT 1)v ON true WHERE s.office_id=p_office_id AND btrim(v.definition->>'category')=current.name) THEN RAISE EXCEPTION 'CATEGORY_CONFLICT' USING ERRCODE='PT409';END IF;
  DELETE FROM private.service_categories WHERE id=cid;
 END IF;
 INSERT INTO private.service_category_commands VALUES(p_office_id,actor,p_idempotency_key,p_command);
 RETURN private.service_categories_state(p_office_id);
EXCEPTION WHEN unique_violation THEN RAISE EXCEPTION 'CATEGORY_CONFLICT' USING ERRCODE='PT409';
END $$;

CREATE FUNCTION public.service_categories_state(p_office_id uuid) RETURNS jsonb LANGUAGE sql SECURITY INVOKER SET search_path='' AS $$SELECT private.service_categories_state(p_office_id);$$;
CREATE FUNCTION public.service_categories_command(p_office_id uuid,p_command jsonb,p_idempotency_key uuid) RETURNS jsonb LANGUAGE sql SECURITY INVOKER SET search_path='' AS $$SELECT private.service_categories_command(p_office_id,p_command,p_idempotency_key);$$;
REVOKE ALL ON FUNCTION private.service_categories_state(uuid),private.service_categories_command(uuid,jsonb,uuid),public.service_categories_state(uuid),public.service_categories_command(uuid,jsonb,uuid) FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION private.service_categories_state(uuid),private.service_categories_command(uuid,jsonb,uuid),public.service_categories_state(uuid),public.service_categories_command(uuid,jsonb,uuid) TO authenticated;

-- 2. Tempo máximo de inatividade por público (equipe ou cliente).
CREATE TABLE private.access_policies (
 office_id uuid NOT NULL REFERENCES public.offices(id),
 audience text NOT NULL CHECK(audience IN('team','client')),
 idle_minutes integer NOT NULL CHECK(idle_minutes BETWEEN 5 AND 1440),
 revision integer NOT NULL DEFAULT 1 CHECK(revision>0),
 updated_at timestamptz NOT NULL DEFAULT clock_timestamp(),
 updated_by uuid REFERENCES auth.users(id),
 PRIMARY KEY(office_id,audience)
);
ALTER TABLE private.access_policies ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON private.access_policies FROM PUBLIC,anon,authenticated,service_role;
INSERT INTO private.access_policies(office_id,audience,idle_minutes)
SELECT o.id,a.audience,30 FROM public.offices o CROSS JOIN (VALUES('team'),('client')) a(audience)
ON CONFLICT(office_id,audience) DO NOTHING;

CREATE TABLE private.access_policy_commands (
 office_id uuid NOT NULL REFERENCES public.offices(id),
 actor_id uuid NOT NULL REFERENCES auth.users(id),
 idempotency_key uuid NOT NULL,
 audience text NOT NULL CHECK(audience IN('team','client')),
 idle_minutes integer NOT NULL CHECK(idle_minutes BETWEEN 5 AND 1440),
 expected_revision integer NOT NULL CHECK(expected_revision>=0),
 created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
 PRIMARY KEY(office_id,actor_id,idempotency_key)
);
ALTER TABLE private.access_policy_commands ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON private.access_policy_commands FROM PUBLIC,anon,authenticated,service_role;
CREATE TRIGGER access_policy_commands_immutable BEFORE UPDATE OR DELETE ON private.access_policy_commands FOR EACH ROW EXECUTE FUNCTION private.templates_immutable20();

CREATE FUNCTION private.access_policies_state(p_office_id uuid) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE actor uuid;m public.memberships;caps text[];manageable boolean;p jsonb;BEGIN
 actor:=private.team_require_identity();
 SELECT * INTO m FROM public.memberships WHERE office_id=p_office_id AND user_id=actor AND active;
 IF m.id IS NULL THEN RAISE EXCEPTION 'ACCESS_FORBIDDEN' USING ERRCODE='PT403';END IF;
 caps:=private.current_permissions(p_office_id);
 manageable:=m.role_code IN('owner','admin') AND caps @> ARRAY['users.manage'];
 SELECT coalesce(jsonb_object_agg(audience,jsonb_build_object('audience',audience,'idle_minutes',idle_minutes,'revision',revision,'updated_at',updated_at)),'{}'::jsonb) INTO p FROM private.access_policies WHERE office_id=p_office_id;
 RETURN jsonb_build_object('policies',p,'audience',CASE WHEN m.role_code='client' THEN 'client' ELSE 'team' END,'can_manage',coalesce(manageable,false));
END $$;

CREATE FUNCTION private.access_policies_set(p_office_id uuid,p_audience text,p_idle_minutes integer,p_expected_revision integer,p_idempotency_key uuid) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE actor uuid;m public.memberships;current private.access_policies;cmd private.access_policy_commands;BEGIN
 actor:=private.team_require_identity();
 IF p_idempotency_key IS NULL OR p_audience IS NULL OR p_audience NOT IN('team','client') OR p_idle_minutes IS NULL OR p_idle_minutes NOT BETWEEN 5 AND 1440 OR p_expected_revision IS NULL OR p_expected_revision NOT BETWEEN 0 AND 2147483645 THEN RAISE EXCEPTION 'ACCESS_VALIDATION' USING ERRCODE='PT422';END IF;
 SELECT * INTO m FROM public.memberships WHERE office_id=p_office_id AND user_id=actor AND active FOR UPDATE;
 IF m.id IS NULL OR m.role_code NOT IN('owner','admin') OR NOT private.current_permissions(p_office_id) @> ARRAY['users.manage'] THEN RAISE EXCEPTION 'ACCESS_FORBIDDEN' USING ERRCODE='PT403';END IF;
 SELECT * INTO cmd FROM private.access_policy_commands WHERE office_id=p_office_id AND actor_id=actor AND idempotency_key=p_idempotency_key;
 IF FOUND THEN
  IF cmd.audience<>p_audience OR cmd.idle_minutes<>p_idle_minutes OR cmd.expected_revision<>p_expected_revision THEN RAISE EXCEPTION 'ACCESS_CONFLICT' USING ERRCODE='PT409';END IF;
  RETURN private.access_policies_state(p_office_id);
 END IF;
 SELECT * INTO current FROM private.access_policies WHERE office_id=p_office_id AND audience=p_audience FOR UPDATE;
 IF current.office_id IS NULL THEN RAISE EXCEPTION 'ACCESS_NOT_FOUND' USING ERRCODE='PT404';END IF;
 IF current.revision<>p_expected_revision THEN RAISE EXCEPTION 'ACCESS_CONFLICT' USING ERRCODE='PT409';END IF;
 UPDATE private.access_policies SET idle_minutes=p_idle_minutes,revision=revision+1,updated_at=clock_timestamp(),updated_by=actor WHERE office_id=p_office_id AND audience=p_audience;
 INSERT INTO private.access_policy_commands VALUES(p_office_id,actor,p_idempotency_key,p_audience,p_idle_minutes,p_expected_revision);
 RETURN private.access_policies_state(p_office_id);
END $$;

CREATE FUNCTION public.access_policies_state(p_office_id uuid) RETURNS jsonb LANGUAGE sql SECURITY INVOKER SET search_path='' AS $$SELECT private.access_policies_state(p_office_id);$$;
CREATE FUNCTION public.access_policies_set(p_office_id uuid,p_audience text,p_idle_minutes integer,p_expected_revision integer,p_idempotency_key uuid) RETURNS jsonb LANGUAGE sql SECURITY INVOKER SET search_path='' AS $$SELECT private.access_policies_set(p_office_id,p_audience,p_idle_minutes,p_expected_revision,p_idempotency_key);$$;
REVOKE ALL ON FUNCTION private.access_policies_state(uuid),private.access_policies_set(uuid,text,integer,integer,uuid),public.access_policies_state(uuid),public.access_policies_set(uuid,text,integer,integer,uuid) FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION private.access_policies_state(uuid),private.access_policies_set(uuid,text,integer,integer,uuid),public.access_policies_state(uuid),public.access_policies_set(uuid,text,integer,integer,uuid) TO authenticated;

-- 3. Arquivamento de atendimentos concluídos/cancelados.
CREATE TABLE private.request_archives (
 office_id uuid NOT NULL,
 request_id uuid NOT NULL,
 archived_at timestamptz NOT NULL DEFAULT clock_timestamp(),
 archived_by uuid NOT NULL REFERENCES auth.users(id),
 reason text NOT NULL CHECK(char_length(reason) BETWEEN 3 AND 500 AND private.templates_has_text20(reason) AND reason !~ '[[:cntrl:]]'),
 PRIMARY KEY(office_id,request_id),
 FOREIGN KEY(office_id,request_id) REFERENCES public.requests(office_id,id)
);
CREATE INDEX request_archives_time_idx ON private.request_archives(office_id,archived_at DESC,request_id);
ALTER TABLE private.request_archives ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON private.request_archives FROM PUBLIC,anon,authenticated,service_role;
CREATE TABLE private.request_archive_commands (
 office_id uuid NOT NULL,
 actor_id uuid NOT NULL REFERENCES auth.users(id),
 idempotency_key uuid NOT NULL,
 request_id uuid NOT NULL,
 action text NOT NULL CHECK(action IN('archive','restore')),
 created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
 PRIMARY KEY(office_id,actor_id,idempotency_key)
);
ALTER TABLE private.request_archive_commands ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON private.request_archive_commands FROM PUBLIC,anon,authenticated,service_role;
CREATE TRIGGER request_archive_commands_immutable BEFORE UPDATE OR DELETE ON private.request_archive_commands FOR EACH ROW EXECUTE FUNCTION private.templates_immutable20();

CREATE FUNCTION private.request_archive_command(p_office_id uuid,p_request_id uuid,p_action text,p_reason text,p_idempotency_key uuid) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE m public.memberships;r public.requests;cmd private.request_archive_commands;BEGIN
 m:=private.requests_actor(p_office_id);
 IF m.role_code='client' OR NOT private.current_permissions(p_office_id) @> ARRAY['requests.read_all'] OR m.role_code NOT IN('owner','admin') THEN RAISE EXCEPTION 'REQUESTS_FORBIDDEN' USING ERRCODE='PT403';END IF;
 IF p_request_id IS NULL OR p_idempotency_key IS NULL OR p_action IS NULL OR p_action NOT IN('archive','restore') OR p_reason IS NULL OR char_length(btrim(p_reason)) NOT BETWEEN 3 AND 500 OR NOT private.templates_has_text20(btrim(p_reason)) OR btrim(p_reason) ~ '[[:cntrl:]]' THEN RAISE EXCEPTION 'REQUEST_VALIDATION' USING ERRCODE='PT422';END IF;
 SELECT * INTO cmd FROM private.request_archive_commands WHERE office_id=p_office_id AND actor_id=m.user_id AND idempotency_key=p_idempotency_key;
 IF FOUND THEN
  IF cmd.request_id<>p_request_id OR cmd.action<>p_action THEN RAISE EXCEPTION 'REQUEST_CONFLICT' USING ERRCODE='PT409';END IF;
  RETURN jsonb_build_object('request_id',p_request_id,'archived',cmd.action='archive');
 END IF;
 SELECT * INTO r FROM public.requests WHERE office_id=p_office_id AND id=p_request_id FOR UPDATE;
 IF r.id IS NULL THEN RAISE EXCEPTION 'REQUEST_NOT_FOUND' USING ERRCODE='PT404';END IF;
 IF p_action='archive' THEN
  IF r.status NOT IN('concluido','cancelado') THEN RAISE EXCEPTION 'REQUEST_CONFLICT' USING ERRCODE='PT409';END IF;
  IF EXISTS(SELECT FROM private.request_archives WHERE office_id=p_office_id AND request_id=p_request_id) THEN RAISE EXCEPTION 'REQUEST_CONFLICT' USING ERRCODE='PT409';END IF;
  INSERT INTO private.request_archives(office_id,request_id,archived_by,reason) VALUES(p_office_id,p_request_id,m.user_id,btrim(p_reason));
 ELSE
  IF NOT EXISTS(SELECT FROM private.request_archives WHERE office_id=p_office_id AND request_id=p_request_id) THEN RAISE EXCEPTION 'REQUEST_CONFLICT' USING ERRCODE='PT409';END IF;
  DELETE FROM private.request_archives WHERE office_id=p_office_id AND request_id=p_request_id;
 END IF;
 INSERT INTO private.request_archive_commands VALUES(p_office_id,m.user_id,p_idempotency_key,p_request_id,p_action);
 RETURN jsonb_build_object('request_id',p_request_id,'archived',p_action='archive');
END $$;

CREATE FUNCTION public.request_archive_command(p_office_id uuid,p_request_id uuid,p_action text,p_reason text,p_idempotency_key uuid) RETURNS jsonb LANGUAGE sql SECURITY INVOKER SET search_path='' AS $$SELECT private.request_archive_command(p_office_id,p_request_id,p_action,p_reason,p_idempotency_key);$$;
REVOKE ALL ON FUNCTION private.request_archive_command(uuid,uuid,text,text,uuid),public.request_archive_command(uuid,uuid,text,text,uuid) FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION private.request_archive_command(uuid,uuid,text,text,uuid),public.request_archive_command(uuid,uuid,text,text,uuid) TO authenticated;

CREATE OR REPLACE FUNCTION private.requests_page(p_office_id uuid,p_query text,p_scope text,p_status text,p_page integer,p_size integer) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE m public.memberships;result jsonb;total bigint;q text;read_all boolean;
BEGIN
 m:=private.requests_actor(p_office_id);read_all:=private.current_permissions(p_office_id) @> ARRAY['requests.read_all'];
 IF p_query IS NULL OR char_length(p_query)>120 OR p_query ~ '[[:cntrl:]]' OR p_scope IS NULL OR p_scope NOT IN('mine','queue','archived') OR p_status IS NULL OR p_status NOT IN('','aberto','em_atendimento','aguardando_cliente','aguardando_responsavel','concluido','cancelado','recebido','em_analise') OR p_page IS NULL OR p_page NOT BETWEEN 1 AND 100000 OR p_size IS NULL OR p_size NOT IN(3,5) THEN RAISE EXCEPTION 'REQUEST_VALIDATION' USING ERRCODE='PT422';END IF;
 IF p_scope='archived' AND (m.role_code='client' OR NOT read_all) THEN RAISE EXCEPTION 'REQUESTS_FORBIDDEN' USING ERRCODE='PT403';END IF;
 q:=lower(btrim(p_query));
 WITH candidates AS(SELECT r.* FROM public.requests r WHERE r.office_id=p_office_id AND (CASE WHEN m.role_code='client' THEN r.origin='portal' AND r.created_by=m.user_id ELSE read_all OR r.created_by=m.user_id OR r.assignee_id=m.id END)
  AND (CASE WHEN p_scope='archived' THEN read_all WHEN p_scope='queue' THEN r.created_by=m.user_id OR r.assignee_id=m.id OR read_all ELSE r.created_by=m.user_id OR r.assignee_id=m.id END)
  AND (CASE WHEN p_scope='archived' THEN EXISTS(SELECT FROM private.request_archives a WHERE a.office_id=r.office_id AND a.request_id=r.id) ELSE NOT EXISTS(SELECT FROM private.request_archives a WHERE a.office_id=r.office_id AND a.request_id=r.id) END)
  AND (p_status='' OR CASE WHEN m.role_code='client' THEN private.request_public_status(r.status)=p_status ELSE r.status=p_status END)
  AND (q='' OR strpos(lower(r.title),q)>0 OR strpos(lower(r.protocol),q)>0)),
 paginated AS(SELECT * FROM candidates ORDER BY updated_at DESC,id DESC LIMIT p_size OFFSET (p_page-1)*p_size)
 SELECT (SELECT count(*) FROM candidates),coalesce((SELECT jsonb_agg(private.request_summary(p,m.role_code='client') ORDER BY p.updated_at DESC,p.id DESC) FROM paginated p),'[]'::jsonb) INTO total,result;
 RETURN jsonb_build_object('items',result,'total',total,'page',p_page,'page_size',p_size,'portal',m.role_code='client');
END $$;
REVOKE ALL ON FUNCTION private.requests_page(uuid,text,text,text,integer,integer) FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION private.requests_page(uuid,text,text,text,integer,integer) TO authenticated;

DO $migration$ DECLARE body text;updated text;BEGIN
 SELECT pg_get_functiondef('private.request_detail(uuid,uuid,integer)'::regprocedure) INTO body;
 updated:=replace(body,'RETURN private.request_detail_record(r,m,p_page);','RETURN private.request_detail_record(r,m,p_page)||jsonb_build_object(''archived'',EXISTS(SELECT FROM private.request_archives a WHERE a.office_id=p_office_id AND a.request_id=r.id));');
 IF updated=body OR position('request_archives' IN updated)=0 THEN RAISE EXCEPTION 'request detail archive target not found';END IF;EXECUTE updated;
END $migration$;

DO $migration$ DECLARE body text;updated text;BEGIN
 SELECT pg_get_functiondef('private.document_offer_projection(private.document_offerings,timestamptz)'::regprocedure) INTO body;
 updated:=replace(body,'FUNCTION private.document_offer_projection(','FUNCTION private.document_staff_offer_projection(');
 updated:=replace(updated,'IF NOT o.portal_enabled OR EXISTS(','IF EXISTS(');
 IF updated=body OR position('IF NOT o.portal_enabled OR EXISTS(' IN updated)>0 THEN RAISE EXCEPTION 'staff offer projection target not found';END IF;EXECUTE updated;
END $migration$;
REVOKE ALL ON FUNCTION private.document_staff_offer_projection(private.document_offerings,timestamptz) FROM PUBLIC,anon,authenticated,service_role;

CREATE FUNCTION private.document_offers_page(p_office_id uuid,p_folder_id uuid,p_unfiled boolean,p_query text,p_page integer,p_size integer,p_category text) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE member public.memberships;at_time timestamptz;items jsonb;folders jsonb;categories jsonb;total bigint;BEGIN
 member:=private.requests_actor(p_office_id);
 IF p_unfiled IS NULL OR (p_unfiled AND p_folder_id IS NOT NULL) OR p_query IS NULL OR char_length(p_query)>120 OR p_query ~ '[[:cntrl:]]' OR p_page IS NULL OR p_page NOT BETWEEN 1 AND 100000 OR p_size IS NULL OR p_size NOT IN(3,5) OR (p_category IS NOT NULL AND (char_length(btrim(p_category)) NOT BETWEEN 1 AND 60 OR p_category ~ '[[:cntrl:]]')) THEN RAISE EXCEPTION 'TEMPLATES_VALIDATION' USING ERRCODE='PT422';END IF;
 at_time:=clock_timestamp();
 WITH available AS MATERIALIZED (SELECT CASE WHEN member.role_code='client' THEN private.document_offer_projection(o,at_time) ELSE private.document_staff_offer_projection(o,at_time) END item FROM private.document_offerings o WHERE o.office_id=p_office_id),
 picked AS MATERIALIZED (SELECT item FROM available WHERE item IS NOT NULL AND (p_folder_id IS NULL OR item->>'folder_id'=p_folder_id::text) AND (NOT p_unfiled OR item->'folder_id'='null'::jsonb) AND (p_category IS NULL OR btrim(p_category)='' OR item->>'service_category'=btrim(p_category)) AND (btrim(p_query)='' OR strpos(lower(item->>'name'),lower(btrim(p_query)))>0 OR strpos(lower(coalesce(item->>'template_code','')),lower(btrim(p_query)))>0)),
 page AS (SELECT item FROM picked ORDER BY lower(item->>'name'),item->>'template_id' LIMIT p_size OFFSET (p_page-1)*p_size)
 SELECT (SELECT count(*) FROM picked),coalesce((SELECT jsonb_agg(item ORDER BY lower(item->>'name'),item->>'template_id') FROM page),'[]'::jsonb) INTO total,items;
 SELECT coalesce(jsonb_agg(jsonb_build_object('id',f.id,'name',f.name,'category',private.model_folder_category(f.office_id,f.id)) ORDER BY f.name,f.id),'[]'::jsonb) INTO folders FROM private.model_folders f WHERE f.office_id=p_office_id AND EXISTS(SELECT FROM private.document_offerings o JOIN private.model_locations l ON l.office_id=o.office_id AND l.template_id=o.template_id WHERE o.office_id=f.office_id AND l.folder_id=f.id AND (CASE WHEN member.role_code='client' THEN private.document_offer_projection(o,at_time) ELSE private.document_staff_offer_projection(o,at_time) END) IS NOT NULL AND (p_category IS NULL OR btrim(p_category)='' OR (CASE WHEN member.role_code='client' THEN private.document_offer_projection(o,at_time) ELSE private.document_staff_offer_projection(o,at_time) END)->>'service_category'=btrim(p_category)));
 WITH picked AS MATERIALIZED (SELECT CASE WHEN member.role_code='client' THEN private.document_offer_projection(o,at_time) ELSE private.document_staff_offer_projection(o,at_time) END item FROM private.document_offerings o WHERE o.office_id=p_office_id)
 SELECT coalesce(jsonb_agg(jsonb_build_object('name',name,'count',n) ORDER BY name),'[]'::jsonb) INTO categories FROM (SELECT item->>'service_category' name,count(*) n FROM picked WHERE item IS NOT NULL GROUP BY 1) c;
 PERFORM private.requests_actor(p_office_id);
 RETURN jsonb_build_object('items',items,'folders',folders,'categories',categories,'total',total,'page',p_page,'page_size',p_size);
END $$;
CREATE FUNCTION public.document_offers_page(p_office_id uuid,p_folder_id uuid,p_unfiled boolean,p_query text,p_page integer,p_size integer,p_category text) RETURNS jsonb LANGUAGE sql SECURITY INVOKER SET search_path='' AS $$SELECT private.document_offers_page(p_office_id,p_folder_id,p_unfiled,p_query,p_page,p_size,p_category);$$;
REVOKE ALL ON FUNCTION private.document_offers_page(uuid,uuid,boolean,text,integer,integer,text),public.document_offers_page(uuid,uuid,boolean,text,integer,integer,text) FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION private.document_offers_page(uuid,uuid,boolean,text,integer,integer,text),public.document_offers_page(uuid,uuid,boolean,text,integer,integer,text) TO authenticated;

CREATE FUNCTION private.model_templates_page(p_office_id uuid,p_folder_id uuid,p_unfiled boolean,p_archived boolean,p_query text,p_page integer,p_size integer,p_state text) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE result jsonb; total bigint; at_time timestamptz; BEGIN
 PERFORM private.templates_actor20(p_office_id);
 IF p_query IS NULL OR char_length(p_query)>120 OR p_query ~ '[[:cntrl:]]' OR p_page IS NULL OR p_page NOT BETWEEN 1 AND 100000 OR p_size IS NULL OR p_size NOT IN(3,5) OR p_unfiled IS NULL OR p_archived IS NULL OR (p_unfiled AND p_folder_id IS NOT NULL) OR p_state IS NULL OR p_state NOT IN('all','approved','draft') THEN RAISE EXCEPTION 'TEMPLATES_VALIDATION' USING ERRCODE='PT422'; END IF;
 IF p_folder_id IS NOT NULL AND NOT EXISTS(SELECT FROM private.model_folders WHERE office_id=p_office_id AND id=p_folder_id) THEN RAISE EXCEPTION 'TEMPLATE_NOT_FOUND' USING ERRCODE='PT404'; END IF;
 at_time:=clock_timestamp();
 WITH candidates AS (
 SELECT t.id,t.code,coalesce(m.display_name,v.definition->>'name') name,v.definition->>'kind' kind,(v.definition->>'demonstration')::boolean demonstration,t.latest_version,
 coalesce(m.revision,0) metadata_revision,m.archived_at,l.folder_id,
 (SELECT max(cv.number) FROM public.template_versions cv JOIN private.template_approvals a ON a.office_id=cv.office_id AND a.template_id=cv.template_id AND a.version_id=cv.id WHERE cv.office_id=t.office_id AND cv.template_id=t.id AND greatest(a.approved_at,(cv.definition->>'effective_from')::timestamptz)<=at_time AND ((cv.definition->>'effective_until') IS NULL OR (cv.definition->>'effective_until')::timestamptz>at_time)) current_version
 FROM public.templates t JOIN public.template_versions v ON v.office_id=t.office_id AND v.template_id=t.id AND v.number=t.latest_version
 LEFT JOIN private.model_metadata m ON m.office_id=t.office_id AND m.template_id=t.id LEFT JOIN private.model_locations l ON l.office_id=t.office_id AND l.template_id=t.id
 WHERE t.office_id=p_office_id AND (m.archived_at IS NOT NULL)=p_archived AND (p_folder_id IS NULL OR l.folder_id=p_folder_id) AND (NOT p_unfiled OR l.folder_id IS NULL)
 AND (btrim(p_query)='' OR strpos(lower(t.code||' '||coalesce(m.display_name,v.definition->>'name')),lower(btrim(p_query)))>0)),
 filtered AS (SELECT * FROM candidates WHERE p_state='all' OR (p_state='approved')=(current_version IS NOT NULL)),
 page AS (SELECT * FROM filtered ORDER BY code,id LIMIT p_size OFFSET (p_page-1)*p_size)
 SELECT (SELECT count(*) FROM filtered),coalesce((SELECT jsonb_agg(to_jsonb(page) ORDER BY code,id) FROM page),'[]'::jsonb) INTO total,result;
 RETURN jsonb_build_object('items',result,'total',total,'page',p_page,'page_size',p_size);
END $$;
CREATE FUNCTION public.model_templates_page(p_office_id uuid,p_folder_id uuid,p_unfiled boolean,p_archived boolean,p_query text,p_page integer,p_size integer,p_state text) RETURNS jsonb LANGUAGE sql SECURITY INVOKER SET search_path='' AS $$SELECT private.model_templates_page(p_office_id,p_folder_id,p_unfiled,p_archived,p_query,p_page,p_size,p_state);$$;
REVOKE ALL ON FUNCTION private.model_templates_page(uuid,uuid,boolean,boolean,text,integer,integer,text),public.model_templates_page(uuid,uuid,boolean,boolean,text,integer,integer,text) FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION private.model_templates_page(uuid,uuid,boolean,boolean,text,integer,integer,text),public.model_templates_page(uuid,uuid,boolean,boolean,text,integer,integer,text) TO authenticated;

NOTIFY pgrst,'reload schema';