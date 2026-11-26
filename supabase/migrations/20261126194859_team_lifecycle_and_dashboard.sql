ALTER TABLE private.team_invitations ADD COLUMN archived_at timestamptz;
CREATE TABLE private.team_invite_credentials (
 user_id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
 invitation_id uuid NOT NULL REFERENCES private.team_invitations(id),
 issued_at timestamptz NOT NULL
);
CREATE INDEX team_invite_credentials_invitation ON private.team_invite_credentials(invitation_id);
CREATE TABLE private.team_departures (
 membership_id uuid PRIMARY KEY,
 office_id uuid NOT NULL,
 role_code text NOT NULL CHECK(role_code IN('owner','admin','employee')),
 departed_at timestamptz NOT NULL DEFAULT clock_timestamp(),
 archived_requests integer NOT NULL DEFAULT 0,
 returned_requests integer NOT NULL DEFAULT 0,
 delivery_email text,
 notice_sent_at timestamptz,
 notice_claimed_at timestamptz,
 notice_first_attempt_at timestamptz,
 FOREIGN KEY(office_id,membership_id) REFERENCES public.memberships(office_id,id)
);
CREATE INDEX team_departures_page ON private.team_departures(office_id,departed_at DESC,membership_id);
ALTER TABLE private.team_invite_credentials ENABLE ROW LEVEL SECURITY;
ALTER TABLE private.team_departures ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON private.team_invite_credentials,private.team_departures FROM PUBLIC,anon,authenticated,service_role;

-- GoTrue rotates invited_at when it sends a new invite. The delivery lease binds
-- that specific issue, independently of user-editable metadata or URL parameters.
CREATE FUNCTION private.team_bind_auth_invitation() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE found_invite uuid; candidates integer;
BEGIN
 IF OLD.email_confirmed_at IS NULL AND NEW.email_confirmed_at IS NOT NULL
    AND EXISTS(SELECT FROM private.team_invite_credentials c WHERE c.user_id=OLD.id) THEN
  IF NOT EXISTS(SELECT FROM private.team_invite_credentials c JOIN private.team_invitations i ON i.id=c.invitation_id
   WHERE c.user_id=OLD.id AND c.issued_at=OLD.invited_at AND i.status='pending'
    AND i.archived_at IS NULL AND i.expires_at>clock_timestamp() AND i.email=lower(OLD.email)
    AND private.team_invitation_authority(i.id)) THEN
   RAISE EXCEPTION 'INVITATION_INVALID' USING ERRCODE='PT410';
  END IF;
 END IF;
 IF NEW.invited_at IS NOT NULL AND NEW.invited_at IS DISTINCT FROM OLD.invited_at
    AND OLD.email_confirmed_at IS NULL AND NEW.email_confirmed_at IS NULL
    AND coalesce(OLD.encrypted_password,'')=''
    AND NOT EXISTS(SELECT FROM public.memberships m WHERE m.user_id=NEW.id) THEN
  SELECT count(*),(array_agg(i.id))[1] INTO candidates,found_invite FROM private.team_invitations i
  WHERE i.email=lower(NEW.email) AND i.status='pending' AND i.archived_at IS NULL AND i.delivery_status='sending'
   AND i.last_delivery_at<=NEW.invited_at AND i.delivery_lease_until>=NEW.invited_at AND i.expires_at>NEW.invited_at;
  IF candidates=1 THEN
   INSERT INTO private.team_invite_credentials(user_id,invitation_id,issued_at) VALUES(NEW.id,found_invite,NEW.invited_at)
   ON CONFLICT(user_id) DO UPDATE SET invitation_id=EXCLUDED.invitation_id,issued_at=EXCLUDED.issued_at;
  ELSIF candidates>1 OR EXISTS(SELECT FROM private.team_invite_credentials WHERE user_id=NEW.id) THEN
   RAISE EXCEPTION 'INVITATION_INVALID' USING ERRCODE='PT410';
  END IF;
 END IF;
 RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION private.team_bind_auth_invitation() FROM PUBLIC,anon,authenticated,service_role;
CREATE TRIGGER team_invitation_auth_deadline BEFORE UPDATE OF invited_at,email_confirmed_at ON auth.users
 FOR EACH ROW EXECUTE FUNCTION private.team_bind_auth_invitation();

-- Bind pre-existing placeholders only when a recorded delivery and its issue
-- timestamp identify a single invitation. Generic Auth sign-ups are unaffected.
INSERT INTO private.team_invite_credentials(user_id,invitation_id,issued_at)
SELECT u.id,(array_agg(i.id))[1],u.invited_at
FROM auth.users u JOIN private.team_invitations i ON i.email=lower(u.email)
 AND i.last_delivery_at<=u.invited_at AND u.invited_at<=i.last_delivery_at+interval '60 seconds'
 AND u.invited_at<i.expires_at
WHERE u.email_confirmed_at IS NULL AND u.deleted_at IS NULL AND coalesce(u.encrypted_password,'')=''
 AND NOT EXISTS(SELECT FROM public.profiles p WHERE p.id=u.id)
 AND NOT EXISTS(SELECT FROM public.memberships m WHERE m.user_id=u.id)
 AND NOT EXISTS(SELECT FROM auth.sessions s WHERE s.user_id=u.id)
GROUP BY u.id,u.invited_at HAVING count(*)=1;


-- A single live delivery per email avoids binding a provider token to another office.
DO $$
DECLARE source text; updated text;
BEGIN
 source:=pg_get_functiondef('private.team_claim_delivery(uuid,uuid,uuid)'::regprocedure);
 updated:=replace(source,' IF invitation.last_delivery_at>', $new$
 PERFORM pg_advisory_xact_lock(hashtextextended(invitation.email,938102));
 IF EXISTS(SELECT FROM private.team_invitations other WHERE other.email=invitation.email AND other.id<>invitation.id
   AND other.status='pending' AND other.delivery_status='sending' AND other.delivery_lease_until>clock_timestamp())
 THEN RAISE EXCEPTION 'TEAM_RATE_LIMIT' USING ERRCODE='PT429'; END IF;
 IF invitation.last_delivery_at>$new$);
 IF updated=source THEN RAISE EXCEPTION 'Changed delivery contract'; END IF;
 EXECUTE updated;
END $$;

-- Delete only system-provisioned placeholders with no confirmed identity or business history.
CREATE FUNCTION private.team_purge_expired_auth() RETURNS integer
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE candidate uuid; removed integer:=0;
BEGIN
 UPDATE private.team_departures SET delivery_email=NULL
 WHERE delivery_email IS NOT NULL AND departed_at<=clock_timestamp()-interval '30 days';
 FOR candidate IN
  SELECT u.id FROM auth.users u JOIN private.team_invite_credentials c ON c.user_id=u.id AND c.issued_at=u.invited_at
  JOIN private.team_invitations i ON i.id=c.invitation_id
  WHERE i.status<>'accepted' AND (i.expires_at<=clock_timestamp() OR i.status IN('revoked','blocked'))
   AND u.email_confirmed_at IS NULL AND u.deleted_at IS NULL AND coalesce(u.encrypted_password,'')=''
   AND NOT EXISTS(SELECT FROM public.profiles p WHERE p.id=u.id)
   AND NOT EXISTS(SELECT FROM public.memberships m WHERE m.user_id=u.id)
   AND NOT EXISTS(SELECT FROM auth.sessions s WHERE s.user_id=u.id)
   AND NOT EXISTS(SELECT FROM private.team_invitations active WHERE active.email=i.email AND active.status='pending'
     AND active.expires_at>clock_timestamp())
  ORDER BY i.expires_at LIMIT 100 FOR UPDATE OF u SKIP LOCKED
 LOOP
  BEGIN
   DELETE FROM auth.users WHERE id=candidate;
   removed:=removed+1;
  EXCEPTION WHEN foreign_key_violation THEN
   -- A new reference disqualifies the placeholder. Retain it and its deadline guard.
   CONTINUE;
  END;
 END LOOP;
 RETURN removed;
END $$;
REVOKE ALL ON FUNCTION private.team_purge_expired_auth() FROM PUBLIC,anon,authenticated,service_role;
DO $$ BEGIN
 IF EXISTS(SELECT FROM pg_extension WHERE extname='pg_cron') THEN
  EXECUTE $job$SELECT cron.schedule('jn-team-expired-invitations','*/10 * * * *','SELECT private.team_purge_expired_auth()')$job$;
 END IF;
END $$;

CREATE FUNCTION private.team_archive_invitation(o uuid,i uuid) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE actor jsonb; invite private.team_invitations;
BEGIN
 actor:=private.team_actor(o,true);
 SELECT * INTO invite FROM private.team_invitations x WHERE x.office_id=o AND x.id=i FOR UPDATE;
 IF invite.id IS NULL OR NOT actor->'allowed_roles' ? invite.role_code THEN RAISE EXCEPTION 'TEAM_FORBIDDEN' USING ERRCODE='PT403'; END IF;
 IF invite.status<>'accepted' THEN RAISE EXCEPTION 'TEAM_CONFLICT' USING ERRCODE='PT409'; END IF;
 UPDATE private.team_invitations SET archived_at=clock_timestamp() WHERE id=i AND archived_at IS NULL;
 IF FOUND THEN
  PERFORM private.team_audit(o,(actor->>'user_id')::uuid,'archives.archived','invitation',i,gen_random_uuid(),'{}');
 END IF;
 RETURN jsonb_build_object('ok',true);
END $$;

CREATE FUNCTION private.team_depart_member(o uuid,member uuid) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE actor jsonb; operator_id uuid; target public.memberships; address text; whole_account boolean; closed_count integer; return_count integer; prior private.team_departures;
BEGIN
 actor:=private.team_actor(o,true);
 operator_id:=(actor->>'user_id')::uuid;
 IF actor->>'role_code'<>'owner' THEN RAISE EXCEPTION 'TEAM_FORBIDDEN' USING ERRCODE='PT403'; END IF;
 SELECT * INTO target FROM public.memberships WHERE office_id=o AND id=member;
 IF target.id IS NULL OR target.role_code='client' THEN RAISE EXCEPTION 'TEAM_FORBIDDEN' USING ERRCODE='PT403'; END IF;
 IF target.user_id=operator_id THEN RAISE EXCEPTION 'SELF_CHANGE' USING ERRCODE='PT403'; END IF;
 PERFORM 1 FROM public.profiles WHERE id=target.user_id FOR UPDATE;
 SELECT * INTO STRICT target FROM public.memberships WHERE office_id=o AND id=member FOR UPDATE;
 PERFORM private.team_guard_member(actor,target,target.role_code,false);
 SELECT * INTO prior FROM private.team_departures WHERE membership_id=member;
 IF FOUND THEN RETURN jsonb_build_object('ok',true,'archived_requests',prior.archived_requests,
   'returned_requests',prior.returned_requests); END IF;
 IF EXISTS(SELECT FROM private.cash_sessions cs WHERE cs.office_id=o AND cs.operator_id=target.user_id AND cs.status='open') THEN
  RAISE EXCEPTION 'TEAM_OPEN_CASH' USING ERRCODE='PT409';
 END IF;
 SELECT lower(email) INTO address FROM auth.users WHERE id=target.user_id;
 whole_account:=NOT EXISTS(SELECT FROM public.memberships m WHERE m.user_id=target.user_id AND m.id<>member AND m.active);
 INSERT INTO private.team_departures(membership_id,office_id,role_code,delivery_email) VALUES(member,o,target.role_code,address);
 UPDATE public.memberships SET active=false WHERE id=member;
 DELETE FROM private.team_member_permissions WHERE membership_id=member;
 DELETE FROM private.team_member_identities WHERE membership_id=member;
 DELETE FROM private.member_category_access WHERE membership_id=member AND office_id=o;
 UPDATE private.team_delegations SET revoked_at=clock_timestamp() WHERE membership_id=member AND revoked_at IS NULL;
 UPDATE private.team_invitations SET status='blocked',verified_until=NULL,delivery_lease_id=NULL,delivery_lease_until=NULL
 WHERE office_id=o AND status='pending' AND expires_at>clock_timestamp() AND (email=address OR inviter_membership_id=member);
 INSERT INTO private.request_archives(office_id,request_id,archived_by,reason)
 SELECT o,r.id,operator_id,'Arquivamento por desligamento de integrante da equipe'
 FROM public.requests r WHERE r.office_id=o AND r.status IN('concluido','cancelado')
 AND (r.created_by=target.user_id OR r.assignee_id=member OR EXISTS(
    SELECT FROM private.request_assignments a WHERE a.office_id=o AND a.request_id=r.id AND a.membership_id=member)
   OR EXISTS(SELECT FROM private.request_history h WHERE h.office_id=o AND h.request_id=r.id AND h.actor_id=target.user_id))
 ON CONFLICT DO NOTHING;
 GET DIAGNOSTICS closed_count=ROW_COUNT;
 WITH returned AS (
  UPDATE public.requests r SET assignee_id=NULL,version=r.version+1,updated_at=clock_timestamp()
   WHERE r.office_id=o AND r.assignee_id=member AND r.status NOT IN('concluido','cancelado')
   RETURNING r.id,r.status
 ), ended AS (
  UPDATE private.request_assignments a SET ended_at=clock_timestamp()
  FROM returned r WHERE a.office_id=o AND a.request_id=r.id AND a.ended_at IS NULL
 )
 INSERT INTO private.request_history(office_id,request_id,kind,actor_id,reason,from_status,to_status,from_assignee)
 SELECT o,id,'transfer',operator_id,'Retorno à fila por desligamento de integrante',status,status,member FROM returned;
 GET DIAGNOSTICS return_count=ROW_COUNT;
 IF whole_account THEN
  INSERT INTO private.account_closures(user_id,reason) VALUES(target.user_id,'other') ON CONFLICT DO NOTHING;
  UPDATE public.profiles SET active=false,display_name=NULL WHERE id=target.user_id;
  DELETE FROM private.session_activities WHERE user_id=target.user_id;
  DELETE FROM private.account_email_intents WHERE user_id=target.user_id AND confirmed_at IS NULL;
 END IF;
 UPDATE private.team_departures SET archived_requests=closed_count,returned_requests=return_count WHERE membership_id=member;
 PERFORM private.emit_business_event(o,'account.closed','membership',member,gen_random_uuid(),'{}');
 RETURN jsonb_build_object('ok',true,'archived_requests',closed_count,'returned_requests',return_count);
END $$;
CREATE OR REPLACE FUNCTION private.team_dashboard(p_office_id uuid, p_kind text, p_page integer, p_query text, p_status text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE actor jsonb; members_count integer; invitations_count integer; total_count integer; items jsonb; scoped_roles text[];
BEGIN
 actor:=private.team_actor(p_office_id);
 IF p_kind IS NULL OR p_kind NOT IN ('members','invitations') OR p_page IS NULL OR p_page<1 OR p_page>100000
  OR p_query IS NULL OR length(p_query)>120 OR p_status IS NULL
  OR (p_kind='members' AND p_status NOT IN ('all','active','inactive'))
  OR (p_kind='invitations' AND p_status NOT IN ('all','pending','accepted','revoked','expired','blocked')) THEN
  RAISE EXCEPTION 'TEAM_VALIDATION' USING ERRCODE='PT422'; END IF;
 SELECT array_agg(value) INTO scoped_roles FROM jsonb_array_elements_text(actor->'allowed_roles');
 SELECT count(*) INTO members_count FROM public.memberships m WHERE m.office_id=p_office_id AND m.role_code=ANY(scoped_roles)
  AND NOT EXISTS(SELECT FROM private.team_departures x WHERE x.membership_id=m.id);
 SELECT count(*) INTO invitations_count FROM private.team_invitations i WHERE i.office_id=p_office_id AND i.role_code=ANY(scoped_roles)
  AND i.archived_at IS NULL AND (i.status<>'pending' OR i.expires_at>clock_timestamp());
 IF p_kind='members' THEN
  WITH roster AS MATERIALIZED (
   SELECT m.id,m.created_at
   FROM public.memberships m JOIN public.profiles p ON p.id=m.user_id JOIN auth.users u ON u.id=m.user_id
   LEFT JOIN private.team_member_identities identity ON identity.membership_id=m.id
   WHERE m.office_id=p_office_id AND m.role_code=ANY(scoped_roles)
    AND (p_status='all' OR (p_status='active' AND m.active) OR (p_status='inactive' AND NOT m.active))
    AND (p_query='' OR coalesce(identity.full_name,p.display_name,'') ILIKE '%'||p_query||'%' OR u.email ILIKE '%'||p_query||'%')
    AND NOT EXISTS(SELECT FROM private.team_departures x WHERE x.membership_id=m.id)
  ), page_ids AS (
   SELECT id FROM roster ORDER BY created_at,id LIMIT 5 OFFSET (p_page-1)*5
  ), paged AS (
   SELECT m.id,m.user_id,coalesce(identity.full_name,p.display_name) AS name,u.email,m.role_code,m.active,
    private.team_user_active(m.user_id,m.office_id) AND permissions.effective @> ARRAY['foundation.access'] AS access_active,
    permissions.effective AS permissions, ARRAY(SELECT mp.permission_code FROM private.team_member_permissions mp WHERE mp.membership_id=m.id ORDER BY mp.permission_code) AS direct_permissions,identity.cpf_masked, CASE WHEN actor->>'role_code'='owner' THEN coalesce((
      SELECT jsonb_object_agg(a.category_id,a.mode) FROM private.member_category_access a
      WHERE a.office_id=m.office_id AND a.membership_id=m.id
    ),'{}'::jsonb) END AS category_access,
    (actor->>'role_code'='owner' OR (m.user_id<>(actor->>'user_id')::uuid AND m.role_code<>'owner' AND NOT coalesce(d.revoked_at IS NULL AND d.expires_at>clock_timestamp(),false))) AS can_edit,
    (m.role_code='owner' AND m.active AND NOT EXISTS(SELECT FROM public.memberships other WHERE other.office_id=m.office_id
      AND other.id<>m.id AND other.role_code='owner' AND private.team_user_active(other.user_id,other.office_id))) AS protected_owner,
    CASE WHEN d.id IS NULL THEN NULL ELSE jsonb_build_object('id',d.id,'allowed_roles',d.allowed_roles,
     'allowed_permissions',d.allowed_permissions,'can_create_owner',d.can_create_owner,'expires_at',d.expires_at,
     'revoked_at',d.revoked_at,'active',d.revoked_at IS NULL AND d.expires_at>clock_timestamp()) END AS delegation,
    EXISTS(SELECT FROM private.archived_records ar WHERE ar.office_id=m.office_id AND ar.target_id=m.id AND ar.restored_at IS NULL) AS archived,
    m.created_at
   FROM public.memberships m JOIN public.profiles p ON p.id=m.user_id JOIN auth.users u ON u.id=m.user_id
   LEFT JOIN private.team_member_identities identity ON identity.membership_id=m.id
   JOIN page_ids ON page_ids.id=m.id
   LEFT JOIN LATERAL (SELECT * FROM private.team_delegations x WHERE x.membership_id=m.id ORDER BY x.created_at DESC,x.id DESC LIMIT 1) d ON true
   CROSS JOIN LATERAL (SELECT private.team_permissions_for_member(m.id) AS effective OFFSET 0) permissions
  )
  SELECT (SELECT count(*) FROM roster),
    coalesce((SELECT jsonb_agg(to_jsonb(paged)-'created_at' ORDER BY created_at,id) FROM paged),'[]'::jsonb)
   INTO total_count,items;
 ELSE
  WITH invitations AS (
   SELECT i.id,i.full_name AS name,i.email,i.role_code,i.permissions,
    CASE WHEN i.status<>'pending' THEN i.status WHEN i.expires_at<=clock_timestamp() THEN 'expired'
      WHEN NOT private.team_invitation_authority(i.id) THEN 'blocked' ELSE 'pending' END AS status,
    CASE WHEN i.delivery_status='sending' AND i.delivery_lease_until<=clock_timestamp() THEN 'failed' ELSE i.delivery_status END AS delivery_status,
    i.expires_at,i.created_at,i.cpf_masked
   FROM private.team_invitations i WHERE i.office_id=p_office_id AND i.role_code=ANY(scoped_roles)
    AND i.archived_at IS NULL AND (p_status='expired' OR i.status<>'pending' OR i.expires_at>clock_timestamp())
    AND (p_query='' OR i.full_name ILIKE '%'||p_query||'%' OR i.email ILIKE '%'||p_query||'%')
  ), filtered AS (SELECT * FROM invitations WHERE p_status='all' OR status=p_status),
  paged AS (SELECT * FROM filtered ORDER BY created_at DESC,id DESC LIMIT 5 OFFSET (p_page-1)*5)
  SELECT (SELECT count(*) FROM filtered),coalesce((SELECT jsonb_agg(to_jsonb(paged) ORDER BY created_at DESC,id DESC) FROM paged),'[]'::jsonb)
   INTO total_count,items;
 END IF;
 RETURN jsonb_build_object('scope',actor-ARRAY['user_id','membership_id','office_id','delegation_id'],'kind',p_kind,
  'category_catalog',CASE WHEN p_kind='members' AND actor->>'role_code'='owner' THEN coalesce((
      SELECT jsonb_agg(jsonb_build_object('id',c.id,'name',c.name,'parent_name',private.category_parent_name(c.office_id,c.id),
        'execution_level',c.execution_level) ORDER BY c.name,c.id)
      FROM private.service_categories c WHERE c.office_id=p_office_id AND c.archived_at IS NULL
    ),'[]'::jsonb) END,'items',items,'total',total_count,'page',p_page,'page_size',5,'counts',jsonb_build_object('members',members_count,'invitations',invitations_count));
END $function$
;

CREATE FUNCTION private.team_lifecycle_archives(o uuid,kind text,page integer) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE actor jsonb; result jsonb;
BEGIN
 actor:=private.team_actor(o);
 IF page IS NULL OR page NOT BETWEEN 1 AND 100000 OR kind IS NULL
    OR kind NOT IN('expired','accepted','departed') THEN RAISE EXCEPTION 'TEAM_VALIDATION' USING ERRCODE='PT422'; END IF;
 IF kind='departed' THEN
  IF actor->>'role_code'<>'owner' THEN RAISE EXCEPTION 'TEAM_FORBIDDEN' USING ERRCODE='PT403'; END IF;
  WITH saved AS (
   SELECT membership_id AS id,role_code,departed_at AS at,archived_requests,returned_requests,
    CASE WHEN notice_sent_at IS NOT NULL THEN 'sent' WHEN delivery_email IS NULL OR departed_at<=clock_timestamp()-interval '30 days'
     OR notice_first_attempt_at<=clock_timestamp()-interval '23 hours' THEN 'unavailable' ELSE 'pending' END AS notice
   FROM private.team_departures WHERE office_id=o
  ), paged AS (SELECT * FROM saved ORDER BY at DESC,id LIMIT 5 OFFSET (page-1)*5)
  SELECT jsonb_build_object('total',(SELECT count(*) FROM saved),
   'items',coalesce((SELECT jsonb_agg(p ORDER BY p.at DESC,p.id) FROM paged p),'[]'),'page',page) INTO result;
 ELSE
  WITH saved AS (
   SELECT i.id,i.full_name AS name,i.email,i.role_code,
    CASE WHEN kind='expired' THEN i.expires_at ELSE i.archived_at END AS at
   FROM private.team_invitations i WHERE i.office_id=o AND actor->'allowed_roles' ? i.role_code
    AND ((kind='expired' AND i.status='pending' AND i.expires_at<=clock_timestamp())
      OR (kind='accepted' AND i.status='accepted' AND i.archived_at IS NOT NULL))
  ), paged AS (SELECT * FROM saved ORDER BY at DESC,id LIMIT 5 OFFSET (page-1)*5)
  SELECT jsonb_build_object('total',(SELECT count(*) FROM saved),
   'items',coalesce((SELECT jsonb_agg(p ORDER BY p.at DESC,p.id) FROM paged p),'[]'),'page',page) INTO result;
 END IF;
 RETURN result;
END $$;

CREATE FUNCTION public.team_archive_invitation(p_office_id uuid,p_invitation_id uuid) RETURNS jsonb
LANGUAGE sql SECURITY INVOKER SET search_path='' AS $$ SELECT private.team_archive_invitation(p_office_id,p_invitation_id); $$;
CREATE FUNCTION public.team_depart_member(p_office_id uuid,p_membership_id uuid) RETURNS jsonb
LANGUAGE sql SECURITY INVOKER SET search_path='' AS $$ SELECT private.team_depart_member(p_office_id,p_membership_id); $$;
CREATE FUNCTION public.team_lifecycle_archives(p_office_id uuid,p_kind text,p_page integer) RETURNS jsonb
LANGUAGE sql SECURITY INVOKER SET search_path='' AS $$ SELECT private.team_lifecycle_archives(p_office_id,p_kind,p_page); $$;
REVOKE ALL ON FUNCTION private.team_archive_invitation(uuid,uuid),public.team_archive_invitation(uuid,uuid),
 private.team_depart_member(uuid,uuid),public.team_depart_member(uuid,uuid),
 private.team_lifecycle_archives(uuid,text,integer),public.team_lifecycle_archives(uuid,text,integer)
 FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION private.team_archive_invitation(uuid,uuid),public.team_archive_invitation(uuid,uuid),
 private.team_depart_member(uuid,uuid),public.team_depart_member(uuid,uuid),
 private.team_lifecycle_archives(uuid,text,integer),public.team_lifecycle_archives(uuid,text,integer) TO authenticated;

CREATE FUNCTION private.team_departure_guard() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
BEGIN
 IF NEW.active AND EXISTS(SELECT FROM private.team_departures WHERE membership_id=NEW.id) THEN
  RAISE EXCEPTION 'TEAM_FORBIDDEN' USING ERRCODE='PT403';
 END IF;
 RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION private.team_departure_guard() FROM PUBLIC,anon,authenticated,service_role;
CREATE TRIGGER team_departed_membership BEFORE UPDATE OF active ON public.memberships
 FOR EACH ROW EXECUTE FUNCTION private.team_departure_guard();

CREATE FUNCTION private.team_departure_notices_claim() RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE payload jsonb;
BEGIN
 WITH candidates AS (
  SELECT membership_id FROM private.team_departures
  WHERE notice_sent_at IS NULL AND delivery_email IS NOT NULL AND departed_at>clock_timestamp()-interval '30 days'
   AND (notice_claimed_at IS NULL OR notice_claimed_at<=clock_timestamp()-interval '5 minutes')
   AND (notice_first_attempt_at IS NULL OR notice_first_attempt_at>clock_timestamp()-interval '23 hours')
  ORDER BY departed_at LIMIT 5 FOR UPDATE SKIP LOCKED
 ), claimed AS (
  UPDATE private.team_departures d
  SET notice_claimed_at=clock_timestamp(),notice_first_attempt_at=coalesce(d.notice_first_attempt_at,clock_timestamp())
  FROM candidates c WHERE c.membership_id=d.membership_id RETURNING d.membership_id AS id,d.delivery_email AS email
 )
 SELECT coalesce(jsonb_agg(to_jsonb(c)),'[]') INTO payload FROM claimed c;
 RETURN payload;
END $$;
CREATE FUNCTION private.team_departure_notice_complete(p_membership_id uuid) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
BEGIN
 UPDATE private.team_departures SET delivery_email=NULL,notice_sent_at=clock_timestamp()
 WHERE membership_id=p_membership_id AND notice_claimed_at IS NOT NULL AND notice_sent_at IS NULL;
 RETURN jsonb_build_object('recorded',FOUND);
END $$;
CREATE FUNCTION public.team_departure_notices_claim() RETURNS jsonb
LANGUAGE sql SECURITY INVOKER SET search_path='' AS $$ SELECT private.team_departure_notices_claim(); $$;
CREATE FUNCTION public.team_departure_notice_complete(p_membership_id uuid) RETURNS jsonb
LANGUAGE sql SECURITY INVOKER SET search_path='' AS $$ SELECT private.team_departure_notice_complete(p_membership_id); $$;
REVOKE ALL ON FUNCTION private.team_departure_notices_claim(),private.team_departure_notice_complete(uuid),
 public.team_departure_notices_claim(),public.team_departure_notice_complete(uuid)
 FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION private.team_departure_notices_claim(),private.team_departure_notice_complete(uuid),
 public.team_departure_notices_claim(),public.team_departure_notice_complete(uuid) TO service_role;
NOTIFY pgrst,'reload schema';
