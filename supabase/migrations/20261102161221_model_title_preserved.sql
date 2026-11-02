-- O título editado pelo gestor é a identidade de exibição do modelo. Publicar
-- uma nova versão não pode sobrescrevê-lo silenciosamente; o nome da versão
-- continua no histórico imutável.
CREATE OR REPLACE FUNCTION private.model_version_name() RETURNS trigger LANGUAGE plpgsql SECURITY INVOKER SET search_path='' AS $$ BEGIN
 INSERT INTO private.model_metadata(office_id,template_id,revision,display_name)
 SELECT NEW.office_id,NEW.template_id,1,NEW.definition->>'name'
 WHERE NOT EXISTS(SELECT FROM private.model_metadata m WHERE m.office_id=NEW.office_id AND m.template_id=NEW.template_id)
 ON CONFLICT(office_id,template_id) DO NOTHING;
 RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION private.model_version_name() FROM PUBLIC,anon,authenticated,service_role;
NOTIFY pgrst,'reload schema';