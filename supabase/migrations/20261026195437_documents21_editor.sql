-- Etapa 21: documentos internos, snapshots e decisões imutáveis.
INSERT INTO public.permissions(code,name) VALUES ('documents.read','Consultar documentos'),('documents.create','Criar documentos'),('documents.update','Editar documentos') ON CONFLICT DO NOTHING;
INSERT INTO public.role_permissions(role_code,permission_code) SELECT 'owner',code FROM public.permissions WHERE code IN('documents.read','documents.create','documents.update') ON CONFLICT DO NOTHING;
DO $m$ DECLARE r record;d text;extra text:=', ''documents.read'', ''documents.create'', ''documents.update''';BEGIN
 FOR r IN SELECT conrelid::regclass tbl,conname,pg_get_constraintdef(oid) def FROM pg_constraint WHERE conrelid IN('private.team_member_permissions'::regclass,'private.team_delegations'::regclass,'private.team_invitations'::regclass) AND contype='c' AND pg_get_constraintdef(oid) LIKE '%cash.read%' LOOP
 d:=replace(r.def,'''cash.read''::text','''cash.read''::text'||replace(extra,', ','::text, ')||'::text');EXECUTE format('ALTER TABLE %s DROP CONSTRAINT %I',r.tbl,r.conname);EXECUTE format('ALTER TABLE %s ADD CONSTRAINT %I %s',r.tbl,r.conname,d);END LOOP;
 FOR r IN SELECT oid FROM pg_proc WHERE pronamespace='private'::regnamespace AND proname IN('team_scope_for_member','team_validate_assignment','safe_audit_changes') LOOP d:=pg_get_functiondef(r.oid);d:=replace(d,'''cash.read''','''cash.read'''||extra);EXECUTE d;END LOOP;
END $m$;
CREATE TABLE public.documents (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), office_id uuid NOT NULL REFERENCES public.offices(id) ON DELETE RESTRICT,
 request_id uuid NOT NULL,request_item_id uuid NOT NULL REFERENCES public.request_items(id) ON DELETE RESTRICT,
 template_id uuid NOT NULL,template_version_id uuid NOT NULL, protocol text NOT NULL,title text NOT NULL,
 revision integer NOT NULL CHECK(revision>0),status text NOT NULL CHECK(status IN('draft','prepared')),
 created_by uuid NOT NULL REFERENCES auth.users(id) ON DELETE RESTRICT,created_at timestamptz NOT NULL DEFAULT clock_timestamp(),updated_at timestamptz NOT NULL DEFAULT clock_timestamp(),prepared_at timestamptz,
 UNIQUE(office_id,id),UNIQUE(office_id,protocol),FOREIGN KEY(office_id,request_id) REFERENCES public.requests(office_id,id) ON DELETE RESTRICT,
 FOREIGN KEY(office_id,template_id,template_version_id) REFERENCES public.template_versions(office_id,template_id,id) ON DELETE RESTRICT
);
CREATE INDEX documents_request_idx ON public.documents(office_id,request_id);
CREATE INDEX documents_item_idx ON public.documents(request_item_id);
CREATE INDEX documents_template_idx ON public.documents(office_id,template_id,template_version_id);
CREATE INDEX documents_author_idx ON public.documents(created_by);
CREATE INDEX documents_updated_idx ON public.documents(office_id,updated_at DESC,id DESC);
CREATE TABLE private.document_revisions (
 office_id uuid NOT NULL,document_id uuid NOT NULL,revision integer NOT NULL CHECK(revision>0),input jsonb NOT NULL,source jsonb NOT NULL,
 source_customer_id uuid GENERATED ALWAYS AS ((source#>>'{customer,customer_id}')::uuid) STORED,
 author_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE RESTRICT,author_name text NOT NULL,created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
 PRIMARY KEY(office_id,document_id,revision),FOREIGN KEY(office_id,document_id) REFERENCES public.documents(office_id,id) ON DELETE RESTRICT,
 FOREIGN KEY(office_id,source_customer_id) REFERENCES public.customers(office_id,id) ON DELETE RESTRICT
);
CREATE INDEX document_revisions_source_idx ON private.document_revisions(office_id,source_customer_id);
CREATE INDEX document_revisions_author_idx ON private.document_revisions(author_id);
CREATE TABLE public.document_participants (
 office_id uuid NOT NULL,document_id uuid NOT NULL,revision integer NOT NULL,position integer NOT NULL,customer_id uuid NOT NULL,role text NOT NULL,label text NOT NULL,snapshot jsonb NOT NULL,
 PRIMARY KEY(office_id,document_id,revision,position),FOREIGN KEY(office_id,document_id,revision) REFERENCES private.document_revisions(office_id,document_id,revision) ON DELETE RESTRICT,
 FOREIGN KEY(office_id,customer_id) REFERENCES public.customers(office_id,id) ON DELETE RESTRICT
);
CREATE INDEX document_participants_customer_idx ON public.document_participants(office_id,customer_id);
CREATE TABLE private.document_preparations (
 office_id uuid NOT NULL,document_id uuid NOT NULL,revision integer NOT NULL,actor_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE RESTRICT,created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
 PRIMARY KEY(office_id,document_id,revision),FOREIGN KEY(office_id,document_id,revision) REFERENCES private.document_revisions(office_id,document_id,revision) ON DELETE RESTRICT
);
CREATE INDEX document_preparations_actor_idx ON private.document_preparations(actor_id);
CREATE TABLE private.document_commands (
 office_id uuid NOT NULL,actor_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE RESTRICT,idempotency_key uuid NOT NULL,digest text NOT NULL,document_id uuid NOT NULL,created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
 PRIMARY KEY(office_id,actor_id,idempotency_key),FOREIGN KEY(office_id,document_id) REFERENCES public.documents(office_id,id) ON DELETE RESTRICT
);
CREATE INDEX document_commands_actor_idx ON private.document_commands(actor_id);
CREATE INDEX document_commands_document_idx ON private.document_commands(office_id,document_id);
CREATE FUNCTION private.documents_immutable21() RETURNS trigger LANGUAGE plpgsql SECURITY INVOKER SET search_path='' AS $$BEGIN RAISE EXCEPTION 'DOCUMENT_CONFLICT' USING ERRCODE='PT409';END$$;
CREATE TRIGGER immutable BEFORE UPDATE OR DELETE ON private.document_revisions FOR EACH ROW EXECUTE FUNCTION private.documents_immutable21();
CREATE TRIGGER immutable BEFORE UPDATE OR DELETE ON public.document_participants FOR EACH ROW EXECUTE FUNCTION private.documents_immutable21();
CREATE TRIGGER immutable BEFORE UPDATE OR DELETE ON private.document_preparations FOR EACH ROW EXECUTE FUNCTION private.documents_immutable21();
CREATE TRIGGER immutable BEFORE UPDATE OR DELETE ON private.document_commands FOR EACH ROW EXECUTE FUNCTION private.documents_immutable21();
ALTER TABLE public.documents ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.document_participants ENABLE ROW LEVEL SECURITY;
ALTER TABLE private.document_revisions ENABLE ROW LEVEL SECURITY;
ALTER TABLE private.document_preparations ENABLE ROW LEVEL SECURITY;
ALTER TABLE private.document_commands ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.documents,public.document_participants,private.document_revisions,private.document_preparations,private.document_commands FROM PUBLIC,anon,authenticated,service_role;
-- Shared source predicate for both the gate and paginated discovery.
CREATE FUNCTION private.documents_customer_visible21(c public.customers,actor uuid,caps text[],historical boolean) RETURNS boolean LANGUAGE sql STABLE SECURITY INVOKER SET search_path='' AS $$
 SELECT c.id IS NOT NULL AND c.blocked_at IS NULL AND(private.customer_in_scope(c,actor) OR(historical AND c.merged_into_id IS NOT NULL AND caps @> ARRAY['customers.read_all']));
$$;
-- Office lock precedes request/document/customer locks, including replay.
CREATE FUNCTION private.documents_access21(p_office uuid,p_request uuid DEFAULT NULL,p_action text DEFAULT NULL,p_document uuid DEFAULT NULL) RETURNS public.memberships LANGUAGE plpgsql SECURITY INVOKER SET search_path='' AS $$
DECLARE m public.memberships; actor uuid;caps text[];r public.requests;c public.customers;cid uuid;
BEGIN
 actor:=private.team_require_identity();
 IF p_action IS NULL THEN PERFORM 1 FROM public.offices WHERE id=p_office FOR SHARE;ELSE PERFORM 1 FROM public.offices WHERE id=p_office FOR NO KEY UPDATE;END IF;
 actor:=private.team_require_identity();SELECT * INTO m FROM public.memberships WHERE office_id=p_office AND user_id=actor AND active AND role_code<>'client' FOR SHARE;
 actor:=private.team_require_identity();caps:=private.current_permissions(p_office);
 IF m.id IS NULL OR NOT private.team_user_active(actor,p_office) OR NOT caps @> ARRAY['foundation.access','documents.read','requests.read','customers.read'] OR(p_action IS NOT NULL AND NOT caps @> ARRAY[p_action]) THEN RAISE EXCEPTION 'DOCUMENTS_FORBIDDEN' USING ERRCODE='PT403';END IF;
 IF p_request IS NOT NULL THEN
 SELECT * INTO r FROM public.requests WHERE office_id=p_office AND id=p_request FOR SHARE;
 IF r.id IS NULL THEN RAISE EXCEPTION 'DOCUMENT_NOT_FOUND' USING ERRCODE='PT404';END IF;
 IF NOT private.request_in_scope(r,m) OR(p_action IS NOT NULL AND (r.status IN('concluido','cancelado') OR private.request_can_work(r,m) IS NOT TRUE)) THEN RAISE EXCEPTION 'DOCUMENTS_FORBIDDEN' USING ERRCODE='PT403';END IF;
 FOR cid IN SELECT DISTINCT x FROM (SELECT r.customer_id x UNION ALL SELECT customer_id FROM public.document_participants WHERE office_id=p_office AND document_id=p_document UNION ALL SELECT (source#>>'{customer,customer_id}')::uuid FROM private.document_revisions WHERE office_id=p_office AND document_id=p_document)z WHERE x IS NOT NULL ORDER BY x LOOP
 SELECT * INTO c FROM public.customers WHERE office_id=p_office AND id=cid FOR SHARE;
 IF private.documents_customer_visible21(c,actor,caps,p_document IS NOT NULL) IS NOT TRUE THEN RAISE EXCEPTION 'DOCUMENTS_FORBIDDEN' USING ERRCODE='PT403';END IF;
 END LOOP;
 actor:=private.team_require_identity();caps:=private.current_permissions(p_office);
 IF NOT caps @> ARRAY['foundation.access','documents.read','requests.read','customers.read'] OR(p_action IS NOT NULL AND NOT caps @> ARRAY[p_action]) OR NOT private.request_in_scope(r,m) OR(p_action IS NOT NULL AND private.request_can_work(r,m) IS NOT TRUE) THEN RAISE EXCEPTION 'DOCUMENTS_FORBIDDEN' USING ERRCODE='PT403';END IF;
 END IF;RETURN m;
END$$;
-- Rendering is deterministic and uses only immutable local snapshots.
CREATE FUNCTION private.documents_trim21(v text) RETURNS text LANGUAGE sql IMMUTABLE SECURITY INVOKER SET search_path='' AS $$ SELECT btrim(v,U&'\0009\000a\000b\000c\000d\0020\00a0\1680\2000\2001\2002\2003\2004\2005\2006\2007\2008\2009\200a\2028\2029\202f\205f\3000\feff');$$;
CREATE FUNCTION private.documents_small21(n integer) RETURNS text LANGUAGE plpgsql IMMUTABLE SECURITY INVOKER SET search_path='' AS $$
DECLARE u text[]:=ARRAY['','um','dois','três','quatro','cinco','seis','sete','oito','nove','dez','onze','doze','treze','catorze','quinze','dezesseis','dezessete','dezoito','dezenove'];t text[]:=ARRAY['','','vinte','trinta','quarenta','cinquenta','sessenta','setenta','oitenta','noventa'];h text[]:=ARRAY['','cento','duzentos','trezentos','quatrocentos','quinhentos','seiscentos','setecentos','oitocentos','novecentos'];
BEGIN IF n<20 THEN RETURN u[n+1];ELSIF n<100 THEN RETURN t[n/10+1]||CASE WHEN n%10>0 THEN ' e '||u[n%10+1] ELSE '' END;ELSIF n=100 THEN RETURN 'cem';ELSE RETURN h[n/100+1]||CASE WHEN n%100>0 THEN ' e '||private.documents_small21(n%100) ELSE '' END;END IF;END$$;
CREATE FUNCTION private.documents_words21(cents bigint) RETURNS text LANGUAGE plpgsql IMMUTABLE SECURITY INVOKER SET search_path='' AS $$
DECLARE n bigint:=cents/100;f integer:=(cents%100)::integer;g integer;idx integer;out text:='';part text;
BEGIN IF cents IS NULL OR cents<0 OR cents>99999999999 THEN RAISE EXCEPTION 'DOCUMENTS_VALIDATION' USING ERRCODE='PT422';END IF;
 FOR idx IN REVERSE 2..0 LOOP g:=CASE idx WHEN 2 THEN n/1000000 WHEN 1 THEN n/1000%1000 ELSE n%1000 END;IF g=0 THEN CONTINUE;END IF;
 part:=CASE idx WHEN 2 THEN private.documents_small21(g)||CASE WHEN g=1 THEN ' milhão' ELSE ' milhões' END WHEN 1 THEN CASE WHEN g=1 THEN 'mil' ELSE private.documents_small21(g)||' mil' END ELSE private.documents_small21(g) END;
 out:=out||CASE WHEN out='' THEN '' WHEN g<100 OR g%100=0 THEN ' e ' ELSE ' ' END||part;END LOOP;
 IF n>0 THEN out:=out||CASE WHEN n%1000000=0 THEN ' de reais' WHEN n=1 THEN ' real' ELSE ' reais' END;END IF;
 IF f>0 THEN out:=out||CASE WHEN out='' THEN '' ELSE ' e ' END||private.documents_small21(f)||CASE WHEN f=1 THEN ' centavo' ELSE ' centavos' END;END IF;RETURN CASE WHEN out='' THEN 'zero reais' ELSE out END;END$$;
CREATE FUNCTION private.documents_issue21(k text,c text,m text) RETURNS jsonb LANGUAGE sql IMMUTABLE SECURITY INVOKER SET search_path='' AS $$SELECT jsonb_build_array(jsonb_build_object('key',k,'code',c,'message',m));$$;
CREATE FUNCTION private.documents_input21(i jsonb,d jsonb) RETURNS void LANGUAGE plpgsql IMMUTABLE SECURITY INVOKER SET search_path='' AS $$
BEGIN
 IF jsonb_typeof(i) IS DISTINCT FROM 'object' OR NOT i ?& ARRAY['content','overrides','money_in_words'] OR (i-'content'-'overrides'-'money_in_words')<>'{}' OR jsonb_typeof(i->'content') IS DISTINCT FROM 'string' OR char_length(i->>'content')>30000 OR translate(i->>'content',E'\t\r\n','')~'[[:cntrl:]]' OR jsonb_typeof(i->'money_in_words') IS DISTINCT FROM 'boolean' OR jsonb_typeof(i->'overrides') IS DISTINCT FROM 'object' THEN RAISE EXCEPTION 'DOCUMENTS_VALIDATION' USING ERRCODE='PT422';END IF;
 IF (SELECT count(*) FROM jsonb_object_keys(i->'overrides'))>14 OR EXISTS(SELECT FROM jsonb_each(i->'overrides')e WHERE jsonb_typeof(e.value)<>'string' OR char_length(e.value#>>'{}')>500 OR translate(e.value#>>'{}',E'\t\r\n','')~'[[:cntrl:]]' OR NOT EXISTS(SELECT FROM jsonb_array_elements(d->'variables')v WHERE v->>'key'=e.key)) THEN RAISE EXCEPTION 'DOCUMENTS_VALIDATION' USING ERRCODE='PT422';END IF;
END$$;
CREATE FUNCTION private.documents_resolve21(d jsonb,i jsonb,s jsonb,p jsonb) RETURNS jsonb LANGUAGE plpgsql IMMUTABLE SECURITY INVOKER SET search_path='' AS $$
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
 ELSIF k LIKE '%.cpf' THEN BEGIN raw:=private.customers_normalize_identifier('person',raw);f:=substr(raw,1,3)||'.'||substr(raw,4,3)||'.'||substr(raw,7,3)||'-'||substr(raw,10,2);EXCEPTION WHEN OTHERS THEN valid:=false;END;
 ELSE valid:=char_length(raw)<=CASE WHEN k LIKE '%.nome' THEN 120 ELSE 500 END;END IF;
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
CREATE FUNCTION private.documents_person21(c public.customers,include_cpf boolean) RETURNS jsonb LANGUAGE sql IMMUTABLE SECURITY INVOKER SET search_path='' AS $$ SELECT jsonb_build_object('customer_id',c.id,'version',c.version,'kind',c.kind,'name',c.name,'identifier',CASE WHEN include_cpf AND c.kind='person' THEN c.identifier END);$$;
CREATE FUNCTION private.documents_parties21(o uuid,p jsonb,d jsonb) RETURNS jsonb LANGUAGE plpgsql SECURITY INVOKER SET search_path='' AS $$
DECLARE x jsonb;c public.customers;result jsonb:='[]';prefix text;actor uuid:=private.team_require_identity();
BEGIN
 IF jsonb_typeof(p) IS DISTINCT FROM 'array' THEN RAISE EXCEPTION 'DOCUMENTS_VALIDATION' USING ERRCODE='PT422';END IF;
 IF jsonb_array_length(p)>20 THEN RAISE EXCEPTION 'DOCUMENTS_VALIDATION' USING ERRCODE='PT422';END IF;
 FOR x IN SELECT e FROM jsonb_array_elements(p)e LOOP
 IF jsonb_typeof(x) IS DISTINCT FROM 'object' OR NOT x ?& ARRAY['role','label','customer_id'] OR x-'role'-'label'-'customer_id'<>'{}' OR jsonb_typeof(x->'role') IS DISTINCT FROM 'string' OR x->>'role' NOT IN('buyer','seller','representative','guardian','other') OR jsonb_typeof(x->'label') IS DISTINCT FROM 'string' OR char_length(x->>'label') NOT BETWEEN 1 AND 80 OR NOT private.templates_has_text20(x->>'label') OR x->>'label'~'[[:cntrl:]]' OR jsonb_typeof(x->'customer_id') IS DISTINCT FROM 'string' OR x->>'customer_id'!~*'^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$' THEN RAISE EXCEPTION 'DOCUMENTS_VALIDATION' USING ERRCODE='PT422';END IF;
 END LOOP;
 IF EXISTS(SELECT FROM jsonb_array_elements(p)e GROUP BY e->>'role',(e->>'customer_id')::uuid HAVING count(*)>1) OR EXISTS(SELECT FROM jsonb_array_elements(p)e WHERE e->>'role' IN('buyer','seller') GROUP BY e->>'role' HAVING count(*)>1) OR EXISTS(SELECT FROM jsonb_array_elements(p)a JOIN jsonb_array_elements(p)b ON (a->>'customer_id')::uuid=(b->>'customer_id')::uuid WHERE a->>'role'='buyer' AND b->>'role'='seller') THEN RAISE EXCEPTION 'DOCUMENTS_VALIDATION' USING ERRCODE='PT422';END IF;
 -- Lock clients in fixed order before capturing any snapshot.
 PERFORM c1.id FROM public.customers c1 WHERE c1.office_id=o AND c1.id IN(SELECT(e->>'customer_id')::uuid FROM jsonb_array_elements(p)e) ORDER BY c1.id FOR SHARE;
 FOR x IN SELECT e FROM jsonb_array_elements(p)e LOOP
 SELECT * INTO c FROM public.customers WHERE office_id=o AND id=(x->>'customer_id')::uuid;
 IF c.id IS NULL OR private.customer_in_scope(c,actor) IS NOT TRUE THEN RAISE EXCEPTION 'DOCUMENTS_FORBIDDEN' USING ERRCODE='PT403';END IF;
 prefix:=CASE x->>'role' WHEN 'buyer' THEN 'participante.comprador.cpf' WHEN 'seller' THEN 'participante.vendedor.cpf' ELSE '' END;
 result:=result||jsonb_build_array(private.documents_person21(c,EXISTS(SELECT FROM jsonb_array_elements(d->'variables')v WHERE v->>'key'=prefix))||jsonb_build_object('role',x->>'role','label',x->>'label'));
 END LOOP;PERFORM private.team_require_identity();RETURN result;END$$;
CREATE FUNCTION private.document_detail(p_office_id uuid,p_document_id uuid,p_revision integer,p_history_page integer) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE d public.documents;r private.document_revisions;t public.template_versions;m public.memberships;q public.requests;participants jsonb;res jsonb;hist jsonb;canedit boolean;prepared timestamptz;
BEGIN
 PERFORM private.documents_access21(p_office_id);
 IF p_history_page IS NULL OR p_history_page NOT BETWEEN 1 AND 1000000 OR(p_revision IS NOT NULL AND p_revision<1) THEN RAISE EXCEPTION 'DOCUMENTS_VALIDATION' USING ERRCODE='PT422';END IF;
 SELECT * INTO d FROM public.documents WHERE office_id=p_office_id AND id=p_document_id;
 IF d.id IS NULL THEN RAISE EXCEPTION 'DOCUMENT_NOT_FOUND' USING ERRCODE='PT404';END IF;
 m:=private.documents_access21(p_office_id,d.request_id,NULL,d.id);
 SELECT * INTO r FROM private.document_revisions WHERE office_id=p_office_id AND document_id=d.id AND revision=coalesce(p_revision,d.revision);
 IF r.document_id IS NULL THEN RAISE EXCEPTION 'DOCUMENT_NOT_FOUND' USING ERRCODE='PT404';END IF;
 SELECT * INTO t FROM public.template_versions WHERE id=d.template_version_id;SELECT * INTO q FROM public.requests WHERE id=d.request_id;
 SELECT coalesce(jsonb_agg(snapshot ORDER BY position),'[]') INTO participants FROM public.document_participants WHERE office_id=p_office_id AND document_id=d.id AND revision=r.revision;
 res:=private.documents_resolve21(t.definition,r.input,r.source,participants);
 SELECT created_at INTO prepared FROM private.document_preparations WHERE office_id=p_office_id AND document_id=d.id AND revision=r.revision;
 canedit:=r.revision=d.revision AND q.status NOT IN('concluido','cancelado') AND private.request_can_work(q,m) AND private.current_permissions(p_office_id) @> ARRAY['documents.update'];
 SELECT coalesce(jsonb_agg(x.value ORDER BY x.revision DESC),'[]') INTO hist FROM(SELECT h.revision,jsonb_build_object('revision',h.revision,'author_name',h.author_name,'created_at',h.created_at,'prepared',EXISTS(SELECT FROM private.document_preparations pr WHERE pr.office_id=h.office_id AND pr.document_id=h.document_id AND pr.revision=h.revision)) value FROM private.document_revisions h WHERE h.office_id=p_office_id AND h.document_id=d.id ORDER BY h.revision DESC LIMIT 5 OFFSET(p_history_page-1)*5)x;
 PERFORM private.documents_access21(p_office_id,d.request_id,NULL,d.id);
 RETURN res||jsonb_build_object('id',d.id,'protocol',d.protocol,'request_id',d.request_id,'request_item_id',d.request_item_id,'request_protocol',q.protocol,'title',d.title,'template',jsonb_build_object('id',d.template_id,'version_id',t.id,'number',t.number,'definition',t.definition),'current_revision',d.revision,'revision',r.revision,'status',CASE WHEN prepared IS NULL THEN 'draft' ELSE 'prepared' END,'created_at',d.created_at,'updated_at',d.updated_at,'prepared_at',prepared,'can_edit',canedit,'can_prepare',canedit AND prepared IS NULL AND res->'issues'='[]','author_name',r.author_name,'revision_created_at',r.created_at,'input',r.input,'source',r.source,'participants',participants,'history',hist,'history_page',p_history_page,'history_total',d.revision);
END$$;
CREATE FUNCTION private.documents_insert_parties21(o uuid,doc uuid,rev integer,p jsonb) RETURNS void LANGUAGE sql SECURITY INVOKER SET search_path='' AS $$
 INSERT INTO public.document_participants(office_id,document_id,revision,position,customer_id,role,label,snapshot) SELECT o,doc,rev,n::integer,(x->>'customer_id')::uuid,x->>'role',x->>'label',x FROM jsonb_array_elements(p) WITH ORDINALITY z(x,n);
$$;
CREATE FUNCTION private.document_create(p_office_id uuid,p_request_id uuid,p_request_item_id uuid,p_template_version_id uuid,p_participants jsonb,p_idempotency_key uuid) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE m public.memberships;r public.requests;it public.request_items;t public.template_versions;c public.customers;d public.documents;cmd private.document_commands;hash text;src jsonb;parts jsonb;i jsonb;actorname text;at_time timestamptz;
BEGIN
 m:=private.documents_access21(p_office_id,NULL,'documents.create');
 IF p_request_id IS NULL OR p_request_item_id IS NULL OR p_template_version_id IS NULL OR p_idempotency_key IS NULL THEN RAISE EXCEPTION 'DOCUMENTS_VALIDATION' USING ERRCODE='PT422';END IF;
 hash:=encode(extensions.digest(jsonb_build_object('kind','create','request',p_request_id,'item',p_request_item_id,'template',p_template_version_id,'participants',p_participants)::text,'sha256'),'hex');
 SELECT * INTO cmd FROM private.document_commands WHERE office_id=p_office_id AND actor_id=m.user_id AND idempotency_key=p_idempotency_key;
 IF cmd.document_id IS NOT NULL THEN
 IF cmd.digest<>hash THEN RAISE EXCEPTION 'DOCUMENT_CONFLICT' USING ERRCODE='PT409';END IF;
 PERFORM private.documents_access21(p_office_id,p_request_id,'documents.create',cmd.document_id);RETURN private.document_detail(p_office_id,cmd.document_id,NULL,1);END IF;
 IF NOT private.current_permissions(p_office_id) @> ARRAY['templates.read'] THEN RAISE EXCEPTION 'DOCUMENTS_FORBIDDEN' USING ERRCODE='PT403';END IF;
 m:=private.documents_access21(p_office_id,p_request_id,'documents.create');
 SELECT * INTO r FROM public.requests WHERE office_id=p_office_id AND id=p_request_id FOR UPDATE;
 SELECT * INTO it FROM public.request_items WHERE office_id=p_office_id AND request_id=r.id AND id=p_request_item_id FOR SHARE;
 IF it.id IS NULL THEN RAISE EXCEPTION 'DOCUMENT_NOT_FOUND' USING ERRCODE='PT404';END IF;
 SELECT * INTO t FROM public.template_versions WHERE office_id=p_office_id AND id=p_template_version_id FOR SHARE;
 at_time:=clock_timestamp();
 IF t.id IS NULL OR NOT EXISTS(SELECT FROM private.template_approvals a WHERE a.office_id=p_office_id AND a.version_id=t.id AND a.approved_at<=at_time) OR(t.definition->>'effective_from')::timestamptz>at_time OR(t.definition->>'effective_until')::timestamptz<=at_time THEN RAISE EXCEPTION 'DOCUMENTS_VALIDATION' USING ERRCODE='PT422';END IF;
 parts:=private.documents_parties21(p_office_id,p_participants,t.definition);
 IF r.customer_id IS NOT NULL THEN SELECT * INTO c FROM public.customers WHERE office_id=p_office_id AND id=r.customer_id FOR SHARE;IF private.customer_in_scope(c,m.user_id) IS NOT TRUE THEN RAISE EXCEPTION 'DOCUMENTS_FORBIDDEN' USING ERRCODE='PT403';END IF;END IF;
 src:=jsonb_build_object('customer',CASE WHEN c.id IS NOT NULL THEN private.documents_person21(c,EXISTS(SELECT FROM jsonb_array_elements(t.definition->'variables')v WHERE v->>'key'='cliente.cpf')) END,'service',jsonb_build_object('id',it.service_id,'version_id',it.version_id,'description',it.snapshot#>>'{definition,name}','quantity',it.snapshot->'quantity','total_cents',it.snapshot->'total_cents'),'emitted_on',(clock_timestamp() AT TIME ZONE 'UTC')::date);
 m:=private.documents_access21(p_office_id,p_request_id,'documents.create');
 IF NOT private.current_permissions(p_office_id) @> ARRAY['templates.read'] THEN RAISE EXCEPTION 'DOCUMENTS_FORBIDDEN' USING ERRCODE='PT403';END IF;
 -- Recheck every newly selected customer after all waits, before persisting.
 parts:=private.documents_parties21(p_office_id,p_participants,t.definition);
 at_time:=clock_timestamp();IF(t.definition->>'effective_from')::timestamptz>at_time OR(t.definition->>'effective_until')::timestamptz<=at_time THEN RAISE EXCEPTION 'DOCUMENTS_VALIDATION' USING ERRCODE='PT422';END IF;
 i:=jsonb_build_object('content',t.definition->>'content','overrides','{}'::jsonb,'money_in_words',true);PERFORM private.documents_resolve21(t.definition,i,src,parts);
 SELECT coalesce(private.customer_relation_display_label(display_name),'Integrante da equipe') INTO actorname FROM public.profiles WHERE id=m.user_id;
 INSERT INTO public.documents(office_id,request_id,request_item_id,template_id,template_version_id,protocol,title,revision,status,created_by) VALUES(p_office_id,r.id,it.id,t.template_id,t.id,'DOC-'||gen_random_uuid()::text,t.definition->>'name',1,'draft',m.user_id) RETURNING * INTO d;
 INSERT INTO private.document_revisions(office_id,document_id,revision,input,source,author_id,author_name) VALUES(p_office_id,d.id,1,i,src,m.user_id,coalesce(actorname,'Equipe'));
 PERFORM private.documents_insert_parties21(p_office_id,d.id,1,parts);
 INSERT INTO private.document_commands(office_id,actor_id,idempotency_key,digest,document_id) VALUES(p_office_id,m.user_id,p_idempotency_key,hash,d.id);
 PERFORM private.emit_business_event(p_office_id,'documents.created','document',d.id,p_idempotency_key,'{}');RETURN private.document_detail(p_office_id,d.id,NULL,1);
END$$;
CREATE FUNCTION private.document_operate(p_office_id uuid,p_document_id uuid,p_operation jsonb) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE m public.memberships;d public.documents;r private.document_revisions;t public.template_versions;cmd private.document_commands;hash text;key uuid;kind text;i jsonb;parts jsonb;oldparts jsonb;resolved jsonb;actorname text;rolekey text;prefix text;expected integer;
BEGIN
 m:=private.documents_access21(p_office_id,NULL,'documents.update');
 IF jsonb_typeof(p_operation) IS DISTINCT FROM 'object' OR NOT p_operation ?& ARRAY['kind','expected_revision','idempotency_key'] OR jsonb_typeof(p_operation->'kind') IS DISTINCT FROM 'string' OR p_operation->>'kind' NOT IN('save','participants','prepare') OR jsonb_typeof(p_operation->'expected_revision') IS DISTINCT FROM 'number' OR p_operation->>'expected_revision'!~'^[1-9][0-9]{0,9}$' OR (p_operation->>'expected_revision')::numeric>2147483646 OR jsonb_typeof(p_operation->'idempotency_key') IS DISTINCT FROM 'string' OR p_operation->>'idempotency_key'!~*'^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$' THEN RAISE EXCEPTION 'DOCUMENTS_VALIDATION' USING ERRCODE='PT422';END IF;
 kind:=p_operation->>'kind';key:=(p_operation->>'idempotency_key')::uuid;expected:=(p_operation->>'expected_revision')::integer;
 IF(kind='save' AND(NOT p_operation ? 'input' OR p_operation-'kind'-'expected_revision'-'idempotency_key'-'input'<>'{}')) OR(kind='participants' AND(NOT p_operation ? 'participants' OR p_operation-'kind'-'expected_revision'-'idempotency_key'-'participants'<>'{}')) OR(kind='prepare' AND p_operation-'kind'-'expected_revision'-'idempotency_key'<>'{}') THEN RAISE EXCEPTION 'DOCUMENTS_VALIDATION' USING ERRCODE='PT422';END IF;
 SELECT * INTO d FROM public.documents WHERE office_id=p_office_id AND id=p_document_id;
 IF d.id IS NULL THEN RAISE EXCEPTION 'DOCUMENT_NOT_FOUND' USING ERRCODE='PT404';END IF;
 m:=private.documents_access21(p_office_id,d.request_id,'documents.update',d.id);
 PERFORM 1 FROM public.requests WHERE office_id=p_office_id AND id=d.request_id FOR UPDATE;
 SELECT * INTO d FROM public.documents WHERE office_id=p_office_id AND id=p_document_id FOR UPDATE;
 m:=private.documents_access21(p_office_id,d.request_id,'documents.update',d.id);
 hash:=encode(extensions.digest(jsonb_build_object('document',d.id,'operation',p_operation-'idempotency_key')::text,'sha256'),'hex');
 SELECT * INTO cmd FROM private.document_commands WHERE office_id=p_office_id AND actor_id=m.user_id AND idempotency_key=key;
 IF cmd.document_id IS NOT NULL THEN IF cmd.digest<>hash THEN RAISE EXCEPTION 'DOCUMENT_CONFLICT' USING ERRCODE='PT409';END IF;RETURN private.document_detail(p_office_id,d.id,NULL,1);END IF;
 IF expected<>d.revision THEN RAISE EXCEPTION 'DOCUMENT_CONFLICT' USING ERRCODE='PT409';END IF;
 SELECT * INTO r FROM private.document_revisions WHERE office_id=p_office_id AND document_id=d.id AND revision=d.revision;SELECT * INTO t FROM public.template_versions WHERE id=d.template_version_id;
 SELECT coalesce(jsonb_agg(snapshot ORDER BY position),'[]') INTO oldparts FROM public.document_participants WHERE office_id=p_office_id AND document_id=d.id AND revision=d.revision;
 i:=r.input;parts:=oldparts;
 IF kind='save' THEN i:=p_operation->'input';PERFORM private.documents_input21(i,t.definition);
 ELSIF kind='participants' THEN
 parts:=private.documents_parties21(p_office_id,p_operation->'participants',t.definition);
 -- Preserve unchanged parties' snapshots, including when their central record changed.
 SELECT coalesce(jsonb_agg(coalesce((SELECT old FROM jsonb_array_elements(oldparts)old WHERE old->>'role'=x->>'role' AND old->>'customer_id'=x->>'customer_id')||jsonb_build_object('label',x->>'label'),x) ORDER BY ord),'[]') INTO parts FROM jsonb_array_elements(parts) WITH ORDINALITY z(x,ord);
 FOREACH rolekey IN ARRAY ARRAY['buyer','seller'] LOOP
 IF(SELECT x->>'customer_id' FROM jsonb_array_elements(parts)x WHERE x->>'role'=rolekey) IS DISTINCT FROM(SELECT x->>'customer_id' FROM jsonb_array_elements(oldparts)x WHERE x->>'role'=rolekey) THEN prefix:=CASE WHEN rolekey='buyer' THEN 'participante.comprador.' ELSE 'participante.vendedor.' END;i:=jsonb_set(i,'{overrides}',(i->'overrides')-(prefix||'nome')-(prefix||'cpf'));END IF;
 END LOOP;END IF;
 m:=private.documents_access21(p_office_id,d.request_id,'documents.update',d.id);resolved:=private.documents_resolve21(t.definition,i,r.source,parts);
 IF kind='prepare' THEN
 IF resolved->'issues'<>'[]' THEN RAISE EXCEPTION 'DOCUMENT_INCOMPLETE' USING ERRCODE='PT422';END IF;
 INSERT INTO private.document_preparations(office_id,document_id,revision,actor_id) VALUES(p_office_id,d.id,d.revision,m.user_id) ON CONFLICT DO NOTHING;
 UPDATE public.documents SET status='prepared',prepared_at=(SELECT created_at FROM private.document_preparations WHERE office_id=p_office_id AND document_id=d.id AND revision=d.revision),updated_at=clock_timestamp() WHERE id=d.id;
 ELSIF i IS DISTINCT FROM r.input OR parts IS DISTINCT FROM oldparts THEN
 SELECT coalesce(private.customer_relation_display_label(display_name),'Integrante da equipe') INTO actorname FROM public.profiles WHERE id=m.user_id;
 UPDATE public.documents SET revision=revision+1,status='draft',prepared_at=NULL,updated_at=clock_timestamp() WHERE id=d.id RETURNING * INTO d;
 INSERT INTO private.document_revisions(office_id,document_id,revision,input,source,author_id,author_name) VALUES(p_office_id,d.id,d.revision,i,r.source,m.user_id,coalesce(actorname,'Equipe'));
 PERFORM private.documents_insert_parties21(p_office_id,d.id,d.revision,parts);
 END IF;
 INSERT INTO private.document_commands(office_id,actor_id,idempotency_key,digest,document_id) VALUES(p_office_id,m.user_id,key,hash,d.id);
 PERFORM private.emit_business_event(p_office_id,CASE kind WHEN 'save' THEN 'documents.saved' WHEN 'participants' THEN 'documents.participants_changed' ELSE 'documents.prepared' END,'document',d.id,key,'{}');RETURN private.document_detail(p_office_id,d.id,NULL,1);
END$$;
CREATE FUNCTION private.documents_page(p_office_id uuid,p_query text,p_page integer,p_size integer) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE m public.memberships;items jsonb:='[]';total bigint;caps text[];x jsonb;
BEGIN
 m:=private.documents_access21(p_office_id);caps:=private.current_permissions(p_office_id);
 IF p_query IS NULL OR char_length(p_query)>120 OR p_page IS NULL OR p_page NOT BETWEEN 1 AND 1000000 OR p_size IS NULL OR p_size NOT IN(3,5) THEN RAISE EXCEPTION 'DOCUMENTS_VALIDATION' USING ERRCODE='PT422';END IF;
 -- Evaluate office sources once. The same shared predicate is used by the gate;
 -- only the selected page is materialized as JSON and revalidated by that gate.
 WITH allowed_customers AS MATERIALIZED(SELECT c.id FROM public.customers c WHERE c.office_id=p_office_id AND private.documents_customer_visible21(c,m.user_id,caps,true)),candidates AS MATERIALIZED(
 SELECT d.*,r.protocol request_protocol FROM public.documents d JOIN public.requests r ON r.office_id=d.office_id AND r.id=d.request_id
 WHERE d.office_id=p_office_id AND(btrim(p_query)='' OR strpos(lower(d.title||' '||d.protocol),lower(btrim(p_query)))>0) AND private.request_in_scope(r,m)
 AND(r.customer_id IS NULL OR EXISTS(SELECT FROM allowed_customers c WHERE c.id=r.customer_id))
 AND NOT EXISTS(SELECT FROM public.document_participants p WHERE p.office_id=p_office_id AND p.document_id=d.id AND NOT EXISTS(SELECT FROM allowed_customers c WHERE c.id=p.customer_id))
 AND NOT EXISTS(SELECT FROM private.document_revisions rev WHERE rev.office_id=p_office_id AND rev.document_id=d.id AND rev.source_customer_id IS NOT NULL AND NOT EXISTS(SELECT FROM allowed_customers c WHERE c.id=rev.source_customer_id))
 ),page AS(SELECT * FROM candidates ORDER BY updated_at DESC,id DESC LIMIT p_size OFFSET(p_page-1)*p_size)
 SELECT(SELECT count(*) FROM candidates),coalesce((SELECT jsonb_agg(jsonb_build_object('id',d.id,'protocol',d.protocol,'request_protocol',d.request_protocol,'title',d.title,'status',d.status,'revision',d.revision,'demonstration',t.definition->'demonstration','updated_at',d.updated_at) ORDER BY d.updated_at DESC,d.id DESC) FROM page d JOIN public.template_versions t ON t.id=d.template_version_id),'[]') INTO total,items;
 FOR x IN SELECT e FROM jsonb_array_elements(items)e LOOP PERFORM private.documents_access21(p_office_id,(SELECT request_id FROM public.documents WHERE id=(x->>'id')::uuid),NULL,(x->>'id')::uuid);END LOOP;
 PERFORM private.documents_access21(p_office_id);
 RETURN jsonb_build_object('items',items,'total',total,'page',p_page,'page_size',p_size);
END$$;
CREATE FUNCTION private.document_options(p_office_id uuid,p_kind text,p_request_id uuid,p_query text,p_page integer) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE m public.memberships;r public.requests;items jsonb:='[]';total bigint:=0;at_time timestamptz;action text;
BEGIN
 m:=private.documents_access21(p_office_id);
 action:=CASE WHEN p_kind='customers' AND private.current_permissions(p_office_id) @> ARRAY['documents.update'] THEN 'documents.update' ELSE 'documents.create' END;
 m:=private.documents_access21(p_office_id,NULL,action);
 IF p_kind IS NULL OR p_kind NOT IN('requests','items','templates','customers') OR p_query IS NULL OR char_length(p_query)>120 OR p_page IS NULL OR p_page NOT BETWEEN 1 AND 1000000 THEN RAISE EXCEPTION 'DOCUMENTS_VALIDATION' USING ERRCODE='PT422';END IF;
 IF p_request_id IS NOT NULL THEN m:=private.documents_access21(p_office_id,p_request_id,action);END IF;
 IF p_kind='requests' THEN
 FOR r IN SELECT * FROM public.requests WHERE office_id=p_office_id AND status NOT IN('concluido','cancelado') AND private.request_can_work(requests,m) AND(btrim(p_query)='' OR strpos(lower(protocol||' '||title),lower(btrim(p_query)))>0) ORDER BY updated_at DESC,id DESC LOOP
 BEGIN PERFORM private.documents_access21(p_office_id,r.id,'documents.create');EXCEPTION WHEN SQLSTATE 'PT403' THEN CONTINUE;END;
 total:=total+1;IF total>(p_page-1)*5 AND total<=p_page*5 THEN items:=items||jsonb_build_array(jsonb_build_object('id',r.id,'label',r.protocol||' — '||r.title));END IF;END LOOP;
 ELSIF p_kind='items' THEN
 IF p_request_id IS NULL THEN RAISE EXCEPTION 'DOCUMENTS_VALIDATION' USING ERRCODE='PT422';END IF;
 WITH candidates AS MATERIALIZED(SELECT id,snapshot#>>'{definition,name}' label,created_at FROM public.request_items WHERE office_id=p_office_id AND request_id=p_request_id AND(btrim(p_query)='' OR strpos(lower(snapshot#>>'{definition,name}'),lower(btrim(p_query)))>0)),page AS(SELECT * FROM candidates ORDER BY created_at,id LIMIT 5 OFFSET(p_page-1)*5)
 SELECT(SELECT count(*) FROM candidates),coalesce((SELECT jsonb_agg(jsonb_build_object('id',id,'label',label) ORDER BY created_at,id) FROM page),'[]') INTO total,items;
 ELSIF p_kind='customers' THEN
 WITH candidates AS MATERIALIZED(SELECT id,name FROM public.customers WHERE office_id=p_office_id AND private.customer_in_scope(customers,m.user_id) AND(btrim(p_query)='' OR strpos(lower(name),lower(btrim(p_query)))>0)),page AS(SELECT * FROM candidates ORDER BY name,id LIMIT 5 OFFSET(p_page-1)*5)
 SELECT(SELECT count(*) FROM candidates),coalesce((SELECT jsonb_agg(jsonb_build_object('id',id,'label',name) ORDER BY name,id) FROM page),'[]') INTO total,items;
 ELSE
 IF NOT private.current_permissions(p_office_id) @> ARRAY['templates.read'] THEN RAISE EXCEPTION 'DOCUMENTS_FORBIDDEN' USING ERRCODE='PT403';END IF;at_time:=clock_timestamp();
 WITH candidates AS MATERIALIZED(SELECT v.id,v.number,v.definition->>'name' name,v.definition->'demonstration' demonstration FROM public.template_versions v JOIN private.template_approvals a ON a.office_id=v.office_id AND a.version_id=v.id WHERE v.office_id=p_office_id AND a.approved_at<=at_time AND((v.definition->>'effective_from') IS NULL OR(v.definition->>'effective_from')::timestamptz<=at_time) AND((v.definition->>'effective_until') IS NULL OR(v.definition->>'effective_until')::timestamptz>at_time) AND(btrim(p_query)='' OR strpos(lower((v.definition->>'name')||' '||(v.definition->>'code')),lower(btrim(p_query)))>0)),page AS(SELECT * FROM candidates ORDER BY name,number DESC,id LIMIT 5 OFFSET(p_page-1)*5)
 SELECT(SELECT count(*) FROM candidates),coalesce((SELECT jsonb_agg(jsonb_build_object('id',id,'label',name||' · v'||number,'demonstration',demonstration) ORDER BY name,number DESC,id) FROM page),'[]') INTO total,items;
 END IF;
 PERFORM private.documents_access21(p_office_id,p_request_id,action);
 RETURN jsonb_build_object('kind',p_kind,'items',items,'total',total,'page',p_page,'page_size',5);
END$$;
CREATE FUNCTION public.documents_page(p_office_id uuid,p_query text,p_page integer,p_size integer) RETURNS jsonb LANGUAGE sql SECURITY INVOKER SET search_path='' AS $$SELECT private.documents_page(p_office_id,p_query,p_page,p_size);$$;
CREATE FUNCTION public.document_options(p_office_id uuid,p_kind text,p_request_id uuid,p_query text,p_page integer) RETURNS jsonb LANGUAGE sql SECURITY INVOKER SET search_path='' AS $$SELECT private.document_options(p_office_id,p_kind,p_request_id,p_query,p_page);$$;
CREATE FUNCTION public.document_create(p_office_id uuid,p_request_id uuid,p_request_item_id uuid,p_template_version_id uuid,p_participants jsonb,p_idempotency_key uuid) RETURNS jsonb LANGUAGE sql SECURITY INVOKER SET search_path='' AS $$SELECT private.document_create(p_office_id,p_request_id,p_request_item_id,p_template_version_id,p_participants,p_idempotency_key);$$;
CREATE FUNCTION public.document_detail(p_office_id uuid,p_document_id uuid,p_revision integer,p_history_page integer) RETURNS jsonb LANGUAGE sql SECURITY INVOKER SET search_path='' AS $$SELECT private.document_detail(p_office_id,p_document_id,p_revision,p_history_page);$$;
CREATE FUNCTION public.document_operate(p_office_id uuid,p_document_id uuid,p_operation jsonb) RETURNS jsonb LANGUAGE sql SECURITY INVOKER SET search_path='' AS $$SELECT private.document_operate(p_office_id,p_document_id,p_operation);$$;
DO $$DECLARE r record;BEGIN FOR r IN SELECT oid::regprocedure signature,proname FROM pg_proc WHERE pronamespace IN('public'::regnamespace,'private'::regnamespace) AND(proname LIKE 'documents_%' OR proname LIKE 'document_%') LOOP EXECUTE format('REVOKE ALL ON FUNCTION %s FROM PUBLIC,anon,authenticated,service_role',r.signature);IF r.proname IN('documents_page','document_options','document_create','document_detail','document_operate') THEN EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO authenticated',r.signature);END IF;END LOOP;END$$;
ALTER TABLE private.audit_reports DROP CONSTRAINT audit_reports_renderer_version_check;
ALTER TABLE private.audit_reports ADD CONSTRAINT audit_reports_renderer_version_check CHECK(renderer_version IN(1,2,3,4,5,6,7,8));
ALTER TABLE private.audit_reports ALTER COLUMN renderer_version SET DEFAULT 8;
