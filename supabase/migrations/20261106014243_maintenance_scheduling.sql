-- Credentials remain in Vault and the Edge runtime, never in Express/Vercel.
CREATE TABLE private.maintenance_schedule_settings(
 worker text PRIMARY KEY CHECK(worker IN('account-closure','retention')),
 project_url text NOT NULL,anon_jwt text NOT NULL,vault_secret_id uuid NOT NULL,
 enabled boolean NOT NULL DEFAULT true,updated_at timestamptz NOT NULL DEFAULT clock_timestamp(),
 last_dispatch_at timestamptz,last_request_id bigint,last_error_code text
);
ALTER TABLE private.maintenance_schedule_settings ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON private.maintenance_schedule_settings FROM PUBLIC,anon,authenticated,service_role;
DO $$BEGIN
 IF EXISTS(SELECT FROM pg_available_extensions WHERE name='pg_cron') THEN EXECUTE 'CREATE EXTENSION IF NOT EXISTS pg_cron WITH SCHEMA pg_catalog';END IF;
 IF EXISTS(SELECT FROM pg_available_extensions WHERE name='pg_net') THEN EXECUTE 'CREATE EXTENSION IF NOT EXISTS pg_net WITH SCHEMA extensions';END IF;
END$$;
CREATE FUNCTION private.maintenance_secret(p_worker text) RETURNS text LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$DECLARE sid uuid;secret text;BEGIN
 SELECT vault_secret_id INTO sid FROM private.maintenance_schedule_settings WHERE worker=p_worker AND enabled;
 IF sid IS NULL OR to_regclass('vault.decrypted_secrets') IS NULL THEN RETURN NULL;END IF;
 EXECUTE 'SELECT decrypted_secret FROM vault.decrypted_secrets WHERE id=$1' INTO secret USING sid;
 RETURN secret;
END$$;
CREATE FUNCTION private.maintenance_authorize(p_worker text,p_secret text) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$DECLARE expected text;BEGIN
 IF p_worker IS NULL OR p_worker NOT IN('account-closure','retention') OR p_secret IS NULL OR length(p_secret)<>64 THEN RETURN jsonb_build_object('authorized',false);END IF;
 expected:=private.maintenance_secret(p_worker);
 RETURN jsonb_build_object('authorized',expected IS NOT NULL AND extensions.digest(expected,'sha256')=extensions.digest(p_secret,'sha256'));
END$$;
CREATE FUNCTION public.maintenance_authorize(p_worker text,p_secret text) RETURNS jsonb LANGUAGE sql SECURITY INVOKER SET search_path='' AS $$SELECT private.maintenance_authorize(p_worker,p_secret);$$;
CREATE FUNCTION private.dispatch_maintenance(p_worker text) RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$DECLARE cfg private.maintenance_schedule_settings;secret text;request_id bigint;BEGIN
 SELECT * INTO cfg FROM private.maintenance_schedule_settings WHERE worker=p_worker AND enabled;
 IF cfg.worker IS NULL THEN RETURN false;END IF;
 secret:=private.maintenance_secret(p_worker);IF secret IS NULL THEN RETURN false;END IF;
 EXECUTE 'SELECT net.http_post(url:=$1,headers:=$2,body:=$3,timeout_milliseconds:=60000)' INTO request_id
 USING cfg.project_url||'/functions/v1/'||cfg.worker,jsonb_build_object('Authorization','Bearer '||cfg.anon_jwt,'apikey',cfg.anon_jwt,'Content-Type','application/json',CASE cfg.worker WHEN 'retention' THEN 'X-Retention-Secret' ELSE 'X-Account-Closure-Secret' END,secret),'{}'::jsonb;
 UPDATE private.maintenance_schedule_settings SET last_dispatch_at=clock_timestamp(),last_request_id=request_id,last_error_code=NULL WHERE worker=p_worker;
 RETURN true;
 EXCEPTION WHEN OTHERS THEN UPDATE private.maintenance_schedule_settings SET last_error_code=SQLSTATE WHERE worker=p_worker;RETURN false;
END$$;
-- Operator-only provisioning. The anonymous JWT is public, the random job secret
-- is generated in Postgres and encrypted by Vault without being returned.
CREATE FUNCTION private.configure_maintenance(p_project_url text,p_anon_jwt text) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$DECLARE v_worker text;sid uuid;payload jsonb;part text;BEGIN
 IF p_project_url IS NULL OR p_project_url !~ '^https://[a-z0-9]{20}\.supabase\.co$' OR p_anon_jwt IS NULL OR p_anon_jwt !~ '^[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$' THEN RAISE EXCEPTION 'MAINTENANCE_VALIDATION' USING ERRCODE='PT422';END IF;
 part:=translate(split_part(p_anon_jwt,'.',2),'-_','+/');payload:=convert_from(decode(part||repeat('=',(4-length(part)%4)%4),'base64'),'UTF8')::jsonb;
 IF payload->>'role' IS DISTINCT FROM 'anon' OR payload->>'ref' IS DISTINCT FROM split_part(split_part(p_project_url,'//',2),'.',1) THEN RAISE EXCEPTION 'MAINTENANCE_VALIDATION' USING ERRCODE='PT422';END IF;
 IF to_regclass('vault.secrets') IS NULL OR to_regnamespace('cron') IS NULL OR to_regnamespace('net') IS NULL THEN RAISE EXCEPTION 'MAINTENANCE_DEPENDENCY' USING ERRCODE='PT503';END IF;
 FOREACH v_worker IN ARRAY ARRAY['account-closure','retention'] LOOP
 SELECT vault_secret_id INTO sid FROM private.maintenance_schedule_settings s WHERE s.worker=v_worker;
 IF sid IS NULL THEN EXECUTE 'SELECT vault.create_secret($1,$2,$3)' INTO sid USING encode(extensions.gen_random_bytes(32),'hex'),'jn-maintenance-'||v_worker,'Restricted job credential; never expose to API clients';END IF;
 INSERT INTO private.maintenance_schedule_settings(worker,project_url,anon_jwt,vault_secret_id)VALUES(v_worker,p_project_url,p_anon_jwt,sid)
 ON CONFLICT(worker)DO UPDATE SET project_url=EXCLUDED.project_url,anon_jwt=EXCLUDED.anon_jwt,enabled=true,updated_at=clock_timestamp();
 END LOOP;
 EXECUTE $q$SELECT cron.schedule('jn-account-closure','*/5 * * * *','select private.dispatch_maintenance(''account-closure'');')$q$;
 EXECUTE $q$SELECT cron.schedule('jn-retention','17 * * * *','select private.dispatch_maintenance(''retention'');')$q$;
 RETURN jsonb_build_object('configured',true,'workers',2);
END$$;
REVOKE ALL ON FUNCTION private.maintenance_secret(text),private.maintenance_authorize(text,text),public.maintenance_authorize(text,text),private.dispatch_maintenance(text),private.configure_maintenance(text,text) FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION private.maintenance_authorize(text,text),public.maintenance_authorize(text,text) TO service_role;
DO $$BEGIN
 IF to_regclass('net.http_request_queue') IS NOT NULL THEN EXECUTE 'REVOKE ALL ON net.http_request_queue FROM PUBLIC,anon,authenticated';END IF;
 IF to_regclass('net._http_response') IS NOT NULL THEN EXECUTE 'REVOKE ALL ON net._http_response FROM PUBLIC,anon,authenticated';END IF;
END$$;
NOTIFY pgrst,'reload schema';
