CREATE TABLE private.privacy_controller_settings(
 office_id uuid PRIMARY KEY REFERENCES public.offices(id),controller jsonb NOT NULL,
 revision integer NOT NULL CHECK(revision>0),updated_at timestamptz NOT NULL DEFAULT clock_timestamp(),updated_by uuid NOT NULL REFERENCES auth.users(id)
);
CREATE INDEX privacy_controller_settings_author_idx ON private.privacy_controller_settings(updated_by);
ALTER TABLE private.privacy_controller_settings ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON private.privacy_controller_settings FROM PUBLIC,anon,authenticated,service_role;
CREATE FUNCTION private.privacy_settings_actor(p_office_id uuid) RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$DECLARE actor uuid;BEGIN
 actor:=private.governance_actor(p_office_id,'settings.access');
 IF NOT EXISTS(SELECT FROM public.memberships WHERE office_id=p_office_id AND user_id=actor AND active AND role_code='owner') THEN RAISE EXCEPTION 'PRIVACY_FORBIDDEN' USING ERRCODE='PT403';END IF;RETURN actor;
END$$;
CREATE FUNCTION private.privacy_settings_state(p_office_id uuid) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$DECLARE result jsonb;BEGIN
 PERFORM private.privacy_settings_actor(p_office_id);
 SELECT jsonb_build_object('configured',true,'revision',revision,'controller',controller) INTO result FROM private.privacy_controller_settings WHERE office_id=p_office_id;
 RETURN coalesce(result,jsonb_build_object('configured',false,'revision',0));
END$$;
CREATE FUNCTION private.privacy_settings_save(p_office_id uuid,p_expected_revision integer,p_controller jsonb) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$DECLARE actor uuid;current_revision integer;key text;value text;BEGIN
 PERFORM 1 FROM public.offices WHERE id=p_office_id FOR NO KEY UPDATE;
 actor:=private.privacy_settings_actor(p_office_id);
 IF p_expected_revision IS NULL OR p_expected_revision<0 OR jsonb_typeof(p_controller) IS DISTINCT FROM 'object' THEN RAISE EXCEPTION 'PRIVACY_VALIDATION' USING ERRCODE='PT422';END IF;
 PERFORM private.request_shape(p_controller,ARRAY['controller_name','cnpj','contact_email','contact_phone','address']);
 IF (SELECT count(*) FROM jsonb_object_keys(p_controller))<>5 THEN RAISE EXCEPTION 'PRIVACY_VALIDATION' USING ERRCODE='PT422';END IF;
 FOR key,value IN SELECT * FROM jsonb_each_text(p_controller) LOOP
 IF jsonb_typeof(p_controller->key)<>'string' OR value IS DISTINCT FROM btrim(value) OR value ~ '[[:cntrl:]]' OR char_length(value)>(CASE key WHEN 'controller_name' THEN 180 WHEN 'contact_email' THEN 254 WHEN 'contact_phone' THEN 40 WHEN 'cnpj' THEN 14 ELSE 500 END) THEN RAISE EXCEPTION 'PRIVACY_VALIDATION' USING ERRCODE='PT422';END IF;
 END LOOP;
 IF char_length(p_controller->>'controller_name')<3 OR(p_controller->>'contact_email'='' AND length(regexp_replace(p_controller->>'contact_phone','[^0-9]','','g'))<8) OR(p_controller->>'contact_email'<>'' AND p_controller->>'contact_email' !~ '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$') THEN RAISE EXCEPTION 'PRIVACY_VALIDATION' USING ERRCODE='PT422';END IF;
 IF p_controller->>'cnpj'<>'' THEN PERFORM private.customers_normalize_identifier('company',p_controller->>'cnpj');END IF;
 SELECT revision INTO current_revision FROM private.privacy_controller_settings WHERE office_id=p_office_id FOR UPDATE;
 IF coalesce(current_revision,0)<>p_expected_revision THEN RAISE EXCEPTION 'PRIVACY_CONFLICT' USING ERRCODE='PT409';END IF;
 PERFORM private.privacy_settings_actor(p_office_id);
 INSERT INTO private.privacy_controller_settings(office_id,controller,revision,updated_by)VALUES(p_office_id,p_controller,p_expected_revision+1,actor)
 ON CONFLICT(office_id)DO UPDATE SET controller=EXCLUDED.controller,revision=EXCLUDED.revision,updated_by=actor,updated_at=clock_timestamp();
 PERFORM private.emit_business_event(p_office_id,'privacy.settings_updated','office',p_office_id,gen_random_uuid(),'{}');
 RETURN private.privacy_settings_state(p_office_id);
END$$;
CREATE FUNCTION private.privacy_controller_public() RETURNS jsonb LANGUAGE sql STABLE SECURITY DEFINER SET search_path='' AS $$
 SELECT coalesce((SELECT jsonb_build_object('configured',true,'revision',s.revision,'controller',s.controller) FROM private.client_registration_settings r JOIN private.privacy_controller_settings s ON s.office_id=r.office_id JOIN public.offices o ON o.id=s.office_id AND o.active WHERE r.singleton LIMIT 1),jsonb_build_object('configured',false,'revision',0));
$$;
CREATE FUNCTION public.privacy_settings_state(p_office_id uuid) RETURNS jsonb LANGUAGE sql SECURITY INVOKER SET search_path='' AS $$SELECT private.privacy_settings_state(p_office_id);$$;
CREATE FUNCTION public.privacy_settings_save(p_office_id uuid,p_expected_revision integer,p_controller jsonb) RETURNS jsonb LANGUAGE sql SECURITY INVOKER SET search_path='' AS $$SELECT private.privacy_settings_save(p_office_id,p_expected_revision,p_controller);$$;
-- Deliberately public, parameterless projection; anon retains NO USAGE on private.
CREATE FUNCTION public.privacy_controller_public() RETURNS jsonb LANGUAGE sql SECURITY DEFINER SET search_path='' AS $$SELECT private.privacy_controller_public();$$;
REVOKE ALL ON FUNCTION private.privacy_settings_actor(uuid),private.privacy_settings_state(uuid),private.privacy_settings_save(uuid,integer,jsonb),private.privacy_controller_public(),public.privacy_settings_state(uuid),public.privacy_settings_save(uuid,integer,jsonb),public.privacy_controller_public() FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION private.privacy_settings_state(uuid),private.privacy_settings_save(uuid,integer,jsonb),public.privacy_settings_state(uuid),public.privacy_settings_save(uuid,integer,jsonb) TO authenticated;
GRANT EXECUTE ON FUNCTION private.privacy_controller_public(),public.privacy_controller_public() TO anon,authenticated;
NOTIFY pgrst,'reload schema';
