-- Technical initial organization requested by the operator; no fabricated Auth
-- identity, approval, price or document edit. The migration history is provenance.
-- Existing location rows (including an explicitly chosen "Sem pasta") win.
DO $organization$
DECLARE office uuid;
BEGIN
 FOR office IN SELECT DISTINCT t.office_id FROM public.templates t ORDER BY t.office_id LOOP
  PERFORM 1 FROM public.offices WHERE id=office FOR UPDATE;
  INSERT INTO private.model_folders(office_id,name)
  SELECT DISTINCT t.office_id,CASE v.definition->>'kind'
   WHEN 'contract' THEN 'Contratos' WHEN 'declaration' THEN 'Declarações'
   WHEN 'application' THEN 'Requerimentos' WHEN 'official_letter' THEN 'Ofícios'
   ELSE 'Outros modelos' END
  FROM public.templates t JOIN public.template_versions v
   ON v.office_id=t.office_id AND v.template_id=t.id AND v.number=t.latest_version
  WHERE t.office_id=office AND NOT EXISTS(
   SELECT FROM private.model_locations l WHERE l.office_id=t.office_id AND l.template_id=t.id)
  ON CONFLICT(office_id,name) DO NOTHING;

  INSERT INTO private.model_locations(office_id,template_id,folder_id,revision)
  SELECT t.office_id,t.id,f.id,1
  FROM public.templates t JOIN public.template_versions v
   ON v.office_id=t.office_id AND v.template_id=t.id AND v.number=t.latest_version
  JOIN private.model_folders f ON f.office_id=t.office_id AND f.name=CASE v.definition->>'kind'
   WHEN 'contract' THEN 'Contratos' WHEN 'declaration' THEN 'Declarações'
   WHEN 'application' THEN 'Requerimentos' WHEN 'official_letter' THEN 'Ofícios'
   ELSE 'Outros modelos' END
  WHERE t.office_id=office AND NOT EXISTS(
   SELECT FROM private.model_locations l WHERE l.office_id=t.office_id AND l.template_id=t.id)
  ON CONFLICT(office_id,template_id) DO NOTHING;
 END LOOP;
END $organization$;
