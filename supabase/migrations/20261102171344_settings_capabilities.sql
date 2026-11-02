-- Capabilities are explicit; no individual or delegated access is silently added.
INSERT INTO public.permissions(code,name) VALUES
 ('settings.access','Acessar configurações'),('categories.manage','Gerenciar categorias'),
 ('access.manage','Configurar prazo de inatividade'),('requests.archives.manage','Relatórios e arquivamento de solicitações') ON CONFLICT DO NOTHING;
INSERT INTO public.role_permissions(role_code,permission_code) SELECT 'owner',code FROM public.permissions WHERE code IN('settings.access','categories.manage','access.manage','requests.archives.manage') ON CONFLICT DO NOTHING;
DO $m$ DECLARE r record;d text;extra text:=', ''settings.access'', ''categories.manage'', ''access.manage'', ''requests.archives.manage''';BEGIN
 FOR r IN SELECT conrelid::regclass tbl,conname,pg_get_constraintdef(oid) def FROM pg_constraint WHERE conrelid IN('private.team_member_permissions'::regclass,'private.team_delegations'::regclass,'private.team_invitations'::regclass) AND contype='c' AND pg_get_constraintdef(oid) LIKE '%cash.read%' LOOP
 d:=replace(r.def,'''cash.read''::text','''cash.read''::text'||replace(extra,', ','::text, ')||'::text');EXECUTE format('ALTER TABLE %s DROP CONSTRAINT %I',r.tbl,r.conname);EXECUTE format('ALTER TABLE %s ADD CONSTRAINT %I %s',r.tbl,r.conname,d);END LOOP;
 FOR r IN SELECT oid FROM pg_proc WHERE pronamespace='private'::regnamespace AND proname IN('team_scope_for_member','team_validate_assignment','safe_audit_changes') LOOP d:=pg_get_functiondef(r.oid);d:=replace(d,'''cash.read''','''cash.read'''||extra);EXECUTE d;END LOOP;
END $m$;
NOTIFY pgrst,'reload schema';
