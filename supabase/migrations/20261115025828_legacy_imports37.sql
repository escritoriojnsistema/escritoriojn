-- Stage37: source provenance and initial obligations, never service revenue or payment.
CREATE TABLE private.import_batches37(
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),office_id uuid NOT NULL REFERENCES public.offices(id) ON DELETE RESTRICT,
 input_hash text NOT NULL CHECK(input_hash ~ '^[a-f0-9]{64}$'),source text NOT NULL,as_of date NOT NULL,
 report jsonb NOT NULL,actor_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE RESTRICT,
 created_at timestamptz NOT NULL DEFAULT clock_timestamp(),UNIQUE(office_id,id),UNIQUE(office_id,input_hash)
);
CREATE INDEX import_batches37_actor_idx ON private.import_batches37(actor_id);
CREATE INDEX import_batches37_page_idx ON private.import_batches37(office_id,created_at DESC,id DESC);
CREATE TABLE private.import_rows37(
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),office_id uuid NOT NULL,batch_id uuid NOT NULL,source_id text NOT NULL CHECK(source_id ~ '^[A-Za-z0-9._:/-]{1,80}$'),
 input_hash text NOT NULL CHECK(input_hash ~ '^[a-f0-9]{64}$'),customer_id uuid NOT NULL,created_customer boolean NOT NULL,
 opening_cents bigint NOT NULL CHECK(opening_cents BETWEEN -1000000000000 AND 1000000000000),evidence text NOT NULL,
 file_id uuid,file_reference_id uuid REFERENCES private.file_references(id) ON DELETE RESTRICT,
 FOREIGN KEY(office_id,batch_id) REFERENCES private.import_batches37(office_id,id) ON DELETE RESTRICT,
 FOREIGN KEY(office_id,customer_id) REFERENCES public.customers(office_id,id) ON DELETE RESTRICT,
 FOREIGN KEY(office_id,file_id) REFERENCES public.files(office_id,id) ON DELETE RESTRICT,
 UNIQUE(office_id,source_id),CHECK((file_id IS NULL)=(file_reference_id IS NULL))
);
CREATE INDEX import_rows37_batch_idx ON private.import_rows37(office_id,batch_id);
CREATE INDEX import_rows37_customer_idx ON private.import_rows37(office_id,customer_id);
CREATE INDEX import_rows37_file_idx ON private.import_rows37(office_id,file_id);
CREATE INDEX import_rows37_reference_idx ON private.import_rows37(file_reference_id);
CREATE TRIGGER file_deletion_file_id BEFORE INSERT OR UPDATE ON private.import_rows37 FOR EACH ROW EXECUTE FUNCTION private.files_deletion_reference_guard('file_id');
CREATE TABLE private.import_reversals37(
 batch_id uuid PRIMARY KEY,office_id uuid NOT NULL,actor_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE RESTRICT,
 reason text NOT NULL CHECK(char_length(reason) BETWEEN 5 AND 500 AND reason=btrim(reason) AND reason !~ '[[:cntrl:]]'),
 created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
 FOREIGN KEY(office_id,batch_id) REFERENCES private.import_batches37(office_id,id) ON DELETE RESTRICT
);
CREATE INDEX import_reversals37_office_idx ON private.import_reversals37(office_id,batch_id);
CREATE INDEX import_reversals37_actor_idx ON private.import_reversals37(actor_id);
CREATE TABLE private.import_commands37(
 office_id uuid NOT NULL REFERENCES public.offices(id) ON DELETE RESTRICT,actor_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE RESTRICT,
 session_id uuid NOT NULL,key uuid NOT NULL,command_hash text NOT NULL,batch_id uuid NOT NULL,
 created_at timestamptz NOT NULL DEFAULT clock_timestamp(),PRIMARY KEY(office_id,actor_id,session_id,key),
 FOREIGN KEY(office_id,batch_id) REFERENCES private.import_batches37(office_id,id) ON DELETE RESTRICT
);
CREATE INDEX import_commands37_actor_idx ON private.import_commands37(actor_id);
CREATE INDEX import_commands37_batch_idx ON private.import_commands37(office_id,batch_id);
CREATE FUNCTION private.imports37_immutable() RETURNS trigger LANGUAGE plpgsql SET search_path='' AS $$BEGIN RAISE EXCEPTION 'IMPORT_HISTORY_IMMUTABLE' USING ERRCODE='PT403';END$$;
DO $$DECLARE t text;BEGIN FOREACH t IN ARRAY ARRAY['import_batches37','import_rows37','import_reversals37','import_commands37'] LOOP
 EXECUTE format('ALTER TABLE private.%I ENABLE ROW LEVEL SECURITY',t);
 EXECUTE format('REVOKE ALL ON private.%I FROM PUBLIC,anon,authenticated,service_role',t);
 EXECUTE format('CREATE TRIGGER %I BEFORE UPDATE OR DELETE ON private.%I FOR EACH ROW EXECUTE FUNCTION private.imports37_immutable()',t||'_immutable',t);
END LOOP;END$$;
CREATE FUNCTION private.imports37_actor(o uuid) RETURNS uuid LANGUAGE plpgsql SECURITY INVOKER SET search_path='' AS $$
DECLARE u uuid;BEGIN
 u:=private.privacy_settings_actor(o);
 PERFORM 1 FROM public.offices WHERE id=o FOR NO KEY UPDATE;
 u:=private.privacy_settings_actor(o);
 IF private.current_permissions(o) @> ARRAY['customers.read','customers.read_all','customers.create','charges.read','charges.create','charges.adjust','requests.read','files.read'] IS NOT TRUE THEN RAISE EXCEPTION 'IMPORT_FORBIDDEN' USING ERRCODE='PT403';END IF;
 RETURN u;
END$$;
-- JSONB rendering adds whitespace. Count compact encoded bytes without changing string contents.
CREATE FUNCTION private.imports37_bytes(p jsonb,d integer DEFAULT 0) RETURNS bigint LANGUAGE plpgsql IMMUTABLE SET search_path='' AS $$
DECLARE answer bigint:=2;pair record;v jsonb;n integer:=0;BEGIN
 IF d>16 THEN RETURN 262145;END IF;
 IF jsonb_typeof(p)='object' THEN
 FOR pair IN SELECT * FROM jsonb_each(p) LOOP
 answer:=answer+octet_length(to_json(pair.key)::text)+1+private.imports37_bytes(pair.value,d+1)+CASE WHEN n>0 THEN 1 ELSE 0 END;n:=n+1;IF answer>262144 THEN RETURN answer;END IF;
 END LOOP;
 ELSIF jsonb_typeof(p)='array' THEN
 FOR v IN SELECT value FROM jsonb_array_elements(p) LOOP
 answer:=answer+private.imports37_bytes(v,d+1)+CASE WHEN n>0 THEN 1 ELSE 0 END;n:=n+1;IF answer>262144 THEN RETURN answer;END IF;
 END LOOP;
 ELSE RETURN coalesce(octet_length(p::text),4);END IF;
 RETURN answer;
END$$;
CREATE FUNCTION private.imports37_input(p jsonb) RETURNS void LANGUAGE plpgsql IMMUTABLE SET search_path='' AS $$
DECLARE d date;k text;BEGIN
 IF jsonb_typeof(p) IS DISTINCT FROM 'object' OR p-ARRAY['source','as_of','expected_debit_cents','expected_credit_cents','rows']<>'{}' OR (SELECT count(*) FROM jsonb_object_keys(p))<>5 OR private.imports37_bytes(p)>262144
 OR jsonb_typeof(p->'source') IS DISTINCT FROM 'string' OR char_length(btrim(p->>'source')) NOT BETWEEN 3 AND 120 OR p->>'source'~'[[:cntrl:]]'
 OR jsonb_typeof(p->'as_of') IS DISTINCT FROM 'string' OR p->>'as_of'!~'^[0-9]{4}-[0-9]{2}-[0-9]{2}$'
 OR jsonb_typeof(p->'rows') IS DISTINCT FROM 'array' THEN RAISE EXCEPTION 'IMPORT_VALIDATION' USING ERRCODE='PT422';END IF;
 IF jsonb_array_length(p->'rows') NOT BETWEEN 1 AND 100 THEN RAISE EXCEPTION 'IMPORT_VALIDATION' USING ERRCODE='PT422';END IF;
 BEGIN d:=(p->>'as_of')::date;IF NOT isfinite(d) OR d<'0001-01-01'::date OR to_char(d,'YYYY-MM-DD')<>p->>'as_of' THEN RAISE EXCEPTION 'IMPORT_VALIDATION' USING ERRCODE='PT422';END IF;EXCEPTION WHEN datetime_field_overflow OR invalid_datetime_format THEN RAISE EXCEPTION 'IMPORT_VALIDATION' USING ERRCODE='PT422';END;
 FOREACH k IN ARRAY ARRAY['expected_debit_cents','expected_credit_cents'] LOOP
 IF jsonb_typeof(p->k) IS DISTINCT FROM 'number' OR p->>k!~'^[0-9]{1,15}$' OR (p->>k)::numeric>100000000000000 THEN RAISE EXCEPTION 'IMPORT_VALIDATION' USING ERRCODE='PT422';END IF;
 END LOOP;
END$$;
CREATE FUNCTION private.imports37_plan(o uuid,p jsonb) RETURNS jsonb LANGUAGE plpgsql SECURITY INVOKER SET search_path='' AS $$
<<plan37>>
DECLARE u uuid;raw jsonb;n jsonb;c public.customers;f public.files;m public.memberships;r public.requests;
 rows jsonb:='[]';seen_ids text[]:='{}';seen_identities text[]:='{}';seen_contacts text[]:='{}';seen_names text[]:='{}';contact text;identity_key text;
 source_id text;outcome text;reason text;num integer:=0;amount bigint;debit bigint:=0;credit bigint:=0;accepted integer:=0;
 cust uuid;fid uuid;identity uuid;v integer;prior private.import_rows37;hash text;link_state jsonb;fingerprints jsonb:='[]';report jsonb;
BEGIN
 u:=private.imports37_actor(o);PERFORM private.imports37_input(p);
 FOR raw IN SELECT value FROM jsonb_array_elements(p->'rows') LOOP
 num:=num+1;outcome:='rejected';reason:='INVALID_ROW';n:=NULL;cust:=NULL;fid:=NULL;identity:=NULL;amount:=0;link_state:=NULL;
 source_id:=left(coalesce(raw->>'source_id',''),80);
 BEGIN
 IF jsonb_typeof(raw) IS DISTINCT FROM 'object' OR raw-ARRAY['source_id','customer_id','customer_version','kind','name','identifier','contacts','opening_cents','evidence','file_id']<>'{}' OR (SELECT count(*) FROM jsonb_object_keys(raw))<>10
 OR jsonb_typeof(raw->'source_id') IS DISTINCT FROM 'string' OR raw->>'source_id'!~'^[A-Za-z0-9._:/-]{1,80}$'
 OR jsonb_typeof(raw->'evidence') IS DISTINCT FROM 'string' OR char_length(btrim(raw->>'evidence')) NOT BETWEEN 5 AND 500 OR raw->>'evidence'~'[[:cntrl:]]'
 OR jsonb_typeof(raw->'opening_cents') IS DISTINCT FROM 'number' OR raw->>'opening_cents'!~'^-?[0-9]{1,13}$' OR abs((raw->>'opening_cents')::numeric)>1000000000000 THEN RAISE EXCEPTION 'IMPORT_ROW' USING ERRCODE='PT422';END IF;
 n:=private.customers_normalize_input(jsonb_build_object('kind',raw->'kind','name',raw->'name','identifier',raw->'identifier','contacts',raw->'contacts'));
 amount:=(raw->>'opening_cents')::bigint;
 IF raw->'customer_id'<>'null'::jsonb THEN
 IF jsonb_typeof(raw->'customer_id') IS DISTINCT FROM 'string' OR raw->>'customer_id'!~*'^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$' OR jsonb_typeof(raw->'customer_version') IS DISTINCT FROM 'number' OR raw->>'customer_version'!~'^[1-9][0-9]{0,9}$' OR (raw->>'customer_version')::numeric>2147483646 THEN RAISE EXCEPTION 'IMPORT_ROW' USING ERRCODE='PT422';END IF;
 cust:=(raw->>'customer_id')::uuid;
 ELSIF raw->'customer_version'<>'null'::jsonb THEN RAISE EXCEPTION 'IMPORT_ROW' USING ERRCODE='PT422';END IF;
 IF raw->'file_id'<>'null'::jsonb THEN IF jsonb_typeof(raw->'file_id') IS DISTINCT FROM 'string' OR raw->>'file_id'!~*'^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$' THEN RAISE EXCEPTION 'IMPORT_ROW' USING ERRCODE='PT422';END IF;fid:=(raw->>'file_id')::uuid;END IF;
 reason:=NULL;
 EXCEPTION WHEN SQLSTATE 'PT422' THEN reason:='INVALID_ROW';n:=NULL;cust:=NULL;fid:=NULL;amount:=0;
 END;
 IF reason IS NULL THEN
 hash:=encode(extensions.digest(raw::text,'sha256'),'hex');
 SELECT * INTO prior FROM private.import_rows37 WHERE office_id=o AND private.import_rows37.source_id=plan37.source_id;
 identity_key:=coalesce(n->>'identifier','');
 IF source_id=ANY(seen_ids) OR (cust IS NULL AND (identity_key<>'' AND identity_key=ANY(seen_identities) OR lower(n->>'name')=ANY(seen_names) OR EXISTS(SELECT FROM jsonb_array_elements(n->'contacts') t WHERE (t->>'kind')||':'||(t->>'value')=ANY(seen_contacts)))) THEN reason:='DUPLICATE_LINE';
 ELSIF prior.id IS NOT NULL THEN
 IF prior.input_hash=hash THEN outcome:='seen';reason:='SOURCE_SEEN';ELSE reason:='SOURCE_CHANGED';END IF;
 ELSIF cust IS NOT NULL THEN
 SELECT * INTO c FROM public.customers WHERE office_id=o AND id=cust;
 SELECT a.id INTO identity FROM private.customer_relations a WHERE a.office_id=o AND a.customer_id=cust AND a.relation_type='identity' AND private.customer_relation_status(a)='active';
 IF c.id IS NULL OR private.customer_in_scope(c,u) IS NOT TRUE OR c.version<>(raw->>'customer_version')::integer OR identity IS NULL OR c.kind<>n->>'kind' OR c.name<>n->>'name' OR c.identifier IS DISTINCT FROM n->>'identifier' THEN reason:='LINK_UNAVAILABLE';
 ELSE outcome:='link';reason:='LINK';link_state:=jsonb_build_object('version',c.version,'identity',identity);END IF;
 ELSE
 IF EXISTS(SELECT FROM public.customers x WHERE x.office_id=o AND ((identity_key<>'' AND x.identifier=identity_key) OR lower(x.name)=lower(n->>'name')))
 OR EXISTS(SELECT FROM public.customer_contacts x JOIN jsonb_array_elements(n->'contacts') t ON x.kind=t->>'kind' AND x.value=t->>'value' WHERE x.office_id=o) THEN reason:='DUPLICATE_CUSTOMER';
 ELSE outcome:='create';reason:='NEW';END IF;
 END IF;
 IF outcome IN('create','link') AND fid IS NOT NULL THEN
 IF cust IS NULL THEN reason:='FILE_UNAVAILABLE';outcome:='rejected';ELSE
 SELECT * INTO f FROM public.files WHERE office_id=o AND id=fid;
 m:=private.files_actor(o,false);
 IF f.id IS NULL THEN reason:='FILE_UNAVAILABLE';outcome:='rejected';ELSE
 BEGIN
 r:=private.files_request(o,f.request_id,m,true);
 IF r.customer_id IS DISTINCT FROM cust OR private.request_can_work(r,m) IS NOT TRUE OR private.files_preview_ready(f) IS NOT TRUE OR private.specialized_file_allowed30(f) IS NOT TRUE OR f.status NOT IN('quarentena','disponivel') OR f.sha256!~'^[a-f0-9]{64}$' OR EXISTS(SELECT FROM private.file_cleanup_reservations z WHERE z.office_id=o AND z.file_id=fid) THEN reason:='FILE_UNAVAILABLE';outcome:='rejected';
 ELSE link_state:=link_state||jsonb_build_object('file',f.id,'sha256',f.sha256,'size',f.size_bytes,'status',f.status,'scanner',f.scanner_status,'request_version',r.version);END IF;
 EXCEPTION WHEN SQLSTATE 'PT403' OR SQLSTATE 'PT404' THEN reason:='FILE_UNAVAILABLE';outcome:='rejected';END;
 END IF;END IF;
 END IF;
 seen_ids:=array_append(seen_ids,source_id);
 IF outcome IN('create','link') THEN
 accepted:=accepted+1;debit:=debit+greatest(amount,0);credit:=credit+greatest(-amount,0);
 IF cust IS NULL THEN
 seen_identities:=array_append(seen_identities,identity_key);seen_names:=array_append(seen_names,lower(n->>'name'));
 FOR contact IN SELECT (t->>'kind')||':'||(t->>'value') FROM jsonb_array_elements(n->'contacts')t LOOP seen_contacts:=array_append(seen_contacts,contact);END LOOP;
 END IF;
 END IF;
 END IF;
 rows:=rows||jsonb_build_array(jsonb_build_object('row',num,'source_id',source_id,'name',left(coalesce(n->>'name',''),120),'outcome',outcome,'reason',reason,'opening_cents',amount,'customer_id',cust,'file_id',fid));
 fingerprints:=fingerprints||jsonb_build_array(link_state);
 END LOOP;
 report:=jsonb_build_object('batch_id',NULL,'status','preview','source',btrim(p->>'source'),'as_of',p->>'as_of','rows',rows,'debit_cents',debit,'credit_cents',credit,'expected_debit_cents',p->'expected_debit_cents','expected_credit_cents',p->'expected_credit_cents','ready',accepted>0 AND debit=(p->>'expected_debit_cents')::bigint AND credit=(p->>'expected_credit_cents')::bigint AND NOT EXISTS(SELECT FROM jsonb_array_elements(rows)x WHERE x->>'reason'='SOURCE_CHANGED'));
 RETURN report||jsonb_build_object('fingerprint',encode(extensions.digest(jsonb_build_object('input',p,'report',report,'links',fingerprints)::text,'sha256'),'hex'));
END$$;
CREATE FUNCTION private.imports37_preview(p_office_id uuid,p_input jsonb) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$BEGIN RETURN private.imports37_plan(p_office_id,p_input);END$$;
CREATE FUNCTION private.imports37_detail(p_office_id uuid,p_batch_id uuid) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE b private.import_batches37;resolved jsonb;BEGIN
 PERFORM private.imports37_actor(p_office_id);
 SELECT * INTO b FROM private.import_batches37 WHERE office_id=p_office_id AND id=p_batch_id;
 IF b.id IS NULL THEN RAISE EXCEPTION 'IMPORT_NOT_FOUND' USING ERRCODE='PT404';END IF;
 SELECT jsonb_agg(x.value||jsonb_build_object('customer_id',i.customer_id,'file_id',i.file_id,'name',coalesce(c.name,''))ORDER BY x.ordinality) INTO resolved FROM jsonb_array_elements(b.report->'rows')WITH ORDINALITY x LEFT JOIN private.import_rows37 i ON i.office_id=p_office_id AND i.batch_id=b.id AND i.source_id=x.value->>'source_id' AND x.value->>'outcome' IN('create','link') LEFT JOIN public.customers c ON c.office_id=p_office_id AND c.id=i.customer_id AND private.customer_in_scope(c,auth.uid());
 RETURN b.report||jsonb_build_object('rows',resolved,'status',CASE WHEN EXISTS(SELECT FROM private.import_reversals37 WHERE office_id=p_office_id AND batch_id=b.id) THEN 'reversed' ELSE 'applied' END,'ready',false);
END$$;
CREATE FUNCTION private.imports37_apply(p_office_id uuid,p_input jsonb,p_fingerprint text,p_key uuid) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE u uuid;s uuid;cmd text;h text;old private.import_commands37;b private.import_batches37;plan jsonb;item jsonb;raw jsonb;n jsonb;cid uuid;rid uuid;bid uuid;outrows jsonb:='[]';BEGIN
 u:=private.imports37_actor(p_office_id);PERFORM private.imports37_input(p_input);s:=(auth.jwt()->>'session_id')::uuid;
 IF p_key IS NULL OR p_fingerprint IS NULL OR p_fingerprint!~'^[a-f0-9]{64}$' THEN RAISE EXCEPTION 'IMPORT_VALIDATION' USING ERRCODE='PT422';END IF;
 h:=encode(extensions.digest(p_input::text,'sha256'),'hex');cmd:=encode(extensions.digest(jsonb_build_object('action','apply','input',p_input,'fingerprint',p_fingerprint)::text,'sha256'),'hex');
 SELECT * INTO old FROM private.import_commands37 WHERE office_id=p_office_id AND actor_id=u AND session_id=s AND key=p_key;
 IF old.batch_id IS NOT NULL THEN IF old.command_hash<>cmd THEN RAISE EXCEPTION 'IMPORT_CONFLICT' USING ERRCODE='PT409';END IF;RETURN private.imports37_detail(p_office_id,old.batch_id);END IF;
 SELECT * INTO b FROM private.import_batches37 WHERE office_id=p_office_id AND input_hash=h;
 IF b.id IS NOT NULL THEN
 INSERT INTO private.import_commands37(office_id,actor_id,session_id,key,command_hash,batch_id)VALUES(p_office_id,u,s,p_key,cmd,b.id);
 RETURN private.imports37_detail(p_office_id,b.id);
 END IF;
 plan:=private.imports37_plan(p_office_id,p_input);
 IF plan->>'fingerprint'<>p_fingerprint THEN RAISE EXCEPTION 'IMPORT_PREVIEW_CHANGED' USING ERRCODE='PT409';END IF;
 IF (plan->>'ready')::boolean IS NOT TRUE THEN RAISE EXCEPTION 'IMPORT_UNRECONCILED' USING ERRCODE='PT422';END IF;
 bid:=gen_random_uuid();
 INSERT INTO private.import_batches37(id,office_id,input_hash,source,as_of,report,actor_id)VALUES(bid,p_office_id,h,btrim(p_input->>'source'),(p_input->>'as_of')::date,plan||jsonb_build_object('batch_id',bid,'status','applied','ready',false,'rows',(SELECT jsonb_agg(x||jsonb_build_object('name','','customer_id',NULL,'file_id',NULL)ORDER BY ordinality)FROM jsonb_array_elements(plan->'rows')WITH ORDINALITY t(x,ordinality))),u);
 FOR item IN SELECT value FROM jsonb_array_elements(plan->'rows') LOOP
 IF item->>'outcome' IN('create','link') THEN
 raw:=p_input->'rows'->((item->>'row')::integer-1);cid:=(item->>'customer_id')::uuid;rid:=NULL;
 IF item->>'outcome'='create' THEN
 n:=private.customer_create(p_office_id,jsonb_build_object('kind',raw->'kind','name',raw->'name','identifier',raw->'identifier','contacts',raw->'contacts'),p_key);cid:=(n->>'id')::uuid;
 END IF;
 IF item->>'file_id' IS NOT NULL THEN INSERT INTO private.file_references(office_id,file_id,reference_kind)VALUES(p_office_id,(item->>'file_id')::uuid,'imports37')RETURNING id INTO rid;END IF;
 INSERT INTO private.import_rows37(office_id,batch_id,source_id,input_hash,customer_id,created_customer,opening_cents,evidence,file_id,file_reference_id)VALUES(p_office_id,bid,item->>'source_id',encode(extensions.digest(raw::text,'sha256'),'hex'),cid,item->>'outcome'='create',(item->>'opening_cents')::bigint,btrim(raw->>'evidence'),(item->>'file_id')::uuid,rid);
 item:=item||jsonb_build_object('customer_id',cid);
 END IF;
 outrows:=outrows||jsonb_build_array(item);
 END LOOP;
 -- Reports store no duplicate person names; detail resolves current names through customer08.
 INSERT INTO private.import_commands37(office_id,actor_id,session_id,key,command_hash,batch_id)VALUES(p_office_id,u,s,p_key,cmd,bid);
 PERFORM private.emit_business_event(p_office_id,'imports.applied','import_batch',bid,p_key,'{}');
 RETURN private.imports37_detail(p_office_id,bid);
END$$;
CREATE FUNCTION private.imports37_reverse(p_office_id uuid,p_batch_id uuid,p_fingerprint text,p_reason text,p_key uuid) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE u uuid;s uuid;cmd text;old private.import_commands37;b private.import_batches37;BEGIN
 u:=private.imports37_actor(p_office_id);s:=(auth.jwt()->>'session_id')::uuid;
 IF p_key IS NULL OR p_fingerprint IS NULL OR p_fingerprint!~'^[a-f0-9]{64}$' OR p_reason IS NULL OR char_length(btrim(p_reason)) NOT BETWEEN 5 AND 500 OR p_reason~'[[:cntrl:]]' THEN RAISE EXCEPTION 'IMPORT_VALIDATION' USING ERRCODE='PT422';END IF;
 cmd:=encode(extensions.digest(jsonb_build_object('action','reverse','batch',p_batch_id,'fingerprint',p_fingerprint,'reason',p_reason)::text,'sha256'),'hex');
 SELECT * INTO old FROM private.import_commands37 WHERE office_id=p_office_id AND actor_id=u AND session_id=s AND key=p_key;
 IF old.batch_id IS NOT NULL THEN IF old.command_hash<>cmd THEN RAISE EXCEPTION 'IMPORT_CONFLICT' USING ERRCODE='PT409';END IF;RETURN private.imports37_detail(p_office_id,old.batch_id);END IF;
 SELECT * INTO b FROM private.import_batches37 WHERE office_id=p_office_id AND id=p_batch_id;
 IF b.id IS NULL THEN RAISE EXCEPTION 'IMPORT_NOT_FOUND' USING ERRCODE='PT404';END IF;
 IF b.report->>'fingerprint'<>p_fingerprint OR EXISTS(SELECT FROM private.import_reversals37 WHERE office_id=p_office_id AND batch_id=b.id) THEN RAISE EXCEPTION 'IMPORT_CONFLICT' USING ERRCODE='PT409';END IF;
 INSERT INTO private.import_reversals37(batch_id,office_id,actor_id,reason)VALUES(b.id,p_office_id,u,btrim(p_reason));
 INSERT INTO private.import_commands37(office_id,actor_id,session_id,key,command_hash,batch_id)VALUES(p_office_id,u,s,p_key,cmd,b.id);
 PERFORM private.emit_business_event(p_office_id,'imports.reversed','import_batch',b.id,p_key,'{}');
 RETURN private.imports37_detail(p_office_id,b.id);
END$$;
CREATE FUNCTION private.imports37_history(p_office_id uuid,p_page integer,p_size integer) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE items jsonb;total bigint;BEGIN
 PERFORM private.imports37_actor(p_office_id);
 IF p_page IS NULL OR p_page NOT BETWEEN 1 AND 100000 OR p_size IS NULL OR p_size NOT IN(3,5) THEN RAISE EXCEPTION 'IMPORT_VALIDATION' USING ERRCODE='PT422';END IF;
 SELECT count(*) INTO total FROM private.import_batches37 WHERE office_id=p_office_id;
 SELECT coalesce(jsonb_agg(jsonb_build_object('id',b.id,'source',b.source,'as_of',b.as_of,'created_at',b.created_at,'status',CASE WHEN EXISTS(SELECT FROM private.import_reversals37 r WHERE r.office_id=p_office_id AND r.batch_id=b.id) THEN 'reversed' ELSE 'applied' END,'debit_cents',b.report->'debit_cents','credit_cents',b.report->'credit_cents')ORDER BY b.created_at DESC,b.id DESC),'[]') INTO items FROM(SELECT * FROM private.import_batches37 WHERE office_id=p_office_id ORDER BY created_at DESC,id DESC LIMIT p_size OFFSET(p_page-1)*p_size)b;
 RETURN jsonb_build_object('items',items,'total',total,'page',p_page,'page_size',p_size);
END$$;
CREATE FUNCTION public.imports37_preview(p_office_id uuid,p_input jsonb) RETURNS jsonb LANGUAGE sql SECURITY INVOKER SET search_path='' AS $$SELECT private.imports37_preview(p_office_id,p_input)$$;
CREATE FUNCTION public.imports37_apply(p_office_id uuid,p_input jsonb,p_fingerprint text,p_key uuid) RETURNS jsonb LANGUAGE sql SECURITY INVOKER SET search_path='' AS $$SELECT private.imports37_apply(p_office_id,p_input,p_fingerprint,p_key)$$;
CREATE FUNCTION public.imports37_detail(p_office_id uuid,p_batch_id uuid) RETURNS jsonb LANGUAGE sql SECURITY INVOKER SET search_path='' AS $$SELECT private.imports37_detail(p_office_id,p_batch_id)$$;
CREATE FUNCTION public.imports37_history(p_office_id uuid,p_page integer,p_size integer) RETURNS jsonb LANGUAGE sql SECURITY INVOKER SET search_path='' AS $$SELECT private.imports37_history(p_office_id,p_page,p_size)$$;
CREATE FUNCTION public.imports37_reverse(p_office_id uuid,p_batch_id uuid,p_fingerprint text,p_reason text,p_key uuid) RETURNS jsonb LANGUAGE sql SECURITY INVOKER SET search_path='' AS $$SELECT private.imports37_reverse(p_office_id,p_batch_id,p_fingerprint,p_reason,p_key)$$;
DO $$DECLARE f record;BEGIN FOR f IN SELECT p.oid::regprocedure signature,n.nspname,p.proname FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname IN('public','private') AND p.proname LIKE 'imports37_%' LOOP
 EXECUTE format('REVOKE ALL ON FUNCTION %s FROM PUBLIC,anon,authenticated,service_role',f.signature);
 IF f.proname IN('imports37_preview','imports37_apply','imports37_detail','imports37_history','imports37_reverse') THEN EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO authenticated',f.signature);END IF;
END LOOP;END$$;
