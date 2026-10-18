-- Cover the complete foreign-key prefixes, including historical/revoked rows.
-- Additive indexes only: preserve records, authorization and audit history.
CREATE INDEX team_delegations_office_membership_idx
 ON private.team_delegations(office_id,membership_id);
CREATE INDEX team_invitations_office_inviter_idx
 ON private.team_invitations(office_id,inviter_membership_id);
CREATE INDEX team_invitations_role_idx ON private.team_invitations(role_code);
CREATE INDEX team_member_permissions_permission_idx
 ON private.team_member_permissions(permission_code);
