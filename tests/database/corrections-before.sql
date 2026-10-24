RESET ROLE;
CREATE TABLE test.corrections_snapshot AS SELECT
 (SELECT jsonb_agg(to_jsonb(e) ORDER BY id) FROM private.cash_entries e) entries,
 (SELECT jsonb_agg(to_jsonb(c) ORDER BY office_id,kind,idempotency_key) FROM private.cash_commands c) commands,
 (SELECT jsonb_agg(to_jsonb(p) ORDER BY id) FROM private.payments p) payments,
 (SELECT count(*) FROM public.audit_events) events,
 (SELECT count(*) FROM private.internal_notifications) notices;
CREATE TABLE test.correction_legacy_commands AS SELECT c.office_id,c.result,
 jsonb_build_object('kind',CASE e.kind WHEN 'refunded' THEN 'refund' ELSE 'reverse' END,'session_id',e.session_id,'expected_version',(c.result->'session'->>'version')::integer-1,'idempotency_key',e.command_key,'entry_id',e.original_entry_id,'amount_cents',e.amount_cents,'reason',e.reason) operation
 FROM private.cash_entries e JOIN private.cash_commands c ON c.office_id=e.office_id AND c.kind='operate' AND c.idempotency_key=e.command_key
 WHERE e.office_id='00000000-0000-4000-e000-000000000151' AND e.kind IN('refunded','reversed') LIMIT 1;
GRANT SELECT ON test.correction_legacy_commands TO authenticated;
