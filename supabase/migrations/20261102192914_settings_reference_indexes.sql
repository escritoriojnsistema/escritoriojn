-- Cover the actor references reported during the production readback.
-- These indexes do not change permissions, policy values or business records.
CREATE INDEX access_policies_updated_by_idx ON private.access_policies(updated_by);
CREATE INDEX access_policy_commands_actor_idx ON private.access_policy_commands(actor_id);
CREATE INDEX service_categories_created_by_idx ON private.service_categories(created_by);
CREATE INDEX service_category_commands_actor_idx ON private.service_category_commands(actor_id);
CREATE INDEX request_archive_commands_actor_idx ON private.request_archive_commands(actor_id);
CREATE INDEX request_archive_policy_commands_actor_idx ON private.request_archive_policy_commands(actor_id);
