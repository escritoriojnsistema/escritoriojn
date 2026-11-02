-- Revalidate the original human session on worker completion and dispatch.
-- No provider records or artifact content are changed.
DO $migration$
DECLARE f record;original text;updated text;
BEGIN
 FOR f IN SELECT p.oid,p.proname FROM pg_proc p WHERE p.pronamespace='private'::regnamespace AND p.proname IN ('document_artifact_complete','document_version_complete','team_finish_delivery','document_presence_state','document_dispatch','document_dispatch_page') LOOP
 original:=pg_get_functiondef(f.oid);updated:=original;
 IF f.proname IN('document_artifact_complete','document_version_complete') THEN
  updated:=replace(updated,'NOT EXISTS(SELECT FROM auth.sessions WHERE id=j.session_id', 'NOT private.session_activity_valid(j.user_id,j.session_id) OR NOT EXISTS(SELECT FROM auth.sessions WHERE id=j.session_id');
 ELSIF f.proname='team_finish_delivery' THEN
  updated:=replace(updated,'OR NOT EXISTS (SELECT FROM auth.sessions s WHERE s.id=invitation.delivery_session_id', 'OR NOT private.session_activity_valid(invitation.delivery_actor_id,invitation.delivery_session_id) OR NOT EXISTS (SELECT FROM auth.sessions s WHERE s.id=invitation.delivery_session_id');
 ELSE
  updated:=replace(updated,'(s.not_after IS NULL OR s.not_after>clock_timestamp())','(s.not_after IS NULL OR s.not_after>clock_timestamp()) AND private.session_activity_valid(s.user_id,s.id)');
  updated:=replace(updated,'(ss.not_after IS NULL OR ss.not_after>clock_timestamp())','(ss.not_after IS NULL OR ss.not_after>clock_timestamp()) AND private.session_activity_valid(ss.user_id,ss.id)');
 END IF;
 IF updated=original THEN RAISE EXCEPTION 'Missing expected session guard in %',f.proname;END IF;
 EXECUTE updated;
 END LOOP;
END $migration$;
NOTIFY pgrst,'reload schema';
