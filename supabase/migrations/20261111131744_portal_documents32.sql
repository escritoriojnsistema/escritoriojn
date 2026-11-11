-- Portal32 reuses identity08, exact publications21 and the central release25/26.
CREATE TABLE private.portal_grants32(
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),office_id uuid NOT NULL,publication_id uuid NOT NULL,revision integer NOT NULL,
 customer_id uuid NOT NULL,identity_id uuid NOT NULL REFERENCES private.customer_relations(id),membership_id uuid NOT NULL,
 sha256 text NOT NULL CHECK(sha256~'^[a-f0-9]{64}$'),file_id uuid,valid_until timestamptz NOT NULL,
 created_by uuid NOT NULL REFERENCES auth.users(id),issuer_membership_id uuid NOT NULL,authority_epoch uuid,
 evidence text NOT NULL CHECK(char_length(evidence) BETWEEN 1 AND 500),created_at timestamptz NOT NULL DEFAULT clock_timestamp(),revoked_at timestamptz,revoked_by uuid REFERENCES auth.users(id),invalidated_at timestamptz,version integer NOT NULL DEFAULT 1,
 FOREIGN KEY(office_id,publication_id) REFERENCES private.document_publications(office_id,id),FOREIGN KEY(office_id,customer_id) REFERENCES public.customers(office_id,id),
 FOREIGN KEY(office_id,membership_id) REFERENCES public.memberships(office_id,id),FOREIGN KEY(office_id,issuer_membership_id) REFERENCES public.memberships(office_id,id),FOREIGN KEY(office_id,file_id) REFERENCES public.files(office_id,id)
);
CREATE INDEX portal_grants32_member_idx ON private.portal_grants32(office_id,membership_id,publication_id);
CREATE INDEX portal_grants32_publication_idx ON private.portal_grants32(office_id,publication_id,created_at DESC,id DESC);
CREATE INDEX portal_grants32_identity_idx ON private.portal_grants32(identity_id);
CREATE INDEX portal_grants32_customer_idx ON private.portal_grants32(office_id,customer_id);
CREATE INDEX portal_grants32_issuer_idx ON private.portal_grants32(office_id,issuer_membership_id);
CREATE INDEX portal_grants32_actor_idx ON private.portal_grants32(created_by);
CREATE INDEX portal_grants32_revoker_idx ON private.portal_grants32(revoked_by);
CREATE INDEX portal_grants32_file_idx ON private.portal_grants32(office_id,file_id);
CREATE TABLE private.portal_grant_events32(
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),grant_id uuid NOT NULL REFERENCES private.portal_grants32(id),actor_id uuid NOT NULL REFERENCES auth.users(id),kind text NOT NULL CHECK(kind IN('grant','revoke')),created_at timestamptz NOT NULL DEFAULT clock_timestamp(),evidence text NOT NULL CHECK(char_length(evidence) BETWEEN 1 AND 500)
);
CREATE INDEX portal_grant_events32_grant_idx ON private.portal_grant_events32(grant_id,created_at DESC);
CREATE INDEX portal_grant_events32_actor_idx ON private.portal_grant_events32(actor_id);
CREATE TABLE private.portal_share_commands32(
 office_id uuid NOT NULL REFERENCES public.offices(id),actor_id uuid NOT NULL REFERENCES auth.users(id),session_id uuid NOT NULL,key uuid NOT NULL,publication_id uuid NOT NULL,digest text NOT NULL,grant_id uuid NOT NULL REFERENCES private.portal_grants32(id),
 PRIMARY KEY(office_id,actor_id,session_id,key),FOREIGN KEY(office_id,publication_id) REFERENCES private.document_publications(office_id,id)
);
CREATE INDEX portal_share_commands32_actor_idx ON private.portal_share_commands32(actor_id);
CREATE INDEX portal_share_commands32_grant_idx ON private.portal_share_commands32(grant_id);
CREATE INDEX portal_share_commands32_publication_idx ON private.portal_share_commands32(office_id,publication_id);
ALTER TABLE private.portal_grants32 ENABLE ROW LEVEL SECURITY;
ALTER TABLE private.portal_grant_events32 ENABLE ROW LEVEL SECURITY;
ALTER TABLE private.portal_share_commands32 ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON private.portal_grants32,private.portal_grant_events32,private.portal_share_commands32 FROM PUBLIC,anon,authenticated,service_role;
CREATE TRIGGER immutable BEFORE UPDATE OR DELETE ON private.portal_grant_events32 FOR EACH ROW EXECUTE FUNCTION private.wf_immutable();
CREATE TRIGGER immutable BEFORE UPDATE OR DELETE ON private.portal_share_commands32 FOR EACH ROW EXECUTE FUNCTION private.wf_immutable();

-- Persist authority loss: restoring an assignment never resurrects an old grant.
CREATE FUNCTION private.portal_authority_invalidate32() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE o uuid;rid uuid;mid uuid;cid uuid;BEGIN
 IF TG_TABLE_NAME='requests' THEN
  IF OLD.assignee_id IS NOT DISTINCT FROM NEW.assignee_id THEN RETURN NEW;END IF;o:=NEW.office_id;rid:=NEW.id;
 ELSIF TG_TABLE_NAME='request_assignments' THEN
  IF TG_OP='DELETE' THEN o:=OLD.office_id;rid:=OLD.request_id;mid:=OLD.membership_id;ELSE o:=NEW.office_id;rid:=NEW.request_id;mid:=NEW.membership_id;END IF;
 ELSE
  IF TG_OP='DELETE' THEN IF OLD.relation_type<>'assignment' THEN RETURN OLD;END IF;o:=OLD.office_id;mid:=OLD.membership_id;cid:=OLD.customer_id;
  ELSE IF NEW.relation_type<>'assignment' THEN RETURN NEW;END IF;o:=NEW.office_id;mid:=NEW.membership_id;cid:=NEW.customer_id;END IF;
 END IF;
 UPDATE private.portal_grants32 g SET invalidated_at=clock_timestamp() FROM private.document_publications p,public.documents d
 WHERE g.office_id=o AND g.revoked_at IS NULL AND g.invalidated_at IS NULL AND p.office_id=o AND p.id=g.publication_id AND d.office_id=o AND d.id=p.document_id
 AND(mid IS NULL OR g.issuer_membership_id=mid) AND(rid IS NULL OR d.request_id=rid)
 AND(cid IS NULL OR EXISTS(SELECT FROM public.requests r WHERE r.office_id=o AND r.id=d.request_id AND r.customer_id=cid) OR EXISTS(SELECT FROM public.document_participants part WHERE part.office_id=o AND part.document_id=d.id AND part.customer_id=cid) OR EXISTS(SELECT FROM private.document_revisions rev WHERE rev.office_id=o AND rev.document_id=d.id AND rev.source_customer_id=cid));
 IF TG_OP='DELETE' THEN RETURN OLD;END IF;RETURN NEW;
END$$;
CREATE TRIGGER portal_authority32 AFTER UPDATE OF assignee_id ON public.requests FOR EACH ROW EXECUTE FUNCTION private.portal_authority_invalidate32();
CREATE TRIGGER portal_authority32 AFTER INSERT OR UPDATE OR DELETE ON private.request_assignments FOR EACH ROW EXECUTE FUNCTION private.portal_authority_invalidate32();
CREATE TRIGGER portal_authority32 AFTER INSERT OR UPDATE OR DELETE ON private.customer_relations FOR EACH ROW EXECUTE FUNCTION private.portal_authority_invalidate32();

CREATE FUNCTION private.portal_identity32(o uuid,mid uuid,cid uuid DEFAULT NULL) RETURNS uuid LANGUAGE sql VOLATILE SECURITY INVOKER SET search_path='' AS $$
 SELECT rel.customer_id FROM private.customer_relations rel JOIN public.customers c ON c.office_id=rel.office_id AND c.id=rel.customer_id
 WHERE rel.office_id=o AND rel.membership_id=mid AND rel.relation_type='identity' AND rel.revoked_at IS NULL AND rel.valid_from<=clock_timestamp()
 AND(rel.valid_until IS NULL OR rel.valid_until>clock_timestamp()) AND(cid IS NULL OR rel.customer_id=cid) AND c.blocked_at IS NULL AND c.merged_into_id IS NULL
 AND private.customer_relation_member_active(o,mid,true) LIMIT 1;
$$;
CREATE FUNCTION private.portal_artifact32(p private.document_publications) RETURNS jsonb LANGUAGE sql STABLE SECURITY INVOKER SET search_path='' AS $$
 SELECT CASE WHEN s->>'mode'='external' THEN jsonb_build_object('sha256',s->'sha256','file_id',s->'file_id')
 ELSE jsonb_build_object('sha256',j.sha256,'file_id',NULL) END FROM(SELECT private.signature_snapshot24(p)s)x LEFT JOIN private.document_artifact_jobs j ON j.office_id=p.office_id AND j.publication_id=p.id AND j.completed_at IS NOT NULL;
$$;
CREATE FUNCTION private.portal_grant_valid32(g private.portal_grants32,p private.document_publications,m public.memberships) RETURNS boolean LANGUAGE sql VOLATILE SECURITY INVOKER SET search_path='' AS $$
 SELECT coalesce((g.office_id=p.office_id AND g.publication_id=p.id AND g.revision=p.revision AND m.office_id=g.office_id AND m.id=g.membership_id AND m.role_code='client' AND m.active
 AND g.revoked_at IS NULL AND g.invalidated_at IS NULL AND g.valid_until>clock_timestamp() AND g.sha256=private.portal_artifact32(p)->>'sha256' AND g.file_id IS NOT DISTINCT FROM(private.portal_artifact32(p)->>'file_id')::uuid
 AND private.portal_identity32(g.office_id,m.id,g.customer_id)=g.customer_id
 AND EXISTS(SELECT FROM private.customer_relations rel WHERE rel.id=g.identity_id AND rel.office_id=g.office_id AND rel.membership_id=m.id AND rel.customer_id=g.customer_id AND rel.relation_type='identity' AND rel.revoked_at IS NULL)
 AND EXISTS(SELECT FROM public.documents d JOIN public.document_participants part ON part.office_id=d.office_id AND part.document_id=d.id AND part.revision=p.revision WHERE d.office_id=p.office_id AND d.id=p.document_id AND d.revision=p.revision AND part.customer_id=g.customer_id)
 AND EXISTS(SELECT FROM public.memberships issuer WHERE issuer.id=g.issuer_membership_id AND issuer.office_id=g.office_id AND issuer.active AND issuer.role_code<>'client' AND private.team_user_active(issuer.user_id,issuer.office_id)
 AND EXISTS(SELECT FROM public.documents doc JOIN public.requests req ON req.office_id=doc.office_id AND req.id=doc.request_id WHERE doc.office_id=p.office_id AND doc.id=p.document_id AND (req.assignee_id IS NULL OR req.assignee_id=issuer.id) AND private.request_execution_allowed(req,issuer) AND private.document_version_scope22(req,issuer,private.team_permissions_for_member(issuer.id)) AND private.document_version_sources22(p.office_id,p.document_id,issuer,private.team_permissions_for_member(issuer.id)))
 AND private.team_permissions_for_member(issuer.id) @> ARRAY['foundation.access','documents.read','requests.read','customers.read','documents.deliver'] AND g.authority_epoch IS NOT DISTINCT FROM(SELECT epoch FROM private.release_authority25 WHERE membership_id=issuer.id))),false);
$$;
CREATE FUNCTION private.portal_recipient_customer32(p private.document_publications,m public.memberships) RETURNS uuid LANGUAGE sql VOLATILE SECURITY INVOKER SET search_path='' AS $$
 SELECT coalesce((SELECT r.customer_id FROM public.documents d JOIN public.requests r ON r.office_id=d.office_id AND r.id=d.request_id WHERE d.office_id=p.office_id AND d.id=p.document_id AND m.office_id=p.office_id AND m.role_code='client' AND m.active AND private.portal_identity32(p.office_id,m.id,r.customer_id)=r.customer_id),
 (SELECT g.customer_id FROM private.portal_grants32 g WHERE g.office_id=p.office_id AND g.publication_id=p.id AND g.membership_id=m.id AND private.portal_grant_valid32(g,p,m) ORDER BY g.created_at DESC LIMIT 1));
$$;
-- Central25/26 still decides finance/signature/editorial/restriction; only recipient scope becomes exact-publication aware.
ALTER FUNCTION private.avaliar_liberacao25(private.document_publications,public.memberships) RENAME TO avaliar_liberacao_before32;
CREATE FUNCTION private.avaliar_liberacao25(p private.document_publications,m public.memberships DEFAULT NULL) RETURNS text[] LANGUAGE plpgsql VOLATILE SECURITY INVOKER SET search_path='' AS $$
DECLARE b text[];BEGIN
 IF m.role_code='client' THEN b:=private.avaliar_liberacao_before32(p,NULL);IF private.portal_recipient_customer32(p,m) IS NULL THEN b:=array_append(b,'identity');END IF;RETURN b;END IF;
 RETURN private.avaliar_liberacao_before32(p,m);
END$$;
-- The existing worker calls this before and after Storage. Its bytes and interfaces remain unchanged.
DO $$DECLARE s text;BEGIN
 s:=pg_get_functiondef('private.document_artifact_authorize(uuid,uuid,boolean)'::regprocedure);
 IF strpos(s,'private.wf_recipient(r,m) IS NOT TRUE')=0 OR strpos(s,'r.customer_id,(result->>''file_id'')::uuid')=0 THEN RAISE EXCEPTION 'PORTAL32_AUTHORIZATION_CONTRACT';END IF;
 s:=replace(s,'private.wf_recipient(r,m) IS NOT TRUE','private.portal_recipient_customer32(p,m) IS NULL');
 s:=replace(s,'r.customer_id,(result->>''file_id'')::uuid','CASE WHEN m.role_code=''client'' THEN private.portal_recipient_customer32(p,m) ELSE r.customer_id END,(result->>''file_id'')::uuid');EXECUTE s;
END$$;

CREATE FUNCTION private.portal_publication32(p private.document_publications,m public.memberships) RETURNS jsonb LANGUAGE plpgsql VOLATILE SECURITY INVOKER SET search_path='' AS $$
DECLARE b text[];own boolean;BEGIN
 IF private.portal_recipient_customer32(p,m) IS NULL THEN RAISE EXCEPTION 'DOCUMENT_NOT_FOUND' USING ERRCODE='PT404';END IF;
 own:=EXISTS(SELECT FROM public.documents d JOIN public.requests r ON r.office_id=d.office_id AND r.id=d.request_id WHERE d.office_id=p.office_id AND d.id=p.document_id AND private.portal_identity32(p.office_id,m.id,r.customer_id)=r.customer_id);
 b:=private.wf_gate(p,m);IF NOT own AND cardinality(b)>0 THEN b:=ARRAY['restriction'];END IF;
 RETURN jsonb_build_object('id',p.id,'title',p.title,'protocol',p.protocol,'revision',p.revision,'created_at',p.created_at,'scope',CASE WHEN own THEN 'own' ELSE 'participant' END,'ready',cardinality(b)=0,'blockers',to_jsonb(b));
END$$;
CREATE FUNCTION private.portal_documents_page32(o uuid,q text,page integer,size integer) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE m public.memberships;n bigint;items jsonb;query text;BEGIN
 m:=private.portal_actor31(o);IF m.role_code<>'client' THEN RAISE EXCEPTION 'PORTAL_FORBIDDEN' USING ERRCODE='PT403';END IF;
 IF q IS NULL OR char_length(q)>120 OR q~'[[:cntrl:]]' OR page IS NULL OR page NOT BETWEEN 1 AND 100000 OR size IS NULL OR size NOT IN(3,5) THEN RAISE EXCEPTION 'PORTAL_VALIDATION' USING ERRCODE='PT422';END IF;query:=lower(btrim(q));
 WITH candidate_ids AS(
 SELECT p.id FROM private.document_publications p JOIN public.documents d ON d.office_id=p.office_id AND d.id=p.document_id AND d.revision=p.revision JOIN public.requests r ON r.office_id=d.office_id AND r.id=d.request_id WHERE p.office_id=o AND r.customer_id=private.portal_identity32(o,m.id)
 UNION SELECT g.publication_id FROM private.portal_grants32 g WHERE g.office_id=o AND g.membership_id=m.id AND g.revoked_at IS NULL AND g.invalidated_at IS NULL AND g.valid_until>clock_timestamp()),
 candidates AS(SELECT p.* FROM candidate_ids x JOIN private.document_publications p ON p.id=x.id AND p.office_id=o JOIN public.documents d ON d.office_id=p.office_id AND d.id=p.document_id AND d.revision=p.revision WHERE private.portal_recipient_customer32(p,m) IS NOT NULL AND(query='' OR strpos(lower(p.title||' '||p.protocol),query)>0)),
 subset AS(SELECT * FROM candidates ORDER BY created_at DESC,id DESC LIMIT size OFFSET(page-1)*size)
 SELECT(SELECT count(*) FROM candidates),coalesce((SELECT jsonb_agg(private.portal_publication32(s,m) ORDER BY s.created_at DESC,s.id DESC) FROM subset s),'[]'::jsonb) INTO n,items;
 PERFORM private.team_require_identity();RETURN jsonb_build_object('items',items,'total',n,'page',page,'page_size',size);
END$$;
CREATE OR REPLACE FUNCTION private.portal_documents_page(p_office_id uuid,p_page integer) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$BEGIN IF p_page IS NULL OR p_page NOT BETWEEN 1 AND 100000 THEN RAISE EXCEPTION 'DOCUMENTS_FORBIDDEN' USING ERRCODE='PT403';END IF;RETURN private.portal_documents_page32(p_office_id,'',p_page,5);END$$;
CREATE FUNCTION private.portal_document_state32(o uuid,pid uuid,page integer,size integer) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE m public.memberships;p private.document_publications;projection jsonb;finance jsonb:=NULL;items jsonb;n bigint;BEGIN
 m:=private.portal_actor31(o);IF m.role_code<>'client' THEN RAISE EXCEPTION 'PORTAL_FORBIDDEN' USING ERRCODE='PT403';END IF;
 IF page IS NULL OR page NOT BETWEEN 1 AND 100000 OR size IS NULL OR size NOT IN(3,5) THEN RAISE EXCEPTION 'PORTAL_VALIDATION' USING ERRCODE='PT422';END IF;
 SELECT * INTO p FROM private.document_publications x WHERE x.office_id=o AND x.id=pid AND EXISTS(SELECT FROM public.documents d WHERE d.office_id=o AND d.id=x.document_id AND d.revision=x.revision);
 IF p.id IS NULL OR private.portal_recipient_customer32(p,m) IS NULL THEN RAISE EXCEPTION 'DOCUMENT_NOT_FOUND' USING ERRCODE='PT404';END IF;projection:=private.portal_publication32(p,m);
 IF projection->>'scope'='own' THEN SELECT jsonb_build_object('due_cents',f->'due_cents','paid_cents',f->'allocated_cents','balance_cents',f->'balance_cents') INTO finance FROM(SELECT private.release_finance25(p)f)x WHERE f->>'charge_id' IS NOT NULL;END IF;
 SELECT count(*) INTO n FROM private.document_releases25 rel WHERE rel.office_id=o AND rel.publication_id=pid AND rel.actor_id=m.user_id AND rel.recipient_customer_id=private.portal_recipient_customer32(p,m);
 SELECT coalesce(jsonb_agg(v),'[]') INTO items FROM(SELECT jsonb_build_object('at',rel.created_at,'kind','download_authorized')v FROM private.document_releases25 rel WHERE rel.office_id=o AND rel.publication_id=pid AND rel.actor_id=m.user_id AND rel.recipient_customer_id=private.portal_recipient_customer32(p,m) ORDER BY rel.created_at DESC,rel.id DESC LIMIT size OFFSET(page-1)*size)x;
 PERFORM private.team_require_identity();RETURN jsonb_build_object('document',projection,'financial',finance,'history',items,'history_total',n,'page',page,'page_size',size);
END$$;

CREATE FUNCTION private.portal_shares_state32(o uuid,pid uuid,page integer) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE m public.memberships;p private.document_publications;d public.documents;r public.requests;items jsonb;options jsonb;n bigint;can_manage boolean;BEGIN
 SELECT * INTO p FROM private.document_publications WHERE office_id=o AND id=pid;IF p.id IS NULL THEN RAISE EXCEPTION 'DOCUMENT_NOT_FOUND' USING ERRCODE='PT404';END IF;
 SELECT * INTO d FROM public.documents WHERE office_id=o AND id=p.document_id;m:=private.documents_access21(o,d.request_id,NULL,d.id);SELECT * INTO r FROM public.requests WHERE office_id=o AND id=d.request_id;
 IF page IS NULL OR page NOT BETWEEN 1 AND 100000 THEN RAISE EXCEPTION 'PORTAL_VALIDATION' USING ERRCODE='PT422';END IF;
 can_manage:=private.current_permissions(o) @> ARRAY['documents.deliver'] AND private.request_can_work(r,m) AND d.revision=p.revision;
 SELECT coalesce(jsonb_agg(v),'[]') INTO options FROM(SELECT DISTINCT c.id,c.name,jsonb_build_object('customer_id',c.id,'name',c.name,'identity_verified',EXISTS(SELECT FROM private.customer_relations rel WHERE rel.office_id=o AND rel.customer_id=c.id AND rel.relation_type='identity' AND rel.revoked_at IS NULL AND private.portal_identity32(o,rel.membership_id,c.id)=c.id))v FROM public.document_participants part JOIN public.customers c ON c.office_id=part.office_id AND c.id=part.customer_id WHERE part.office_id=o AND part.document_id=p.document_id AND part.revision=p.revision AND c.id IS DISTINCT FROM r.customer_id AND c.blocked_at IS NULL AND c.merged_into_id IS NULL ORDER BY c.name,c.id LIMIT 20)x;
 SELECT count(*) INTO n FROM private.portal_grants32 WHERE office_id=o AND publication_id=pid;
 SELECT coalesce(jsonb_agg(v),'[]') INTO items FROM(SELECT jsonb_build_object('id',g.id,'customer_name',c.name,'valid_until',g.valid_until,'created_at',g.created_at,'version',g.version,'status',CASE WHEN g.revoked_at IS NOT NULL THEN 'revoked' WHEN g.valid_until<=clock_timestamp() THEN 'expired' WHEN NOT private.portal_grant_valid32(g,p,recipient) THEN 'unavailable' ELSE 'active' END)v FROM private.portal_grants32 g JOIN public.customers c ON c.office_id=o AND c.id=g.customer_id JOIN public.memberships recipient ON recipient.office_id=o AND recipient.id=g.membership_id WHERE g.office_id=o AND g.publication_id=pid ORDER BY g.created_at DESC,g.id DESC LIMIT 5 OFFSET(page-1)*5)x;
 PERFORM private.documents_access21(o,d.request_id,NULL,d.id);RETURN jsonb_build_object('publication_id',pid,'revision',p.revision,'can_manage',can_manage,'ready',cardinality(private.wf_gate(p))=0,'participants',options,'items',items,'total',n,'page',page,'page_size',5);
END$$;
CREATE FUNCTION private.portal_share_command32(o uuid,pid uuid,c jsonb,k uuid) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE m public.memberships;p private.document_publications;d public.documents;g private.portal_grants32;prior private.portal_share_commands32;ident private.customer_relations;artifact jsonb;why text;ends timestamptz;cid uuid;digest text;sid uuid;rid uuid;
BEGIN
 PERFORM private.team_require_identity();PERFORM 1 FROM public.offices WHERE id=o FOR NO KEY UPDATE;
 SELECT * INTO p FROM private.document_publications WHERE office_id=o AND id=pid;SELECT * INTO d FROM public.documents WHERE office_id=o AND id=p.document_id FOR UPDATE;
 IF p.id IS NULL OR d.revision<>p.revision THEN RAISE EXCEPTION 'DOCUMENT_NOT_FOUND' USING ERRCODE='PT404';END IF;m:=private.delivery_actor26(o,d.id,'documents.deliver');
 IF k IS NULL OR jsonb_typeof(c) IS DISTINCT FROM 'object' OR c->>'expected_revision' IS DISTINCT FROM p.revision::text THEN RAISE EXCEPTION 'PORTAL_VALIDATION' USING ERRCODE='PT422';END IF;
 sid:=(auth.jwt()->>'session_id')::uuid;digest:=encode(extensions.digest(c::text,'sha256'),'hex');SELECT * INTO prior FROM private.portal_share_commands32 WHERE office_id=o AND actor_id=m.user_id AND session_id=sid AND key=k;
 IF prior.key IS NOT NULL THEN IF prior.publication_id<>pid OR prior.digest<>digest THEN RAISE EXCEPTION 'DOCUMENT_CONFLICT' USING ERRCODE='PT409';END IF;
  SELECT * INTO g FROM private.portal_grants32 WHERE id=prior.grant_id;
  IF c->>'kind'='grant' AND(g.revoked_at IS NOT NULL OR NOT private.portal_grant_valid32(g,p,(SELECT recipient FROM public.memberships recipient WHERE recipient.id=g.membership_id))) THEN RAISE EXCEPTION 'DOCUMENTS_FORBIDDEN' USING ERRCODE='PT403';END IF;RETURN jsonb_build_object('id',prior.grant_id);END IF;
 why:=private.customer_relation_evidence(c->'evidence');
 IF c->>'kind'='grant' THEN
  PERFORM private.customer_relation_payload(c,ARRAY['kind','expected_revision','customer_id','valid_until','evidence']);cid:=private.customer_relation_uuid(c->'customer_id');ends:=private.customer_relation_time(c->'valid_until',false);
  IF ends<=clock_timestamp() OR ends>clock_timestamp()+interval '365 days' OR NOT EXISTS(SELECT FROM public.document_participants WHERE office_id=o AND document_id=d.id AND revision=p.revision AND customer_id=cid) THEN RAISE EXCEPTION 'PORTAL_VALIDATION' USING ERRCODE='PT422';END IF;
  IF cardinality(private.wf_gate(p))>0 THEN RAISE EXCEPTION 'DOCUMENTS_FORBIDDEN' USING ERRCODE='PT403';END IF;
  SELECT * INTO ident FROM private.customer_relations WHERE office_id=o AND customer_id=cid AND relation_type='identity' AND revoked_at IS NULL FOR SHARE;
  IF ident.id IS NULL OR private.portal_identity32(o,ident.membership_id,cid) IS DISTINCT FROM cid THEN RAISE EXCEPTION 'PORTAL_VALIDATION' USING ERRCODE='PT422';END IF;
  IF EXISTS(SELECT FROM private.portal_grants32 WHERE office_id=o AND publication_id=pid AND customer_id=cid AND revoked_at IS NULL AND valid_until>clock_timestamp()) THEN RAISE EXCEPTION 'DOCUMENT_CONFLICT' USING ERRCODE='PT409';END IF;
  artifact:=private.portal_artifact32(p);IF artifact->>'sha256' IS NULL THEN RAISE EXCEPTION 'DOCUMENT_INCOMPLETE' USING ERRCODE='PT422';END IF;
  m:=private.delivery_actor26(o,d.id,'documents.deliver');
  INSERT INTO private.portal_grants32(office_id,publication_id,revision,customer_id,identity_id,membership_id,sha256,file_id,valid_until,created_by,issuer_membership_id,authority_epoch,evidence)
  VALUES(o,pid,p.revision,cid,ident.id,ident.membership_id,artifact->>'sha256',(artifact->>'file_id')::uuid,ends,m.user_id,m.id,(SELECT epoch FROM private.release_authority25 WHERE membership_id=m.id),why)RETURNING id INTO rid;
 ELSIF c->>'kind'='revoke' THEN
  PERFORM private.customer_relation_payload(c,ARRAY['kind','expected_revision','id','version','evidence']);
  SELECT * INTO g FROM private.portal_grants32 WHERE id=private.customer_relation_uuid(c->'id') AND office_id=o AND publication_id=pid FOR UPDATE;
  m:=private.delivery_actor26(o,d.id,'documents.deliver');
  IF g.id IS NULL OR g.revoked_at IS NOT NULL OR c->>'version' IS DISTINCT FROM g.version::text THEN RAISE EXCEPTION 'DOCUMENT_CONFLICT' USING ERRCODE='PT409';END IF;
  UPDATE private.portal_grants32 SET revoked_at=clock_timestamp(),revoked_by=m.user_id,version=version+1 WHERE id=g.id;rid:=g.id;
 ELSE RAISE EXCEPTION 'PORTAL_VALIDATION' USING ERRCODE='PT422';END IF;
 INSERT INTO private.portal_grant_events32(grant_id,actor_id,kind,evidence)VALUES(rid,m.user_id,c->>'kind',why);INSERT INTO private.portal_share_commands32 VALUES(o,m.user_id,sid,k,pid,digest,rid);
 PERFORM private.team_audit(o,m.user_id,CASE WHEN c->>'kind'='grant' THEN 'portal.document_grant' ELSE 'portal.document_revoke' END,'document_publication',pid,k,'{}');RETURN jsonb_build_object('id',rid);
END$$;

-- Public reading of linked requests does NOT change operational scope, attachments or client mutations.
CREATE FUNCTION private.portal_request_visible32(r public.requests,m public.memberships) RETURNS boolean LANGUAGE sql VOLATILE SECURITY INVOKER SET search_path='' AS $$
 SELECT coalesce((m.role_code='client' AND m.active AND m.office_id=r.office_id AND((r.origin='portal' AND r.created_by=m.user_id) OR private.portal_identity32(r.office_id,m.id,r.customer_id)=r.customer_id)
 AND NOT EXISTS(SELECT FROM private.portal_request_visibility hidden WHERE hidden.office_id=r.office_id AND hidden.request_id=r.id)),false);
$$;
CREATE FUNCTION private.portal_request_summary32(r public.requests,m public.memberships) RETURNS jsonb LANGUAGE sql VOLATILE SECURITY INVOKER SET search_path='' AS $$
 SELECT private.request_summary(r,true)||CASE WHEN r.origin='portal' AND r.created_by=m.user_id THEN '{}'::jsonb ELSE jsonb_build_object('title','Atendimento do escritório') END;
$$;
CREATE FUNCTION private.portal_requests_page32(o uuid,q text,scope text,status text,page integer,size integer) RETURNS jsonb LANGUAGE plpgsql SECURITY INVOKER SET search_path='' AS $$
DECLARE m public.memberships;items jsonb;n bigint;query text;v_status text:=status;BEGIN
 m:=private.requests_actor(o);
 IF m.role_code<>'client' OR q IS NULL OR char_length(q)>120 OR q~'[[:cntrl:]]' OR scope IS NULL OR scope NOT IN('mine','queue') OR status IS NULL OR status NOT IN('','recebido','em_analise','aguardando_cliente','concluido','cancelado','aberto','em_atendimento','aguardando_responsavel') OR page IS NULL OR page NOT BETWEEN 1 AND 100000 OR size IS NULL OR size NOT IN(3,5) THEN RAISE EXCEPTION 'REQUEST_VALIDATION' USING ERRCODE='PT422';END IF;query:=lower(btrim(q));
 WITH candidates AS(SELECT r.* FROM public.requests r WHERE r.office_id=o AND((r.origin='portal' AND r.created_by=m.user_id) OR r.customer_id=private.portal_identity32(o,m.id)) AND private.portal_request_visible32(r,m)
 AND(v_status='' OR private.request_public_status(r.status)=v_status) AND(query='' OR strpos(lower((private.portal_request_summary32(r,m)->>'title')||' '||r.protocol),query)>0)),
 subset AS(SELECT * FROM candidates ORDER BY updated_at DESC,id DESC LIMIT size OFFSET(page-1)*size)
 SELECT(SELECT count(*) FROM candidates),coalesce((SELECT jsonb_agg(private.portal_request_summary32(s,m) ORDER BY s.updated_at DESC,s.id DESC) FROM subset s),'[]'::jsonb) INTO n,items;
 PERFORM private.team_require_identity();RETURN jsonb_build_object('items',items,'total',n,'page',page,'page_size',size,'portal',true);
END$$;
CREATE FUNCTION private.portal_request_detail32(o uuid,rid uuid,page integer) RETURNS jsonb LANGUAGE plpgsql SECURITY INVOKER SET search_path='' AS $$
DECLARE m public.memberships;r public.requests;result jsonb;items jsonb;n bigint;owned boolean;BEGIN
 m:=private.requests_actor(o);IF page IS NULL OR page NOT BETWEEN 1 AND 100000 THEN RAISE EXCEPTION 'REQUEST_VALIDATION' USING ERRCODE='PT422';END IF;
 SELECT * INTO r FROM public.requests x WHERE x.office_id=o AND x.id=rid;
 IF r.id IS NULL OR private.portal_request_visible32(r,m) IS NOT TRUE THEN RAISE EXCEPTION 'REQUEST_NOT_FOUND' USING ERRCODE='PT404';END IF;
 owned:=r.origin='portal' AND r.created_by=m.user_id;
 IF owned THEN result:=private.request_detail_record(r,m,page);ELSE
 result:=private.portal_request_summary32(r,m)||jsonb_build_object('portal',true,'linked_view',true,'message','','assignee_name',NULL,'services',coalesce((SELECT jsonb_agg(i.snapshot->'definition'->>'name' ORDER BY i.created_at,i.id) FROM public.request_items i WHERE i.office_id=o AND i.request_id=rid),'[]'::jsonb));END IF;
 SELECT count(*) INTO n FROM private.request_history h WHERE h.office_id=o AND h.request_id=rid AND h.kind IN('created','status');
 SELECT coalesce(jsonb_agg(v),'[]') INTO items FROM(SELECT jsonb_build_object('at',h.created_at,'status',private.request_public_status(coalesce(h.to_status,'aberto')))v FROM private.request_history h WHERE h.office_id=o AND h.request_id=rid AND h.kind IN('created','status') ORDER BY h.created_at DESC,h.id DESC LIMIT 3 OFFSET(page-1)*3)x;
 PERFORM private.team_require_identity();RETURN result||jsonb_build_object('portal_history',jsonb_build_object('items',items,'total',n,'page',page,'page_size',3));
END$$;
ALTER FUNCTION private.requests_page(uuid,text,text,text,integer,integer) RENAME TO requests_page_before32;
CREATE FUNCTION private.requests_page(p_office_id uuid,p_query text,p_scope text,p_status text,p_page integer,p_size integer) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE m public.memberships;BEGIN m:=private.requests_actor(p_office_id);IF m.role_code='client' THEN RETURN private.portal_requests_page32(p_office_id,p_query,p_scope,p_status,p_page,p_size);END IF;RETURN private.requests_page_before32(p_office_id,p_query,p_scope,p_status,p_page,p_size);END$$;
ALTER FUNCTION private.request_detail(uuid,uuid,integer) RENAME TO request_detail_before32;
CREATE FUNCTION private.request_detail(p_office_id uuid,p_request_id uuid,p_page integer) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE m public.memberships;BEGIN m:=private.requests_actor(p_office_id);IF m.role_code='client' THEN RETURN private.portal_request_detail32(p_office_id,p_request_id,p_page);END IF;RETURN private.request_detail_before32(p_office_id,p_request_id,p_page);END$$;
-- A participant grant never expands finance. A bound customer requires its own verified identity.
CREATE OR REPLACE FUNCTION private.finance_client_request(r public.requests,m public.memberships) RETURNS boolean LANGUAGE sql VOLATILE SECURITY INVOKER SET search_path='' AS $$
 SELECT coalesce((r.office_id=m.office_id AND m.role_code='client' AND m.active AND((r.customer_id IS NULL AND r.origin='portal' AND r.created_by=m.user_id) OR private.portal_identity32(r.office_id,m.id,r.customer_id)=r.customer_id)),false);
$$;

CREATE FUNCTION public.portal_documents_page32(o uuid,q text,page integer,size integer) RETURNS jsonb LANGUAGE sql SECURITY INVOKER SET search_path='' AS $$SELECT private.portal_documents_page32(o,q,page,size)$$;
CREATE FUNCTION public.portal_document_state32(o uuid,pid uuid,page integer,size integer) RETURNS jsonb LANGUAGE sql SECURITY INVOKER SET search_path='' AS $$SELECT private.portal_document_state32(o,pid,page,size)$$;
CREATE FUNCTION public.portal_shares_state32(o uuid,pid uuid,page integer) RETURNS jsonb LANGUAGE sql SECURITY INVOKER SET search_path='' AS $$SELECT private.portal_shares_state32(o,pid,page)$$;
CREATE FUNCTION public.portal_share_command32(o uuid,pid uuid,c jsonb,k uuid) RETURNS jsonb LANGUAGE sql SECURITY INVOKER SET search_path='' AS $$SELECT private.portal_share_command32(o,pid,c,k)$$;
DO $$DECLARE f record;BEGIN
 FOR f IN SELECT p.oid::regprocedure sig,p.proname,n.nspname FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname IN('public','private') AND p.proname IN('portal_authority_invalidate32','portal_identity32','portal_artifact32','portal_grant_valid32','portal_recipient_customer32','avaliar_liberacao_before32','avaliar_liberacao25','portal_publication32','portal_documents_page32','portal_document_state32','portal_shares_state32','portal_share_command32','portal_request_visible32','portal_request_summary32','portal_requests_page32','portal_request_detail32','requests_page_before32','request_detail_before32','requests_page','request_detail','finance_client_request') LOOP
 EXECUTE format('REVOKE ALL ON FUNCTION %s FROM PUBLIC,anon,authenticated,service_role',f.sig);
 IF f.proname IN('portal_documents_page32','portal_document_state32','portal_shares_state32','portal_share_command32','requests_page','request_detail') THEN EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO authenticated',f.sig);END IF;
 END LOOP;
END$$;
NOTIFY pgrst,'reload schema';
