-- Replace redundant FOR ALL false policies on readable tables with explicit
-- mutation denials. SELECT behavior and all ACLs remain unchanged.
DO $$
DECLARE target_table text;
BEGIN
  FOREACH target_table IN ARRAY ARRAY['offices','profiles','memberships','audit_events'] LOOP
    EXECUTE format('DROP POLICY %I ON public.%I',target_table || '_deny',target_table);
    EXECUTE format('CREATE POLICY %I ON public.%I FOR INSERT TO anon,authenticated WITH CHECK (false)',
      target_table || '_insert_deny',target_table);
    EXECUTE format('CREATE POLICY %I ON public.%I FOR UPDATE TO anon,authenticated USING (false) WITH CHECK (false)',
      target_table || '_update_deny',target_table);
    EXECUTE format('CREATE POLICY %I ON public.%I FOR DELETE TO anon,authenticated USING (false)',
      target_table || '_delete_deny',target_table);
  END LOOP;
END $$;
