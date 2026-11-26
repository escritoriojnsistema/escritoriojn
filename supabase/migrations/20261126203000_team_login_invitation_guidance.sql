-- This lookup is available only to the application server. It must first prove
-- possession of the invitation link or verify the submitted password with Auth.
CREATE FUNCTION private.team_login_guidance(p_email text,p_invitation_id uuid) RETURNS text
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path='' AS $$
DECLARE address text:=lower(btrim(p_email));
BEGIN
 IF p_invitation_id IS NOT NULL THEN
  IF EXISTS(SELECT FROM private.team_invitations i WHERE i.id=p_invitation_id AND i.email=address
    AND i.status='pending' AND i.expires_at<=statement_timestamp()) THEN RETURN 'invitation_expired'; END IF;
  IF EXISTS(SELECT FROM private.team_invitations i WHERE i.id=p_invitation_id AND i.email=address
    AND i.status='pending' AND i.expires_at>statement_timestamp() AND private.team_invitation_authority(i.id))
    THEN RETURN 'confirm_email'; END IF;
  RETURN 'unavailable';
 END IF;

 -- Ordinary passwords are checked by GoTrue before this lookup. Confirm that
 -- the account is still unconfirmed and inspect only its staff invitation state.
 IF NOT EXISTS(SELECT FROM auth.users u WHERE lower(u.email)=address AND u.email_confirmed_at IS NULL
     AND u.deleted_at IS NULL) THEN RETURN 'unavailable'; END IF;
 IF EXISTS(SELECT FROM auth.users u JOIN public.memberships m ON m.user_id=u.id
   WHERE lower(u.email)=address AND u.email_confirmed_at IS NULL AND u.deleted_at IS NULL
     AND m.active AND m.role_code IN('owner','admin','employee'))
  OR EXISTS(SELECT FROM private.team_invitations i
    WHERE i.email=address AND i.status='pending' AND i.expires_at>statement_timestamp()
      AND private.team_invitation_authority(i.id)) THEN RETURN 'confirm_email'; END IF;
 IF EXISTS(SELECT FROM private.team_invitations i WHERE i.email=address AND i.status='pending'
    AND i.expires_at<=statement_timestamp()) THEN RETURN 'invitation_expired'; END IF;
 RETURN 'invitation_required';
END $$;

CREATE FUNCTION public.team_login_guidance(p_email text,p_invitation_id uuid) RETURNS text
LANGUAGE sql STABLE SECURITY INVOKER SET search_path='' AS $$
 SELECT private.team_login_guidance(p_email,p_invitation_id);
$$;
REVOKE ALL ON FUNCTION private.team_login_guidance(text,uuid),public.team_login_guidance(text,uuid)
 FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION private.team_login_guidance(text,uuid),public.team_login_guidance(text,uuid) TO service_role;
NOTIFY pgrst,'reload schema';
