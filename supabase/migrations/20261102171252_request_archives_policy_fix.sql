-- CLI: supabase migration new request_archives_policy_fix (20261102171252).
-- Corrective addition to the three recovered migrations; never rewrite/reapply them.
-- Logical archive only: requests, items, documents, attachments and finance stay intact.
CREATE TABLE private.request_archive_policies (
 office_id uuid NOT NULL REFERENCES public.offices(id),
 version integer NOT NULL CHECK(version>0), days integer NOT NULL CHECK(days IN(30,60,90)),
 cutoff timestamptz NOT NULL, created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
 created_by uuid REFERENCES auth.users(id), PRIMARY KEY(office_id,version)
);
CREATE TABLE private.request_archive_policy_commands (
 office_id uuid NOT NULL REFERENCES public.offices(id), actor_id uuid NOT NULL REFERENCES auth.users(id),
 idempotency_key uuid NOT NULL, days integer NOT NULL, expected_version integer NOT NULL,
 created_at timestamptz NOT NULL DEFAULT clock_timestamp(), PRIMARY KEY(office_id,actor_id,idempotency_key)
);
CREATE TABLE private.request_archive_reports (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), office_id uuid NOT NULL REFERENCES public.offices(id),
 actor_id uuid NOT NULL REFERENCES auth.users(id), idempotency_key uuid NOT NULL,
 filters jsonb NOT NULL, snapshot jsonb NOT NULL, created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
 UNIQUE(office_id,actor_id,idempotency_key), UNIQUE(office_id,id),
 CHECK(jsonb_typeof(snapshot)='object' AND octet_length(snapshot::text)<=2000000)
);
ALTER TABLE private.request_archive_policies ENABLE ROW LEVEL SECURITY;
ALTER TABLE private.request_archive_policy_commands ENABLE ROW LEVEL SECURITY;
ALTER TABLE private.request_archive_reports ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON private.request_archive_policies,private.request_archive_policy_commands,private.request_archive_reports FROM PUBLIC,anon,authenticated,service_role;
CREATE TRIGGER request_archive_policies_immutable BEFORE UPDATE OR DELETE ON private.request_archive_policies FOR EACH ROW EXECUTE FUNCTION private.request_immutable();
CREATE TRIGGER request_archive_policy_commands_immutable BEFORE UPDATE OR DELETE ON private.request_archive_policy_commands FOR EACH ROW EXECUTE FUNCTION private.request_immutable();
CREATE TRIGGER request_archive_reports_immutable BEFORE UPDATE OR DELETE ON private.request_archive_reports FOR EACH ROW EXECUTE FUNCTION private.request_immutable();
CREATE TRIGGER request_archives_immutable BEFORE UPDATE OR DELETE ON private.request_archives FOR EACH ROW EXECUTE FUNCTION private.request_immutable();
ALTER TABLE private.request_archive_commands ADD COLUMN reason text;
ALTER TABLE private.request_archive_commands ADD COLUMN expected_version integer;
-- Historical commands with no stored reason cannot safely authorize a new replay.
CREATE INDEX request_archive_reports_actor_idx ON private.request_archive_reports(actor_id);
CREATE INDEX request_archive_policies_author_idx ON private.request_archive_policies(created_by);
CREATE INDEX request_archives_author_idx ON private.request_archives(archived_by);
CREATE INDEX request_archive_commands_request_idx ON private.request_archive_commands(office_id,request_id);
CREATE INDEX requests_closed_archive_idx ON public.requests(office_id,updated_at DESC,id DESC) WHERE status IN('concluido','cancelado');
INSERT INTO private.request_archive_policies(office_id,version,days,cutoff)
 SELECT id,1,90,clock_timestamp()-interval '90 days' FROM public.offices;
CREATE FUNCTION private.request_archive_policy_initialize() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
BEGIN INSERT INTO private.request_archive_policies(office_id,version,days,cutoff) VALUES(NEW.id,1,90,clock_timestamp()-interval '90 days');RETURN NEW;END $$;
CREATE TRIGGER office_request_archive_policy AFTER INSERT ON public.offices FOR EACH ROW EXECUTE FUNCTION private.request_archive_policy_initialize();

CREATE FUNCTION private.request_archives_actor(p_office_id uuid,p_write boolean DEFAULT false,p_all boolean DEFAULT false) RETURNS public.memberships
LANGUAGE plpgsql SECURITY INVOKER SET search_path='' AS $$
DECLARE m public.memberships;caps text[];
BEGIN
 m:=private.requests_actor(p_office_id,p_write,'requests.archives.manage');caps:=private.current_permissions(p_office_id);
 IF m.role_code NOT IN('owner','admin') OR NOT caps @> ARRAY['requests.read','requests.archives.manage'] OR (p_all AND NOT caps @> ARRAY['requests.read_all']) THEN
  RAISE EXCEPTION 'REQUEST_ARCHIVES_FORBIDDEN' USING ERRCODE='PT403';END IF;
 RETURN m;
END $$;
CREATE FUNCTION private.request_archive_policy_record(p_office_id uuid) RETURNS jsonb LANGUAGE sql VOLATILE SECURITY INVOKER SET search_path='' SET timezone='UTC' AS $$
 SELECT jsonb_build_object('days',days,'version',version,'cutoff',greatest(cutoff,clock_timestamp()-make_interval(days=>days))) FROM private.request_archive_policies WHERE office_id=p_office_id ORDER BY version DESC LIMIT 1;
$$;
CREATE FUNCTION private.request_archives_policy_get(p_office_id uuid) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
BEGIN PERFORM private.request_archives_actor(p_office_id);RETURN private.request_archive_policy_record(p_office_id);END $$;
CREATE FUNCTION private.request_archives_policy_set(p_office_id uuid,p_days integer,p_expected_version integer,p_idempotency_key uuid) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE m public.memberships;old private.request_archive_policies;cmd private.request_archive_policy_commands;at_time timestamptz;
BEGIN
 m:=private.request_archives_actor(p_office_id,true);
 IF p_days IS NULL OR p_days NOT IN(30,60,90) OR p_expected_version IS NULL OR p_expected_version NOT BETWEEN 1 AND 2147483645 OR p_idempotency_key IS NULL THEN RAISE EXCEPTION 'REQUEST_ARCHIVES_VALIDATION' USING ERRCODE='PT422';END IF;
 SELECT * INTO cmd FROM private.request_archive_policy_commands WHERE office_id=p_office_id AND actor_id=m.user_id AND idempotency_key=p_idempotency_key;
 IF FOUND THEN
  PERFORM private.request_archives_actor(p_office_id,true);
  IF cmd.days<>p_days OR cmd.expected_version<>p_expected_version THEN RAISE EXCEPTION 'REQUEST_ARCHIVES_CONFLICT' USING ERRCODE='PT409';END IF;
  RETURN private.request_archive_policy_record(p_office_id);
 END IF;
 SELECT * INTO old FROM private.request_archive_policies WHERE office_id=p_office_id ORDER BY version DESC LIMIT 1;
 PERFORM private.request_archives_actor(p_office_id,true);at_time:=clock_timestamp();
 IF old.version IS DISTINCT FROM p_expected_version THEN RAISE EXCEPTION 'REQUEST_ARCHIVES_CONFLICT' USING ERRCODE='PT409';END IF;
 -- Include elapsed time under the OLD policy before increasing its duration.
 INSERT INTO private.request_archive_policies(office_id,version,days,cutoff,created_by)
 VALUES(p_office_id,old.version+1,p_days,greatest(old.cutoff,at_time-make_interval(days=>old.days),at_time-make_interval(days=>p_days)),m.user_id);
 INSERT INTO private.request_archive_policy_commands(office_id,actor_id,idempotency_key,days,expected_version) VALUES(p_office_id,m.user_id,p_idempotency_key,p_days,p_expected_version);
 PERFORM private.emit_business_event(p_office_id,'requests.archive_policy_changed','office',p_office_id,p_idempotency_key,'{}');
 RETURN private.request_archive_policy_record(p_office_id);
END $$;

CREATE FUNCTION private.request_is_archived(r public.requests,p_cutoff timestamptz) RETURNS boolean LANGUAGE sql STABLE SECURITY INVOKER SET search_path='' AS $$
 SELECT EXISTS(SELECT FROM private.request_archives a WHERE a.office_id=r.office_id AND a.request_id=r.id) OR (r.status IN('concluido','cancelado') AND r.updated_at<p_cutoff);
$$;
CREATE FUNCTION private.request_archives_in_selection(r public.requests,m public.memberships,p_scope text) RETURNS boolean LANGUAGE sql STABLE SECURITY INVOKER SET search_path='' AS $$
 SELECT private.request_in_scope(r,m) AND (p_scope='all' OR r.category='account_correction' OR r.created_by=m.user_id OR r.assignee_id=m.id OR EXISTS(SELECT FROM private.request_assignments a WHERE a.office_id=r.office_id AND a.request_id=r.id AND a.membership_id=m.id));
$$;
CREATE FUNCTION private.request_archives_item(r public.requests,p_cutoff timestamptz) RETURNS jsonb LANGUAGE sql STABLE SECURITY INVOKER SET search_path='' SET timezone='UTC' AS $$
 SELECT jsonb_build_object('id',r.id,'protocol',r.protocol,'title',r.title,'status',r.status,'version',r.version,'closed_at',r.updated_at,'archived',private.request_is_archived(r,p_cutoff),'archived_at',(SELECT a.archived_at FROM private.request_archives a WHERE a.office_id=r.office_id AND a.request_id=r.id));
$$;
CREATE FUNCTION private.request_archives_filters(p_scope text,p_view text,p_status text,p_from timestamptz,p_until timestamptz) RETURNS void LANGUAGE plpgsql SECURITY INVOKER SET search_path='' SET timezone='UTC' AS $$
BEGIN
 IF p_scope IS NULL OR p_scope NOT IN('mine','all') OR p_view IS NULL OR p_view NOT IN('recent','archived') OR p_status IS NULL OR p_status NOT IN('','concluido','cancelado')
  OR (p_from IS NOT NULL AND (NOT isfinite(p_from) OR p_from<>date_trunc('day',p_from))) OR (p_until IS NOT NULL AND (NOT isfinite(p_until) OR p_until<>date_trunc('day',p_until))) OR (p_from IS NOT NULL AND p_until IS NOT NULL AND p_from>=p_until) THEN RAISE EXCEPTION 'REQUEST_ARCHIVES_VALIDATION' USING ERRCODE='PT422';END IF;
END $$;
CREATE FUNCTION private.request_archives_page(p_office_id uuid,p_scope text,p_view text,p_status text,p_from timestamptz,p_until timestamptz,p_page integer,p_size integer) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE m public.memberships;cut timestamptz;items jsonb;total bigint;
BEGIN
 m:=private.request_archives_actor(p_office_id,false,p_scope='all');
 PERFORM private.request_archives_filters(p_scope,p_view,p_status,p_from,p_until);
 IF p_page IS NULL OR p_page NOT BETWEEN 1 AND 100000 OR p_size IS NULL OR p_size NOT IN(3,5) THEN RAISE EXCEPTION 'REQUEST_ARCHIVES_VALIDATION' USING ERRCODE='PT422';END IF;
 cut:=(private.request_archive_policy_record(p_office_id)->>'cutoff')::timestamptz;
 WITH candidates AS(SELECT r.* FROM public.requests r WHERE r.office_id=p_office_id AND r.status IN('concluido','cancelado') AND private.request_archives_in_selection(r,m,p_scope)
  AND private.request_is_archived(r,cut)=(p_view='archived') AND (p_status='' OR r.status=p_status) AND (p_from IS NULL OR r.updated_at>=p_from) AND (p_until IS NULL OR r.updated_at<p_until)),
 paged AS(SELECT * FROM candidates ORDER BY updated_at DESC,id DESC LIMIT p_size OFFSET(p_page-1)*p_size)
 SELECT (SELECT count(*) FROM candidates),coalesce((SELECT jsonb_agg(private.request_archives_item(p,cut) ORDER BY p.updated_at DESC,p.id DESC) FROM paged p),'[]'::jsonb) INTO total,items;
 RETURN jsonb_build_object('items',items,'total',total,'page',p_page,'page_size',p_size,'can_read_all',private.current_permissions(p_office_id) @> ARRAY['requests.read_all']);
END $$;
CREATE FUNCTION private.request_archives_archive(p_office_id uuid,p_request_id uuid,p_expected_version integer,p_reason text,p_idempotency_key uuid) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE m public.memberships;r public.requests;cmd private.request_archive_commands;cut timestamptz;
BEGIN
 m:=private.request_archives_actor(p_office_id,true);
 IF p_request_id IS NULL OR p_idempotency_key IS NULL OR p_expected_version IS NULL OR p_expected_version NOT BETWEEN 1 AND 2147483645 OR p_reason IS NULL OR char_length(btrim(p_reason)) NOT BETWEEN 3 AND 500 OR NOT private.templates_has_text20(btrim(p_reason)) OR p_reason ~ '[[:cntrl:]]' THEN RAISE EXCEPTION 'REQUEST_ARCHIVES_VALIDATION' USING ERRCODE='PT422';END IF;
 SELECT * INTO r FROM public.requests WHERE office_id=p_office_id AND id=p_request_id FOR UPDATE;
 m:=private.request_archives_actor(p_office_id,true);
 IF r.id IS NULL OR private.request_in_scope(r,m) IS NOT TRUE THEN RAISE EXCEPTION 'REQUEST_NOT_FOUND' USING ERRCODE='PT404';END IF;
 SELECT * INTO cmd FROM private.request_archive_commands WHERE office_id=p_office_id AND actor_id=m.user_id AND idempotency_key=p_idempotency_key;
 IF FOUND THEN
  IF cmd.request_id<>p_request_id OR cmd.action<>'archive' OR cmd.reason IS DISTINCT FROM btrim(p_reason) OR cmd.expected_version IS DISTINCT FROM p_expected_version THEN RAISE EXCEPTION 'REQUEST_ARCHIVES_CONFLICT' USING ERRCODE='PT409';END IF;
  RETURN jsonb_build_object('request_id',r.id,'archived',true);
 END IF;
 cut:=(private.request_archive_policy_record(p_office_id)->>'cutoff')::timestamptz;
 IF r.status NOT IN('concluido','cancelado') OR r.version<>p_expected_version OR private.request_is_archived(r,cut) THEN RAISE EXCEPTION 'REQUEST_ARCHIVES_CONFLICT' USING ERRCODE='PT409';END IF;
 INSERT INTO private.request_archives(office_id,request_id,archived_by,reason) VALUES(p_office_id,r.id,m.user_id,btrim(p_reason));
 INSERT INTO private.request_archive_commands(office_id,actor_id,idempotency_key,request_id,action,reason,expected_version) VALUES(p_office_id,m.user_id,p_idempotency_key,r.id,'archive',btrim(p_reason),p_expected_version);
 PERFORM private.emit_business_event(p_office_id,'requests.archived','request',r.id,p_idempotency_key,'{}');
 RETURN jsonb_build_object('request_id',r.id,'archived',true);
END $$;
-- Retire the unsafe legacy write path, including restore. Its SQL remains in history.
REVOKE ALL ON FUNCTION private.request_archive_command(uuid,uuid,text,text,uuid),public.request_archive_command(uuid,uuid,text,text,uuid) FROM PUBLIC,anon,authenticated,service_role;

CREATE FUNCTION private.request_archives_report_get(p_office_id uuid,p_report_id uuid) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE m public.memberships;r private.request_archive_reports;
BEGIN
 m:=private.request_archives_actor(p_office_id);
 SELECT * INTO r FROM private.request_archive_reports WHERE office_id=p_office_id AND id=p_report_id AND actor_id=m.user_id;
 IF r.id IS NULL THEN RAISE EXCEPTION 'REQUEST_ARCHIVES_FORBIDDEN' USING ERRCODE='PT403';END IF;
 m:=private.request_archives_actor(p_office_id,false,r.filters->>'scope'='all');
 IF EXISTS(SELECT FROM jsonb_array_elements(r.snapshot->'items') x LEFT JOIN public.requests q ON q.office_id=p_office_id AND q.id=(x->>'id')::uuid WHERE q.id IS NULL OR private.request_archives_in_selection(q,m,r.filters->>'scope') IS NOT TRUE) THEN RAISE EXCEPTION 'REQUEST_ARCHIVES_FORBIDDEN' USING ERRCODE='PT403';END IF;
 RETURN r.snapshot;
END $$;
CREATE FUNCTION private.request_archives_report_begin(p_office_id uuid,p_scope text,p_view text,p_status text,p_from timestamptz,p_until timestamptz,p_idempotency_key uuid) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' SET timezone='UTC' AS $$
DECLARE m public.memberships;prior private.request_archive_reports;cut timestamptz;items jsonb;total bigint;at_time timestamptz;f jsonb;report_id uuid;data jsonb;
BEGIN
 m:=private.request_archives_actor(p_office_id,true,p_scope='all');
 PERFORM private.request_archives_filters(p_scope,p_view,p_status,p_from,p_until);
 IF p_idempotency_key IS NULL THEN RAISE EXCEPTION 'REQUEST_ARCHIVES_VALIDATION' USING ERRCODE='PT422';END IF;
 f:=jsonb_build_object('scope',p_scope,'view',p_view,'status',p_status,'from',p_from,'until',p_until);
 SELECT * INTO prior FROM private.request_archive_reports WHERE office_id=p_office_id AND actor_id=m.user_id AND idempotency_key=p_idempotency_key;
 IF FOUND THEN
  IF prior.filters<>f THEN RAISE EXCEPTION 'REQUEST_ARCHIVES_CONFLICT' USING ERRCODE='PT409';END IF;
  RETURN private.request_archives_report_get(p_office_id,prior.id);
 END IF;
 -- Office write lock serializes request changes, scope changes and policy writes.
 m:=private.request_archives_actor(p_office_id,true,p_scope='all');at_time:=clock_timestamp();
 cut:=(private.request_archive_policy_record(p_office_id)->>'cutoff')::timestamptz;
 WITH candidates AS(SELECT r.* FROM public.requests r WHERE r.office_id=p_office_id AND r.status IN('concluido','cancelado') AND private.request_archives_in_selection(r,m,p_scope)
  AND private.request_is_archived(r,cut)=(p_view='archived') AND (p_status='' OR r.status=p_status) AND (p_from IS NULL OR r.updated_at>=p_from) AND (p_until IS NULL OR r.updated_at<p_until)
  ORDER BY r.updated_at DESC,r.id DESC LIMIT 1001)
 SELECT count(*),coalesce(jsonb_agg(private.request_archives_item(c,cut) ORDER BY c.updated_at DESC,c.id DESC),'[]'::jsonb) INTO total,items FROM candidates c;
 IF total>1000 THEN RAISE EXCEPTION 'REQUEST_ARCHIVES_EXPORT_LIMIT' USING ERRCODE='PT422';END IF;
 report_id:=gen_random_uuid();
 data:=jsonb_build_object('id',report_id,'office_id',p_office_id,'protocol','JN-SOL-'||report_id::text,'renderer_version',1,'created_at',at_time,
  'office_name',(SELECT name FROM public.offices WHERE id=p_office_id),'actor_name',(SELECT private.customer_relation_display_label(display_name) FROM public.profiles WHERE id=m.user_id),
  'filters',f,'cutoff',cut,'count',total,'items',items);
 IF octet_length(data::text)>2000000 THEN RAISE EXCEPTION 'REQUEST_ARCHIVES_EXPORT_LIMIT' USING ERRCODE='PT422';END IF;
 PERFORM private.request_archives_actor(p_office_id,true,p_scope='all');
 INSERT INTO private.request_archive_reports(id,office_id,actor_id,idempotency_key,filters,snapshot,created_at) VALUES(report_id,p_office_id,m.user_id,p_idempotency_key,f,data,at_time);
 PERFORM private.emit_business_event(p_office_id,'requests.report_created','request_report',report_id,p_idempotency_key,jsonb_build_object('count',total));
 RETURN data;
END $$;

-- Restore all original scope rules. Portal summaries never contain archive flags.
CREATE OR REPLACE FUNCTION private.requests_page(p_office_id uuid,p_query text,p_scope text,p_status text,p_page integer,p_size integer) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE m public.memberships;result jsonb;total bigint;q text;cut timestamptz;
BEGIN
 m:=private.requests_actor(p_office_id);
 IF p_query IS NULL OR char_length(p_query)>120 OR p_query ~ '[[:cntrl:]]' OR p_scope IS NULL OR p_scope NOT IN('mine','queue','archived') OR p_status IS NULL OR p_status NOT IN('','aberto','em_atendimento','aguardando_cliente','aguardando_responsavel','concluido','cancelado','recebido','em_analise') OR p_page IS NULL OR p_page NOT BETWEEN 1 AND 100000 OR p_size IS NULL OR p_size NOT IN(3,5) THEN RAISE EXCEPTION 'REQUEST_VALIDATION' USING ERRCODE='PT422';END IF;
 IF p_scope='archived' THEN PERFORM private.request_archives_actor(p_office_id,false,true);END IF;
 q:=lower(btrim(p_query));cut:=(private.request_archive_policy_record(p_office_id)->>'cutoff')::timestamptz;
 WITH candidates AS(SELECT r.* FROM public.requests r WHERE r.office_id=p_office_id AND private.request_in_scope(r,m)
  AND (p_scope IN('queue','archived') OR (r.category='account_correction' AND m.role_code<>'client') OR r.created_by=m.user_id OR r.assignee_id=m.id OR (m.role_code<>'client' AND EXISTS(SELECT FROM private.request_assignments a WHERE a.office_id=r.office_id AND a.request_id=r.id AND a.membership_id=m.id)))
  AND (m.role_code='client' OR private.request_is_archived(r,cut)=(p_scope='archived'))
  AND (p_status='' OR CASE WHEN m.role_code='client' THEN private.request_public_status(r.status)=p_status ELSE r.status=p_status END)
  AND (q='' OR strpos(lower(r.title),q)>0 OR strpos(lower(r.protocol),q)>0)),
 paginated AS(SELECT * FROM candidates ORDER BY updated_at DESC,id DESC LIMIT p_size OFFSET (p_page-1)*p_size)
 SELECT (SELECT count(*) FROM candidates),coalesce((SELECT jsonb_agg(private.request_summary(p,m.role_code='client') ORDER BY p.updated_at DESC,p.id DESC) FROM paginated p),'[]'::jsonb) INTO total,result;
 RETURN jsonb_build_object('items',result,'total',total,'page',p_page,'page_size',p_size,'portal',m.role_code='client');
END $$;

CREATE FUNCTION public.request_archives_policy_get(p_office_id uuid) RETURNS jsonb LANGUAGE sql SECURITY INVOKER SET search_path='' AS $$SELECT private.request_archives_policy_get(p_office_id);$$;
CREATE FUNCTION public.request_archives_policy_set(p_office_id uuid,p_days integer,p_expected_version integer,p_idempotency_key uuid) RETURNS jsonb LANGUAGE sql SECURITY INVOKER SET search_path='' AS $$SELECT private.request_archives_policy_set(p_office_id,p_days,p_expected_version,p_idempotency_key);$$;
CREATE FUNCTION public.request_archives_page(p_office_id uuid,p_scope text,p_view text,p_status text,p_from timestamptz,p_until timestamptz,p_page integer,p_size integer) RETURNS jsonb LANGUAGE sql SECURITY INVOKER SET search_path='' AS $$SELECT private.request_archives_page(p_office_id,p_scope,p_view,p_status,p_from,p_until,p_page,p_size);$$;
CREATE FUNCTION public.request_archives_archive(p_office_id uuid,p_request_id uuid,p_expected_version integer,p_reason text,p_idempotency_key uuid) RETURNS jsonb LANGUAGE sql SECURITY INVOKER SET search_path='' AS $$SELECT private.request_archives_archive(p_office_id,p_request_id,p_expected_version,p_reason,p_idempotency_key);$$;
CREATE FUNCTION public.request_archives_report_begin(p_office_id uuid,p_scope text,p_view text,p_status text,p_from timestamptz,p_until timestamptz,p_idempotency_key uuid) RETURNS jsonb LANGUAGE sql SECURITY INVOKER SET search_path='' AS $$SELECT private.request_archives_report_begin(p_office_id,p_scope,p_view,p_status,p_from,p_until,p_idempotency_key);$$;
CREATE FUNCTION public.request_archives_report_get(p_office_id uuid,p_report_id uuid) RETURNS jsonb LANGUAGE sql SECURITY INVOKER SET search_path='' AS $$SELECT private.request_archives_report_get(p_office_id,p_report_id);$$;
DO $$DECLARE f record;BEGIN
 FOR f IN SELECT p.oid::regprocedure signature,p.proname FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname IN('public','private') AND (p.proname LIKE 'request_archives_%' OR p.proname IN('request_archive_policy_initialize','request_archive_policy_record','request_is_archived')) LOOP
  EXECUTE format('REVOKE ALL ON FUNCTION %s FROM PUBLIC,anon,authenticated,service_role',f.signature);
  IF f.proname IN('request_archives_policy_get','request_archives_policy_set','request_archives_page','request_archives_archive','request_archives_report_begin','request_archives_report_get') THEN EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO authenticated',f.signature);END IF;
 END LOOP;
END $$;
