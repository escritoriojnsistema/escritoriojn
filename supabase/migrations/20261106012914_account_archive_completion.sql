-- A retained archive includes publications prepared after access was closed.
-- Matching is by verified customer relation, never by name/email coincidence.
CREATE INDEX closed_account_offices_customer_idx ON private.closed_account_offices(office_id,customer_id);
CREATE INDEX closed_account_documents_office_idx ON private.closed_account_documents(office_id,user_id);
CREATE FUNCTION private.sync_closed_account_documents(p_office_id uuid,p_user_id uuid DEFAULT NULL,p_publication_id uuid DEFAULT NULL) RETURNS void LANGUAGE sql SECURITY DEFINER SET search_path='' AS $$
 INSERT INTO private.closed_account_documents(user_id,office_id,publication_id)
 SELECT a.user_id,a.office_id,p.id FROM private.closed_account_offices a
 JOIN private.document_publications p ON p.office_id=a.office_id
 JOIN public.documents d ON d.office_id=p.office_id AND d.id=p.document_id
 JOIN public.requests r ON r.office_id=d.office_id AND r.id=d.request_id
 JOIN private.customer_relations cr ON cr.office_id=r.office_id AND cr.customer_id=r.customer_id AND cr.membership_id=a.membership_id AND cr.relation_type='identity' AND cr.revoked_at IS NULL AND cr.valid_from<=clock_timestamp()
 JOIN public.customers c ON c.office_id=cr.office_id AND c.id=cr.customer_id AND c.blocked_at IS NULL AND c.merged_into_id IS NULL
 WHERE a.office_id=p_office_id AND(p_user_id IS NULL OR a.user_id=p_user_id) AND(p_publication_id IS NULL OR p.id=p_publication_id)
 ON CONFLICT DO NOTHING;
$$;
CREATE FUNCTION private.closed_account_publication_sync() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$BEGIN PERFORM private.sync_closed_account_documents(NEW.office_id,NULL,NEW.id);RETURN NEW;END$$;
CREATE TRIGGER closed_account_publication_sync AFTER INSERT ON private.document_publications FOR EACH ROW EXECUTE FUNCTION private.closed_account_publication_sync();
DO $m$ DECLARE body text;updated text;BEGIN
 body:=pg_get_functiondef('private.deleted_account_documents(uuid,uuid)'::regprocedure);
 updated:=replace(body,'-- Staff access revalidates the current identity relation without reactivating access.','PERFORM private.sync_closed_account_documents(p_office_id,p_user_id,NULL);');
 IF updated=body THEN RAISE EXCEPTION 'Closed account archive sync target missing';END IF;EXECUTE updated;
 body:=pg_get_functiondef('private.deleted_accounts_page(uuid,text,integer)'::regprocedure);
 updated:=replace(body,'strpos(lower(p.display_name),lower(p_query))>0','strpos(lower(p.display_name),lower(p_query))>0 OR EXISTS(SELECT FROM private.closed_account_documents ca JOIN private.document_publications pub ON pub.office_id=ca.office_id AND pub.id=ca.publication_id WHERE ca.office_id=a.office_id AND ca.user_id=a.user_id AND strpos(lower(pub.title),lower(p_query))>0 AND private.documents_accessible_for_closure(pub.office_id,pub.document_id))');
 IF updated=body THEN RAISE EXCEPTION 'Closed account document search target missing';END IF;EXECUTE updated;
END$m$;
REVOKE ALL ON FUNCTION private.sync_closed_account_documents(uuid,uuid,uuid),private.closed_account_publication_sync() FROM PUBLIC,anon,authenticated,service_role;
NOTIFY pgrst,'reload schema';
