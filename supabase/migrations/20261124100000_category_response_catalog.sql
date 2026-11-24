CREATE TABLE private.category_response_options (
  office_id uuid NOT NULL,
  category_id uuid NOT NULL,
  kind text NOT NULL CHECK (kind IN ('type','model')),
  name_key text NOT NULL,
  definition jsonb NOT NULL,
  PRIMARY KEY (office_id,category_id,kind,name_key),
  FOREIGN KEY (office_id,category_id) REFERENCES private.service_categories(office_id,id)
);
ALTER TABLE private.category_response_options ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON private.category_response_options FROM PUBLIC,anon,authenticated,service_role;

-- Keep definitions already saved in fields available after those fields are removed.
WITH existing AS (
  SELECT f.office_id,f.category_id,x.ordinality,t.kind,t.definition
  FROM private.category_intake_forms f
  CROSS JOIN LATERAL jsonb_array_elements(f.fields) WITH ORDINALITY x(field,ordinality)
  CROSS JOIN LATERAL (VALUES
    ('type', CASE WHEN x.field ? 'response_name' THEN jsonb_build_object('name',x.field->'response_name','type',x.field->'type') END),
    ('model',x.field->'model')
  ) t(kind,definition)
  WHERE t.definition IS NOT NULL
)
INSERT INTO private.category_response_options(office_id,category_id,kind,name_key,definition)
SELECT DISTINCT ON (office_id,category_id,kind,lower(btrim(definition->>'name')))
  office_id,category_id,kind,lower(btrim(definition->>'name')),definition
FROM existing ORDER BY office_id,category_id,kind,lower(btrim(definition->>'name')),ordinality;

CREATE FUNCTION private.category_response_options(o uuid,cid uuid) RETURNS jsonb
LANGUAGE sql STABLE SECURITY INVOKER SET search_path='' AS $$
  SELECT jsonb_build_object('types',coalesce(jsonb_agg(definition ORDER BY name_key) FILTER(WHERE kind='type'),'[]'),
    'models',coalesce(jsonb_agg(definition ORDER BY name_key) FILTER(WHERE kind='model'),'[]'))
  FROM private.category_response_options WHERE office_id=o AND category_id=cid;
$$;

DO $projection$
DECLARE source text; updated text;
BEGIN
  source:=pg_get_functiondef('private.category_intake_form(uuid,uuid,boolean)'::regprocedure);
  updated:=replace(source,'''can_manage'',manage AND allowed,''has_services'',has_services);',
    '''can_manage'',manage AND allowed,''has_services'',has_services)
      || CASE WHEN manage THEN jsonb_build_object(''response_options'',private.category_response_options(o,cid)) ELSE ''{}''::jsonb END;');
  IF updated=source THEN RAISE EXCEPTION 'Category form projection contract changed'; END IF;
  EXECUTE updated;
END $projection$;

CREATE FUNCTION private.category_response_option_validate(kind text,d jsonb) RETURNS void
LANGUAGE plpgsql IMMUTABLE SECURITY INVOKER SET search_path='' AS $$
BEGIN
  IF kind NOT IN ('type','model') OR kind IS NULL THEN RAISE EXCEPTION 'REQUEST_VALIDATION' USING ERRCODE='PT422'; END IF;
  PERFORM private.request_shape(d,ARRAY['name',CASE WHEN kind='type' THEN 'type' ELSE 'mask' END]);
  PERFORM private.request_text(d->'name',1,80);
  IF private.category_response_is_credential(d->>'name') OR (CASE WHEN kind='type' THEN
    jsonb_typeof(d->'type') IS DISTINCT FROM 'string' OR d->>'type' NOT IN ('text','textarea','number','date','email','phone','cpf','cnpj','cpf_cnpj','select')
  ELSE jsonb_typeof(d->'mask') IS DISTINCT FROM 'string' OR d->>'mask' !~ '^[-0A* .()/]{1,48}$'
    OR d->>'mask' !~ '[0A*]$' OR d->>'mask'<>btrim(d->>'mask') END) THEN
    RAISE EXCEPTION 'REQUEST_VALIDATION' USING ERRCODE='PT422';
  END IF;
END $$;

CREATE FUNCTION private.category_response_option_save(o uuid,cid uuid,c jsonb,k uuid) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE actor uuid; session_id uuid; prior private.category_intake_commands; kind_code text; name_key_new text;
  previous jsonb; saved jsonb; previous_key text; next_definition jsonb;
BEGIN
  PERFORM 1 FROM public.offices WHERE id=o FOR NO KEY UPDATE;
  PERFORM private.category_intake_form(o,cid,true);
  actor:=auth.uid();session_id:=(auth.jwt()->>'session_id')::uuid;
  PERFORM private.request_shape(c,ARRAY['kind','option','previous']);
  IF k IS NULL THEN RAISE EXCEPTION 'REQUEST_VALIDATION' USING ERRCODE='PT422'; END IF;
  kind_code:=c->>'kind';next_definition:=c->'option';previous:=c->'previous';
  PERFORM private.category_response_option_validate(kind_code,next_definition);
  SELECT * INTO prior FROM private.category_intake_commands WHERE office_id=o AND actor_id=actor AND key=k;
  IF prior.key IS NOT NULL THEN
    IF prior.session_id IS DISTINCT FROM session_id OR prior.category_id IS DISTINCT FROM cid OR prior.request_id IS NOT NULL OR prior.payload IS DISTINCT FROM c THEN
      RAISE EXCEPTION 'REQUEST_IDEMPOTENCY_CONFLICT' USING ERRCODE='PT409';
    END IF;
    RETURN private.category_response_options(o,cid);
  END IF;
  name_key_new:=lower(btrim(next_definition->>'name'));
  IF previous IS DISTINCT FROM 'null'::jsonb THEN
    PERFORM private.category_response_option_validate(kind_code,previous);
    previous_key:=lower(btrim(previous->>'name'));
    SELECT src.definition INTO saved FROM private.category_response_options src
    WHERE src.office_id=o AND src.category_id=cid AND src.kind=kind_code AND src.name_key=previous_key;
    IF saved IS DISTINCT FROM previous THEN RAISE EXCEPTION 'REQUEST_CONFLICT' USING ERRCODE='PT409'; END IF;
    UPDATE private.category_response_options src SET name_key=name_key_new,definition=next_definition
    WHERE src.office_id=o AND src.category_id=cid AND src.kind=kind_code AND src.name_key=previous_key;
  ELSE
    IF (SELECT count(*) FROM private.category_response_options src WHERE src.office_id=o AND src.category_id=cid AND src.kind=kind_code)>=100 THEN
      RAISE EXCEPTION 'REQUEST_VALIDATION' USING ERRCODE='PT422';
    END IF;
    INSERT INTO private.category_response_options VALUES(o,cid,kind_code,name_key_new,next_definition);
  END IF;
  INSERT INTO private.category_intake_commands(office_id,actor_id,session_id,key,category_id,payload) VALUES(o,actor,session_id,k,cid,c);
  PERFORM private.team_audit(o,actor,'portal.category_response_option_saved','category',cid,k,'{}');
  RETURN private.category_response_options(o,cid);
EXCEPTION WHEN unique_violation THEN RAISE EXCEPTION 'REQUEST_CONFLICT' USING ERRCODE='PT409';
END $$;

CREATE FUNCTION public.category_response_option_save(o uuid,cid uuid,c jsonb,k uuid) RETURNS jsonb
LANGUAGE sql SECURITY INVOKER SET search_path='' AS $$SELECT private.category_response_option_save(o,cid,c,k)$$;
REVOKE ALL ON FUNCTION private.category_response_options(uuid,uuid),private.category_response_option_validate(text,jsonb),
  private.category_response_option_save(uuid,uuid,jsonb,uuid),public.category_response_option_save(uuid,uuid,jsonb,uuid)
FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION private.category_response_option_save(uuid,uuid,jsonb,uuid),public.category_response_option_save(uuid,uuid,jsonb,uuid) TO authenticated;
NOTIFY pgrst,'reload schema';
