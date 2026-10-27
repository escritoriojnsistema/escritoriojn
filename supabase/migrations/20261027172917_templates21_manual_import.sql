-- Ajuste pós21: manual-only declared fields and private technical draft import.
-- No historical migration, approval, document, signature or PDF is rewritten.
CREATE OR REPLACE FUNCTION private.templates_validate20(d jsonb) RETURNS jsonb LANGUAGE plpgsql IMMUTABLE SECURITY INVOKER SET search_path='' AS $$
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
 IF jsonb_array_length(d->'variables')>80 THEN RAISE EXCEPTION 'TEMPLATES_VALIDATION' USING ERRCODE='PT422';END IF;
 FOR v IN SELECT x FROM jsonb_array_elements(d->'variables')x LOOP
 IF jsonb_typeof(v) IS DISTINCT FROM 'object' THEN RAISE EXCEPTION 'TEMPLATES_VALIDATION' USING ERRCODE='PT422';END IF;
 IF NOT v ?& ARRAY['key','label','type','required'] OR(SELECT count(*) FROM jsonb_object_keys(v))<>4 OR jsonb_typeof(v->'key') IS DISTINCT FROM 'string' OR jsonb_typeof(v->'label') IS DISTINCT FROM 'string' OR (char_length(v->>'label') NOT BETWEEN 1 AND 80 OR NOT private.templates_has_text20(v->>'label')) OR v->>'label' ~ '[[:cntrl:]]' OR jsonb_typeof(v->'type') IS DISTINCT FROM 'string' OR jsonb_typeof(v->'required') IS DISTINCT FROM 'boolean' OR v->>'key'=ANY(seen) THEN RAISE EXCEPTION 'TEMPLATES_VALIDATION' USING ERRCODE='PT422';END IF;
 typ:=CASE WHEN v->>'key' IN('cliente.nome','cliente.cpf','cliente.endereco','participante.vendedor.nome','participante.vendedor.cpf','participante.comprador.nome','participante.comprador.cpf','servico.descricao') THEN 'text' WHEN v->>'key' IN('datas.emissao','datas.inicio','datas.fim') THEN 'date' WHEN v->>'key' IN('valores.total','valores.parcela') THEN 'money' WHEN v->>'key'='servico.quantidade' THEN 'number' END;
 IF v->>'key' ~ '^documento\.[a-z][a-z0-9_]{0,63}$' THEN typ:=CASE WHEN v->>'type' IN('text','date','money','number','cpf','cnpj','tax_id') THEN v->>'type' END;END IF;
 IF typ IS NULL OR v->>'type'<>typ THEN RAISE EXCEPTION 'TEMPLATES_VALIDATION' USING ERRCODE='PT422';END IF;seen:=array_append(seen,v->>'key');END LOOP;
 SELECT coalesce(array_agg(DISTINCT m[1]),'{}') INTO placeholders FROM regexp_matches(d->>'content','\{\{([a-z][a-z0-9_]*(\.[a-z][a-z0-9_]*)+)\}\}','g')m;
 remaining:=regexp_replace(d->>'content','\{\{([a-z][a-z0-9_]*(\.[a-z][a-z0-9_]*)+)\}\}','','g');
 IF strpos(remaining,'{{')>0 OR strpos(remaining,'}}')>0 OR NOT(seen @> placeholders AND seen <@ placeholders) THEN RAISE EXCEPTION 'TEMPLATES_VALIDATION' USING ERRCODE='PT422';END IF;
 RETURN d;
END $$;
-- Legacy automatic overrides retain500 at rest; the resolver still reports names over120 as pending.
CREATE OR REPLACE FUNCTION private.documents_input21(i jsonb,d jsonb) RETURNS void LANGUAGE plpgsql IMMUTABLE SECURITY INVOKER SET search_path='' AS $$
BEGIN
 IF jsonb_typeof(i) IS DISTINCT FROM 'object' OR NOT i ?& ARRAY['content','overrides','money_in_words'] OR (i-'content'-'overrides'-'money_in_words')<>'{}' OR jsonb_typeof(i->'content') IS DISTINCT FROM 'string' OR char_length(i->>'content')>30000 OR translate(i->>'content',E'\t\r\n','')~'[[:cntrl:]]' OR jsonb_typeof(i->'money_in_words') IS DISTINCT FROM 'boolean' OR jsonb_typeof(i->'overrides') IS DISTINCT FROM 'object' THEN RAISE EXCEPTION 'DOCUMENTS_VALIDATION' USING ERRCODE='PT422';END IF;
 IF (SELECT count(*) FROM jsonb_object_keys(i->'overrides'))>80 OR EXISTS(SELECT FROM jsonb_each(i->'overrides')e WHERE jsonb_typeof(e.value)<>'string' OR char_length(e.value#>>'{}')>CASE WHEN e.key ~ '^documento\.[a-z][a-z0-9_]{0,63}$' THEN 2000 ELSE 500 END OR translate(e.value#>>'{}',E'\t\r\n','')~'[[:cntrl:]]' OR NOT EXISTS(SELECT FROM jsonb_array_elements(d->'variables')v WHERE v->>'key'=e.key)) THEN RAISE EXCEPTION 'DOCUMENTS_VALIDATION' USING ERRCODE='PT422';END IF;
END$$;
CREATE OR REPLACE FUNCTION private.documents_resolve21(d jsonb,i jsonb,s jsonb,p jsonb) RETURNS jsonb LANGUAGE plpgsql IMMUTABLE SECURITY INVOKER SET search_path='' AS $$
DECLARE vals jsonb:='{}';fmt jsonb:='{}';words jsonb:='{}';issues jsonb:='[]';automatic jsonb;v jsonb;k text;label text;typ text;raw text;rendered text:=i->>'content';stripped text;valid boolean;f text;cents bigint;day date;part jsonb;rolekey text;mat text[];seen text[]:=ARRAY[]::text[];
BEGIN
 PERFORM private.documents_input21(i,d);
 automatic:=jsonb_build_object('cliente.nome',s#>>'{customer,name}','cliente.cpf',CASE WHEN s#>>'{customer,kind}'='person' THEN s#>>'{customer,identifier}' END,'servico.descricao',s#>>'{service,description}','servico.quantidade',s#>>'{service,quantity}','datas.emissao',s->>'emitted_on','valores.total',to_char((s#>>'{service,total_cents}')::numeric/100,'FM999999999990.00'));
 FOR part IN SELECT x FROM jsonb_array_elements(p)x WHERE x->>'role' IN('buyer','seller') LOOP rolekey:=CASE WHEN part->>'role'='buyer' THEN 'comprador' ELSE 'vendedor' END;automatic:=automatic||jsonb_build_object('participante.'||rolekey||'.nome',part->>'name','participante.'||rolekey||'.cpf',CASE WHEN part->>'kind'='person' THEN part->>'identifier' END);END LOOP;
 FOR v IN SELECT x FROM jsonb_array_elements(d->'variables')x LOOP
 k:=v->>'key';label:=v->>'label';typ:=v->>'type';raw:=nullif(private.documents_trim21(CASE WHEN i->'overrides' ? k THEN i->'overrides'->>k ELSE automatic->>k END),'');valid:=true;
 IF (v->>'required')::boolean AND k LIKE 'participante.%' AND NOT EXISTS(SELECT FROM jsonb_array_elements(p)x WHERE x->>'role'=CASE WHEN k LIKE 'participante.comprador.%' THEN 'buyer' ELSE 'seller' END) THEN issues:=issues||private.documents_issue21(k,'participant_required',label||': selecione o participante correspondente.');END IF;
 IF raw IS NULL THEN IF (v->>'required')::boolean THEN issues:=issues||private.documents_issue21(k,'required',label||': informe o campo obrigatório.');END IF;vals:=vals||jsonb_build_object(k,NULL);CONTINUE;END IF;
 f:=raw;
 IF typ='date' THEN
 valid:=raw~'^[0-9]{4}-[0-9]{2}-[0-9]{2}$' AND left(raw,4)<>'0000';
 IF valid THEN BEGIN day:=raw::date;valid:=to_char(day,'YYYY-MM-DD')=raw;EXCEPTION WHEN OTHERS THEN valid:=false;END;END IF;IF valid THEN f:=to_char(day,'DD/MM/YYYY');END IF;
 ELSIF typ='money' THEN valid:=raw~'^(0|[1-9][0-9]{0,8})(\.[0-9]{1,2})?$';IF valid THEN cents:=(raw::numeric*100)::bigint;raw:=to_char(cents::numeric/100,'FM999999999990.00');f:='R$ '||translate(to_char(cents::numeric/100,'FM999,999,999,990.00'),',.','.,');words:=words||jsonb_build_object(k,private.documents_words21(cents));END IF;
 ELSIF typ='number' THEN valid:=raw~'^(0|[1-9][0-9]{0,5})(\.[0-9]{1,3})?$';IF valid THEN valid:=raw::numeric<=100000;IF valid THEN raw:=trim_scale(raw::numeric)::text;f:=replace(raw,'.',',');END IF;END IF;
 ELSIF typ='tax_id' THEN BEGIN
 IF raw ~ '^([0-9]{11}|[0-9]{3}\.[0-9]{3}\.[0-9]{3}-[0-9]{2})$' THEN raw:=private.customers_normalize_identifier('person',raw);f:=substr(raw,1,3)||'.'||substr(raw,4,3)||'.'||substr(raw,7,3)||'-'||substr(raw,10,2);
 ELSIF raw ~ '^([0-9]{14}|[0-9]{2}\.[0-9]{3}\.[0-9]{3}/[0-9]{4}-[0-9]{2})$' THEN raw:=private.customers_normalize_identifier('company',raw);f:=substr(raw,1,2)||'.'||substr(raw,3,3)||'.'||substr(raw,6,3)||'/'||substr(raw,9,4)||'-'||substr(raw,13,2);
 ELSE valid:=false;END IF;EXCEPTION WHEN OTHERS THEN valid:=false;END;
 ELSIF typ='cpf' OR k LIKE '%.cpf' AND k NOT LIKE 'documento.%' THEN BEGIN raw:=private.customers_normalize_identifier('person',raw);f:=substr(raw,1,3)||'.'||substr(raw,4,3)||'.'||substr(raw,7,3)||'-'||substr(raw,10,2);EXCEPTION WHEN OTHERS THEN valid:=false;END;
 ELSIF typ='cnpj' THEN BEGIN raw:=private.customers_normalize_identifier('company',raw);f:=substr(raw,1,2)||'.'||substr(raw,3,3)||'.'||substr(raw,6,3)||'/'||substr(raw,9,4)||'-'||substr(raw,13,2);EXCEPTION WHEN OTHERS THEN valid:=false;END;
 ELSE valid:=char_length(raw)<=CASE WHEN k LIKE 'documento.%' THEN 2000 WHEN k LIKE '%.nome' THEN 120 ELSE 500 END;END IF;
 IF valid THEN vals:=vals||jsonb_build_object(k,raw);fmt:=fmt||jsonb_build_object(k,f);ELSE vals:=vals||jsonb_build_object(k,NULL);issues:=issues||private.documents_issue21(k,'invalid_value',label||': confira o valor informado.');END IF;
 END LOOP;
 IF vals->>'datas.inicio'>vals->>'datas.fim' THEN issues:=issues||private.documents_issue21('datas.fim','date_order','A data final deve ser igual ou posterior à data de início.');END IF;
 -- Build from original matches, so literal braces inside a replacement are never evaluated recursively.
 rendered:='';stripped:=i->>'content';
 LOOP mat:=regexp_match(stripped,'^(.*?)\{\{([^{}]*)\}\}(.*)$','s');EXIT WHEN mat IS NULL;k:=mat[2];rendered:=rendered||mat[1];stripped:=mat[3];
 SELECT x INTO v FROM jsonb_array_elements(d->'variables')x WHERE x->>'key'=k;
 IF v IS NULL THEN rendered:=rendered||'{{'||k||'}}';IF NOT issues @> jsonb_build_array(jsonb_build_object('key',k,'code','unknown_variable')) THEN issues:=issues||private.documents_issue21(k,'unknown_variable','Variável não declarada: '||k||'.');END IF;
 ELSE seen:=array_append(seen,k);rendered:=rendered||coalesce(fmt->>k||CASE WHEN (i->>'money_in_words')::boolean AND words ? k THEN ' ('||(words->>k)||')' ELSE '' END,'[Pendente: '||(v->>'label')||']');END IF;END LOOP;rendered:=rendered||stripped;
 FOR v IN SELECT x FROM jsonb_array_elements(d->'variables')x WHERE(x->>'required')::boolean LOOP IF NOT(v->>'key'=ANY(seen)) THEN issues:=issues||private.documents_issue21(v->>'key','missing_placeholder',(v->>'label')||': restaure {{'||(v->>'key')||'}} no texto.');END IF;END LOOP;
 stripped:=regexp_replace(i->>'content','\{\{[^{}]*\}\}','','g');IF strpos(stripped,'{{')>0 OR strpos(stripped,'}}')>0 THEN issues:=issues||private.documents_issue21('content','invalid_placeholder','Há um campo automático incompleto. Use {{chave.do.campo}}.');END IF;
 IF private.documents_trim21(i->>'content')='' THEN issues:=issues||private.documents_issue21('content','content_empty','Informe o texto do documento.');END IF;
 IF char_length(rendered)>50000 THEN issues:=issues||private.documents_issue21('content','invalid_value','A prévia excede 50.000 caracteres. Reduza repetições de campos automáticos.');rendered:=i->>'content';END IF;
 RETURN jsonb_build_object('values',vals,'formatted',fmt,'words',words,'issues',issues,'rendered_content',rendered);
END$$;

CREATE TABLE private.template_import_batches(
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),office_id uuid NOT NULL REFERENCES public.offices(id) ON DELETE RESTRICT,
 batch_key text NOT NULL CHECK(batch_key ~ '^[A-Za-z0-9][A-Za-z0-9_-]{0,119}$'),
 source_url text NOT NULL CHECK(char_length(source_url) BETWEEN 1 AND 2048 AND source_url ~ '^https://[^[:space:]]+$' AND source_url !~ '[[:cntrl:]]'),
 payload_digest text NOT NULL CHECK(payload_digest ~ '^[0-9a-f]{64}$'),actor_db_role name NOT NULL DEFAULT current_user,
 result jsonb NOT NULL CHECK(jsonb_typeof(result)='object'),created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
 UNIQUE(office_id,id),UNIQUE(office_id,batch_key)
);
ALTER TABLE private.template_import_batches ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON private.template_import_batches FROM PUBLIC,anon,authenticated,service_role;
CREATE TRIGGER immutable BEFORE UPDATE OR DELETE ON private.template_import_batches FOR EACH ROW EXECUTE FUNCTION private.templates_immutable20();
ALTER TABLE public.templates ALTER COLUMN created_by DROP NOT NULL;
ALTER TABLE public.templates ADD COLUMN source_import_id uuid;
ALTER TABLE public.templates ADD CONSTRAINT templates_author_origin21 CHECK((created_by IS NOT NULL AND source_import_id IS NULL) OR(created_by IS NULL AND source_import_id IS NOT NULL));
ALTER TABLE public.templates ADD CONSTRAINT templates_import_office21 FOREIGN KEY(office_id,source_import_id) REFERENCES private.template_import_batches(office_id,id) ON DELETE RESTRICT;
CREATE INDEX templates_import_office_idx ON public.templates(office_id,source_import_id);
ALTER TABLE public.template_versions ALTER COLUMN created_by DROP NOT NULL;
ALTER TABLE public.template_versions ADD COLUMN source_import_id uuid;
ALTER TABLE public.template_versions ADD CONSTRAINT template_versions_author_origin21 CHECK((created_by IS NOT NULL AND source_import_id IS NULL) OR(created_by IS NULL AND source_import_id IS NOT NULL));
ALTER TABLE public.template_versions ADD CONSTRAINT template_versions_import_office21 FOREIGN KEY(office_id,source_import_id) REFERENCES private.template_import_batches(office_id,id) ON DELETE RESTRICT;
CREATE INDEX template_versions_import_office_idx ON public.template_versions(office_id,source_import_id);
CREATE FUNCTION private.templates_origin21() RETURNS trigger LANGUAGE plpgsql SECURITY INVOKER SET search_path='' AS $$BEGIN
 IF ROW(NEW.office_id,NEW.code,NEW.created_by,NEW.source_import_id,NEW.created_at) IS DISTINCT FROM ROW(OLD.office_id,OLD.code,OLD.created_by,OLD.source_import_id,OLD.created_at) THEN RAISE EXCEPTION 'TEMPLATE_CONFLICT' USING ERRCODE='PT409';END IF;RETURN NEW;
END$$;
REVOKE ALL ON FUNCTION private.templates_origin21() FROM PUBLIC,anon,authenticated,service_role;
CREATE TRIGGER immutable_origin BEFORE UPDATE ON public.templates FOR EACH ROW EXECUTE FUNCTION private.templates_origin21();
CREATE OR REPLACE FUNCTION private.template_version20(v public.template_versions) RETURNS jsonb LANGUAGE sql STABLE SECURITY INVOKER SET search_path='' AS $$
 SELECT v.definition||jsonb_build_object('id',v.id,'number',v.number,'created_by',v.created_by,'source_import_id',v.source_import_id,'created_by_name',v.created_by_name,'created_at',v.created_at,'reason',v.reason,'approved_by',a.approved_by,'approved_by_name',a.approved_by_name,'approved_at',a.approved_at,'approval_reason',a.reason) FROM(SELECT 1)x LEFT JOIN private.template_approvals a ON a.office_id=v.office_id AND a.template_id=v.template_id AND a.version_id=v.id;
$$;

-- The migration owner is the only grantee. This invoker does not accept a JWT,
-- impersonate a human author or bypass caller privileges through a definer.
CREATE FUNCTION private.import_template_drafts(office uuid,batch_key text,source_url text,definitions jsonb) RETURNS jsonb
LANGUAGE plpgsql SECURITY INVOKER SET search_path='' AS $$
DECLARE old_batch private.template_import_batches;digest text;batch_id uuid:=gen_random_uuid();d jsonb;item jsonb;items jsonb:='[]';summary jsonb;template_id uuid;version_id uuid;BEGIN
 IF office IS NULL OR batch_key IS NULL OR batch_key !~ '^[A-Za-z0-9][A-Za-z0-9_-]{0,119}$' OR source_url IS NULL OR char_length(source_url)>2048 OR source_url !~ '^https://[^[:space:]]+$' OR source_url ~ '[[:cntrl:]]' OR jsonb_typeof(definitions) IS DISTINCT FROM 'array' THEN RAISE EXCEPTION 'TEMPLATES_VALIDATION' USING ERRCODE='PT422';END IF;
 IF jsonb_array_length(definitions)=0 THEN RAISE EXCEPTION 'TEMPLATES_VALIDATION' USING ERRCODE='PT422';END IF;
 -- Same first lock as human20 mutations; serializes batches and code allocation.
 PERFORM 1 FROM public.offices o WHERE o.id=office AND o.active FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'TEMPLATES_VALIDATION' USING ERRCODE='PT422';END IF;
 digest:=encode(extensions.digest(jsonb_build_object('source_url',source_url,'definitions',definitions)::text,'sha256'),'hex');
 SELECT * INTO old_batch FROM private.template_import_batches b WHERE b.office_id=office AND b.batch_key=import_template_drafts.batch_key;
 IF FOUND THEN IF old_batch.payload_digest<>digest THEN RAISE EXCEPTION 'TEMPLATE_IMPORT_CONFLICT' USING ERRCODE='PT409';END IF;RETURN old_batch.result;END IF;
 FOR d IN SELECT x FROM jsonb_array_elements(definitions)x LOOP
 PERFORM private.templates_validate20(d);
 IF d->'review_required'<>'true'::jsonb THEN RAISE EXCEPTION 'TEMPLATES_VALIDATION' USING ERRCODE='PT422';END IF;
 IF EXISTS(SELECT FROM public.templates t WHERE t.office_id=office AND t.code=d->>'code') OR EXISTS(SELECT FROM jsonb_array_elements(items)i WHERE i->>'code'=d->>'code') THEN RAISE EXCEPTION 'TEMPLATE_IMPORT_CONFLICT' USING ERRCODE='PT409';END IF;
 items:=items||jsonb_build_array(jsonb_build_object('id',gen_random_uuid(),'code',d->>'code','version_id',gen_random_uuid(),'number',1));
 END LOOP;
 summary:=jsonb_build_object('id',batch_id,'batch_key',batch_key,'payload_digest',digest,'count',jsonb_array_length(definitions),'items',items);
 INSERT INTO private.template_import_batches(id,office_id,batch_key,source_url,payload_digest,actor_db_role,result)VALUES(batch_id,office,batch_key,source_url,digest,current_user,summary);
 FOR d,item IN SELECT x,y FROM jsonb_array_elements(definitions) WITH ORDINALITY ds(x,n) JOIN jsonb_array_elements(items) WITH ORDINALITY its(y,n) USING(n) LOOP
 template_id:=(item->>'id')::uuid;version_id:=(item->>'version_id')::uuid;
 INSERT INTO public.templates(id,office_id,code,latest_version,created_by,source_import_id)VALUES(template_id,office,d->>'code',1,NULL,batch_id);
 INSERT INTO public.template_versions(id,office_id,template_id,number,definition,created_by,created_by_name,reason,source_import_id)VALUES(version_id,office,template_id,1,d,NULL,'Importação técnica — revisão pendente','Minuta adaptada importada para revisão humana.',batch_id);
 INSERT INTO public.audit_events(office_id,actor_kind,actor_db_role,action,target_type,target_id,request_id,changes)VALUES(office,'operator',current_user,'templates.saved','template',template_id,batch_id,'{}');
 END LOOP;
 RETURN summary;
END$$;
REVOKE ALL ON FUNCTION private.import_template_drafts(uuid,text,text,jsonb) FROM PUBLIC,anon,authenticated,service_role;
COMMENT ON FUNCTION private.import_template_drafts(uuid,text,text,jsonb) IS 'Technical draft import for the migration owner only; no approval or document creation. Exact batch replay returns the persisted result.';
NOTIFY pgrst,'reload schema';
