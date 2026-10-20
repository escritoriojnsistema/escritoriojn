-- Etapa10 remote advisor follow-up: covering indexes for new composite FKs.
-- Additive only. Existing catalog09, customer data and request snapshots stay intact.
CREATE INDEX requests_office_assignee_updated_idx
 ON public.requests(office_id,assignee_id,updated_at DESC);
CREATE INDEX requests_office_customer_idx
 ON public.requests(office_id,customer_id);
CREATE INDEX request_assignments_office_member_idx
 ON private.request_assignments(office_id,membership_id);
