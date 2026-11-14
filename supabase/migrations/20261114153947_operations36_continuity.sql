-- Owner configuration only. No hosted backup, provider quota or restore claim is fabricated.
CREATE TABLE private.operations36_policies(office_id uuid PRIMARY KEY REFERENCES public.offices(id),revision integer NOT NULL CHECK(revision>0),policy jsonb NOT NULL,updated_by uuid NOT NULL REFERENCES auth.users(id),updated_at timestamptz NOT NULL DEFAULT clock_timestamp());
CREATE INDEX operations36_policy_author_idx ON private.operations36_policies(updated_by);
CREATE TABLE private.operations36_commands(office_id uuid NOT NULL REFERENCES public.offices(id),actor_id uuid NOT NULL REFERENCES auth.users(id),session_id uuid NOT NULL,key uuid NOT NULL,payload jsonb NOT NULL,created_at timestamptz NOT NULL DEFAULT clock_timestamp(),PRIMARY KEY(office_id,actor_id,session_id,key));
CREATE INDEX operations36_command_actor_idx ON private.operations36_commands(actor_id);
ALTER TABLE private.operations36_policies ENABLE ROW LEVEL SECURITY;
ALTER TABLE private.operations36_commands ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON private.operations36_policies,private.operations36_commands FROM PUBLIC,anon,authenticated,service_role;

-- Strict DER/SPKI RSA check also covers callers using the authenticated RPC directly.
CREATE FUNCTION private.operations36_der(d bytea,tag integer,pos integer) RETURNS integer[] LANGUAGE plpgsql IMMUTABLE SET search_path='' AS $$
DECLARE n integer;len integer;start_at integer;i integer;BEGIN
 IF pos<0 OR pos+2>octet_length(d) OR get_byte(d,pos)<>tag THEN RETURN NULL;END IF;
 len:=get_byte(d,pos+1);start_at:=pos+2;
 IF len>=128 THEN n:=len-128;IF n NOT BETWEEN 1 AND 3 OR start_at+n>octet_length(d) OR get_byte(d,start_at)=0 THEN RETURN NULL;END IF;len:=0;
  FOR i IN 0..n-1 LOOP len:=len*256+get_byte(d,start_at+i);END LOOP;start_at:=start_at+n;IF len<128 THEN RETURN NULL;END IF;
 END IF;
 IF start_at+len>octet_length(d) THEN RETURN NULL;END IF;RETURN ARRAY[start_at,len,start_at+len];
END$$;
CREATE FUNCTION private.operations36_rsa(p text) RETURNS boolean LANGUAGE plpgsql IMMUTABLE SET search_path='' AS $$
DECLARE body text;d bytea;outer_s integer[];bits integer[];inner_s integer[];modulus integer[];exponent integer[];first_byte integer;skip integer:=0;top_bit integer:=0;i integer;BEGIN
 body:=substring(p FROM E'^-----BEGIN PUBLIC KEY-----\n([A-Za-z0-9+/=\n]+)\n-----END PUBLIC KEY-----\n?$');
 IF body IS NULL OR char_length(body) NOT BETWEEN 64 AND 8000 THEN RETURN false;END IF;
 BEGIN d:=decode(replace(body,E'\n',''),'base64');EXCEPTION WHEN OTHERS THEN RETURN false;END;
 outer_s:=private.operations36_der(d,48,0);IF outer_s IS NULL OR outer_s[3]<>octet_length(d) OR substring(d FROM outer_s[1]+1 FOR 15)<>decode('300d06092a864886f70d0101010500','hex') THEN RETURN false;END IF;
 bits:=private.operations36_der(d,3,outer_s[1]+15);IF bits IS NULL OR bits[3]<>outer_s[3] OR bits[2]<1 OR get_byte(d,bits[1])<>0 THEN RETURN false;END IF;
 inner_s:=private.operations36_der(d,48,bits[1]+1);IF inner_s IS NULL OR inner_s[3]<>bits[3] THEN RETURN false;END IF;
 modulus:=private.operations36_der(d,2,inner_s[1]);IF modulus IS NULL OR modulus[2]<384 THEN RETURN false;END IF;
 first_byte:=get_byte(d,modulus[1]);IF first_byte=0 THEN skip:=1;first_byte:=get_byte(d,modulus[1]+1);IF first_byte<128 THEN RETURN false;END IF;ELSIF first_byte>=128 THEN RETURN false;END IF;
 FOR i IN 0..7 LOOP IF (first_byte & (1<<i))<>0 THEN top_bit:=i+1;END IF;END LOOP;
 IF (modulus[2]-skip-1)*8+top_bit NOT BETWEEN 3072 AND 16384 THEN RETURN false;END IF;
 exponent:=private.operations36_der(d,2,modulus[3]);IF exponent IS NULL OR exponent[3]<>inner_s[3] OR exponent[2] NOT BETWEEN 1 AND 8 OR get_byte(d,exponent[1])>=128 OR (get_byte(d,exponent[3]-1)&1)=0 OR (exponent[2]=1 AND get_byte(d,exponent[1])<=1) THEN RETURN false;END IF;
 IF exponent[2]>1 AND get_byte(d,exponent[1])=0 AND get_byte(d,exponent[1]+1)<128 THEN RETURN false;END IF;RETURN true;
END$$;

CREATE FUNCTION private.operations36_valid(p jsonb) RETURNS boolean LANGUAGE plpgsql IMMUTABLE SET search_path='' AS $$
DECLARE k text;v jsonb; maximum bigint;BEGIN
 IF jsonb_typeof(p) IS DISTINCT FROM 'object' OR (SELECT count(*) FROM jsonb_object_keys(p))<>18 THEN RETURN false;END IF;
 IF p - ARRAY['responsible','currency','budget_cents','database_quota_bytes','storage_quota_bytes','transfer_quota_bytes','email_quota_count','execution_quota_count','recipient_public_key','external_folder_id','rpo_hours','rto_hours','daily_copies','weekly_copies','documents_per_month','average_document_bytes','retention_months','version_copies'] <> '{}'::jsonb THEN RETURN false;END IF;
 IF jsonb_typeof(p->'responsible') IS DISTINCT FROM 'string' OR p->>'responsible'<>btrim(p->>'responsible') OR char_length(p->>'responsible')>120 OR p->>'responsible'~'[[:cntrl:]]' OR jsonb_typeof(p->'currency') IS DISTINCT FROM 'string' OR p->>'currency' NOT IN('USD','BRL') THEN RETURN false;END IF;
 IF jsonb_typeof(p->'external_folder_id') IS DISTINCT FROM 'string' OR (p->>'external_folder_id'<>'' AND p->>'external_folder_id'!~'^[A-Za-z0-9_-]{10,200}$') THEN RETURN false;END IF;
 IF jsonb_typeof(p->'recipient_public_key') IS DISTINCT FROM 'string' OR (p->>'recipient_public_key'<>'' AND NOT private.operations36_rsa(p->>'recipient_public_key')) THEN RETURN false;END IF;
 FOR k,v IN SELECT * FROM jsonb_each(p) LOOP
  IF k=ANY(ARRAY['budget_cents','database_quota_bytes','storage_quota_bytes','transfer_quota_bytes','email_quota_count','execution_quota_count','documents_per_month','average_document_bytes']) THEN
   IF v<>'null'::jsonb THEN IF jsonb_typeof(v)<>'number' OR v::text!~'^[0-9]{1,13}$' THEN RETURN false;END IF;IF v::text::numeric>9000000000000 THEN RETURN false;END IF;END IF;
  ELSIF k=ANY(ARRAY['rpo_hours','rto_hours','daily_copies','weekly_copies','retention_months','version_copies']) THEN
   maximum:=CASE k WHEN 'rpo_hours' THEN 720 WHEN 'rto_hours' THEN 168 WHEN 'daily_copies' THEN 90 WHEN 'weekly_copies' THEN 52 WHEN 'retention_months' THEN 120 ELSE 100 END;
   IF jsonb_typeof(v)<>'number' OR v::text!~'^[0-9]{1,3}$' THEN RETURN false;END IF;IF v::text::integer NOT BETWEEN 1 AND maximum THEN RETURN false;END IF;
  END IF;
 END LOOP;RETURN true;
END$$;

CREATE FUNCTION private.operations36_state(p_office_id uuid) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$DECLARE result jsonb;BEGIN
 -- Reuse the existing canonical owner + settings.access + current-session gate.
 PERFORM private.privacy_settings_actor(p_office_id);
 SELECT jsonb_build_object('revision',revision,'policy',policy) INTO result FROM private.operations36_policies WHERE office_id=p_office_id;
 RETURN coalesce(result,jsonb_build_object('revision',0,'policy',null)) || jsonb_build_object('observed_at',clock_timestamp(),'production_backup_verified',false,'provider_usage',null,'usage',jsonb_build_object(
  'customers',(SELECT count(*) FROM public.customers WHERE office_id=p_office_id),
  'requests',(SELECT count(*) FROM public.requests WHERE office_id=p_office_id),
  'files',(SELECT count(*) FROM public.files WHERE office_id=p_office_id AND status<>'removido'),
  'declared_file_bytes',(SELECT coalesce(sum(size_bytes),0) FROM public.files WHERE office_id=p_office_id AND status<>'removido')));
END$$;

CREATE FUNCTION private.operations36_save(p_office_id uuid,p_expected_revision integer,p_policy jsonb,p_key uuid) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE actor uuid;sid uuid;old jsonb;payload jsonb;revision_now integer;BEGIN
 actor:=private.privacy_settings_actor(p_office_id);sid:=(auth.jwt()->>'session_id')::uuid;
 IF sid IS NULL OR p_key IS NULL OR p_expected_revision IS NULL OR p_expected_revision<0 OR NOT private.operations36_valid(p_policy) THEN RAISE EXCEPTION 'OPERATIONS_VALIDATION' USING ERRCODE='PT422';END IF;
 PERFORM 1 FROM public.offices WHERE id=p_office_id FOR NO KEY UPDATE;
 actor:=private.privacy_settings_actor(p_office_id);
 payload:=jsonb_build_object('revision',p_expected_revision,'policy',p_policy);
 SELECT c.payload INTO old FROM private.operations36_commands c WHERE c.office_id=p_office_id AND c.actor_id=actor AND c.session_id=sid AND c.key=p_key;
 IF FOUND THEN
  IF old<>payload THEN RAISE EXCEPTION 'OPERATIONS_KEY_CONFLICT' USING ERRCODE='PT409';END IF;
  RETURN private.operations36_state(p_office_id);
 END IF;
 SELECT revision INTO revision_now FROM private.operations36_policies WHERE office_id=p_office_id;
 IF coalesce(revision_now,0)<>p_expected_revision OR p_expected_revision>=2147483646 THEN RAISE EXCEPTION 'OPERATIONS_CONFLICT' USING ERRCODE='PT409';END IF;
 INSERT INTO private.operations36_policies(office_id,revision,policy,updated_by)VALUES(p_office_id,p_expected_revision+1,p_policy,actor)
 ON CONFLICT(office_id)DO UPDATE SET revision=EXCLUDED.revision,policy=EXCLUDED.policy,updated_by=actor,updated_at=clock_timestamp();
 INSERT INTO private.operations36_commands(office_id,actor_id,session_id,key,payload)VALUES(p_office_id,actor,sid,p_key,payload);
 PERFORM private.emit_business_event(p_office_id,'operations.settings_updated','office',p_office_id,gen_random_uuid(),'{}');
 RETURN private.operations36_state(p_office_id);
END$$;
CREATE FUNCTION public.operations36_state(p_office_id uuid) RETURNS jsonb LANGUAGE sql SECURITY INVOKER SET search_path='' AS $$SELECT private.operations36_state(p_office_id);$$;
CREATE FUNCTION public.operations36_save(p_office_id uuid,p_expected_revision integer,p_policy jsonb,p_key uuid) RETURNS jsonb LANGUAGE sql SECURITY INVOKER SET search_path='' AS $$SELECT private.operations36_save(p_office_id,p_expected_revision,p_policy,p_key);$$;
REVOKE ALL ON FUNCTION private.operations36_valid(jsonb),private.operations36_state(uuid),private.operations36_save(uuid,integer,jsonb,uuid),public.operations36_state(uuid),public.operations36_save(uuid,integer,jsonb,uuid) FROM PUBLIC,anon,authenticated,service_role;
REVOKE ALL ON FUNCTION private.operations36_der(bytea,integer,integer),private.operations36_rsa(text) FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION private.operations36_state(uuid),private.operations36_save(uuid,integer,jsonb,uuid),public.operations36_state(uuid),public.operations36_save(uuid,integer,jsonb,uuid) TO authenticated;
NOTIFY pgrst,'reload schema';
