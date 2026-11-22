-- Extend the existing operation journal to cover the interval before metadata removal.

ALTER TABLE private.request_deletion_operations
  ADD COLUMN cleanup_lease_until timestamptz,
  ADD COLUMN previous_status text,
  ADD COLUMN category_id uuid,
  ADD COLUMN client_recipient_id uuid;



CREATE FUNCTION private.request_deletion_preserved_dependencies(
  p_office_id uuid,
  p_request_id uuid
) RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY INVOKER SET search_path = '' AS $$
DECLARE
  v_financial boolean;
  v_refunds boolean;
  v_documents boolean;
  v_document_tasks boolean;
  v_retention boolean;
  v_archives boolean;
  v_deliveries boolean;
  v_specialized boolean;
  v_account_records boolean;
BEGIN
  SELECT EXISTS (
    SELECT 1 FROM private.payment_allocations pa
    JOIN private.charges c ON c.office_id = pa.office_id AND c.id = pa.charge_id
    WHERE c.office_id = p_office_id AND c.request_id = p_request_id
    UNION ALL
    SELECT 1 FROM private.cash_entries e
    WHERE e.office_id = p_office_id AND e.request_id = p_request_id
    UNION ALL
    SELECT 1 FROM private.quick_operations q
    WHERE q.office_id = p_office_id AND q.request_id = p_request_id
  ) INTO v_financial;

  SELECT EXISTS (
    SELECT 1 FROM private.payment_reversals rv
    JOIN private.payment_allocations pa ON pa.office_id = rv.office_id AND pa.id = rv.allocation_id
    JOIN private.charges c ON c.office_id = pa.office_id AND c.id = pa.charge_id
    WHERE c.office_id = p_office_id AND c.request_id = p_request_id
    UNION ALL
    SELECT 1 FROM private.payment_refunds rf
    JOIN private.payment_reversals rv ON rv.office_id = rf.office_id AND rv.id = rf.reversal_id
    JOIN private.payment_allocations pa ON pa.office_id = rv.office_id AND pa.id = rv.allocation_id
    JOIN private.charges c ON c.office_id = pa.office_id AND c.id = pa.charge_id
    WHERE c.office_id = p_office_id AND c.request_id = p_request_id
  ) INTO v_refunds;

  SELECT EXISTS (
    SELECT 1 FROM public.documents d
    WHERE d.office_id = p_office_id AND d.request_id = p_request_id
  ) INTO v_documents;

  SELECT EXISTS (
    SELECT 1 FROM private.document_correction_requests x
    WHERE x.office_id = p_office_id AND x.request_id = p_request_id
    UNION ALL
    SELECT 1 FROM private.document_courtesies y
    WHERE y.office_id = p_office_id AND y.request_id = p_request_id
    UNION ALL
    SELECT 1 FROM private.document_cash_tasks z
    WHERE z.office_id = p_office_id AND z.request_id = p_request_id
  ) INTO v_document_tasks;

  SELECT EXISTS (
    SELECT 1 FROM private.retention_items ri
    WHERE ri.office_id = p_office_id AND ri.request_id = p_request_id AND ri.purged_at IS NULL
  ) INTO v_retention;

  SELECT EXISTS (
    SELECT 1 FROM private.request_archives ra
    WHERE ra.office_id = p_office_id AND ra.request_id = p_request_id
  ) INTO v_archives;

  SELECT EXISTS (
    SELECT 1 FROM private.deliveries dl
    WHERE dl.office_id = p_office_id
      AND dl.file_id IN (SELECT f.id FROM public.files f WHERE f.office_id = p_office_id AND f.request_id = p_request_id)
  ) INTO v_deliveries;

  SELECT EXISTS (
    SELECT 1 FROM private.property_records27 pr
    WHERE pr.office_id = p_office_id AND pr.request_id = p_request_id
    UNION ALL
    SELECT 1 FROM private.ditr_cases28 dc
    WHERE dc.office_id = p_office_id AND dc.request_id = p_request_id
    UNION ALL
    SELECT 1 FROM private.rural_cases29 rc
    WHERE rc.office_id = p_office_id AND rc.request_id = p_request_id
    UNION ALL
    SELECT 1 FROM private.specialized_cases sc
    WHERE sc.office_id = p_office_id AND sc.request_id = p_request_id
  ) INTO v_specialized;

  SELECT EXISTS (
    SELECT 1 FROM private.account_corrections ac
    WHERE ac.office_id = p_office_id AND ac.request_id = p_request_id
    UNION ALL
    SELECT 1 FROM private.account_email_intents aei
    WHERE aei.office_id = p_office_id AND aei.request_id = p_request_id
  ) INTO v_account_records;

  RETURN jsonb_build_object(
    'financial', v_financial,
    'refunds', v_refunds,
    'documents', v_documents,
    'document_tasks', v_document_tasks,
    'retention', v_retention,
    'archives', v_archives,
    'deliveries', v_deliveries,
    'specialized', v_specialized,
    'account_records', v_account_records
  );
END $$;

CREATE OR REPLACE FUNCTION private.request_deletion_evaluate(
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
  block_message text := NULL;
  alternatives jsonb := '[]'::jsonb;
  att jsonb;
  has_charges boolean := false;
  has_payments boolean := false;
  has_refunds boolean := false;
  has_documents boolean := false;
  has_active_delete boolean := false;
  deps jsonb;
  v_dep text;
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
  actor := private.team_require_identity();
  IF actor<>m.user_id OR NOT private.team_user_active(actor,p_office_id) THEN
    RAISE EXCEPTION 'DELETION_FORBIDDEN' USING ERRCODE='PT403';
  END IF;

  IF private.request_in_scope(r, m) IS NOT TRUE THEN
    RAISE EXCEPTION 'REQUEST_NOT_FOUND' USING ERRCODE = 'PT404';
  END IF;

  caps := private.current_permissions(p_office_id);
  actor_kind := CASE WHEN m.role_code = 'client' THEN 'client' ELSE 'team' END;

  -- Determine whether actor is permitted to even see the deletion section
  IF actor_kind = 'client' THEN
    is_client_owner := r.origin = 'portal' AND r.created_by = m.user_id
      AND private.finance_client_request(r, m) IS TRUE;
    IF NOT is_client_owner THEN
      RAISE EXCEPTION 'REQUEST_NOT_FOUND' USING ERRCODE = 'PT404';
    END IF;
    can_show := true;
  ELSE
    can_show := caps @> ARRAY['requests.delete']
      AND private.request_execution_allowed(r, m) IS TRUE;
  END IF;

  att := private.request_deletion_attachment_summary(p_office_id, p_request_id);

  -- Check absolute financial, documentary, and concurrency blockers
  SELECT EXISTS(
    SELECT 1 FROM private.charges c
    WHERE c.office_id = p_office_id AND c.request_id = p_request_id
  ) INTO has_charges;

  deps := private.request_deletion_preserved_dependencies(p_office_id, p_request_id);
  has_payments := (deps->>'financial')::boolean;
  has_refunds := (deps->>'refunds')::boolean;
  has_documents := (deps->>'documents')::boolean;

  SELECT EXISTS(
    SELECT 1 FROM private.request_deletion_operations op
    WHERE op.office_id = p_office_id
      AND op.request_id = p_request_id
      AND op.status IN ('processing', 'storage_cleanup_failed')
  ) INTO has_active_delete;

  IF NOT can_show THEN
    eligible := false;
    block_reason := 'INSUFFICIENT_PERMISSION';
  ELSIF has_active_delete THEN
    eligible := false;
    block_reason := 'CONCURRENT_OPERATION';
    alternatives := jsonb_build_array('Aguardar a confirmação da operação em andamento');
  ELSIF has_refunds THEN
    eligible := false;
    block_reason := 'REFUND_LINKED';
    alternatives := jsonb_build_array('Consultar histórico financeiro');
  ELSIF has_payments THEN
    eligible := false;
    block_reason := 'PAYMENT_CONFIRMED';
    alternatives := jsonb_build_array('Cancelar atendimento', 'Consultar financeiro e recibos');
  ELSIF has_charges THEN
    -- An open obligation is a mandatory financial record even before any money is confirmed.
    eligible := false;
    block_reason := 'STATUS_NOT_ELIGIBLE';
    block_message := 'Esta solicitação possui cobrança vinculada e precisa permanecer no histórico financeiro. Consulte o financeiro para cancelar o atendimento quando aplicável.';
    alternatives := jsonb_build_array('Consultar cobrança e solicitação', 'Arquivar atendimento');
  ELSIF has_documents OR (deps->>'document_tasks')::boolean OR (deps->>'deliveries')::boolean THEN
    eligible := false;
    block_reason := 'FORMALIZED_DOCUMENT';
    alternatives := jsonb_build_array('Arquivar atendimento após conclusão', 'Consultar documento formalizado');
  ELSIF (deps->>'retention')::boolean OR (deps->>'archives')::boolean THEN
    eligible := false;
    block_reason := 'LEGAL_RETENTION';
    alternatives := jsonb_build_array('Manter sob guarda documental', 'Arquivar solicitação');
  ELSIF (deps->>'specialized')::boolean THEN
    eligible := false;
    block_reason := 'STATUS_NOT_ELIGIBLE';
    block_message := 'Esta solicitação possui atendimento especializado (rural, ITR/DITR ou jurídico/previdenciário) com registro próprio e precisa ser preservada.';
    alternatives := jsonb_build_array('Arquivar solicitação', 'Consultar o registro especializado');
  ELSIF (deps->>'account_records')::boolean THEN
    eligible := false;
    block_reason := 'STATUS_NOT_ELIGIBLE';
    block_message := 'Esta solicitação está vinculada a correção ou confirmação de dados da conta e precisa permanecer para auditoria.';
    alternatives := jsonb_build_array('Consultar histórico da conta', 'Arquivar solicitação');
  ELSIF ((att->>'shared_preserved_count')::integer > 0) THEN
    -- public.files.request_id is NOT NULL: a shared/otherwise-referenced file cannot stay attached
    -- to a request that no longer exists, so the deletion is refused instead of orphaning files.
    eligible := false;
    block_reason := 'STATUS_NOT_ELIGIBLE';
    block_message := 'Esta solicitação possui anexos compartilhados ou usados por outro registro. Preserve os arquivos e resolva a referência antes de excluir.';
    alternatives := jsonb_build_array('Consultar anexos compartilhados', 'Arquivar solicitação');
  ELSIF (att->>'has_protected')::boolean OR ((att->>'retained_preserved_count')::integer > 0) THEN
    eligible := false;
    block_reason := 'LEGAL_RETENTION';
    alternatives := jsonb_build_array('Manter sob guarda documental', 'Arquivar solicitação');
  ELSIF actor_kind = 'client' THEN
    -- Situação A/B (contrato shared/requestDeletion.ts): the client only deletes while the request is
    -- still under their own preparation, before triage/handoff to the team.
    IF (r.status = 'aberto' OR (r.status = 'aguardando_cliente' AND r.assignee_id IS NULL))
       AND r.assignee_id IS NULL THEN
      eligible := true;
      block_reason := NULL;
    ELSE
      eligible := false;
      block_reason := 'CONTROL_WITH_TEAM';
      alternatives := jsonb_build_array('Acompanhar andamento da solicitação', 'Solicitar cancelamento junto à equipe');
    END IF;
  ELSE
    -- Situação C/D: team deletion needs the current permission and never removes a request still
    -- under the client's own preparation.
    IF (r.status = 'aguardando_cliente' AND r.assignee_id IS NULL)
       OR EXISTS (SELECT FROM private.category_intakes WHERE office_id=r.office_id AND request_id=r.id AND submitted_at IS NULL)
       OR EXISTS (SELECT FROM private.service_intakes33 WHERE office_id=r.office_id AND request_id=r.id AND submitted_at IS NULL) THEN
      eligible := false;
      block_reason := 'CONTROL_WITH_CLIENT';
      alternatives := jsonb_build_array('Aguardar envio pelo cliente');
    ELSIF r.status IN ('aberto', 'em_atendimento', 'aguardando_cliente', 'aguardando_responsavel', 'cancelado') THEN
      eligible := true;
      block_reason := NULL;
    ELSE
      eligible := false;
      block_reason := 'STATUS_NOT_ELIGIBLE';
      alternatives := jsonb_build_array('Arquivar solicitação concluída', 'Consultar histórico');
    END IF;
  END IF;

  -- Check if client portal account exists to notify on team deletion
  IF actor_kind = 'team' THEN
    SELECT cm.id INTO client_membership_id
    FROM public.memberships cm
    WHERE cm.office_id = p_office_id
      AND cm.role_code = 'client'
      AND cm.active
      AND private.finance_client_request(r, cm) IS TRUE
      AND (cm.user_id = r.created_by OR r.origin <> 'portal')
    LIMIT 1;
  END IF;

  RETURN jsonb_build_object(
    'request_id', r.id,
    'office_id', r.office_id,
    'protocol', r.protocol,
    'title', r.title,
    'category_id', (SELECT category_id FROM private.request_categories WHERE office_id=r.office_id AND request_id=r.id),
    'status', r.status,
    'version', r.version,
    'actor_kind', actor_kind,
    'eligible', eligible,
    'can_show_action', can_show,
    'block_reason', block_reason,
    'block_message', CASE
      -- a specific cause (e.g. shared attachment) keeps its own explanation
      WHEN block_reason IS NOT NULL AND block_message IS NOT NULL THEN block_message
      WHEN block_reason = 'INSUFFICIENT_PERMISSION' THEN 'Seu perfil não possui permissão para excluir solicitações definitivamente.'
      WHEN block_reason = 'CONCURRENT_OPERATION' THEN 'Já existe uma operação de exclusão em andamento para esta solicitação. Aguarde a conclusão.'
      WHEN block_reason = 'PAYMENT_CONFIRMED' THEN 'Esta solicitação possui pagamento confirmado e não pode ser excluída definitivamente.'
      WHEN block_reason = 'REFUND_LINKED' THEN 'Esta solicitação possui reembolso ou estorno vinculado e precisa permanecer no histórico financeiro.'
      WHEN block_reason = 'FORMALIZED_DOCUMENT' THEN 'Esta solicitação possui documento formalizado ou assinado e não pode ser excluída.'
      WHEN block_reason = 'LEGAL_RETENTION' THEN 'Esta solicitação está protegida por obrigação legal, retenção ou guarda documental ativa.'
      WHEN block_reason = 'CONTROL_WITH_CLIENT' THEN 'A solicitação ainda está sob controle do cliente antes do envio. Somente o titular pode excluí-la nesta etapa.'
      WHEN block_reason = 'CONTROL_WITH_TEAM' THEN 'Esta solicitação já está em atendimento pela equipe do escritório e não pode mais ser excluída pelo cliente.'
      WHEN block_reason = 'STATUS_NOT_ELIGIBLE' THEN 'A situação atual da solicitação não permite exclusão definitiva.'
      ELSE 'A situação atual da solicitação não permite exclusão definitiva.'
    END,
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

CREATE OR REPLACE FUNCTION private.request_immutable() RETURNS trigger
LANGUAGE plpgsql SECURITY INVOKER SET search_path = '' AS $$
DECLARE
  token text := nullif(current_setting('jn.request_deletion_id', true), '');
  row_data jsonb;
  v_request uuid;
BEGIN
  IF TG_OP = 'DELETE' AND token IS NOT NULL THEN
    row_data := to_jsonb(OLD);
    IF row_data->>'request_id' = token THEN
      RETURN OLD;
    END IF;
    IF TG_TABLE_NAME='checklist_history' AND EXISTS (
      SELECT FROM private.checklist_entries e JOIN private.checklist_instances i
        ON i.office_id=e.office_id AND i.id=e.instance_id
      WHERE e.office_id=(row_data->>'office_id')::uuid AND e.id=(row_data->>'entry_id')::uuid
        AND i.request_id::text=token
    ) THEN RETURN OLD; END IF;
    IF row_data ? 'file_id' AND nullif(row_data->>'file_id', '') IS NOT NULL THEN
      SELECT f.request_id INTO v_request FROM public.files f WHERE f.id = (row_data->>'file_id')::uuid;
      IF v_request IS NOT NULL AND v_request::text = token THEN
        RETURN OLD;
      END IF;
    END IF;
  END IF;
  RAISE EXCEPTION 'REQUEST_HISTORY_IMMUTABLE' USING ERRCODE = 'PT403';
END $$;

CREATE OR REPLACE FUNCTION private.templates_immutable20() RETURNS trigger
LANGUAGE plpgsql SET search_path = '' AS $$
DECLARE
  token text := nullif(current_setting('jn.request_deletion_id', true), '');
BEGIN
  IF TG_OP = 'DELETE' AND token IS NOT NULL AND (to_jsonb(OLD)->>'request_id') = token THEN
    RETURN OLD;
  END IF;
  RAISE EXCEPTION 'TEMPLATE_CONFLICT' USING ERRCODE = 'PT409';
END $$;

CREATE OR REPLACE FUNCTION private.category_intake_snapshot_guard() RETURNS trigger
LANGUAGE plpgsql SET search_path = '' AS $$
DECLARE
  token text := nullif(current_setting('jn.request_deletion_id', true), '');
BEGIN
  IF TG_OP = 'DELETE' AND token IS NOT NULL AND (to_jsonb(OLD)->>'request_id') = token THEN
    RETURN OLD;
  END IF;
  IF TG_OP = 'DELETE' OR to_jsonb(NEW) - 'submitted_at' IS DISTINCT FROM to_jsonb(OLD) - 'submitted_at'
     OR OLD.submitted_at IS NOT NULL OR NEW.submitted_at IS NULL THEN
    RAISE EXCEPTION 'REQUEST_CONFLICT' USING ERRCODE = 'PT409';
  END IF;
  RETURN NEW;
END $$;

CREATE OR REPLACE FUNCTION private.request_deletion_attachment_summary(
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
    ORDER BY id
  LOOP
    v_total := v_total + 1;
    IF f.protected OR f.legal_hold OR (f.retain_until IS NOT NULL AND f.retain_until > clock_timestamp()) THEN
      v_retained := v_retained + 1;
      v_has_protected := true;
    ELSE
      v_unreferenced := private.files_delete_unreferenced(f)
        AND NOT EXISTS (SELECT FROM private.file_deletions WHERE file_id=f.id AND completed_at IS NULL);
      IF v_unreferenced IS NOT TRUE THEN
        v_shared := v_shared + 1;
      ELSE
        SELECT i.bucket, i.object_path INTO v_bucket, v_path
        FROM private.upload_intents i
        WHERE i.office_id = p_office_id AND i.file_id = f.id
        LIMIT 1;
        IF v_bucket = 'request-attachments' AND split_part(v_path,'/',1) = f.office_id::text THEN
          v_exclusive := v_exclusive + 1;
          v_objects := v_objects || jsonb_build_array(
            jsonb_build_object(
              'file_id', f.id,
              'bucket', v_bucket,
              'object_path', v_path
            )
          );
        ELSE
          v_shared := v_shared + 1;
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

CREATE OR REPLACE FUNCTION private.request_deletion_result_json(
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
      ELSE 'Exclusão reservada. Aguardando a remoção dos anexos exclusivos no armazenamento.'
    END,
    'idempotent_replay', p_replay
  );
$$;

CREATE FUNCTION private.request_deletion_pending(p_office_id uuid, p_request_id uuid)
RETURNS boolean LANGUAGE sql SECURITY INVOKER SET search_path = '' AS $$
  SELECT EXISTS (
    SELECT FROM private.request_deletion_operations
    WHERE office_id=p_office_id AND request_id=p_request_id AND NOT db_deleted
      AND status IN ('processing', 'storage_cleanup_failed')
  );
$$;

-- A new FK write must finish before the initial request lock is released,
-- or observe the committed deletion reservation and fail.
CREATE FUNCTION private.request_deletion_reference_guard()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE
  parent_id uuid := (to_jsonb(NEW)->>TG_ARGV[0])::uuid;
  request_record public.requests;
BEGIN
  IF parent_id IS NOT NULL THEN
    IF TG_ARGV[1]='item' THEN
      SELECT r.* INTO request_record FROM public.requests r
      JOIN public.request_items i ON i.office_id=r.office_id AND i.request_id=r.id
      WHERE i.id=parent_id FOR KEY SHARE OF r;
    ELSE
      SELECT * INTO request_record FROM public.requests r WHERE r.id=parent_id FOR KEY SHARE;
    END IF;
    IF FOUND AND private.request_deletion_pending(request_record.office_id, request_record.id) THEN
      RAISE EXCEPTION 'CONCURRENT_OPERATION' USING ERRCODE = 'PT409';
    END IF;
  END IF;
  RETURN NEW;
END $$;

DO $$
DECLARE relation record;
BEGIN
  FOR relation IN
    SELECT DISTINCT k.conrelid::regclass AS tbl, a.attname,
      CASE WHEN k.confrelid='public.request_items'::regclass THEN 'item' ELSE 'request' END AS parent
    FROM pg_catalog.pg_constraint k
    CROSS JOIN LATERAL unnest(k.conkey,k.confkey) AS keys(child_column,parent_column)
    JOIN pg_catalog.pg_attribute a ON a.attrelid=k.conrelid AND a.attnum=keys.child_column
    JOIN pg_catalog.pg_attribute b ON b.attrelid=k.confrelid AND b.attnum=keys.parent_column
    WHERE k.contype='f' AND k.confrelid IN ('public.requests'::regclass,'public.request_items'::regclass)
      AND b.attname='id'
  LOOP
    EXECUTE format(
      'CREATE TRIGGER %I BEFORE INSERT OR UPDATE ON %s FOR EACH ROW EXECUTE FUNCTION private.request_deletion_reference_guard(%L,%L)',
      'request_delete_'||relation.parent||'_pending_'||relation.attname, relation.tbl, relation.attname, relation.parent
    );
  END LOOP;
END $$;
CREATE OR REPLACE FUNCTION private.request_record_guard() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
BEGIN
  IF TG_OP = 'UPDATE' AND private.request_deletion_pending(OLD.office_id, OLD.id) THEN
    RAISE EXCEPTION 'CONCURRENT_OPERATION' USING ERRCODE = 'PT409';
  END IF;
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

CREATE OR REPLACE FUNCTION private.files_deletion_reference_guard() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE fid uuid;f public.files;BEGIN
 fid:=nullif(to_jsonb(NEW)->>TG_ARGV[0],'')::uuid;IF fid IS NULL THEN RETURN NEW;END IF;
 SELECT * INTO f FROM public.files WHERE id=fid;IF f.id IS NULL THEN RETURN NEW;END IF;
 PERFORM 1 FROM public.offices WHERE id=f.office_id FOR NO KEY UPDATE;
 PERFORM 1 FROM public.requests WHERE office_id=f.office_id AND id=f.request_id FOR UPDATE;
 PERFORM 1 FROM public.files WHERE id=f.id FOR UPDATE;
 IF private.request_deletion_pending(f.office_id, f.request_id) OR EXISTS(SELECT FROM private.file_deletions WHERE file_id=f.id AND completed_at IS NULL) THEN RAISE EXCEPTION 'FILE_DELETE_PENDING' USING ERRCODE='PT409';END IF;
 RETURN NEW;
END $$;

CREATE OR REPLACE FUNCTION private.files_deletion_lease_guard() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE o jsonb;f public.files;BEGIN
 FOR o IN SELECT value FROM jsonb_array_elements(NEW.objects) LOOP
 SELECT * INTO f FROM public.files WHERE id=(o->>'file_id')::uuid;
 IF f.id IS NOT NULL THEN
 PERFORM 1 FROM public.offices WHERE id=f.office_id FOR NO KEY UPDATE;PERFORM 1 FROM public.requests WHERE office_id=f.office_id AND id=f.request_id FOR UPDATE;PERFORM 1 FROM public.files WHERE id=f.id FOR UPDATE;
 IF private.request_deletion_pending(f.office_id, f.request_id) OR EXISTS(SELECT FROM private.file_deletions WHERE file_id=f.id AND completed_at IS NULL) THEN RAISE EXCEPTION 'FILE_DELETE_PENDING' USING ERRCODE='PT409';END IF;END IF;
 END LOOP;RETURN NEW;
END $$;

CREATE OR REPLACE FUNCTION private.files_cleanup_eligible(f public.files) RETURNS boolean LANGUAGE sql STABLE SECURITY INVOKER SET search_path='' AS $$SELECT private.files_cleanup_eligible_before_individual_delete(f) AND NOT private.request_deletion_pending(f.office_id,f.request_id) AND NOT EXISTS(SELECT FROM private.file_deletions WHERE file_id=f.id AND completed_at IS NULL);$$;
CREATE OR REPLACE FUNCTION private.files_storage_allowed(p_bucket text,p_path text,p_operation text,p_metadata jsonb DEFAULT NULL) RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE i private.upload_intents;f public.files;m public.memberships;r public.requests;BEGIN
 IF p_bucket<>'request-attachments' THEN RETURN false;END IF;
 IF p_operation='delete' OR(p_operation='select' AND storage.allow_any_operation(ARRAY['object.delete','object.delete_many'])) THEN RETURN private.files_delete_storage_allowed(p_bucket,p_path);END IF;
 SELECT * INTO i FROM private.upload_intents WHERE bucket=p_bucket AND object_path=p_path;
 IF i.id IS NULL THEN RETURN false;END IF;
 IF p_operation<>'select' AND private.files_storage_allowed_before_preview_delete(p_bucket,p_path,p_operation,p_metadata) IS NOT TRUE THEN
   RETURN false;
 END IF;
 PERFORM 1 FROM public.requests WHERE office_id=i.office_id AND id=i.request_id FOR KEY SHARE;
 IF NOT FOUND OR private.request_deletion_pending(i.office_id,i.request_id) OR EXISTS(SELECT FROM private.file_deletions WHERE file_id=i.file_id AND completed_at IS NULL) THEN RETURN false;END IF;
 IF p_operation<>'select' THEN RETURN true;END IF;
 IF NOT storage.allow_any_operation(ARRAY['object.get_authenticated','object.get_authenticated_info']) THEN RETURN false;END IF;
 m:=private.files_actor(i.office_id);r:=private.files_request(i.office_id,i.request_id,m);SELECT * INTO f FROM public.files WHERE office_id=i.office_id AND id=i.file_id FOR SHARE;
 RETURN f.id IS NOT NULL AND private.specialized_file_allowed30(f) IS TRUE AND private.files_preview_ready(f) IS TRUE AND(m.role_code<>'client' OR(f.created_by=m.user_id AND NOT EXISTS(SELECT FROM private.portal_hidden_files WHERE file_id=f.id)));
EXCEPTION WHEN OTHERS THEN RETURN false;END $$;

-- An exclusive attachment can be guarded by file metadata and an upload intent,
-- including when the original upload never produced a Storage object.
CREATE FUNCTION private.request_deletion_purge(r public.requests)
RETURNS void LANGUAGE plpgsql SECURITY INVOKER SET search_path = '' AS $$
BEGIN
  -- Set transaction-local deletion token so immutability guards authorize only this exact request
  PERFORM set_config('jn.request_deletion_id', r.id::text, true);

  -- Defense in depth: the preserved-dependency map is re-evaluated inside the same transaction
  -- that already holds FOR UPDATE on the request, so a concurrent payment/document/archive cannot
  -- be created between the eligibility check and the physical removal.
  IF EXISTS (
    SELECT 1 FROM jsonb_each_text(private.request_deletion_preserved_dependencies(r.office_id, r.id)) d
    WHERE d.value = 'true'
  ) THEN
    RAISE EXCEPTION 'DELETION_BLOCKED' USING ERRCODE = 'PT422';
  END IF;

  DELETE FROM private.category_intake_files
  WHERE office_id = r.office_id AND request_id = r.id;

  DELETE FROM private.file_process_leases l
  WHERE l.office_id=r.office_id AND (
    l.target_id IN (SELECT id FROM private.upload_intents WHERE office_id=r.office_id AND request_id=r.id)
    OR EXISTS (
      SELECT FROM public.files f WHERE f.office_id=r.office_id AND f.request_id=r.id
        AND l.objects @> jsonb_build_array(jsonb_build_object('file_id', f.id))
    )
  );
  DELETE FROM private.upload_intents WHERE office_id=r.office_id AND request_id=r.id;
  DELETE FROM public.files WHERE office_id=r.office_id AND request_id=r.id;
  DELETE FROM private.checklist_history h
  USING private.checklist_entries e, private.checklist_instances i
  WHERE h.office_id=r.office_id AND h.entry_id=e.id AND e.office_id=i.office_id
    AND e.instance_id=i.id AND i.office_id=r.office_id AND i.request_id=r.id;
  DELETE FROM private.checklist_entries e USING private.checklist_instances i
  WHERE e.office_id=i.office_id AND e.instance_id=i.id AND i.office_id=r.office_id AND i.request_id=r.id;
  DELETE FROM private.checklist_instances WHERE office_id=r.office_id AND request_id=r.id;

  -- Detach non-blocking operational rows linked to this request. Every financial, documentary,
  -- retained, archived, specialized or account-related dependency was refused above; only the
  -- operational link tables below are physically removed together with the request.
  DELETE FROM private.category_intake_commands
  WHERE office_id = r.office_id AND request_id = r.id;
  DELETE FROM private.category_intakes
  WHERE office_id = r.office_id AND request_id = r.id;
  DELETE FROM private.request_preintake_events
  WHERE office_id = r.office_id AND request_id = r.id;
  DELETE FROM private.request_preintakes
  WHERE office_id = r.office_id AND request_id = r.id;
  DELETE FROM private.request_level_exceptions
  WHERE office_id = r.office_id AND request_id = r.id;
  DELETE FROM private.portal_request_commands
  WHERE office_id = r.office_id AND request_id = r.id;
  DELETE FROM private.portal_request_visibility
  WHERE office_id = r.office_id AND request_id = r.id;
  DELETE FROM private.portal_request_limits33
  WHERE office_id = r.office_id AND request_id = r.id;
  DELETE FROM private.portal_representations31
  WHERE office_id = r.office_id AND request_id = r.id;
  DELETE FROM private.service_intake_commands33
  WHERE office_id = r.office_id AND request_id = r.id;
  DELETE FROM private.staff_category_request_commands
  WHERE office_id = r.office_id AND request_id = r.id;
  DELETE FROM private.internal_notifications
  WHERE office_id = r.office_id AND request_id = r.id;
  DELETE FROM private.request_assignments
  WHERE office_id = r.office_id AND request_id = r.id;
  DELETE FROM private.request_history
  WHERE office_id = r.office_id AND request_id = r.id;
  DELETE FROM private.request_categories
  WHERE office_id = r.office_id AND request_id = r.id;
  DELETE FROM public.request_items
  WHERE office_id = r.office_id AND request_id = r.id;
  DELETE FROM public.requests
  WHERE office_id = r.office_id AND id = r.id;

  PERFORM set_config('jn.request_deletion_id', '', true);
END $$;

CREATE FUNCTION private.request_deletion_publish(op private.request_deletion_operations)
RETURNS private.request_deletion_operations LANGUAGE plpgsql SECURITY INVOKER SET search_path = '' AS $$
BEGIN
  IF op.actor_kind = 'team' AND NOT op.audit_recorded THEN
    INSERT INTO public.audit_events(office_id,actor_id,actor_kind,action,target_type,target_id,request_id,changes)
    VALUES (op.office_id,op.actor_user_id,'user','requests.deleted','request',op.request_id,op.id,
      jsonb_strip_nulls(jsonb_build_object(
        'protocol',op.protocol,'previous_status',op.previous_status,'category_id',op.category_id
      )));
    op.audit_recorded := true;
    INSERT INTO private.internal_notifications(office_id,request_id,recipient_id,event_id,kind,deleted_protocol)
    SELECT op.office_id,NULL,m.id,op.id,'request_deleted',op.protocol
    FROM public.memberships m WHERE m.office_id=op.office_id AND m.id=op.client_recipient_id
      AND m.role_code='client' AND m.active;
    op.client_notified := FOUND;
  END IF;
  UPDATE private.request_deletion_operations
  SET status='completed', db_deleted=true, storage_cleanup_completed=true,
      storage_objects_to_delete='[]', cleanup_lease_until=NULL,
      last_error_code=NULL, client_recipient_id=NULL, previous_status=NULL, category_id=NULL,
      audit_recorded=op.audit_recorded, client_notified=op.client_notified,
      updated_at=clock_timestamp()
  WHERE id=op.id RETURNING * INTO op;
  RETURN op;
END $$;

CREATE OR REPLACE FUNCTION private.request_delete_permanently(
  p_office_id uuid, p_request_id uuid, p_expected_version integer, p_expected_status text,
  p_idempotency_key text, p_confirmation_ack boolean, p_client_verification_token text DEFAULT NULL
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE
  actor uuid := private.team_require_identity();
  r public.requests;
  op private.request_deletion_operations;
  evaluation jsonb;
  objects jsonb;
BEGIN
  IF p_office_id IS NULL OR p_request_id IS NULL OR p_expected_version IS NULL OR p_expected_version < 1
     OR p_expected_status IS NULL OR p_idempotency_key IS NULL
     OR char_length(btrim(p_idempotency_key)) NOT BETWEEN 8 AND 128
     OR p_confirmation_ack IS DISTINCT FROM true THEN
    RAISE EXCEPTION 'DELETION_VALIDATION' USING ERRCODE = 'PT422';
  END IF;

  PERFORM 1 FROM public.offices WHERE id=p_office_id FOR NO KEY UPDATE;
  actor := private.team_require_identity();
  IF NOT private.team_user_active(actor,p_office_id) THEN
    RAISE EXCEPTION 'DELETION_FORBIDDEN' USING ERRCODE = 'PT403';
  END IF;

  SELECT * INTO op FROM private.request_deletion_operations
  WHERE office_id=p_office_id AND request_id=p_request_id AND idempotency_key=btrim(p_idempotency_key);
  IF FOUND THEN
    IF op.actor_user_id <> actor THEN
      RAISE EXCEPTION 'DELETION_FORBIDDEN' USING ERRCODE = 'PT403';
    END IF;
    RETURN private.request_deletion_result_json(op,true);
  END IF;

  evaluation := private.request_deletion_evaluate(p_office_id,p_request_id,true);
  IF (evaluation->>'version')::integer <> p_expected_version OR evaluation->>'status' <> p_expected_status THEN
    RAISE EXCEPTION 'DELETION_CONFLICT' USING ERRCODE = 'PT409';
  END IF;
  IF (evaluation->>'eligible')::boolean IS NOT TRUE THEN
    IF evaluation->>'block_reason' = 'INSUFFICIENT_PERMISSION' THEN
      RAISE EXCEPTION 'DELETION_FORBIDDEN' USING ERRCODE = 'PT403';
    ELSIF evaluation->>'block_reason' = 'CONCURRENT_OPERATION' THEN
      RAISE EXCEPTION 'CONCURRENT_OPERATION' USING ERRCODE = 'PT409';
    END IF;
    RAISE EXCEPTION '%',coalesce(evaluation->>'block_reason','DELETION_BLOCKED') USING ERRCODE = 'PT422';
  END IF;

  SELECT * INTO STRICT r FROM public.requests WHERE office_id=p_office_id AND id=p_request_id;
  objects := evaluation->'storage_objects';
  IF jsonb_array_length(objects) > 0 THEN
    -- Validate the complete operational dependency graph under the request lock
    -- before the Storage worker can cause an irreversible external effect.
    BEGIN
      PERFORM private.request_deletion_purge(r);
      RAISE EXCEPTION USING ERRCODE='PJN01', MESSAGE='PREFLIGHT_ROLLBACK';
    EXCEPTION
      WHEN SQLSTATE 'PJN01' THEN NULL;
      WHEN foreign_key_violation OR restrict_violation THEN
        RAISE EXCEPTION 'DELETION_BLOCKED' USING ERRCODE='PT422';
    END;
  END IF;

  INSERT INTO private.request_deletion_operations(
    office_id,request_id,protocol,actor_user_id,actor_kind,idempotency_key,status,
    storage_objects_to_delete,previous_status,category_id,client_recipient_id
  ) VALUES (
    r.office_id,r.id,r.protocol,actor,evaluation->>'actor_kind',btrim(p_idempotency_key),'processing',
    objects,r.status,(evaluation->>'category_id')::uuid,(evaluation->>'client_membership_id')::uuid
  ) RETURNING * INTO op;

  IF jsonb_array_length(objects)=0 THEN
    BEGIN
      PERFORM private.request_deletion_purge(r);
    EXCEPTION WHEN foreign_key_violation OR restrict_violation THEN
      RAISE EXCEPTION 'DELETION_BLOCKED' USING ERRCODE='PT422';
    END;
    op := private.request_deletion_publish(op);
  END IF;
  RETURN private.request_deletion_result_json(op,false);
END $$;

CREATE OR REPLACE FUNCTION private.request_deletion_claim_cleanup(
  p_office_id uuid DEFAULT NULL, p_operation_id uuid DEFAULT NULL
) RETURNS jsonb LANGUAGE sql SECURITY DEFINER SET search_path = '' AS $$
  WITH available AS (
    SELECT id FROM private.request_deletion_operations
    WHERE status IN ('processing','storage_cleanup_failed') AND NOT storage_cleanup_completed
      AND (cleanup_lease_until IS NULL OR cleanup_lease_until<=clock_timestamp())
      AND (p_office_id IS NULL OR office_id=p_office_id)
      AND (p_operation_id IS NULL OR id=p_operation_id)
    ORDER BY created_at,id LIMIT 10 FOR UPDATE SKIP LOCKED
  ), claimed AS (
    UPDATE private.request_deletion_operations op
    SET cleanup_lease_until=clock_timestamp()+interval '5 minutes'
    FROM available WHERE op.id=available.id RETURNING op.*
  )
  SELECT coalesce(jsonb_agg(jsonb_build_object(
    'operation_id',id,'office_id',office_id,'request_id',request_id,
    'protocol',protocol,'objects',storage_objects_to_delete
  ) ORDER BY created_at,id),'[]'::jsonb) FROM claimed;
$$;

CREATE OR REPLACE FUNCTION private.request_deletion_complete_cleanup(
  p_operation_id uuid,p_removed_file_ids uuid[],p_failed_count integer,p_error_code text DEFAULT NULL
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE
  op private.request_deletion_operations;
  r public.requests;
  remaining jsonb;
  office uuid;
BEGIN
  IF p_operation_id IS NULL OR p_failed_count IS NULL OR p_failed_count<0 THEN
    RAISE EXCEPTION 'DELETION_VALIDATION' USING ERRCODE = 'PT422';
  END IF;
  SELECT office_id INTO office FROM private.request_deletion_operations WHERE id=p_operation_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'DELETION_OPERATION_NOT_FOUND' USING ERRCODE='PT404'; END IF;
  PERFORM 1 FROM public.offices WHERE id=office FOR NO KEY UPDATE;
  SELECT * INTO STRICT op FROM private.request_deletion_operations WHERE id=p_operation_id FOR UPDATE;
  IF op.status='completed' THEN RETURN private.request_deletion_result_json(op,true); END IF;
  IF op.cleanup_lease_until IS NULL THEN
    RAISE EXCEPTION 'CONCURRENT_OPERATION' USING ERRCODE='PT409';
  END IF;

  -- A worker acknowledgment alone does not prove that the API removed the object.
  SELECT coalesce(jsonb_agg(obj),'[]') INTO remaining
  FROM jsonb_array_elements(op.storage_objects_to_delete) AS obj
  WHERE NOT coalesce((obj->>'file_id')::uuid=ANY(p_removed_file_ids),false)
     OR EXISTS (SELECT FROM storage.objects s WHERE s.bucket_id=obj->>'bucket' AND s.name=obj->>'object_path');

  UPDATE private.request_deletion_operations SET
    storage_objects_to_delete=remaining,
    attachments_removed=op.attachments_removed+jsonb_array_length(op.storage_objects_to_delete)-jsonb_array_length(remaining),
    status='storage_cleanup_failed', cleanup_lease_until=NULL,
    last_error_code=CASE WHEN p_failed_count>0 THEN 'STORAGE_REMOVE_FAILED' ELSE 'STORAGE_NOT_VERIFIED' END,
    updated_at=clock_timestamp()
  WHERE id=op.id RETURNING * INTO op;

  IF jsonb_array_length(remaining)>0 OR p_failed_count>0 THEN
    RETURN private.request_deletion_result_json(op,false);
  END IF;

  IF NOT op.db_deleted THEN
    SELECT * INTO STRICT r FROM public.requests WHERE office_id=op.office_id AND id=op.request_id FOR UPDATE;
    BEGIN
      PERFORM private.request_deletion_purge(r);
      op := private.request_deletion_publish(op);
    EXCEPTION WHEN foreign_key_violation OR restrict_violation OR SQLSTATE 'PT422' OR SQLSTATE 'PT409' THEN
      UPDATE private.request_deletion_operations SET last_error_code='FINALIZATION_BLOCKED'
      WHERE id=op.id RETURNING * INTO op;
    END;
  ELSE
    -- Legacy attempts may have already removed metadata and emitted their events.
    UPDATE private.request_deletion_operations SET
      status='completed', storage_cleanup_completed=true, last_error_code=NULL
    WHERE id=op.id RETURNING * INTO op;
  END IF;
  RETURN private.request_deletion_result_json(op,false);
END $$;

REVOKE ALL ON FUNCTION
  private.request_deletion_preserved_dependencies(uuid,uuid),
  private.request_deletion_pending(uuid,uuid), private.request_deletion_reference_guard(),
  private.request_deletion_purge(public.requests), private.request_deletion_publish(private.request_deletion_operations)
FROM PUBLIC,anon,authenticated,service_role;

NOTIFY pgrst,'reload schema';

CREATE FUNCTION private.request_deletion_cleanup_authorize(p_office_id uuid,p_operation_id uuid)
RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE
  actor uuid := private.team_require_identity();
BEGIN
  RETURN EXISTS (
    SELECT FROM private.request_deletion_operations op
    JOIN public.memberships m ON m.office_id=op.office_id AND m.user_id=actor AND m.active
    WHERE op.office_id=p_office_id AND op.id=p_operation_id AND op.actor_user_id=actor
      AND private.team_user_active(actor,op.office_id)
      AND (op.actor_kind='client' AND m.role_code='client'
           OR op.actor_kind='team' AND m.role_code<>'client'
              AND private.current_permissions(op.office_id) @> ARRAY['requests.delete'])
  );
END $$;

CREATE FUNCTION public.request_deletion_cleanup_authorize(p_office_id uuid,p_operation_id uuid)
RETURNS boolean LANGUAGE sql SECURITY INVOKER SET search_path = '' AS $$
  SELECT private.request_deletion_cleanup_authorize(p_office_id,p_operation_id);
$$;

REVOKE ALL ON FUNCTION private.request_deletion_cleanup_authorize(uuid,uuid),public.request_deletion_cleanup_authorize(uuid,uuid)
FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION private.request_deletion_cleanup_authorize(uuid,uuid),public.request_deletion_cleanup_authorize(uuid,uuid)
TO authenticated;

-- The audit readers and exports retain their existing authorization and use
-- this allowlist when projecting audit changes.
ALTER FUNCTION private.safe_audit_changes(jsonb) RENAME TO safe_audit_changes_before_request_delete;
CREATE FUNCTION private.safe_audit_changes(p_changes jsonb) RETURNS jsonb
LANGUAGE sql IMMUTABLE SECURITY INVOKER SET search_path = '' AS $$
  SELECT private.safe_audit_changes_before_request_delete(p_changes) || jsonb_strip_nulls(jsonb_build_object(
    'protocol', CASE WHEN p_changes->>'protocol' ~ '^AT-[0-9]{6,18}$' THEN p_changes->>'protocol' END,
    'previous_status', CASE WHEN p_changes->>'previous_status' IN (
      'aberto','em_atendimento','aguardando_cliente','aguardando_responsavel','concluido','cancelado'
    ) THEN p_changes->>'previous_status' END,
    'category_id', CASE WHEN p_changes->>'category_id' ~ '^[0-9a-f-]{36}$' THEN p_changes->>'category_id' END
  ));
$$;
REVOKE ALL ON FUNCTION private.safe_audit_changes(jsonb),private.safe_audit_changes_before_request_delete(jsonb)
FROM PUBLIC,anon,authenticated,service_role;

NOTIFY pgrst,'reload schema';
