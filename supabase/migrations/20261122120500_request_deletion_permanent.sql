-- Etapa 1: Permanent Request Deletion with Coordinated Attachment Cleanup
-- Strict fail-closed eligibility, single-flight concurrency lock, Storage API cleanup tracking,
-- client notification & business audit exclusively for team-initiated deletions.

CREATE TABLE private.request_deletion_operations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  office_id uuid NOT NULL REFERENCES public.offices(id) ON DELETE RESTRICT,
  request_id uuid NOT NULL,
  protocol text NOT NULL CHECK (char_length(btrim(protocol)) BETWEEN 3 AND 60),
  actor_user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE RESTRICT,
  actor_kind text NOT NULL CHECK (actor_kind IN ('client', 'team')),
  idempotency_key text NOT NULL CHECK (char_length(btrim(idempotency_key)) BETWEEN 8 AND 128),
  status text NOT NULL CHECK (status IN ('processing', 'storage_cleanup_failed', 'completed')),
  db_deleted boolean NOT NULL DEFAULT false,
  storage_cleanup_completed boolean NOT NULL DEFAULT false,
  storage_objects_to_delete jsonb NOT NULL DEFAULT '[]'::jsonb,
  attachments_removed integer NOT NULL DEFAULT 0 CHECK (attachments_removed >= 0),
  attachments_preserved integer NOT NULL DEFAULT 0 CHECK (attachments_preserved >= 0),
  client_notified boolean NOT NULL DEFAULT false,
  audit_recorded boolean NOT NULL DEFAULT false,
  last_error_code text,
  created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  updated_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  UNIQUE (office_id, request_id, idempotency_key),
  CHECK (status <> 'completed' OR (db_deleted AND storage_cleanup_completed))
);

CREATE UNIQUE INDEX request_deletion_active_lock_idx
  ON private.request_deletion_operations(office_id, request_id)
  WHERE status IN ('processing', 'storage_cleanup_failed');

CREATE INDEX request_deletion_office_status_idx
  ON private.request_deletion_operations(office_id, status, updated_at DESC);

CREATE INDEX request_deletion_actor_idx
  ON private.request_deletion_operations(actor_user_id);

ALTER TABLE private.request_deletion_operations ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON private.request_deletion_operations FROM PUBLIC, anon, authenticated, service_role;

-- Internal helper: inspect attachments and classify exclusive vs shared vs retained
CREATE FUNCTION private.request_deletion_attachment_summary(
  p_office_id uuid,
  p_request_id uuid
) RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY INVOKER SET search_path = '' AS $$
DECLARE
  f public.files;
  v_total integer := 0;
  v_exclusive integer := 0;
  v_shared integer := 0;
  v_retained integer := 0;
  v_has_protected boolean := false;
  v_objects jsonb := '[]'::jsonb;
  v_bucket text;
  v_path text;
  v_unreferenced boolean;
BEGIN
  FOR f IN
    SELECT *
    FROM public.files
    WHERE office_id = p_office_id
      AND request_id = p_request_id
      AND status <> 'removido'
  LOOP
    v_total := v_total + 1;
    IF f.protected OR f.legal_hold OR (f.retain_until IS NOT NULL AND f.retain_until > clock_timestamp()) THEN
      v_retained := v_retained + 1;
      v_has_protected := true;
    ELSE
      v_unreferenced := private.files_delete_unreferenced(f);
      IF v_unreferenced IS NOT TRUE THEN
        v_shared := v_shared + 1;
      ELSE
        v_exclusive := v_exclusive + 1;
        SELECT i.bucket, i.object_path INTO v_bucket, v_path
        FROM private.upload_intents i
        WHERE i.office_id = p_office_id AND i.file_id = f.id
        LIMIT 1;
        IF v_bucket IS NOT NULL AND v_path IS NOT NULL THEN
          v_objects := v_objects || jsonb_build_array(
            jsonb_build_object(
              'file_id', f.id,
              'bucket', v_bucket,
              'object_path', v_path
            )
          );
        END IF;
      END IF;
    END IF;
  END LOOP;

  RETURN jsonb_build_object(
    'total_count', v_total,
    'exclusive_count', v_exclusive,
    'shared_preserved_count', v_shared,
    'retained_preserved_count', v_retained,
    'has_protected', v_has_protected,
    'objects', v_objects
  );
END $$;

-- Internal helper: compute authoritative eligibility matrix (Situações A-E + absolute blocks)
CREATE FUNCTION private.request_deletion_evaluate(
  p_office_id uuid,
  p_request_id uuid,
  p_write boolean DEFAULT false
) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE
  actor uuid;
  m public.memberships;
  caps text[];
  r public.requests;
  actor_kind text;
  can_show boolean := false;
  eligible boolean := false;
  block_reason text := NULL;
  alternatives jsonb := '[]'::jsonb;
  att jsonb;
  has_charges boolean := false;
  has_payments boolean := false;
  has_documents boolean := false;
  has_active_delete boolean := false;
  client_membership_id uuid := NULL;
  is_client_owner boolean := false;
BEGIN
  actor := private.team_require_identity();
  SELECT * INTO m
  FROM public.memberships
  WHERE office_id = p_office_id AND user_id = actor AND active
  FOR SHARE;
  IF m.id IS NULL OR NOT private.team_user_active(m.user_id, p_office_id) THEN
    RAISE EXCEPTION 'DELETION_FORBIDDEN' USING ERRCODE = 'PT403';
  END IF;

  IF p_write THEN
    SELECT * INTO r
    FROM public.requests
    WHERE office_id = p_office_id AND id = p_request_id
    FOR UPDATE;
  ELSE
    SELECT * INTO r
    FROM public.requests
    WHERE office_id = p_office_id AND id = p_request_id
    FOR SHARE;
  END IF;

  IF r.id IS NULL THEN
    RAISE EXCEPTION 'REQUEST_NOT_FOUND' USING ERRCODE = 'PT404';
  END IF;

  IF private.request_in_scope(r, m) IS NOT TRUE THEN
    RAISE EXCEPTION 'REQUEST_NOT_FOUND' USING ERRCODE = 'PT404';
  END IF;

  caps := private.current_permissions(p_office_id);
  actor_kind := CASE WHEN m.role_code = 'client' THEN 'client' ELSE 'team' END;

  -- Determine whether actor is permitted to even see the deletion section
  IF actor_kind = 'client' THEN
    is_client_owner := (r.origin = 'portal' AND r.created_by = m.user_id);
    IF NOT is_client_owner THEN
      RAISE EXCEPTION 'REQUEST_NOT_FOUND' USING ERRCODE = 'PT404';
    END IF;
    can_show := true;
  ELSE
    can_show := caps @> ARRAY['requests.delete'];
  END IF;

  att := private.request_deletion_attachment_summary(p_office_id, p_request_id);

  -- Check absolute financial, documentary, and concurrency blockers
  SELECT EXISTS(
    SELECT 1 FROM private.charges c
    WHERE c.office_id = p_office_id AND c.request_id = p_request_id
  ) INTO has_charges;

  SELECT EXISTS(
    SELECT 1
    FROM private.payment_allocations pa
    JOIN private.charges c ON c.office_id = pa.office_id AND c.id = pa.charge_id
    WHERE c.office_id = p_office_id AND c.request_id = p_request_id
  ) INTO has_payments;

  SELECT EXISTS(
    SELECT 1 FROM public.documents d
    WHERE d.office_id = p_office_id AND d.request_id = p_request_id
  ) INTO has_documents;

  SELECT EXISTS(
    SELECT 1 FROM private.request_deletion_operations op
    WHERE op.office_id = p_office_id
      AND op.request_id = p_request_id
      AND op.status IN ('processing', 'storage_cleanup_failed')
  ) INTO has_active_delete;

  IF NOT can_show THEN
    eligible := false;
    block_reason := 'NO_PERMISSION';
  ELSIF has_active_delete THEN
    eligible := false;
    block_reason := 'CONCURRENT_DELETION';
  ELSIF has_payments THEN
    eligible := false;
    block_reason := 'FINANCIAL_LINKED';
    alternatives := jsonb_build_array('Cancelar solicitação', 'Arquivar ou encerrar atendimento');
  ELSIF has_charges THEN
    eligible := false;
    block_reason := 'FINANCIAL_LINKED';
    alternatives := jsonb_build_array('Cancelar cobrança e solicitação', 'Arquivar atendimento');
  ELSIF has_documents THEN
    eligible := false;
    block_reason := 'DOCUMENT_FINALIZED';
    alternatives := jsonb_build_array('Cancelar solicitação', 'Manter histórico documental');
  ELSIF (att->>'has_protected')::boolean THEN
    eligible := false;
    block_reason := 'LEGAL_HOLD_OR_RETENTION';
    alternatives := jsonb_build_array('Cancelar solicitação', 'Preservar guarda legal');
  ELSIF r.status = 'concluido' THEN
    eligible := false;
    block_reason := 'STATUS_COMPLETED';
    alternatives := jsonb_build_array('Manter registro concluído', 'Arquivar');
  ELSIF actor_kind = 'client' AND r.status NOT IN ('aberto', 'aguardando_cliente') THEN
    eligible := false;
    block_reason := 'CLIENT_IN_PROGRESS';
    alternatives := jsonb_build_array('Solicitar cancelamento ao escritório');
  ELSIF actor_kind = 'team' AND r.status = 'em_atendimento' AND m.role_code NOT IN ('owner', 'admin') THEN
    eligible := false;
    block_reason := 'TEAM_IN_PROGRESS';
    alternatives := jsonb_build_array('Cancelar solicitação', 'Solicitar exclusão a um administrador');
  ELSE
    eligible := true;
    block_reason := NULL;
  END IF;

  -- Check if client portal account exists to notify on team deletion
  IF actor_kind = 'team' THEN
    SELECT cm.id INTO client_membership_id
    FROM public.memberships cm
    WHERE cm.office_id = p_office_id
      AND cm.role_code = 'client'
      AND cm.active
      AND cm.user_id = r.created_by
    LIMIT 1;
  END IF;

  RETURN jsonb_build_object(
    'request_id', r.id,
    'office_id', r.office_id,
    'protocol', r.protocol,
    'title', r.title,
    'status', r.status,
    'version', r.version,
    'actor_kind', actor_kind,
    'eligible', eligible,
    'can_show_action', can_show,
    'block_reason', block_reason,
    'block_message', NULL,
    'recommended_alternatives', alternatives,
    'notify_client_on_delete', (actor_kind = 'team' AND client_membership_id IS NOT NULL),
    'requires_audit', (actor_kind = 'team'),
    'client_membership_id', client_membership_id,
    'attachments', jsonb_build_object(
      'total_count', (att->>'total_count')::integer,
      'exclusive_count', (att->>'exclusive_count')::integer,
      'shared_preserved_count', (att->>'shared_preserved_count')::integer,
      'retained_preserved_count', (att->>'retained_preserved_count')::integer
    ),
    'storage_objects', att->'objects',
    'backend_ready', true
  );
END $$;

CREATE FUNCTION private.request_deletion_result_json(
  op private.request_deletion_operations,
  p_replay boolean DEFAULT false
) RETURNS jsonb
LANGUAGE sql STABLE SECURITY INVOKER SET search_path = '' AS $$
  SELECT jsonb_build_object(
    'operation_id', op.id,
    'request_id', op.request_id,
    'protocol', op.protocol,
    'status', op.status,
    'db_deleted', op.db_deleted,
    'storage_cleanup_completed', op.storage_cleanup_completed,
    'attachments_removed', op.attachments_removed,
    'attachments_preserved', op.attachments_preserved,
    'client_notified', op.client_notified,
    'audit_recorded', op.audit_recorded,
    'message', CASE
      WHEN op.status = 'completed' THEN 'Solicitação excluída definitivamente.'
      WHEN op.status = 'storage_cleanup_failed' THEN 'A limpeza física dos anexos exclusivos encontrou uma falha e permanece em acompanhamento.'
      ELSE 'Exclusão registrada no banco. Aguardando confirmação da limpeza física dos anexos exclusivos no armazenamento.'
    END,
    'idempotent_replay', p_replay
  );
$$;

-- RPC 1: request_deletion_eligibility
CREATE FUNCTION private.request_deletion_eligibility(
  p_office_id uuid,
  p_request_id uuid
) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE
  eval jsonb;
BEGIN
  IF p_office_id IS NULL OR p_request_id IS NULL THEN
    RAISE EXCEPTION 'DELETION_VALIDATION' USING ERRCODE = 'PT422';
  END IF;
  eval := private.request_deletion_evaluate(p_office_id, p_request_id, false);
  RETURN eval - ARRAY['storage_objects', 'client_membership_id'];
END $$;

-- RPC 2: request_delete_permanently
CREATE FUNCTION private.request_delete_permanently(
  p_office_id uuid,
  p_request_id uuid,
  p_expected_version integer,
  p_expected_status text,
  p_idempotency_key text,
  p_confirmation_ack boolean,
  p_client_verification_token text DEFAULT NULL
) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE
  actor uuid;
  existing private.request_deletion_operations;
  op private.request_deletion_operations;
  eval jsonb;
  v_objects jsonb;
  v_exclusive_count integer;
  v_preserved_count integer;
  v_actor_kind text;
  v_client_mid uuid;
  v_notified boolean := false;
  v_audited boolean := false;
  v_storage_done boolean := false;
  v_status text;
  v_obj jsonb;
BEGIN
  actor := private.team_require_identity();
  IF p_office_id IS NULL OR p_request_id IS NULL
     OR p_expected_version IS NULL OR p_expected_version < 1
     OR p_expected_status IS NULL
     OR p_idempotency_key IS NULL OR char_length(btrim(p_idempotency_key)) NOT BETWEEN 8 AND 128
     OR p_confirmation_ack IS DISTINCT FROM true THEN
    RAISE EXCEPTION 'DELETION_VALIDATION' USING ERRCODE = 'PT422';
  END IF;

  -- Idempotent replay check before touching locks on already-deleted request
  SELECT * INTO existing
  FROM private.request_deletion_operations
  WHERE office_id = p_office_id
    AND request_id = p_request_id
    AND idempotency_key = btrim(p_idempotency_key);
  IF existing.id IS NOT NULL THEN
    IF existing.actor_user_id <> actor THEN
      RAISE EXCEPTION 'DELETION_FORBIDDEN' USING ERRCODE = 'PT403';
    END IF;
    RETURN private.request_deletion_result_json(existing, true);
  END IF;

  PERFORM 1 FROM public.offices WHERE id = p_office_id FOR NO KEY UPDATE;
  eval := private.request_deletion_evaluate(p_office_id, p_request_id, true);

  IF (eval->>'version')::integer <> p_expected_version
     OR (eval->>'status') <> p_expected_status THEN
    RAISE EXCEPTION 'DELETION_CONFLICT' USING ERRCODE = 'PT409';
  END IF;

  IF (eval->>'eligible')::boolean IS NOT TRUE THEN
    IF eval->>'block_reason' = 'NO_PERMISSION' THEN
      RAISE EXCEPTION 'DELETION_FORBIDDEN' USING ERRCODE = 'PT403';
    ELSIF eval->>'block_reason' = 'CONCURRENT_DELETION' THEN
      RAISE EXCEPTION 'CONCURRENT_OPERATION' USING ERRCODE = 'PT409';
    ELSE
      RAISE EXCEPTION '%', coalesce(eval->>'block_reason', 'DELETION_BLOCKED') USING ERRCODE = 'PT422';
    END IF;
  END IF;

  v_actor_kind := eval->>'actor_kind';
  v_objects := coalesce(eval->'storage_objects', '[]'::jsonb);
  v_exclusive_count := jsonb_array_length(v_objects);
  v_preserved_count := coalesce((eval->'attachments'->>'shared_preserved_count')::integer, 0)
                     + coalesce((eval->'attachments'->>'retained_preserved_count')::integer, 0);
  v_client_mid := nullif(eval->>'client_membership_id', '')::uuid;

  -- When there are no physical storage objects to remove, storage cleanup is already complete.
  -- When exclusive objects exist, status stays 'processing' until Edge Function confirms Storage API removal.
  v_storage_done := (v_exclusive_count = 0);
  v_status := CASE WHEN v_storage_done THEN 'completed' ELSE 'processing' END;

  -- Set transaction-local deletion token so immutability guards authorize only this exact request
  PERFORM set_config('jn.request_deletion_id', p_request_id::text, true);

  -- Remove exclusive file DB metadata (never DELETE FROM storage.objects here!)
  FOR v_obj IN SELECT value FROM jsonb_array_elements(v_objects) LOOP
    DELETE FROM private.file_process_leases
    WHERE office_id = p_office_id
      AND (
        objects @> jsonb_build_array(jsonb_build_object('file_id', (v_obj->>'file_id')::uuid))
        OR target_id IN (SELECT id FROM private.upload_intents WHERE office_id = p_office_id AND file_id = (v_obj->>'file_id')::uuid)
      );
    DELETE FROM private.upload_intents
    WHERE office_id = p_office_id AND file_id = (v_obj->>'file_id')::uuid;
    DELETE FROM public.files
    WHERE office_id = p_office_id AND id = (v_obj->>'file_id')::uuid;
  END LOOP;

  -- Detach non-blocking operational rows linked to this request
  DELETE FROM private.internal_notifications
  WHERE office_id = p_office_id AND request_id = p_request_id;
  DELETE FROM private.request_assignments
  WHERE office_id = p_office_id AND request_id = p_request_id;
  DELETE FROM private.request_history
  WHERE office_id = p_office_id AND request_id = p_request_id;
  DELETE FROM public.request_items
  WHERE office_id = p_office_id AND request_id = p_request_id;
  DELETE FROM public.requests
  WHERE office_id = p_office_id AND id = p_request_id;

  PERFORM set_config('jn.request_deletion_id', '', true);

  -- Team-only notification (no broken link; request_id is NULL) and team-only audit
  IF v_actor_kind = 'team' THEN
    IF v_client_mid IS NOT NULL THEN
      INSERT INTO private.internal_notifications(
        office_id, request_id, recipient_id, event_id, kind, deleted_protocol
      ) VALUES (
        p_office_id, NULL, v_client_mid, gen_random_uuid(), 'request_deleted', eval->>'protocol'
      );
      v_notified := true;
    END IF;
    PERFORM private.emit_business_event(
      p_office_id,
      'requests.deleted',
      'request',
      p_request_id,
      gen_random_uuid(),
      '{}'::jsonb
    );
    v_audited := true;
  END IF;

  INSERT INTO private.request_deletion_operations(
    office_id, request_id, protocol, actor_user_id, actor_kind, idempotency_key,
    status, db_deleted, storage_cleanup_completed, storage_objects_to_delete,
    attachments_removed, attachments_preserved, client_notified, audit_recorded
  ) VALUES (
    p_office_id, p_request_id, eval->>'protocol', actor, v_actor_kind, btrim(p_idempotency_key),
    v_status, true, v_storage_done, v_objects,
    CASE WHEN v_storage_done THEN v_exclusive_count ELSE 0 END,
    v_preserved_count, v_notified, v_audited
  )
  RETURNING * INTO op;

  RETURN private.request_deletion_result_json(op, false);
END $$;

-- RPC 3: request_deletion_status
CREATE FUNCTION private.request_deletion_status(
  p_office_id uuid,
  p_request_id uuid,
  p_idempotency_key text
) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE
  actor uuid;
  m public.memberships;
  op private.request_deletion_operations;
BEGIN
  actor := private.team_require_identity();
  IF p_office_id IS NULL OR p_request_id IS NULL
     OR p_idempotency_key IS NULL OR char_length(btrim(p_idempotency_key)) NOT BETWEEN 8 AND 128 THEN
    RAISE EXCEPTION 'DELETION_VALIDATION' USING ERRCODE = 'PT422';
  END IF;

  SELECT * INTO m
  FROM public.memberships
  WHERE office_id = p_office_id AND user_id = actor AND active;
  IF m.id IS NULL OR NOT private.team_user_active(m.user_id, p_office_id) THEN
    RAISE EXCEPTION 'DELETION_FORBIDDEN' USING ERRCODE = 'PT403';
  END IF;

  SELECT * INTO op
  FROM private.request_deletion_operations
  WHERE office_id = p_office_id
    AND request_id = p_request_id
    AND idempotency_key = btrim(p_idempotency_key);
  IF op.id IS NULL THEN
    RAISE EXCEPTION 'DELETION_OPERATION_NOT_FOUND' USING ERRCODE = 'PT404';
  END IF;

  IF op.actor_user_id <> actor AND NOT (m.role_code IN ('owner', 'admin') AND private.current_permissions(p_office_id) @> ARRAY['requests.delete']) THEN
    RAISE EXCEPTION 'DELETION_FORBIDDEN' USING ERRCODE = 'PT403';
  END IF;

  RETURN private.request_deletion_result_json(op, true);
END $$;

-- Service-role only Edge Function helpers for coordinated Storage API cleanup (never SQL DELETE on storage.objects)
CREATE FUNCTION private.request_deletion_claim_cleanup(
  p_office_id uuid DEFAULT NULL,
  p_operation_id uuid DEFAULT NULL
) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE
  items jsonb;
BEGIN
  SELECT coalesce(jsonb_agg(
    jsonb_build_object(
      'operation_id', op.id,
      'office_id', op.office_id,
      'request_id', op.request_id,
      'protocol', op.protocol,
      'objects', op.storage_objects_to_delete
    ) ORDER BY op.created_at ASC
  ), '[]'::jsonb) INTO items
  FROM (
    SELECT *
    FROM private.request_deletion_operations
    WHERE status IN ('processing', 'storage_cleanup_failed')
      AND db_deleted = true
      AND storage_cleanup_completed = false
      AND (p_office_id IS NULL OR office_id = p_office_id)
      AND (p_operation_id IS NULL OR id = p_operation_id)
    ORDER BY created_at ASC
    LIMIT 10
    FOR UPDATE SKIP LOCKED
  ) op;
  RETURN items;
END $$;

CREATE FUNCTION private.request_deletion_complete_cleanup(
  p_operation_id uuid,
  p_removed_file_ids uuid[],
  p_failed_count integer,
  p_error_code text DEFAULT NULL
) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE
  op private.request_deletion_operations;
  remaining jsonb;
  removed_now integer;
BEGIN
  IF p_operation_id IS NULL OR p_failed_count IS NULL OR p_failed_count < 0 THEN
    RAISE EXCEPTION 'DELETION_VALIDATION' USING ERRCODE = 'PT422';
  END IF;

  SELECT * INTO op
  FROM private.request_deletion_operations
  WHERE id = p_operation_id
  FOR UPDATE;
  IF op.id IS NULL THEN
    RAISE EXCEPTION 'DELETION_OPERATION_NOT_FOUND' USING ERRCODE = 'PT404';
  END IF;

  SELECT coalesce(jsonb_agg(elem), '[]'::jsonb) INTO remaining
  FROM jsonb_array_elements(op.storage_objects_to_delete) elem
  WHERE NOT ((elem->>'file_id')::uuid = ANY(coalesce(p_removed_file_ids, ARRAY[]::uuid[])));

  removed_now := greatest(0, jsonb_array_length(op.storage_objects_to_delete) - jsonb_array_length(remaining));

  IF jsonb_array_length(remaining) = 0 AND p_failed_count = 0 THEN
    UPDATE private.request_deletion_operations
       SET status = 'completed',
           storage_cleanup_completed = true,
           storage_objects_to_delete = '[]'::jsonb,
           attachments_removed = op.attachments_removed + removed_now,
           last_error_code = NULL,
           updated_at = clock_timestamp()
     WHERE id = op.id
     RETURNING * INTO op;
  ELSE
    UPDATE private.request_deletion_operations
       SET status = 'storage_cleanup_failed',
           storage_cleanup_completed = false,
           storage_objects_to_delete = remaining,
           attachments_removed = op.attachments_removed + removed_now,
           last_error_code = left(coalesce(p_error_code, 'STORAGE_REMOVE_FAILED'), 64),
           updated_at = clock_timestamp()
     WHERE id = op.id
     RETURNING * INTO op;
  END IF;

  RETURN private.request_deletion_result_json(op, false);
END $$;

-- Preserve strict immutability across all tables; permit DELETE only for the exact request authorized in the current transaction
CREATE OR REPLACE FUNCTION private.request_immutable() RETURNS trigger
LANGUAGE plpgsql SECURITY INVOKER SET search_path = '' AS $$
BEGIN
  IF TG_OP = 'DELETE'
     AND TG_TABLE_NAME IN ('request_items', 'request_history')
     AND nullif(current_setting('jn.request_deletion_id', true), '') = (to_jsonb(OLD)->>'request_id') THEN
    RETURN OLD;
  END IF;
  RAISE EXCEPTION 'REQUEST_HISTORY_IMMUTABLE' USING ERRCODE = 'PT403';
END $$;

CREATE OR REPLACE FUNCTION private.request_record_guard() RETURNS trigger
LANGUAGE plpgsql SECURITY INVOKER SET search_path = '' AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    IF nullif(current_setting('jn.request_deletion_id', true), '') = OLD.id::text THEN
      RETURN OLD;
    END IF;
    RAISE EXCEPTION 'REQUEST_CONFLICT' USING ERRCODE = 'PT409';
  END IF;
  IF OLD.status IN ('concluido', 'cancelado')
     OR OLD.created_by IS DISTINCT FROM NEW.created_by
     OR OLD.office_id IS DISTINCT FROM NEW.office_id
     OR OLD.protocol IS DISTINCT FROM NEW.protocol
     OR OLD.origin IS DISTINCT FROM NEW.origin
     OR OLD.idempotency_key IS DISTINCT FROM NEW.idempotency_key
     OR OLD.payload_digest IS DISTINCT FROM NEW.payload_digest
     OR OLD.created_at IS DISTINCT FROM NEW.created_at THEN
    RAISE EXCEPTION 'REQUEST_CONFLICT' USING ERRCODE = 'PT409';
  END IF;
  RETURN NEW;
END $$;

-- Public SECURITY INVOKER RPC wrappers
CREATE FUNCTION public.request_deletion_eligibility(
  p_office_id uuid,
  p_request_id uuid
) RETURNS jsonb
LANGUAGE sql SECURITY INVOKER SET search_path = '' AS $$
  SELECT private.request_deletion_eligibility(p_office_id, p_request_id);
$$;

CREATE FUNCTION public.request_delete_permanently(
  p_office_id uuid,
  p_request_id uuid,
  p_expected_version integer,
  p_expected_status text,
  p_idempotency_key text,
  p_confirmation_ack boolean,
  p_client_verification_token text DEFAULT NULL
) RETURNS jsonb
LANGUAGE sql SECURITY INVOKER SET search_path = '' AS $$
  SELECT private.request_delete_permanently(
    p_office_id,
    p_request_id,
    p_expected_version,
    p_expected_status,
    p_idempotency_key,
    p_confirmation_ack,
    p_client_verification_token
  );
$$;

CREATE FUNCTION public.request_deletion_status(
  p_office_id uuid,
  p_request_id uuid,
  p_idempotency_key text
) RETURNS jsonb
LANGUAGE sql SECURITY INVOKER SET search_path = '' AS $$
  SELECT private.request_deletion_status(p_office_id, p_request_id, p_idempotency_key);
$$;

-- Public SECURITY INVOKER wrappers granted EXCLUSIVELY to service_role (PostgREST only exposes public)
CREATE FUNCTION public.request_deletion_claim_cleanup(
  p_office_id uuid DEFAULT NULL,
  p_operation_id uuid DEFAULT NULL
) RETURNS jsonb
LANGUAGE sql SECURITY INVOKER SET search_path = '' AS $$
  SELECT private.request_deletion_claim_cleanup(p_office_id, p_operation_id);
$$;

CREATE FUNCTION public.request_deletion_complete_cleanup(
  p_operation_id uuid,
  p_removed_file_ids uuid[],
  p_failed_count integer,
  p_error_code text DEFAULT NULL
) RETURNS jsonb
LANGUAGE sql SECURITY INVOKER SET search_path = '' AS $$
  SELECT private.request_deletion_complete_cleanup(
    p_operation_id,
    p_removed_file_ids,
    p_failed_count,
    p_error_code
  );
$$;

REVOKE ALL ON FUNCTION
  private.request_immutable(),
  private.request_record_guard(),
  private.request_deletion_attachment_summary(uuid, uuid),
  private.request_deletion_evaluate(uuid, uuid, boolean),
  private.request_deletion_result_json(private.request_deletion_operations, boolean),
  private.request_deletion_eligibility(uuid, uuid),
  private.request_delete_permanently(uuid, uuid, integer, text, text, boolean, text),
  private.request_deletion_status(uuid, uuid, text),
  private.request_deletion_claim_cleanup(uuid, uuid),
  private.request_deletion_complete_cleanup(uuid, uuid[], integer, text),
  public.request_deletion_eligibility(uuid, uuid),
  public.request_delete_permanently(uuid, uuid, integer, text, text, boolean, text),
  public.request_deletion_status(uuid, uuid, text),
  public.request_deletion_claim_cleanup(uuid, uuid),
  public.request_deletion_complete_cleanup(uuid, uuid[], integer, text)
FROM PUBLIC, anon, authenticated, service_role;

GRANT EXECUTE ON FUNCTION
  private.request_deletion_eligibility(uuid, uuid),
  private.request_delete_permanently(uuid, uuid, integer, text, text, boolean, text),
  private.request_deletion_status(uuid, uuid, text),
  public.request_deletion_eligibility(uuid, uuid),
  public.request_delete_permanently(uuid, uuid, integer, text, text, boolean, text),
  public.request_deletion_status(uuid, uuid, text)
TO authenticated;

GRANT EXECUTE ON FUNCTION
  private.request_deletion_claim_cleanup(uuid, uuid),
  private.request_deletion_complete_cleanup(uuid, uuid[], integer, text),
  public.request_deletion_claim_cleanup(uuid, uuid),
  public.request_deletion_complete_cleanup(uuid, uuid[], integer, text)
TO service_role;

NOTIFY pgrst, 'reload schema';
