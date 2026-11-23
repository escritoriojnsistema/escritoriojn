DO $legacy$
DECLARE name text; signature regprocedure;
BEGIN
  FOREACH signature IN ARRAY ARRAY[
    'private.category_intake_validate(jsonb,jsonb)'::regprocedure,
    'private.category_intake_answers(jsonb,jsonb,boolean)'::regprocedure
  ] LOOP
    SELECT proname INTO name FROM pg_proc WHERE oid=signature;
    EXECUTE replace(pg_get_functiondef(signature),'private.'||name||'(', 'private.'||name||'_base(');
  END LOOP;
END $legacy$;

CREATE FUNCTION private.category_response_is_credential(value text) RETURNS boolean
LANGUAGE sql IMMUTABLE SECURITY INVOKER SET search_path='' AS $$
  SELECT coalesce(value,'') ~* '(^|[^[:alnum:]])(senha|password|passcode|otp|c[oó]digo de (verifica[cç][aã]o|autentica[cç][aã]o)|token de acesso)([^[:alnum:]]|$)';
$$;

CREATE FUNCTION private.category_response_matches(mask text,answer text) RETURNS boolean
LANGUAGE sql IMMUTABLE SECURITY INVOKER SET search_path='' AS $$
  SELECT char_length(mask)=char_length(answer) AND NOT EXISTS (
    SELECT FROM generate_series(1,char_length(mask)) AS index
    CROSS JOIN LATERAL (SELECT substr(mask,index,1) AS token,substr(answer,index,1) AS character) AS item
    WHERE NOT CASE item.token
      WHEN '0' THEN item.character ~ '^[0-9]$'
      WHEN 'A' THEN item.character ~ '^[A-Za-z]$'
      WHEN '*' THEN item.character ~ '^[A-Za-z0-9]$'
      ELSE item.token=item.character END
  );
$$;

-- The alphanumeric CNPJ is valid in intake answers. Customer identifiers use their own registry contract.
CREATE FUNCTION private.category_response_cnpj_alphanumeric(answer text) RETURNS boolean
LANGUAGE plpgsql IMMUTABLE SECURITY INVOKER SET search_path='' AS $$
DECLARE code text; length integer; position integer; sum integer; remainder integer;
BEGIN
  IF answer !~ '^([A-Z0-9]{12}[0-9]{2}|[A-Z0-9]{2}\.[A-Z0-9]{3}\.[A-Z0-9]{3}/[A-Z0-9]{4}-[0-9]{2})$' THEN RETURN false; END IF;
  code:=translate(answer,'./-','');
  FOREACH length IN ARRAY ARRAY[12,13] LOOP
    sum:=0;
    FOR position IN 1..length LOOP
      sum:=sum+(ascii(substr(code,position,1))-48)*((length-position)%8+2);
    END LOOP;
    remainder:=sum%11;
    IF substr(code,length+1,1)::integer<>(CASE WHEN remainder<2 THEN 0 ELSE 11-remainder END) THEN RETURN false; END IF;
  END LOOP;
  RETURN true;
END $$;

CREATE OR REPLACE FUNCTION private.category_intake_validate(fields jsonb,documents jsonb) RETURNS void
LANGUAGE plpgsql IMMUTABLE SECURITY INVOKER SET search_path='' AS $$
DECLARE field jsonb; model jsonb; checked_fields jsonb:='[]';
BEGIN
  IF jsonb_typeof(fields) IS DISTINCT FROM 'array' OR jsonb_array_length(fields)>24 THEN
    RAISE EXCEPTION 'REQUEST_VALIDATION' USING ERRCODE='PT422';
  END IF;
  FOR field IN SELECT value FROM jsonb_array_elements(fields) LOOP
    IF jsonb_typeof(field) IS DISTINCT FROM 'object' OR private.category_response_is_credential(field->>'label') THEN
      RAISE EXCEPTION 'REQUEST_VALIDATION' USING ERRCODE='PT422';
    END IF;
    IF field ? 'response_name' THEN
      PERFORM private.request_text(field->'response_name',1,80);
      IF private.category_response_is_credential(field->>'response_name') THEN
        RAISE EXCEPTION 'REQUEST_VALIDATION' USING ERRCODE='PT422';
      END IF;
    END IF;
    IF field ? 'model' THEN
      model:=field->'model';
      PERFORM private.request_shape(model,ARRAY['name','mask']);
      PERFORM private.request_text(model->'name',1,80);
      IF field->>'type' NOT IN ('text','phone') OR private.category_response_is_credential(model->>'name')
        OR jsonb_typeof(model->'mask') IS DISTINCT FROM 'string' OR model->>'mask' !~ '^[-0A* .()/]{1,48}$'
        OR model->>'mask' !~ '[0A*]$' OR model->>'mask'<>btrim(model->>'mask')
        OR (field->>'type'='phone' AND (model->>'mask' ~ '[A*]' OR char_length(regexp_replace(model->>'mask','[^0]','','g')) NOT BETWEEN 10 AND 15)) THEN
        RAISE EXCEPTION 'REQUEST_VALIDATION' USING ERRCODE='PT422';
      END IF;
    END IF;
    field:=field-ARRAY['response_name','model'];
    IF field->>'type'='cpf_cnpj' THEN field:=jsonb_set(field,'{type}','"cpf"'); END IF;
    checked_fields:=checked_fields||jsonb_build_array(field);
  END LOOP;
  PERFORM private.category_intake_validate_base(checked_fields,documents);
END $$;

CREATE OR REPLACE FUNCTION private.category_intake_answers(fields jsonb,answers jsonb,complete boolean DEFAULT false) RETURNS jsonb
LANGUAGE plpgsql IMMUTABLE SECURITY INVOKER SET search_path='' AS $$
DECLARE field jsonb; answer text; checked_fields jsonb:='[]';
BEGIN
  FOR field IN SELECT value FROM jsonb_array_elements(fields) LOOP
    answer:=btrim(coalesce(answers->>(field->>'key'),''));
    IF answer<>'' AND (private.category_response_is_credential(field->>'label')
      OR (field ? 'model' AND NOT private.category_response_matches(field#>>'{model,mask}',answer))) THEN
      RAISE EXCEPTION 'REQUEST_VALIDATION' USING ERRCODE='PT422';
    END IF;
    IF field->>'type'='cpf_cnpj' THEN
      field:=jsonb_set(field,'{type}',CASE WHEN answer~'[A-Za-z]' OR char_length(translate(answer,'./-',''))=14 THEN '"cnpj"'::jsonb ELSE '"cpf"'::jsonb END);
    END IF;
    IF field->>'type'='cnpj' AND answer~'[A-Za-z]' THEN
      IF NOT private.category_response_cnpj_alphanumeric(answer) THEN RAISE EXCEPTION 'REQUEST_VALIDATION' USING ERRCODE='PT422'; END IF;
      field:=jsonb_set(field,'{type}','"text"');
    END IF;
    checked_fields:=checked_fields||jsonb_build_array(field);
  END LOOP;
  RETURN private.category_intake_answers_base(checked_fields,answers,complete);
END $$;

REVOKE ALL ON FUNCTION private.category_intake_validate_base(jsonb,jsonb),private.category_intake_answers_base(jsonb,jsonb,boolean),
  private.category_response_is_credential(text),private.category_response_matches(text,text),
  private.category_response_cnpj_alphanumeric(text) FROM PUBLIC,anon,authenticated,service_role;
NOTIFY pgrst,'reload schema';
