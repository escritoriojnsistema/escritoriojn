-- Cover only foreign keys introduced by the authorized corrections.
CREATE INDEX account_retention_holds_created_by_idx ON private.account_retention_holds(created_by);
CREATE INDEX account_retention_holds_released_by_idx ON private.account_retention_holds(released_by);
CREATE INDEX account_retention_holds_user_id_idx ON private.account_retention_holds(user_id);
CREATE INDEX account_retention_policies_approved_by_idx ON private.account_retention_policies(approved_by);
CREATE INDEX closed_account_documents_publication_id_idx ON private.closed_account_documents(publication_id);
CREATE INDEX closed_account_offices_customer_id_idx ON private.closed_account_offices(customer_id);
CREATE INDEX closed_account_offices_membership_id_idx ON private.closed_account_offices(membership_id);
CREATE INDEX portal_hidden_files_file_id_idx ON private.portal_hidden_files(file_id);
CREATE INDEX portal_intake_forms_intake_id_idx ON private.portal_intake_forms(intake_id);
CREATE INDEX portal_intake_revisions_actor_id_idx ON private.portal_intake_revisions(actor_id);
CREATE INDEX portal_intake_revisions_office_id_request_id_request_item__idx ON private.portal_intake_revisions(office_id,request_id,request_item_id);
CREATE INDEX portal_request_commands_actor_id_idx ON private.portal_request_commands(actor_id);
CREATE INDEX portal_request_commands_office_id_request_id_idx ON private.portal_request_commands(office_id,request_id);
CREATE INDEX request_level_exceptions_authorized_by_idx ON private.request_level_exceptions(authorized_by);
CREATE INDEX request_level_exceptions_membership_id_idx ON private.request_level_exceptions(membership_id);
CREATE INDEX request_level_exceptions_revoked_by_idx ON private.request_level_exceptions(revoked_by);
CREATE INDEX request_preintake_events_actor_id_idx ON private.request_preintake_events(actor_id);
CREATE INDEX request_preintake_events_office_id_request_id_idx ON private.request_preintake_events(office_id,request_id);
CREATE INDEX request_preintakes_collector_id_idx ON private.request_preintakes(collector_id);
CREATE INDEX retention_items_classified_by_idx ON private.retention_items(classified_by);
CREATE INDEX retention_items_office_id_request_id_idx ON private.retention_items(office_id,request_id);
CREATE INDEX retention_items_user_id_idx ON private.retention_items(user_id);
CREATE INDEX retention_purges_authorized_by_idx ON private.retention_purges(authorized_by);
CREATE INDEX retention_purges_cleanup_plan_id_idx ON private.retention_purges(cleanup_plan_id);
CREATE INDEX retention_purges_office_id_idx ON private.retention_purges(office_id);
CREATE INDEX retention_redaction_context_purge_id_idx ON private.retention_redaction_context(purge_id);
-- Preparsed SQL preserves a narrow public invoker without granting anon USAGE
-- on the private schema. The private, parameterless projection remains guarded.
CREATE OR REPLACE FUNCTION public.privacy_controller_public() RETURNS jsonb LANGUAGE sql STABLE SECURITY INVOKER SET search_path='' BEGIN ATOMIC SELECT private.privacy_controller_public(); END;
NOTIFY pgrst,'reload schema';
