-- Etapa20: support the immutable command's office/template foreign key.
-- Additive index only; no data, grants, function bodies or historical snapshots change.
CREATE INDEX template_commands_template_idx ON private.template_commands(office_id,template_id);
