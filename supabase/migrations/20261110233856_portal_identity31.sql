-- Consolidates identity08. No Auth accounts, individual grants or document release are created.
CREATE TABLE private.portal_invites31(
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),office_id uuid NOT NULL,customer_id uuid NOT NULL,membership_id uuid NOT NULL,
 token_hash text NOT NULL UNIQUE CHECK(token_hash~'^[a-f0-9]{64}$'),contact_hash text NOT NULL,customer_version integer NOT NULL,
 evidence text NOT NULL CHECK(char_length(evidence) BETWEEN 1 AND 500),created_by uuid NOT NULL REFERENCES auth.users(id),created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
 expires_at timestamptz NOT NULL DEFAULT clock_timestamp()+interval '24 hours',consumed_at timestamptz,revoked_at timestamptz,
 FOREIGN KEY(office_id,customer_id) REFERENCES public.customers(office_id,id),FOREIGN KEY(office_id,membership_id) REFERENCES public.memberships(office_id,id)
);
CREATE INDEX portal_invites31_customer_idx ON private.portal_invites31(office_id,customer_id,created_at DESC);
CREATE INDEX portal_invites31_member_idx ON private.portal_invites31(membership_id);
CREATE INDEX portal_invites31_actor_idx ON private.portal_invites31(created_by);
CREATE TABLE private.portal_representations31(
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),office_id uuid NOT NULL,customer_id uuid NOT NULL,relation_id uuid NOT NULL REFERENCES private.customer_relations(id),
 representative_identity_id uuid NOT NULL REFERENCES private.customer_relations(id),request_id uuid NOT NULL,evidence text NOT NULL CHECK(char_length(evidence) BETWEEN 1 AND 500),valid_until timestamptz NOT NULL,
 created_by uuid NOT NULL REFERENCES auth.users(id),created_at timestamptz NOT NULL DEFAULT clock_timestamp(),revoked_at timestamptz,
 FOREIGN KEY(office_id,customer_id) REFERENCES public.customers(office_id,id),FOREIGN KEY(office_id,request_id) REFERENCES public.requests(office_id,id)
);
CREATE INDEX portal_representations31_scope_idx ON private.portal_representations31(office_id,customer_id,created_at DESC);
CREATE INDEX portal_representations31_relation_idx ON private.portal_representations31(relation_id);
CREATE INDEX portal_representations31_identity_idx ON private.portal_representations31(representative_identity_id);
CREATE INDEX portal_representations31_request_idx ON private.portal_representations31(request_id);
CREATE INDEX portal_representations31_actor_idx ON private.portal_representations31(created_by);
CREATE TABLE private.portal_commands31(
 office_id uuid NOT NULL REFERENCES public.offices(id),actor_id uuid NOT NULL REFERENCES auth.users(id),session_id uuid NOT NULL,key uuid NOT NULL,
 digest text NOT NULL,result jsonb NOT NULL,PRIMARY KEY(office_id,actor_id,session_id,key)
);
CREATE INDEX portal_commands31_actor_idx ON private.portal_commands31(actor_id);
ALTER TABLE private.portal_invites31 ENABLE ROW LEVEL SECURITY;
ALTER TABLE private.portal_representations31 ENABLE ROW LEVEL SECURITY;
ALTER TABLE private.portal_commands31 ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON private.portal_invites31,private.portal_representations31,private.portal_commands31 FROM PUBLIC,anon,authenticated,service_role;

CREATE FUNCTION private.portal_actor31(o uuid,write_access boolean DEFAULT false) RETURNS public.memberships LANGUAGE plpgsql SECURITY INVOKER SET search_path='' AS $$
DECLARE a uuid;m public.memberships;
BEGIN
 a:=private.team_require_identity();
 IF write_access THEN PERFORM 1 FROM public.offices WHERE id=o FOR NO KEY UPDATE;ELSE PERFORM 1 FROM public.offices WHERE id=o FOR SHARE;END IF;
 a:=private.team_require_identity();SELECT * INTO m FROM public.memberships WHERE office_id=o AND user_id=a AND active FOR SHARE;
 IF m.id IS NULL OR private.team_user_active(a,o) IS NOT TRUE THEN RAISE EXCEPTION 'PORTAL_FORBIDDEN' USING ERRCODE='PT403';END IF;
 RETURN m;
END$$;
CREATE FUNCTION private.portal_customer31(o uuid,cid uuid) RETURNS public.customers LANGUAGE plpgsql SECURITY INVOKER SET search_path='' AS $$
DECLARE a uuid;c public.customers;
BEGIN
 a:=private.customers_actor(o,'customers.verify');SELECT * INTO c FROM public.customers WHERE office_id=o AND id=cid FOR UPDATE;
 a:=private.customers_actor(o,'customers.verify');IF c.id IS NULL OR private.customer_in_scope(c,a) IS NOT TRUE THEN RAISE EXCEPTION 'PORTAL_NOT_FOUND' USING ERRCODE='PT404';END IF;RETURN c;
END$$;
CREATE FUNCTION private.portal_rep_valid31(g private.portal_representations31,m public.memberships) RETURNS boolean LANGUAGE sql VOLATILE SECURITY INVOKER SET search_path='' AS $$
 SELECT m.role_code='client' AND m.active AND m.office_id=g.office_id AND g.revoked_at IS NULL AND g.valid_until>clock_timestamp()
 AND EXISTS(SELECT FROM private.customer_relations rep JOIN private.customer_relations ident ON ident.office_id=rep.office_id AND ident.customer_id=rep.representative_customer_id
 JOIN public.customers principal ON principal.office_id=rep.office_id AND principal.id=rep.customer_id
 JOIN public.customers representative ON representative.office_id=rep.office_id AND representative.id=rep.representative_customer_id
 JOIN public.requests r ON r.office_id=g.office_id AND r.id=g.request_id AND r.customer_id=g.customer_id
 WHERE rep.id=g.relation_id AND rep.office_id=g.office_id AND rep.customer_id=g.customer_id AND rep.relation_type='representation'
 AND rep.revoked_at IS NULL AND rep.valid_from<=clock_timestamp() AND(rep.valid_until IS NULL OR rep.valid_until>clock_timestamp())
 AND ident.id=g.representative_identity_id AND ident.relation_type='identity' AND ident.membership_id=m.id AND ident.revoked_at IS NULL AND ident.valid_from<=clock_timestamp()
 AND principal.blocked_at IS NULL AND principal.merged_into_id IS NULL AND representative.blocked_at IS NULL AND representative.merged_into_id IS NULL);
$$;
CREATE FUNCTION private.portal_state31(o uuid,cid uuid DEFAULT NULL) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE m public.memberships;c public.customers;ident jsonb;requests jsonb:='[]';invites jsonb:='[]';grants jsonb:='[]';
BEGIN
 m:=private.portal_actor31(o,cid IS NOT NULL);
 IF m.role_code='client' THEN
  IF cid IS NOT NULL THEN RAISE EXCEPTION 'PORTAL_FORBIDDEN' USING ERRCODE='PT403';END IF;
  SELECT jsonb_build_object('name',customer_row.name,'verified_at',r.created_at) INTO ident FROM private.customer_relations r JOIN public.customers customer_row ON customer_row.id=r.customer_id AND customer_row.office_id=r.office_id
  WHERE r.office_id=o AND r.membership_id=m.id AND r.relation_type='identity' AND r.revoked_at IS NULL AND r.valid_from<=clock_timestamp() AND customer_row.blocked_at IS NULL AND customer_row.merged_into_id IS NULL;
  SELECT coalesce(jsonb_agg(v),'[]') INTO grants FROM(SELECT jsonb_build_object('id',g.id,'protocol',r.protocol,'status',private.request_summary(r,true)->>'public_status','valid_until',g.valid_until,'scope','request_status')v
   FROM private.portal_representations31 g JOIN public.requests r ON r.office_id=g.office_id AND r.id=g.request_id WHERE g.office_id=o AND g.representative_identity_id IN(SELECT identity_link.id FROM private.customer_relations identity_link WHERE identity_link.office_id=o AND identity_link.membership_id=m.id AND identity_link.relation_type='identity' AND identity_link.revoked_at IS NULL) AND private.portal_rep_valid31(g,m) ORDER BY g.created_at DESC,g.id LIMIT 20)x;
 ELSE
  c:=private.portal_customer31(o,cid);
  IF private.current_permissions(o) @> ARRAY['requests.read'] THEN SELECT coalesce(jsonb_agg(v),'[]') INTO requests FROM(SELECT jsonb_build_object('id',r.id,'protocol',r.protocol)v FROM public.requests r WHERE r.office_id=o AND r.customer_id=cid AND private.request_in_scope(r,m) ORDER BY r.created_at DESC,r.id LIMIT 20)x;END IF;
  SELECT coalesce(jsonb_agg(v),'[]') INTO invites FROM(SELECT jsonb_build_object('id',i.id,'created_at',i.created_at,'expires_at',i.expires_at,'status',CASE WHEN i.revoked_at IS NOT NULL THEN 'revoked' WHEN i.consumed_at IS NOT NULL THEN 'consumed' WHEN i.expires_at<=clock_timestamp() THEN 'expired' ELSE 'pending' END)v FROM private.portal_invites31 i WHERE i.office_id=o AND i.customer_id=cid ORDER BY i.created_at DESC,i.id LIMIT 20)x;
  SELECT coalesce(jsonb_agg(v),'[]') INTO grants FROM(SELECT jsonb_build_object('id',g.id,'protocol',r.protocol,'status',CASE WHEN g.revoked_at IS NOT NULL THEN 'revoked' WHEN g.valid_until<=clock_timestamp() THEN 'expired' WHEN NOT EXISTS(SELECT FROM public.memberships recipient JOIN private.customer_relations verified ON verified.membership_id=recipient.id AND verified.id=g.representative_identity_id WHERE private.portal_rep_valid31(g,recipient)) THEN 'unavailable' ELSE 'authorized' END,'valid_until',g.valid_until,'scope','request_status')v FROM private.portal_representations31 g JOIN public.requests r ON r.office_id=g.office_id AND r.id=g.request_id WHERE g.office_id=o AND g.customer_id=cid AND private.current_permissions(o) @> ARRAY['requests.read'] AND private.request_in_scope(r,m) ORDER BY g.created_at DESC,g.id LIMIT 20)x;
 END IF;
 PERFORM private.team_require_identity();RETURN jsonb_build_object('customer_version',c.version,'requests',requests,'identity',ident,'invitations',invites,'representations',grants,'limit',20);
END$$;
CREATE FUNCTION private.portal_command31(o uuid,cid uuid,c jsonb,k uuid) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE m public.memberships;customer public.customers;i private.portal_invites31;g private.portal_representations31;rep private.customer_relations;
 target public.memberships;existing private.customer_relations;actor uuid;sid uuid;kind text;v_token_hash text;contact_hash text;ev text;ends timestamptz;result jsonb;prior private.portal_commands31;d text;rid uuid;
BEGIN
 IF k IS NULL OR c IS NULL OR jsonb_typeof(c)<>'object' THEN RAISE EXCEPTION 'PORTAL_VALIDATION' USING ERRCODE='PT422';END IF;
 m:=private.portal_actor31(o,true);actor:=m.user_id;sid:=(auth.jwt()->>'session_id')::uuid;kind:=c->>'kind';
 IF m.role_code='client' THEN
  IF cid IS NOT NULL OR kind IS DISTINCT FROM 'accept' THEN RAISE EXCEPTION 'PORTAL_FORBIDDEN' USING ERRCODE='PT403';END IF;
 ELSE customer:=private.portal_customer31(o,cid);END IF;
 IF kind='accept' OR kind='issue' THEN
  IF c->>'token' IS NULL OR c->>'token' !~ '^[a-f0-9]{64}$' THEN RAISE EXCEPTION 'PORTAL_VALIDATION' USING ERRCODE='PT422';END IF;
  v_token_hash:=encode(extensions.digest(c->>'token','sha256'),'hex');
 END IF;
 d:=encode(extensions.digest(c::text||coalesce(cid::text,''),'sha256'),'hex');
 IF kind='represent' AND NOT private.current_permissions(o) @> ARRAY['customers.relate','requests.read'] THEN RAISE EXCEPTION 'PORTAL_FORBIDDEN' USING ERRCODE='PT403';END IF;
 SELECT * INTO prior FROM private.portal_commands31 WHERE office_id=o AND actor_id=actor AND session_id=sid AND key=k;
  IF prior.key IS NOT NULL THEN IF prior.digest<>d THEN RAISE EXCEPTION 'PORTAL_CONFLICT' USING ERRCODE='PT409';END IF;
   IF kind='represent' AND NOT EXISTS(SELECT FROM private.portal_representations31 gr JOIN public.requests req ON req.office_id=gr.office_id AND req.id=gr.request_id JOIN public.memberships recipient ON recipient.office_id=gr.office_id AND recipient.id=(SELECT membership_id FROM private.customer_relations WHERE id=gr.representative_identity_id) WHERE gr.id=(prior.result->>'id')::uuid AND gr.revoked_at IS NULL AND private.portal_rep_valid31(gr,recipient) AND private.request_in_scope(req,m)) THEN RAISE EXCEPTION 'PORTAL_FORBIDDEN' USING ERRCODE='PT403';END IF;
   IF kind='accept' AND NOT EXISTS(SELECT FROM private.portal_invites31 inv JOIN private.customer_relations ident ON ident.office_id=inv.office_id AND ident.customer_id=inv.customer_id AND ident.membership_id=inv.membership_id AND ident.relation_type='identity' AND ident.revoked_at IS NULL WHERE inv.id=(prior.result->>'id')::uuid AND inv.membership_id=m.id AND inv.token_hash=v_token_hash AND inv.consumed_at IS NOT NULL) THEN RAISE EXCEPTION 'PORTAL_FORBIDDEN' USING ERRCODE='PT403';END IF;
   RETURN prior.result;END IF;
 IF kind='issue' AND m.role_code<>'client' THEN
  PERFORM private.customer_relation_payload(c,ARRAY['kind','membership_id','token','evidence','expected_version']);
  IF c->>'expected_version' IS DISTINCT FROM customer.version::text THEN RAISE EXCEPTION 'PORTAL_CONFLICT' USING ERRCODE='PT409';END IF;
  ev:=private.customer_relation_evidence(c->'evidence');
  SELECT * INTO target FROM public.memberships WHERE office_id=o AND id=private.customer_relation_uuid(c->'membership_id') AND role_code='client' AND active FOR SHARE;
  IF target.id IS NULL OR private.customer_relation_member_active(o,target.id,true) IS NOT TRUE THEN RAISE EXCEPTION 'PORTAL_VALIDATION' USING ERRCODE='PT422';END IF;
  -- Identity collisions are resolved by the existing explicit revoke/merge flow, never by contact matching.
  IF EXISTS(SELECT FROM private.customer_relations WHERE office_id=o AND relation_type='identity' AND revoked_at IS NULL AND (customer_id=cid OR membership_id=target.id) AND(customer_id<>cid OR membership_id<>target.id)) THEN RAISE EXCEPTION 'PORTAL_CONFLICT' USING ERRCODE='PT409';END IF;
  SELECT encode(extensions.digest(lower(btrim(email)),'sha256'),'hex') INTO contact_hash FROM auth.users WHERE id=target.user_id AND email_confirmed_at IS NOT NULL;
  IF contact_hash IS NULL THEN RAISE EXCEPTION 'PORTAL_VALIDATION' USING ERRCODE='PT422';END IF;
  UPDATE private.portal_invites31 SET revoked_at=clock_timestamp() WHERE office_id=o AND customer_id=cid AND consumed_at IS NULL AND revoked_at IS NULL;
  INSERT INTO private.portal_invites31(office_id,customer_id,membership_id,token_hash,contact_hash,customer_version,evidence,created_by)VALUES(o,cid,target.id,v_token_hash,contact_hash,customer.version,ev,actor) RETURNING id INTO rid;
 ELSIF kind='accept' AND m.role_code='client' THEN
  PERFORM private.customer_relation_payload(c,ARRAY['kind','token']);
  SELECT * INTO i FROM private.portal_invites31 WHERE office_id=o AND portal_invites31.token_hash=v_token_hash AND membership_id=m.id FOR UPDATE;
  IF i.id IS NULL OR i.revoked_at IS NOT NULL OR i.consumed_at IS NOT NULL OR i.expires_at<=clock_timestamp() THEN RAISE EXCEPTION 'PORTAL_INVALID_TOKEN' USING ERRCODE='PT422';END IF;
  SELECT * INTO customer FROM public.customers WHERE office_id=o AND id=i.customer_id FOR UPDATE;
  m:=private.portal_actor31(o,true);
  SELECT encode(extensions.digest(lower(btrim(email)),'sha256'),'hex') INTO contact_hash FROM auth.users WHERE id=actor AND email_confirmed_at IS NOT NULL;
  IF customer.id IS NULL OR customer.blocked_at IS NOT NULL OR customer.merged_into_id IS NOT NULL OR customer.version<>i.customer_version OR contact_hash IS DISTINCT FROM i.contact_hash OR i.expires_at<=clock_timestamp() THEN RAISE EXCEPTION 'PORTAL_INVALID_TOKEN' USING ERRCODE='PT422';END IF;
  SELECT * INTO existing FROM private.customer_relations WHERE office_id=o AND relation_type='identity' AND revoked_at IS NULL AND(customer_id=customer.id OR membership_id=m.id) LIMIT 1;
  IF existing.id IS NOT NULL AND(existing.customer_id<>customer.id OR existing.membership_id<>m.id) THEN RAISE EXCEPTION 'PORTAL_CONFLICT' USING ERRCODE='PT409';END IF;
  IF existing.id IS NULL THEN
   INSERT INTO private.customer_relations(office_id,customer_id,relation_type,membership_id,evidence,valid_from,created_by)VALUES(o,customer.id,'identity',m.id,i.evidence,clock_timestamp(),i.created_by);
   UPDATE public.customers SET version=version+1,updated_at=clock_timestamp() WHERE id=customer.id;
  END IF;
  UPDATE private.portal_invites31 SET consumed_at=clock_timestamp() WHERE id=i.id;rid:=i.id;
 ELSIF kind='revoke_invite' THEN
  PERFORM private.customer_relation_payload(c,ARRAY['kind','id']);
  UPDATE private.portal_invites31 SET revoked_at=clock_timestamp() WHERE id=private.customer_relation_uuid(c->'id') AND office_id=o AND customer_id=cid AND consumed_at IS NULL AND revoked_at IS NULL RETURNING id INTO rid;
 ELSIF kind='represent' THEN
  PERFORM private.customer_relation_payload(c,ARRAY['kind','relation_id','request_id','valid_until','evidence']);ev:=private.customer_relation_evidence(c->'evidence');ends:=private.customer_relation_time(c->'valid_until',false);
  IF ends<=clock_timestamp() OR ends>clock_timestamp()+interval '30 days' OR NOT private.current_permissions(o) @> ARRAY['customers.relate','requests.read'] THEN RAISE EXCEPTION 'PORTAL_VALIDATION' USING ERRCODE='PT422';END IF;
  SELECT * INTO rep FROM private.customer_relations WHERE office_id=o AND id=private.customer_relation_uuid(c->'relation_id') AND customer_id=cid AND relation_type='representation' FOR SHARE;
  IF rep.id IS NULL OR rep.revoked_at IS NOT NULL OR rep.valid_from>clock_timestamp() OR(rep.valid_until IS NOT NULL AND rep.valid_until<ends) THEN RAISE EXCEPTION 'PORTAL_VALIDATION' USING ERRCODE='PT422';END IF;
  IF NOT EXISTS(SELECT FROM public.requests r WHERE r.office_id=o AND r.id=private.customer_relation_uuid(c->'request_id') AND r.customer_id=cid AND private.request_in_scope(r,m)) THEN RAISE EXCEPTION 'PORTAL_NOT_FOUND' USING ERRCODE='PT404';END IF;
  IF NOT EXISTS(SELECT FROM public.customers rc WHERE rc.office_id=o AND rc.id=rep.representative_customer_id AND private.customer_in_scope(rc,actor)) THEN RAISE EXCEPTION 'PORTAL_NOT_FOUND' USING ERRCODE='PT404';END IF;
  SELECT * INTO existing FROM private.customer_relations WHERE office_id=o AND customer_id=rep.representative_customer_id AND relation_type='identity' AND revoked_at IS NULL;
  IF existing.id IS NULL OR private.customer_relation_member_active(o,existing.membership_id,true) IS NOT TRUE THEN RAISE EXCEPTION 'PORTAL_VALIDATION' USING ERRCODE='PT422';END IF;
  IF EXISTS(SELECT FROM private.portal_representations31 WHERE office_id=o AND customer_id=cid AND relation_id=rep.id AND request_id=private.customer_relation_uuid(c->'request_id') AND revoked_at IS NULL AND valid_until>clock_timestamp()) THEN RAISE EXCEPTION 'PORTAL_CONFLICT' USING ERRCODE='PT409';END IF;
  INSERT INTO private.portal_representations31(office_id,customer_id,relation_id,representative_identity_id,request_id,evidence,valid_until,created_by)VALUES(o,cid,rep.id,existing.id,private.customer_relation_uuid(c->'request_id'),ev,ends,actor) RETURNING id INTO rid;
 ELSIF kind='revoke_representation' THEN
  PERFORM private.customer_relation_payload(c,ARRAY['kind','id']);
  UPDATE private.portal_representations31 SET revoked_at=clock_timestamp() WHERE id=private.customer_relation_uuid(c->'id') AND office_id=o AND customer_id=cid AND revoked_at IS NULL RETURNING id INTO rid;
 ELSE RAISE EXCEPTION 'PORTAL_VALIDATION' USING ERRCODE='PT422';END IF;
 IF rid IS NULL THEN RAISE EXCEPTION 'PORTAL_CONFLICT' USING ERRCODE='PT409';END IF;
 PERFORM private.team_require_identity();PERFORM private.team_audit(o,actor,'portal.'||kind,'portal_link',rid,k,'{}');result:=jsonb_build_object('id',rid);
 INSERT INTO private.portal_commands31 VALUES(o,actor,sid,k,d,result);
 RETURN result;
EXCEPTION WHEN unique_violation THEN RAISE EXCEPTION 'PORTAL_CONFLICT' USING ERRCODE='PT409';
END$$;
CREATE FUNCTION public.portal_state31(o uuid,cid uuid DEFAULT NULL) RETURNS jsonb LANGUAGE sql SECURITY INVOKER SET search_path='' AS $$SELECT private.portal_state31(o,cid)$$;
CREATE FUNCTION public.portal_command31(o uuid,cid uuid,c jsonb,k uuid) RETURNS jsonb LANGUAGE sql SECURITY INVOKER SET search_path='' AS $$SELECT private.portal_command31(o,cid,c,k)$$;
REVOKE ALL ON FUNCTION private.portal_actor31(uuid,boolean),private.portal_customer31(uuid,uuid),private.portal_rep_valid31(private.portal_representations31,public.memberships),private.portal_state31(uuid,uuid),private.portal_command31(uuid,uuid,jsonb,uuid),public.portal_state31(uuid,uuid),public.portal_command31(uuid,uuid,jsonb,uuid) FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION private.portal_state31(uuid,uuid),private.portal_command31(uuid,uuid,jsonb,uuid),public.portal_state31(uuid,uuid),public.portal_command31(uuid,uuid,jsonb,uuid) TO authenticated;

-- The client role itself identifies the portal audience. Internal capabilities stay internal.
DELETE FROM public.role_permissions WHERE role_code='client' AND permission_code='foundation.access';
DO $$DECLARE s text;BEGIN
 s:=pg_get_functiondef('private.team_permissions_for_member(uuid)'::regprocedure);
 s:=replace(s,'WHERE m.id=p_membership_id AND','WHERE m.role_code<>''client'' AND m.id=p_membership_id AND');EXECUTE s;
 s:=pg_get_functiondef('private.requests_actor(uuid,boolean,text)'::regprocedure);
 s:=replace(s,'OR NOT caps @> ARRAY[''foundation.access'']','OR (m.role_code<>''client'' AND NOT caps @> ARRAY[''foundation.access''])');EXECUTE s;
 s:=pg_get_functiondef('private.notifications_actor(uuid,boolean)'::regprocedure);
 s:=replace(s,'OR (private.current_permissions(p_office_id) @> ARRAY[''foundation.access'']) IS NOT TRUE','OR (m.role_code<>''client'' AND (private.current_permissions(p_office_id) @> ARRAY[''foundation.access'']) IS NOT TRUE)');EXECUTE s;
 s:=pg_get_functiondef('private.service_categories_state(uuid)'::regprocedure);
 s:=replace(s,'OR NOT private.current_permissions(p_office_id) @> ARRAY[''foundation.access'']','OR private.team_user_active(actor,p_office_id) IS NOT TRUE OR (m.role_code<>''client'' AND NOT private.current_permissions(p_office_id) @> ARRAY[''foundation.access''])');EXECUTE s;
END$$;
CREATE FUNCTION private.client_access31(o uuid) RETURNS boolean LANGUAGE sql VOLATILE SECURITY DEFINER SET search_path='' AS $$
 SELECT EXISTS(SELECT FROM public.memberships m JOIN auth.sessions s ON s.user_id=m.user_id AND s.id::text=auth.jwt()->>'session_id'
 WHERE m.office_id=o AND m.user_id=auth.uid() AND m.role_code='client' AND m.active AND private.team_user_active(m.user_id,o)
 AND private.session_activity_valid(m.user_id,s.id));
$$;
REVOKE ALL ON FUNCTION private.client_access31(uuid) FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION private.client_access31(uuid) TO authenticated;
ALTER POLICY offices_read ON public.offices USING(private.current_permissions(id) @> ARRAY['foundation.access'] OR private.client_access31(id));
ALTER POLICY memberships_read ON public.memberships USING(user_id=(SELECT auth.uid()) AND(private.current_permissions(office_id) @> ARRAY['foundation.access'] OR private.client_access31(office_id)));
