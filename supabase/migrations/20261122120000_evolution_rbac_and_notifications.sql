-- Evolution RBAC & Notifications (Etapas 1-6)
-- Additive migration: never modifies historical migrations or relaxes existing RLS/ACL.

-- 1. Seed the 4 new RBAC permissions idempotently (owner-granted by default; admin configurable via team management)
INSERT INTO public.permissions(code, name) VALUES
  ('requests.delete', 'Excluir solicitações definitivamente'),
  ('payments.manual.approve', 'Aprovar recebimentos manuais no caixa'),
  ('payments.providers.manage', 'Configurar bancos, Pix, cartões e maquininhas'),
  ('charges.discount.approve', 'Aprovar descontos comerciais em cobranças')
ON CONFLICT (code) DO NOTHING;

INSERT INTO public.role_permissions(role_code, permission_code)
SELECT 'owner', code
FROM public.permissions
WHERE code IN (
  'requests.delete',
  'payments.manual.approve',
  'payments.providers.manage',
  'charges.discount.approve'
)
ON CONFLICT DO NOTHING;

-- 2. Extend private.internal_notifications to support request_deleted (request_id NULL after hard delete)
--    and financial approval notifications (with approval_id + approval_summary).
ALTER TABLE private.internal_notifications ALTER COLUMN request_id DROP NOT NULL;
ALTER TABLE private.internal_notifications ADD COLUMN IF NOT EXISTS deleted_protocol text;
ALTER TABLE private.internal_notifications ADD COLUMN IF NOT EXISTS approval_id uuid;
ALTER TABLE private.internal_notifications ADD COLUMN IF NOT EXISTS approval_summary text;

DO $m$
DECLARE
  body text;
BEGIN
  SELECT pg_get_constraintdef(oid) INTO body
  FROM pg_constraint
  WHERE conrelid = 'private.internal_notifications'::regclass
    AND conname = 'internal_notifications_kind_check';

  IF body IS NOT NULL AND strpos(body, 'request_deleted') = 0 THEN
    body := replace(
      body,
      '''handoff''::text',
      '''request_deleted''::text,''payment_approval_requested''::text,''payment_approval_decided''::text,''discount_approval_requested''::text,''discount_approval_decided''::text,''handoff''::text'
    );
    ALTER TABLE private.internal_notifications DROP CONSTRAINT internal_notifications_kind_check;
    EXECUTE 'ALTER TABLE private.internal_notifications ADD CONSTRAINT internal_notifications_kind_check ' || body;
  END IF;
END $m$;

ALTER TABLE private.internal_notifications DROP CONSTRAINT IF EXISTS internal_notifications_deleted_req_check;
ALTER TABLE private.internal_notifications ADD CONSTRAINT internal_notifications_deleted_req_check CHECK (
  (kind = 'request_deleted' AND request_id IS NULL AND deleted_protocol IS NOT NULL AND char_length(btrim(deleted_protocol)) BETWEEN 3 AND 60)
  OR (kind <> 'request_deleted' AND request_id IS NOT NULL)
);

CREATE INDEX IF NOT EXISTS internal_notifications_approval_idx
  ON private.internal_notifications(office_id, approval_id)
  WHERE approval_id IS NOT NULL;

-- 3. Extend private.notification_visible to include the 5 new notification kinds safely
ALTER FUNCTION private.notification_visible(private.internal_notifications, public.requests, public.memberships)
  RENAME TO notification_visible_before_evolution;

CREATE FUNCTION private.notification_visible(
  n private.internal_notifications,
  r public.requests,
  m public.memberships
) RETURNS boolean
LANGUAGE sql STABLE SECURITY INVOKER SET search_path = '' AS $$
  SELECT CASE
    WHEN n.kind = 'request_deleted' THEN
      n.office_id = m.office_id
      AND n.recipient_id = m.id
      AND m.role_code = 'client'
    WHEN n.kind IN (
      'payment_approval_requested',
      'payment_approval_decided',
      'discount_approval_requested',
      'discount_approval_decided'
    ) THEN
      n.office_id = m.office_id
      AND n.recipient_id = m.id
      AND m.role_code <> 'client'
      AND (
        private.current_permissions(m.office_id) && ARRAY[
          'cash.read',
          'cash.open',
          'charges.read',
          'payments.manual.approve',
          'charges.discount.approve'
        ]
      )
    ELSE
      r.id IS NOT NULL AND private.notification_visible_before_evolution(n, r, m)
  END;
$$;

-- 4. Update notifications_page, notifications_summary, and notifications_read to:
--    - accept the 5 new kinds in p_kind filter;
--    - include request_deleted rows (request_id IS NULL, can_open = false, deleted_protocol);
--    - include financial approval rows with approval_id and approval_summary.
ALTER FUNCTION private.notifications_page(uuid, text, text, text, integer, integer)
  RENAME TO notifications_page_before_evolution;

CREATE FUNCTION private.notifications_page(
  p_office_id uuid,
  p_query text,
  p_read text,
  p_kind text,
  p_page integer,
  p_size integer
) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE
  m public.memberships;
  caps text[];
  q text;
  evolution_kinds text[] := ARRAY[
    'request_deleted',
    'payment_approval_requested',
    'payment_approval_decided',
    'discount_approval_requested',
    'discount_approval_decided'
  ];
  legacy jsonb;
  legacy_items jsonb;
  evo_items jsonb;
  combined jsonb;
  total_count integer;
  unread_evo integer;
  unread_total integer;
BEGIN
  m := private.notifications_actor(p_office_id);
  caps := private.current_permissions(p_office_id);

  IF p_query IS NULL OR char_length(p_query) > 120 OR p_query ~ '[[:cntrl:]]'
     OR p_read IS NULL OR p_read NOT IN ('all', 'unread', 'read')
     OR p_page IS NULL OR p_page NOT BETWEEN 1 AND 100000
     OR p_size IS NULL OR p_size NOT IN (3, 5) THEN
    RAISE EXCEPTION 'REQUEST_VALIDATION' USING ERRCODE = 'PT422';
  END IF;

  q := lower(btrim(p_query));

  -- Count unread evolution notifications visible to this member
  SELECT count(*)::integer INTO unread_evo
  FROM private.internal_notifications n
  LEFT JOIN public.requests r ON r.office_id = n.office_id AND r.id = n.request_id
  WHERE n.office_id = p_office_id
    AND n.recipient_id = m.id
    AND n.read_at IS NULL
    AND n.kind = ANY(evolution_kinds)
    AND private.notification_visible(n, r, m);

  -- Filtered exclusively on one of the 5 evolution kinds
  IF p_kind = ANY(evolution_kinds) THEN
    WITH own AS (
      SELECT n.*,
             r.protocol AS req_protocol,
             coalesce(r.protocol, n.deleted_protocol) AS display_protocol
      FROM private.internal_notifications n
      LEFT JOIN public.requests r ON r.office_id = n.office_id AND r.id = n.request_id
      WHERE n.office_id = p_office_id
        AND n.recipient_id = m.id
        AND n.kind = p_kind
        AND private.notification_visible(n, r, m)
    ), filtered AS (
      SELECT *
      FROM own
      WHERE (p_read = 'all' OR (p_read = 'unread' AND read_at IS NULL) OR (p_read = 'read' AND read_at IS NOT NULL))
        AND (q = '' OR strpos(lower(coalesce(display_protocol, '') || ' ' || coalesce(approval_summary, '')), q) > 0)
    ), paged AS (
      SELECT * FROM filtered ORDER BY created_at DESC, id DESC LIMIT p_size OFFSET (p_page - 1) * p_size
    )
    SELECT jsonb_build_object(
      'total', (SELECT count(*) FROM filtered),
      'unread', coalesce((private.notifications_summary(p_office_id)->>'unread')::integer, unread_evo),
      'page', p_page,
      'page_size', p_size,
      'items', coalesce((
        SELECT jsonb_agg(
          jsonb_build_object(
            'id', id,
            'kind', kind,
            'created_at', created_at,
            'read_at', read_at,
            'can_open', CASE WHEN kind = 'request_deleted' THEN false ELSE request_id IS NOT NULL END,
            'request_id', CASE WHEN kind = 'request_deleted' THEN NULL ELSE request_id END,
            'protocol', display_protocol,
            'deleted_protocol', deleted_protocol,
            'approval_id', approval_id,
            'approval_summary', approval_summary,
            'attendant_name', NULL
          ) ORDER BY created_at DESC, id DESC
        )
        FROM paged
      ), '[]'::jsonb)
    ) INTO combined;
    RETURN combined;
  END IF;

  -- Legacy specific kind filter delegates directly to existing page logic
  IF p_kind <> 'all' THEN
    legacy := private.notifications_page_before_evolution(p_office_id, p_query, p_read, p_kind, p_page, p_size);
    unread_total := coalesce((legacy->>'unread')::integer, 0) + unread_evo;
    RETURN jsonb_set(legacy, '{unread}', to_jsonb(unread_total));
  END IF;

  -- p_kind = 'all': merge legacy and evolution notifications ordered by created_at DESC, id DESC
  legacy := private.notifications_page_before_evolution(p_office_id, p_query, p_read, 'all', 1, 5);
  SELECT coalesce(jsonb_agg(item), '[]'::jsonb) INTO evo_items
  FROM (
    SELECT jsonb_build_object(
      'id', n.id,
      'kind', n.kind,
      'created_at', n.created_at,
      'read_at', n.read_at,
      'can_open', CASE WHEN n.kind = 'request_deleted' THEN false ELSE n.request_id IS NOT NULL END,
      'request_id', CASE WHEN n.kind = 'request_deleted' THEN NULL ELSE n.request_id END,
      'protocol', coalesce(r.protocol, n.deleted_protocol),
      'deleted_protocol', n.deleted_protocol,
      'approval_id', n.approval_id,
      'approval_summary', n.approval_summary,
      'attendant_name', NULL
    ) AS item
    FROM private.internal_notifications n
    LEFT JOIN public.requests r ON r.office_id = n.office_id AND r.id = n.request_id
    WHERE n.office_id = p_office_id
      AND n.recipient_id = m.id
      AND n.kind = ANY(evolution_kinds)
      AND private.notification_visible(n, r, m)
      AND (p_read = 'all' OR (p_read = 'unread' AND n.read_at IS NULL) OR (p_read = 'read' AND n.read_at IS NOT NULL))
      AND (q = '' OR strpos(lower(coalesce(r.protocol, n.deleted_protocol, '') || ' ' || coalesce(n.approval_summary, '')), q) > 0)
    ORDER BY n.created_at DESC, n.id DESC
    LIMIT p_page * p_size
  ) s;

  IF jsonb_array_length(evo_items) = 0 THEN
    legacy := private.notifications_page_before_evolution(p_office_id, p_query, p_read, 'all', p_page, p_size);
    unread_total := coalesce((legacy->>'unread')::integer, 0) + unread_evo;
    RETURN jsonb_set(legacy, '{unread}', to_jsonb(unread_total));
  END IF;

  -- Fetch enough legacy items to accurately page merged results
  legacy := private.notifications_page_before_evolution(p_office_id, p_query, p_read, 'all', p_page, p_size);
  legacy_items := coalesce(legacy->'items', '[]'::jsonb);

  SELECT count(*)::integer INTO total_count
  FROM private.internal_notifications n
  LEFT JOIN public.requests r ON r.office_id = n.office_id AND r.id = n.request_id
  WHERE n.office_id = p_office_id
    AND n.recipient_id = m.id
    AND n.kind = ANY(evolution_kinds)
    AND private.notification_visible(n, r, m)
    AND (p_read = 'all' OR (p_read = 'unread' AND n.read_at IS NULL) OR (p_read = 'read' AND n.read_at IS NOT NULL))
    AND (q = '' OR strpos(lower(coalesce(r.protocol, n.deleted_protocol, '') || ' ' || coalesce(n.approval_summary, '')), q) > 0);

  WITH merged AS (
    SELECT elem FROM jsonb_array_elements(legacy_items) elem
    UNION ALL
    SELECT elem FROM jsonb_array_elements(evo_items) elem
  ), ordered AS (
    SELECT elem
    FROM merged
    ORDER BY (elem->>'created_at')::timestamptz DESC, (elem->>'id')::uuid DESC
    LIMIT p_size
  )
  SELECT jsonb_build_object(
    'total', coalesce((legacy->>'total')::integer, 0) + total_count,
    'unread', coalesce((legacy->>'unread')::integer, 0) + unread_evo,
    'page', p_page,
    'page_size', p_size,
    'items', coalesce((SELECT jsonb_agg(elem) FROM ordered), '[]'::jsonb)
  ) INTO combined;

  RETURN combined;
END $$;

ALTER FUNCTION private.notifications_summary(uuid)
  RENAME TO notifications_summary_before_evolution;

CREATE FUNCTION private.notifications_summary(p_office_id uuid)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE
  m public.memberships;
  base jsonb;
  extra integer;
BEGIN
  m := private.notifications_actor(p_office_id);
  base := private.notifications_summary_before_evolution(p_office_id);
  SELECT count(*)::integer INTO extra
  FROM private.internal_notifications n
  LEFT JOIN public.requests r ON r.office_id = n.office_id AND r.id = n.request_id
  WHERE n.office_id = p_office_id
    AND n.recipient_id = m.id
    AND n.read_at IS NULL
    AND n.kind IN (
      'request_deleted',
      'payment_approval_requested',
      'payment_approval_decided',
      'discount_approval_requested',
      'discount_approval_decided'
    )
    AND private.notification_visible(n, r, m);
  RETURN jsonb_build_object('unread', coalesce((base->>'unread')::integer, 0) + extra);
END $$;

ALTER FUNCTION private.notifications_read(uuid, uuid)
  RENAME TO notifications_read_before_evolution;

CREATE FUNCTION private.notifications_read(p_office_id uuid, p_id uuid)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE
  m public.memberships;
  n private.internal_notifications;
  r public.requests;
BEGIN
  m := private.notifications_actor(p_office_id, true);
  IF p_id IS NULL THEN
    RAISE EXCEPTION 'REQUEST_VALIDATION' USING ERRCODE = 'PT422';
  END IF;
  SELECT * INTO n
  FROM private.internal_notifications
  WHERE office_id = p_office_id AND id = p_id AND recipient_id = m.id
  FOR UPDATE;
  IF n.id IS NOT NULL AND n.kind IN (
    'request_deleted',
    'payment_approval_requested',
    'payment_approval_decided',
    'discount_approval_requested',
    'discount_approval_decided'
  ) THEN
    IF n.request_id IS NOT NULL THEN
      SELECT * INTO r FROM public.requests WHERE office_id = p_office_id AND id = n.request_id;
    END IF;
    IF private.notification_visible(n, r, m) IS NOT TRUE THEN
      RAISE EXCEPTION 'REQUEST_NOT_FOUND' USING ERRCODE = 'PT404';
    END IF;
    UPDATE private.internal_notifications
       SET read_at = coalesce(read_at, clock_timestamp())
     WHERE office_id = p_office_id AND id = n.id;
    RETURN jsonb_build_object('id', n.id, 'read', true);
  END IF;
  RETURN private.notifications_read_before_evolution(p_office_id, p_id);
END $$;

REVOKE ALL ON FUNCTION
  private.notification_visible_before_evolution(private.internal_notifications, public.requests, public.memberships),
  private.notification_visible(private.internal_notifications, public.requests, public.memberships),
  private.notifications_page_before_evolution(uuid, text, text, text, integer, integer),
  private.notifications_page(uuid, text, text, text, integer, integer),
  private.notifications_summary_before_evolution(uuid),
  private.notifications_summary(uuid),
  private.notifications_read_before_evolution(uuid, uuid),
  private.notifications_read(uuid, uuid)
FROM PUBLIC, anon, authenticated, service_role;

GRANT EXECUTE ON FUNCTION
  private.notifications_page(uuid, text, text, text, integer, integer),
  private.notifications_summary(uuid),
  private.notifications_read(uuid, uuid)
TO authenticated;

NOTIFY pgrst, 'reload schema';
