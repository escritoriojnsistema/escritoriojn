-- 20261105150002 revoked every private.portal_% function, including this
-- existing RPC callee. Its public SECURITY INVOKER wrapper still requires the
-- caller to EXECUTE the checked private entrypoint. Restore only that contract;
-- identity, session, office, client role, recipient and release gates stay intact.
GRANT EXECUTE ON FUNCTION private.portal_documents_page(uuid,integer) TO authenticated;
NOTIFY pgrst,'reload schema';
