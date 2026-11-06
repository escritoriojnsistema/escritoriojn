-- Retention decisions are explicit, per class/type and versioned. No legal period is seeded.
ALTER TABLE private.account_retention_policies ADD CONSTRAINT retention_start_event CHECK(start_event IS NULL OR start_event IN('account_closed','request_closed','verified_event'));
ALTER TABLE private.account_retention_holds ADD COLUMN released_by uuid REFERENCES auth.users(id),ADD COLUMN release_reason text;
CREATE TABLE private.retention_policy_history(office_id uuid NOT NULL REFERENCES public.offices(id),data_class text NOT NULL,document_type text NOT NULL,revision integer NOT NULL,policy jsonb NOT NULL,PRIMARY KEY(office_id,data_class,document_type,revision));
CREATE TABLE private.retention_items(
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),office_id uuid NOT NULL REFERENCES public.offices(id),user_id uuid NOT NULL REFERENCES auth.users(id),
 target_kind text NOT NULL CHECK(target_kind IN('file','document')),target_id uuid NOT NULL,request_id uuid NOT NULL,
 data_class text NOT NULL CHECK(data_class IN('registration','request','signed_document','financial','tax','audit','optional')),document_type text NOT NULL CHECK(char_length(document_type) BETWEEN 1 AND 100),
 classified_by uuid NOT NULL REFERENCES auth.users(id),classified_session_id uuid NOT NULL,scheduling_retry_at timestamptz NOT NULL DEFAULT clock_timestamp(),classified_at timestamptz NOT NULL DEFAULT clock_timestamp(),
 verified_start_at timestamptz,verified_start_reason text CHECK(char_length(verified_start_reason) BETWEEN 1 AND 1000),
 review_due_at timestamptz NOT NULL DEFAULT clock_timestamp()+interval '30 days',revision integer NOT NULL DEFAULT 1,CHECK((verified_start_at IS NULL)=(verified_start_reason IS NULL)),
 reserved_at timestamptz,purged_at timestamptz,UNIQUE(office_id,target_kind,target_id),FOREIGN KEY(office_id,request_id) REFERENCES public.requests(office_id,id)
);
CREATE TABLE private.retention_purges(
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),item_id uuid NOT NULL UNIQUE REFERENCES private.retention_items(id),office_id uuid NOT NULL REFERENCES public.offices(id),
 authorized_by uuid NOT NULL REFERENCES auth.users(id),authorized_at timestamptz NOT NULL DEFAULT clock_timestamp(),policy_snapshot jsonb NOT NULL,
 objects jsonb NOT NULL,token uuid NOT NULL DEFAULT gen_random_uuid(),lease_until timestamptz,attempts integer NOT NULL DEFAULT 0,next_attempt_at timestamptz NOT NULL DEFAULT clock_timestamp(),
 completed_at timestamptz,cleanup_plan_id uuid REFERENCES private.file_cleanup_plans(id)
);
-- No role can manufacture this context. Only the revoked private completion adapter inserts it.
CREATE TABLE private.retention_redaction_context(backend_pid integer NOT NULL,transaction_id bigint NOT NULL,purge_id uuid NOT NULL REFERENCES private.retention_purges(id),token uuid NOT NULL,PRIMARY KEY(backend_pid,transaction_id));
CREATE INDEX retention_pending_idx ON private.retention_purges(next_attempt_at) WHERE completed_at IS NULL;
CREATE INDEX retention_review_idx ON private.retention_items(office_id,review_due_at) WHERE purged_at IS NULL;
DO $$DECLARE t text;BEGIN FOREACH t IN ARRAY ARRAY['retention_items','retention_purges','retention_policy_history','retention_redaction_context'] LOOP EXECUTE format('ALTER TABLE private.%I ENABLE ROW LEVEL SECURITY',t);EXECUTE format('REVOKE ALL ON private.%I FROM PUBLIC,anon,authenticated,service_role',t);END LOOP;END$$;
CREATE FUNCTION private.retention_actor(o uuid) RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE actor uuid;BEGIN actor:=private.governance_actor(o,'archives.manage',true);
 IF NOT EXISTS(SELECT FROM public.memberships WHERE office_id=o AND user_id=actor AND active AND role_code IN('owner','admin')) THEN RAISE EXCEPTION 'RETENTION_FORBIDDEN' USING ERRCODE='PT403';END IF;RETURN actor;END$$;
-- Domain read permissions and current source scope apply to discovery and classification too.
CREATE FUNCTION private.retention_target_visible(o uuid,k text,target uuid) RETURNS boolean LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path='' AS $$
DECLARE d public.documents;f public.files;m public.memberships;BEGIN
 IF k='document' THEN SELECT * INTO d FROM public.documents WHERE office_id=o AND id=target;IF d.id IS NULL THEN RETURN false;END IF;
 PERFORM private.documents_access21_before_retention(o,d.request_id,NULL,d.id);RETURN true;
 ELSIF k='file' THEN m:=private.files_actor(o);SELECT * INTO f FROM public.files WHERE office_id=o AND id=target;IF f.id IS NULL THEN RETURN false;END IF;PERFORM private.files_request(o,f.request_id,m);RETURN true;END IF;RETURN false;
 EXCEPTION WHEN SQLSTATE 'PT403' OR SQLSTATE 'PT404' OR SQLSTATE 'PT409' THEN RETURN false;END$$;
-- Explicit-actor equivalents of canonical scope: background work has no user JWT.
CREATE FUNCTION private.retention_request_scope_as(r public.requests,m public.memberships,caps text[]) RETURNS boolean LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path='' AS $$
DECLARE scoped boolean;BEGIN
 IF r.office_id IS DISTINCT FROM m.office_id OR m.id IS NULL OR NOT m.active OR m.role_code NOT IN('owner','admin') THEN RETURN false;END IF;
 IF r.category='account_correction' THEN scoped:=caps @> ARRAY['requests.read','accounts.corrections.read'];
 ELSE scoped:=r.created_by=m.user_id OR r.assignee_id=m.id OR caps @> ARRAY['requests.read_all'] OR EXISTS(SELECT FROM private.request_assignments a WHERE a.office_id=r.office_id AND a.request_id=r.id AND a.membership_id=m.id);END IF;
 IF NOT coalesce(scoped,false) THEN RETURN false;END IF;
 RETURN private.request_execution_allowed(r,m);END$$;
CREATE FUNCTION private.retention_customer_scope_as(c public.customers,actor uuid,caps text[]) RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path='' AS $$
 SELECT c.id IS NOT NULL AND c.blocked_at IS NULL AND((c.merged_into_id IS NULL AND(c.created_by=actor OR caps @> ARRAY['customers.read_all'] OR EXISTS(SELECT FROM private.customer_relations cr JOIN public.memberships mb ON mb.office_id=cr.office_id AND mb.id=cr.membership_id WHERE cr.office_id=c.office_id AND cr.customer_id=c.id AND cr.relation_type='assignment' AND cr.revoked_at IS NULL AND cr.valid_from<=clock_timestamp() AND(cr.valid_until IS NULL OR cr.valid_until>clock_timestamp()) AND mb.user_id=actor AND mb.active AND mb.role_code<>'client'))) OR(c.merged_into_id IS NOT NULL AND caps @> ARRAY['customers.read_all']));$$;
-- Background authorization uses the recorded administrator, never a fabricated user JWT.
CREATE FUNCTION private.retention_target_visible_as(o uuid,k text,target uuid,actor uuid) RETURNS boolean LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path='' AS $$
DECLARE d public.documents;r public.requests;m public.memberships;caps text[];cid uuid;c public.customers;BEGIN
 SELECT * INTO m FROM public.memberships WHERE office_id=o AND user_id=actor AND active AND role_code IN('owner','admin');
 caps:=coalesce(private.team_permissions_for_member(m.id),'{}');
 IF m.id IS NULL OR NOT private.team_user_active(actor,o) OR NOT caps @> ARRAY['foundation.access','archives.manage','requests.read','customers.read'] THEN RETURN false;END IF;
 IF k='document' THEN SELECT * INTO d FROM public.documents WHERE office_id=o AND id=target;IF d.id IS NULL OR NOT caps @> ARRAY['documents.read'] THEN RETURN false;END IF;SELECT * INTO r FROM public.requests WHERE office_id=o AND id=d.request_id;
 ELSIF k='file' THEN IF NOT caps @> ARRAY['files.read'] THEN RETURN false;END IF;SELECT rq.* INTO r FROM public.requests rq JOIN public.files f ON f.office_id=rq.office_id AND f.request_id=rq.id WHERE f.office_id=o AND f.id=target;
 ELSE RETURN false;END IF;
 IF r.id IS NULL OR private.retention_request_scope_as(r,m,caps) IS NOT TRUE THEN RETURN false;END IF;
 IF k='document' THEN
 FOR cid IN SELECT DISTINCT x FROM(SELECT r.customer_id x UNION SELECT customer_id FROM public.document_participants WHERE office_id=o AND document_id=target UNION SELECT source_customer_id FROM private.document_revisions WHERE office_id=o AND document_id=target)z WHERE x IS NOT NULL ORDER BY x LOOP
 SELECT * INTO c FROM public.customers WHERE office_id=o AND id=cid FOR SHARE;
 IF private.retention_customer_scope_as(c,actor,caps) IS NOT TRUE THEN RETURN false;END IF;END LOOP;END IF;RETURN true;END$$;
CREATE FUNCTION private.retention_policy_set(p_office_id uuid,p_input jsonb) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE actor uuid;old private.account_retention_policies;p private.account_retention_policies;BEGIN
 actor:=private.retention_actor(p_office_id);
 IF p_input IS NULL OR jsonb_typeof(p_input)<>'object' OR (SELECT count(*) FROM jsonb_object_keys(p_input))<>10 OR NOT p_input ?& ARRAY['data_class','document_type','legal_basis','justification','start_event','period_days','review_at','backup_disposition','revision','approved'] OR p_input->'approved' IS DISTINCT FROM 'true'::jsonb OR p_input->>'data_class' NOT IN('registration','request','signed_document','financial','tax','audit','optional') OR p_input->>'start_event' NOT IN('account_closed','request_closed','verified_event') OR NOT (p_input->>'period_days' ~ '^(0|[1-9][0-9]{0,4})$') OR (p_input->>'period_days')::integer>36525 OR NOT(p_input->>'revision' ~ '^(0|[1-9][0-9]{0,8})$') THEN RAISE EXCEPTION 'RETENTION_VALIDATION' USING ERRCODE='PT422';END IF;
 IF jsonb_typeof(p_input->'data_class')<>'string' OR jsonb_typeof(p_input->'start_event')<>'string' OR jsonb_typeof(p_input->'period_days')<>'number' OR jsonb_typeof(p_input->'revision')<>'number' OR jsonb_typeof(p_input->'review_at')<>'string' THEN RAISE EXCEPTION 'RETENTION_VALIDATION' USING ERRCODE='PT422';END IF;
 IF EXISTS(SELECT FROM unnest(ARRAY['document_type','legal_basis','justification','backup_disposition'])k WHERE jsonb_typeof(p_input->k)<>'string' OR char_length(btrim(p_input->>k)) NOT BETWEEN 1 AND CASE WHEN k='document_type' THEN 100 ELSE 2000 END) OR (p_input->>'review_at')::timestamptz<=clock_timestamp() OR (p_input->>'review_at')::timestamptz>clock_timestamp()+interval '366 days' THEN RAISE EXCEPTION 'RETENTION_VALIDATION' USING ERRCODE='PT422';END IF;
 SELECT * INTO old FROM private.account_retention_policies WHERE office_id=p_office_id AND data_class=p_input->>'data_class' AND document_type=p_input->>'document_type' FOR UPDATE;
 IF coalesce(old.revision,0)<>(p_input->>'revision')::integer OR EXISTS(SELECT FROM private.retention_items i JOIN private.retention_purges j ON j.item_id=i.id WHERE i.office_id=p_office_id AND i.data_class=p_input->>'data_class' AND i.document_type=p_input->>'document_type' AND j.completed_at IS NULL) THEN RAISE EXCEPTION 'RETENTION_CONFLICT' USING ERRCODE='PT409';END IF;
 INSERT INTO private.account_retention_policies(office_id,data_class,document_type,legal_basis,justification,start_event,period_days,approved_by,approved_at,review_at,backup_disposition,revision)
 VALUES(p_office_id,p_input->>'data_class',p_input->>'document_type',p_input->>'legal_basis',p_input->>'justification',p_input->>'start_event',(p_input->>'period_days')::integer,actor,clock_timestamp(),(p_input->>'review_at')::timestamptz,p_input->>'backup_disposition',coalesce(old.revision,0)+1)
 ON CONFLICT(office_id,data_class,document_type) DO UPDATE SET legal_basis=EXCLUDED.legal_basis,justification=EXCLUDED.justification,start_event=EXCLUDED.start_event,period_days=EXCLUDED.period_days,approved_by=actor,approved_at=EXCLUDED.approved_at,review_at=EXCLUDED.review_at,backup_disposition=EXCLUDED.backup_disposition,revision=EXCLUDED.revision RETURNING * INTO p;
 UPDATE private.retention_items SET scheduling_retry_at=clock_timestamp() WHERE office_id=p_office_id AND data_class=p.data_class AND document_type=p.document_type AND reserved_at IS NULL;
 INSERT INTO private.retention_policy_history VALUES(p.office_id,p.data_class,p.document_type,p.revision,to_jsonb(p));
 PERFORM private.team_audit(p_office_id,actor,'retention.policy_approved','office',p_office_id,gen_random_uuid(),'{}');RETURN jsonb_build_object('policy',to_jsonb(p));
 EXCEPTION WHEN invalid_text_representation OR invalid_datetime_format OR datetime_field_overflow OR check_violation OR not_null_violation THEN RAISE EXCEPTION 'RETENTION_VALIDATION' USING ERRCODE='PT422';END$$;
-- Classify only a closed account's closed request and validate all known data subjects.
CREATE FUNCTION private.retention_classify(p_office_id uuid,p_input jsonb) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE actor uuid;r public.requests;m public.memberships;rid uuid;it private.retention_items;doc uuid;uid uuid;verified_at timestamptz;verified_reason text;BEGIN
 actor:=private.retention_actor(p_office_id);
 IF p_input IS NULL OR jsonb_typeof(p_input)<>'object' OR (SELECT count(*) FROM jsonb_object_keys(p_input)) NOT IN(6,8) OR (p_input-ARRAY['user_id','target_kind','target_id','data_class','document_type','revision','verified_start_at','verified_start_reason'])<>'{}' OR NOT p_input ?& ARRAY['user_id','target_kind','target_id','data_class','document_type','revision'] OR p_input->>'target_kind' NOT IN('file','document') OR p_input->>'data_class' NOT IN('registration','request','signed_document','financial','tax','audit','optional') OR char_length(btrim(p_input->>'document_type')) NOT BETWEEN 1 AND 100 THEN RAISE EXCEPTION 'RETENTION_VALIDATION' USING ERRCODE='PT422';END IF;
 IF jsonb_typeof(p_input->'target_kind')<>'string' OR jsonb_typeof(p_input->'data_class')<>'string' OR jsonb_typeof(p_input->'document_type')<>'string' OR jsonb_typeof(p_input->'revision')<>'number' OR (p_input->>'revision')::integer<0 THEN RAISE EXCEPTION 'RETENTION_VALIDATION' USING ERRCODE='PT422';END IF;
 IF (p_input ? 'verified_start_at' AND jsonb_typeof(p_input->'verified_start_at') NOT IN('null','string')) OR(p_input ? 'verified_start_reason' AND jsonb_typeof(p_input->'verified_start_reason') NOT IN('null','string')) THEN RAISE EXCEPTION 'RETENTION_VALIDATION' USING ERRCODE='PT422';END IF;
 verified_at:=(p_input->>'verified_start_at')::timestamptz;verified_reason:=nullif(btrim(p_input->>'verified_start_reason'),'');
 IF (verified_at IS NULL)<>(verified_reason IS NULL) OR verified_at>clock_timestamp() OR verified_at<'1900-01-01'::timestamptz OR char_length(verified_reason)>1000 OR (verified_at IS NULL AND EXISTS(SELECT FROM private.account_retention_policies WHERE office_id=p_office_id AND data_class=p_input->>'data_class' AND document_type=p_input->>'document_type' AND start_event='verified_event' AND approved_at IS NOT NULL)) THEN RAISE EXCEPTION 'RETENTION_VALIDATION' USING ERRCODE='PT422';END IF;
 uid:=(p_input->>'user_id')::uuid;
 IF p_input->>'target_kind'='file' THEN SELECT request_id INTO rid FROM public.files WHERE office_id=p_office_id AND id=(p_input->>'target_id')::uuid;ELSE doc:=(p_input->>'target_id')::uuid;SELECT request_id INTO rid FROM public.documents WHERE office_id=p_office_id AND id=doc;END IF;
 SELECT * INTO r FROM public.requests WHERE office_id=p_office_id AND id=rid FOR UPDATE;
 SELECT * INTO m FROM public.memberships WHERE office_id=p_office_id AND user_id=actor AND active;
 IF r.id IS NULL THEN RAISE EXCEPTION 'RETENTION_NOT_FOUND' USING ERRCODE='PT404';END IF;
 IF NOT private.retention_target_visible(p_office_id,p_input->>'target_kind',(p_input->>'target_id')::uuid) THEN RAISE EXCEPTION 'RETENTION_FORBIDDEN' USING ERRCODE='PT403';END IF;
 IF NOT private.current_permissions(p_office_id) @> ARRAY['requests.read','customers.read'] OR private.request_in_scope(r,m) IS NOT TRUE OR NOT EXISTS(SELECT FROM private.closed_account_offices WHERE office_id=p_office_id AND user_id=uid AND customer_id=r.customer_id) THEN RAISE EXCEPTION 'RETENTION_FORBIDDEN' USING ERRCODE='PT403';END IF;
 IF r.status NOT IN('concluido','cancelado') OR EXISTS(SELECT FROM private.customer_relations cr JOIN public.memberships mb ON mb.id=cr.membership_id WHERE cr.office_id=p_office_id AND cr.customer_id=r.customer_id AND cr.relation_type='identity' AND cr.revoked_at IS NULL AND mb.user_id<>uid) OR (doc IS NOT NULL AND (EXISTS(SELECT FROM public.document_participants WHERE office_id=p_office_id AND document_id=doc AND customer_id IS DISTINCT FROM r.customer_id) OR EXISTS(SELECT FROM private.document_revisions dr WHERE dr.office_id=p_office_id AND dr.document_id=doc AND dr.source_customer_id IS NOT NULL AND dr.source_customer_id IS DISTINCT FROM r.customer_id))) THEN RAISE EXCEPTION 'RETENTION_CONFLICT' USING ERRCODE='PT409';END IF;
 SELECT * INTO it FROM private.retention_items WHERE office_id=p_office_id AND target_kind=p_input->>'target_kind' AND target_id=(p_input->>'target_id')::uuid FOR UPDATE;
 IF it.reserved_at IS NOT NULL OR coalesce(it.revision,0)<>(p_input->>'revision')::integer THEN RAISE EXCEPTION 'RETENTION_CONFLICT' USING ERRCODE='PT409';END IF;
 INSERT INTO private.retention_items(office_id,user_id,target_kind,target_id,request_id,data_class,document_type,classified_by,classified_session_id,verified_start_at,verified_start_reason,revision,review_due_at)
 VALUES(p_office_id,uid,p_input->>'target_kind',(p_input->>'target_id')::uuid,r.id,p_input->>'data_class',btrim(p_input->>'document_type'),actor,(auth.jwt()->>'session_id')::uuid,verified_at,verified_reason,coalesce(it.revision,0)+1,(SELECT closed_at+interval '30 days' FROM private.account_closures WHERE user_id=uid))
 ON CONFLICT(office_id,target_kind,target_id) DO UPDATE SET user_id=EXCLUDED.user_id,data_class=EXCLUDED.data_class,document_type=EXCLUDED.document_type,verified_start_at=EXCLUDED.verified_start_at,verified_start_reason=EXCLUDED.verified_start_reason,classified_by=actor,classified_session_id=EXCLUDED.classified_session_id,scheduling_retry_at=clock_timestamp(),classified_at=clock_timestamp(),revision=EXCLUDED.revision RETURNING * INTO it;
 PERFORM private.team_audit(p_office_id,actor,'retention.classified','retention',it.id,gen_random_uuid(),'{}');RETURN jsonb_build_object('item',to_jsonb(it));
 EXCEPTION WHEN invalid_text_representation OR invalid_datetime_format OR datetime_field_overflow OR check_violation OR not_null_violation THEN RAISE EXCEPTION 'RETENTION_VALIDATION' USING ERRCODE='PT422';END$$;
CREATE FUNCTION private.retention_deadline(i private.retention_items) RETURNS timestamptz LANGUAGE sql STABLE SECURITY DEFINER SET search_path='' AS $$
 SELECT (CASE p.start_event WHEN 'account_closed' THEN c.closed_at WHEN 'request_closed' THEN r.updated_at WHEN 'verified_event' THEN i.verified_start_at END)+make_interval(days=>p.period_days)
 FROM private.account_retention_policies p JOIN private.account_closures c ON c.user_id=i.user_id JOIN public.requests r ON r.office_id=i.office_id AND r.id=i.request_id
 WHERE p.office_id=i.office_id AND p.data_class=i.data_class AND p.document_type=i.document_type AND p.approved_at IS NOT NULL AND p.review_at>clock_timestamp() AND r.status IN('concluido','cancelado');$$;
CREATE FUNCTION private.retention_hold(p_office_id uuid,p_input jsonb) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE actor uuid;uid uuid;h uuid;BEGIN actor:=private.retention_actor(p_office_id);
 IF p_input IS NULL OR jsonb_typeof(p_input)<>'object' OR (SELECT count(*) FROM jsonb_object_keys(p_input))<>4 OR NOT p_input ?& ARRAY['user_id','data_class','reason','release_id'] OR p_input->>'data_class' NOT IN('registration','request','signed_document','financial','tax','audit','optional') OR jsonb_typeof(p_input->'reason')<>'string' OR char_length(btrim(p_input->>'reason')) NOT BETWEEN 1 AND 1000 THEN RAISE EXCEPTION 'RETENTION_VALIDATION' USING ERRCODE='PT422';END IF;
 uid:=(p_input->>'user_id')::uuid;
 IF NOT private.current_permissions(p_office_id) @> ARRAY['customers.read'] OR NOT EXISTS(SELECT FROM private.closed_account_offices ca JOIN public.customers c ON c.office_id=ca.office_id AND c.id=ca.customer_id WHERE ca.office_id=p_office_id AND ca.user_id=uid AND private.customer_in_scope(c,actor)) THEN RAISE EXCEPTION 'RETENTION_NOT_FOUND' USING ERRCODE='PT404';END IF;
 -- A reservation is a committed destructive decision: never claim a hold succeeded after dispatch.
 IF EXISTS(SELECT FROM private.retention_items WHERE office_id=p_office_id AND user_id=uid AND data_class=p_input->>'data_class' AND reserved_at IS NOT NULL AND purged_at IS NULL) THEN RAISE EXCEPTION 'RETENTION_CONFLICT' USING ERRCODE='PT409';END IF;
 IF p_input->>'release_id' IS NULL THEN INSERT INTO private.account_retention_holds(office_id,user_id,data_class,reason,created_by) VALUES(p_office_id,uid,p_input->>'data_class',p_input->>'reason',actor)RETURNING id INTO h;
 ELSE UPDATE private.account_retention_holds SET released_at=clock_timestamp(),released_by=actor,release_reason=p_input->>'reason' WHERE office_id=p_office_id AND user_id=uid AND data_class=p_input->>'data_class' AND id=(p_input->>'release_id')::uuid AND released_at IS NULL RETURNING id INTO h;IF h IS NULL THEN RAISE EXCEPTION 'RETENTION_CONFLICT' USING ERRCODE='PT409';END IF;END IF;
 UPDATE private.retention_items SET scheduling_retry_at=clock_timestamp() WHERE office_id=p_office_id AND user_id=uid AND data_class=p_input->>'data_class' AND reserved_at IS NULL;
 PERFORM private.team_audit(p_office_id,actor,CASE WHEN p_input->>'release_id' IS NULL THEN 'retention.hold_created' ELSE 'retention.hold_released' END,'retention_hold',h,gen_random_uuid(),'{}');RETURN jsonb_build_object('id',h);
 EXCEPTION WHEN invalid_text_representation THEN RAISE EXCEPTION 'RETENTION_VALIDATION' USING ERRCODE='PT422';END$$;
-- A reserved document cannot be regenerated, previewed, distributed or edited.
CREATE FUNCTION private.retention_document_blocked(o uuid,d uuid) RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path='' AS $$SELECT EXISTS(SELECT FROM private.retention_items WHERE office_id=o AND target_kind='document' AND target_id=d AND reserved_at IS NOT NULL);$$;
ALTER FUNCTION private.documents_access21(uuid,uuid,text,uuid) RENAME TO documents_access21_before_retention;
CREATE FUNCTION private.documents_access21(p_office uuid,p_request uuid DEFAULT NULL,p_action text DEFAULT NULL,p_document uuid DEFAULT NULL) RETURNS public.memberships LANGUAGE plpgsql SECURITY INVOKER SET search_path='' AS $$DECLARE m public.memberships;BEGIN m:=private.documents_access21_before_retention(p_office,p_request,p_action,p_document);IF p_document IS NOT NULL AND private.retention_document_blocked(p_office,p_document) THEN RAISE EXCEPTION 'RETENTION_PURGED' USING ERRCODE='PT409';END IF;RETURN m;END$$;
ALTER FUNCTION private.wf_gate(private.document_publications,public.memberships) RENAME TO wf_gate_before_retention;
CREATE FUNCTION private.wf_gate(p private.document_publications,m public.memberships DEFAULT NULL) RETURNS text[] LANGUAGE sql STABLE SECURITY INVOKER SET search_path='' AS $$SELECT CASE WHEN private.retention_document_blocked(p.office_id,p.document_id) THEN ARRAY['retention_purged']::text[] ELSE private.wf_gate_before_retention(p,m) END;$$;
-- Version completion bypasses access21 using captured identity: fence that path explicitly.
CREATE FUNCTION private.retention_version_fence() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$BEGIN IF EXISTS(SELECT FROM private.document_versions v WHERE v.office_id=NEW.office_id AND v.id=NEW.version_id AND private.retention_document_blocked(v.office_id,v.document_id)) THEN RAISE EXCEPTION 'RETENTION_PURGED' USING ERRCODE='PT409';END IF;RETURN NEW;END$$;
CREATE TRIGGER retention_version_fence BEFORE INSERT OR UPDATE ON private.document_version_files FOR EACH ROW EXECUTE FUNCTION private.retention_version_fence();
CREATE FUNCTION private.retention_reserve_as(p_office_id uuid,p_id uuid,p_revision integer,p_actor uuid,p_session_id uuid) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE actor uuid:=p_actor;caps text[];it private.retention_items;p private.account_retention_policies;j private.retention_purges;r public.requests;m public.memberships;f public.files;objs jsonb;plan uuid;BEGIN
 PERFORM 1 FROM public.offices WHERE id=p_office_id FOR UPDATE;
 SELECT * INTO it FROM private.retention_items WHERE office_id=p_office_id AND id=p_id FOR UPDATE;
 IF it.id IS NULL THEN RAISE EXCEPTION 'RETENTION_NOT_FOUND' USING ERRCODE='PT404';END IF;
 IF p_revision IS DISTINCT FROM it.revision THEN RAISE EXCEPTION 'RETENTION_CONFLICT' USING ERRCODE='PT409';END IF;
 SELECT * INTO r FROM public.requests WHERE office_id=p_office_id AND id=it.request_id FOR UPDATE;
 SELECT * INTO m FROM public.memberships WHERE office_id=p_office_id AND user_id=actor AND active;
 caps:=coalesce(private.team_permissions_for_member(m.id),'{}');
 IF m.id IS NULL OR m.role_code NOT IN('owner','admin') OR NOT private.team_user_active(actor,p_office_id) OR NOT caps @> ARRAY['foundation.access','archives.manage','requests.read','customers.read'] OR NOT private.retention_target_visible_as(p_office_id,it.target_kind,it.target_id,actor) OR private.retention_request_scope_as(r,m,caps) IS NOT TRUE THEN RAISE EXCEPTION 'RETENTION_FORBIDDEN' USING ERRCODE='PT403';END IF;
 SELECT * INTO j FROM private.retention_purges WHERE item_id=it.id FOR UPDATE;
 IF j.completed_at IS NOT NULL THEN RETURN jsonb_build_object('id',j.id,'completed',true);END IF;
 IF j.id IS NOT NULL THEN
 IF j.lease_until>clock_timestamp() THEN RAISE EXCEPTION 'RETENTION_CONFLICT' USING ERRCODE='PT409';END IF;
 UPDATE private.retention_purges SET authorized_by=actor,next_attempt_at=clock_timestamp() WHERE id=j.id;RETURN jsonb_build_object('id',j.id,'completed',false);END IF;
 SELECT * INTO p FROM private.account_retention_policies WHERE office_id=p_office_id AND data_class=it.data_class AND document_type=it.document_type FOR SHARE;
 IF private.retention_deadline(it) IS NULL OR private.retention_deadline(it)>clock_timestamp() OR EXISTS(SELECT FROM private.account_retention_holds WHERE office_id=p_office_id AND user_id=it.user_id AND data_class=it.data_class AND released_at IS NULL) THEN RAISE EXCEPTION 'RETENTION_CONFLICT' USING ERRCODE='PT409';END IF;
 -- Revalidate ownership, other live subjects and business obligations immediately before fencing.
 IF r.status NOT IN('concluido','cancelado') OR NOT EXISTS(SELECT FROM private.closed_account_offices WHERE office_id=p_office_id AND user_id=it.user_id AND customer_id=r.customer_id) OR EXISTS(SELECT FROM private.customer_relations cr JOIN public.memberships mb ON mb.id=cr.membership_id WHERE cr.office_id=p_office_id AND cr.customer_id=r.customer_id AND cr.relation_type='identity' AND cr.revoked_at IS NULL AND mb.user_id<>it.user_id) THEN RAISE EXCEPTION 'RETENTION_CONFLICT' USING ERRCODE='PT409';END IF;
 IF it.target_kind='file' THEN
 IF NOT caps @> ARRAY['files.read','files.manage'] THEN RAISE EXCEPTION 'RETENTION_FORBIDDEN' USING ERRCODE='PT403';END IF;
 SELECT * INTO f FROM public.files WHERE office_id=p_office_id AND id=it.target_id FOR UPDATE;
 IF f.id IS NULL OR f.request_id<>it.request_id OR f.status NOT IN('disponivel','rejeitado') OR f.protected OR f.legal_hold OR f.retain_until>clock_timestamp() OR EXISTS(SELECT FROM private.file_cleanup_reservations WHERE file_id=f.id) OR EXISTS(SELECT FROM private.upload_intents WHERE source_file_id=f.id) OR EXISTS(SELECT FROM private.file_process_leases WHERE office_id=p_office_id AND completed_at IS NULL AND expires_at>clock_timestamp() AND objects @> jsonb_build_array(jsonb_build_object('file_id',f.id))) THEN RAISE EXCEPTION 'RETENTION_CONFLICT' USING ERRCODE='PT409';END IF;
 -- Historical signature references may survive physical erasure only after every linked
 -- document has its own authorized disposition. Unknown/checklist references stay protected.
 IF EXISTS(SELECT FROM private.file_references WHERE office_id=p_office_id AND file_id=f.id AND reference_kind<>'document_signature24') OR (EXISTS(SELECT FROM private.file_references WHERE office_id=p_office_id AND file_id=f.id) AND NOT EXISTS(SELECT FROM private.document_signature_events24 WHERE office_id=p_office_id AND file_id=f.id)) OR EXISTS(SELECT FROM private.document_signature_events24 e JOIN private.document_publications dp ON dp.office_id=e.office_id AND dp.id=e.publication_id WHERE e.office_id=p_office_id AND e.file_id=f.id AND NOT private.retention_document_blocked(p_office_id,dp.document_id)) THEN RAISE EXCEPTION 'RETENTION_CONFLICT' USING ERRCODE='PT409';END IF;
 SELECT jsonb_agg(jsonb_build_object('bucket',bucket,'object_path',object_path)) INTO objs FROM private.upload_intents WHERE office_id=p_office_id AND file_id=f.id;
 IF objs IS NULL THEN RAISE EXCEPTION 'RETENTION_CONFLICT' USING ERRCODE='PT409';END IF;
 INSERT INTO private.file_cleanup_plans(office_id,created_by,session_id) VALUES(p_office_id,actor,p_session_id) RETURNING id INTO plan;
 INSERT INTO private.file_cleanup_reservations(file_id,office_id,plan_id) VALUES(f.id,p_office_id,plan);
 ELSE
 IF NOT private.retention_target_visible_as(p_office_id,'document',it.target_id,actor) THEN RAISE EXCEPTION 'RETENTION_FORBIDDEN' USING ERRCODE='PT403';END IF;
 PERFORM 1 FROM public.documents WHERE office_id=p_office_id AND id=it.target_id FOR UPDATE;
 IF EXISTS(SELECT FROM public.document_participants WHERE office_id=p_office_id AND document_id=it.target_id AND customer_id IS DISTINCT FROM r.customer_id) OR EXISTS(SELECT FROM private.document_revisions dr WHERE dr.office_id=p_office_id AND dr.document_id=it.target_id AND dr.source_customer_id IS NOT NULL AND dr.source_customer_id IS DISTINCT FROM r.customer_id) OR EXISTS(SELECT FROM private.document_artifact_jobs a JOIN private.document_publications dp ON dp.office_id=a.office_id AND dp.id=a.publication_id WHERE dp.office_id=p_office_id AND dp.document_id=it.target_id AND a.completed_at IS NULL) OR EXISTS(SELECT FROM private.document_version_files a JOIN private.document_versions v ON v.office_id=a.office_id AND v.id=a.version_id WHERE v.office_id=p_office_id AND v.document_id=it.target_id AND a.completed_at IS NULL) THEN RAISE EXCEPTION 'RETENTION_CONFLICT' USING ERRCODE='PT409';END IF;
 SELECT coalesce(jsonb_agg(jsonb_build_object('bucket','jn-document-artifacts','object_path',object_path)),'[]') INTO objs FROM(
 SELECT a.object_path FROM private.document_artifact_jobs a JOIN private.document_publications dp ON dp.office_id=a.office_id AND dp.id=a.publication_id WHERE dp.office_id=p_office_id AND dp.document_id=it.target_id
 UNION SELECT a.object_path FROM private.document_version_files a JOIN private.document_versions v ON v.office_id=a.office_id AND v.id=a.version_id WHERE v.office_id=p_office_id AND v.document_id=it.target_id)x;
 END IF;
 IF jsonb_array_length(objs)>200 THEN RAISE EXCEPTION 'RETENTION_LIMIT' USING ERRCODE='PT422';END IF;
 UPDATE private.retention_items SET reserved_at=clock_timestamp(),revision=revision+1 WHERE id=it.id;
 INSERT INTO private.retention_purges(item_id,office_id,authorized_by,policy_snapshot,objects,cleanup_plan_id) VALUES(it.id,p_office_id,actor,to_jsonb(p)||jsonb_build_object('effective_deadline',private.retention_deadline(it)),objs,plan)RETURNING * INTO j;
 PERFORM private.team_audit(p_office_id,actor,'retention.purge_reserved','retention',it.id,gen_random_uuid(),'{}');RETURN jsonb_build_object('id',j.id,'completed',false);
END$$;
CREATE FUNCTION private.retention_reserve(p_office_id uuid,p_id uuid,p_revision integer) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE actor uuid;BEGIN actor:=private.retention_actor(p_office_id);RETURN private.retention_reserve_as(p_office_id,p_id,p_revision,actor,(auth.jwt()->>'session_id')::uuid);END$$;
CREATE FUNCTION private.retention_schedule_due() RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE i private.retention_items;reserved integer:=0;BEGIN
 FOR i IN SELECT * FROM private.retention_items x WHERE x.reserved_at IS NULL AND x.scheduling_retry_at<=clock_timestamp() AND private.retention_deadline(x)<=clock_timestamp() ORDER BY x.scheduling_retry_at,x.review_due_at,x.id LIMIT 20 LOOP
 BEGIN
 PERFORM private.retention_reserve_as(i.office_id,i.id,i.revision,i.classified_by,i.classified_session_id);reserved:=reserved+1;
 EXCEPTION WHEN SQLSTATE 'PT403' OR SQLSTATE 'PT409' OR SQLSTATE 'PT422' THEN
 UPDATE private.retention_items SET scheduling_retry_at=clock_timestamp()+interval '1 hour' WHERE id=i.id AND revision=i.revision AND reserved_at IS NULL;
 END;
 IF reserved>=2 THEN RETURN;END IF;
 END LOOP;END$$;
CREATE FUNCTION private.retention_state(p_office_id uuid,p_page integer) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE actor uuid;items jsonb;policies jsonb;holds jsonb;total integer;candidates jsonb;candidate_total integer;m public.memberships;BEGIN actor:=private.retention_actor(p_office_id);
 SELECT * INTO m FROM public.memberships WHERE office_id=p_office_id AND user_id=actor AND active;
 IF NOT private.current_permissions(p_office_id) @> ARRAY['requests.read','customers.read'] THEN RAISE EXCEPTION 'RETENTION_FORBIDDEN' USING ERRCODE='PT403';END IF;
 IF p_page IS NULL OR p_page NOT BETWEEN 1 AND 100000 THEN RAISE EXCEPTION 'RETENTION_VALIDATION' USING ERRCODE='PT422';END IF;
 SELECT coalesce(jsonb_agg(to_jsonb(p) ORDER BY data_class,document_type),'[]') INTO policies FROM private.account_retention_policies p WHERE office_id=p_office_id;
 SELECT coalesce(jsonb_agg(to_jsonb(h) ORDER BY created_at),'[]') INTO holds FROM private.account_retention_holds h WHERE office_id=p_office_id AND released_at IS NULL AND EXISTS(SELECT FROM private.closed_account_offices ca JOIN public.customers c ON c.office_id=ca.office_id AND c.id=ca.customer_id WHERE ca.office_id=p_office_id AND ca.user_id=h.user_id AND private.customer_in_scope(c,actor));
 SELECT count(*) INTO total FROM private.retention_items i JOIN public.requests r ON r.office_id=i.office_id AND r.id=i.request_id WHERE i.office_id=p_office_id AND private.request_in_scope(r,m) AND private.retention_target_visible(i.office_id,i.target_kind,i.target_id);
 SELECT coalesce(jsonb_agg(v.value),'[]') INTO items FROM(SELECT (to_jsonb(i)-'classified_session_id')||jsonb_build_object('title',CASE i.target_kind WHEN 'file' THEN (SELECT f.name FROM public.files f WHERE f.office_id=i.office_id AND f.id=i.target_id) ELSE (SELECT d.title FROM public.documents d WHERE d.office_id=i.office_id AND d.id=i.target_id) END,'deadline',private.retention_deadline(i),'status',CASE WHEN i.purged_at IS NOT NULL THEN 'purged' WHEN i.reserved_at IS NOT NULL THEN 'reserved' WHEN EXISTS(SELECT FROM private.account_retention_holds WHERE office_id=i.office_id AND user_id=i.user_id AND data_class=i.data_class AND released_at IS NULL) THEN 'held' WHEN private.retention_deadline(i) IS NULL THEN CASE WHEN i.review_due_at<=clock_timestamp() THEN 'review_overdue' ELSE 'pending_review' END WHEN private.retention_deadline(i)<=clock_timestamp() THEN 'due' ELSE 'retained' END,'attempts',coalesce(j.attempts,0))value FROM private.retention_items i LEFT JOIN private.retention_purges j ON j.item_id=i.id WHERE i.office_id=p_office_id AND private.retention_target_visible(i.office_id,i.target_kind,i.target_id) AND EXISTS(SELECT FROM public.requests r WHERE r.office_id=i.office_id AND r.id=i.request_id AND private.request_in_scope(r,m)) ORDER BY i.review_due_at,i.id LIMIT 5 OFFSET(p_page-1)*5)v;

 WITH eligible AS(
 SELECT DISTINCT ON(x.target_kind,x.target_id) ca.user_id,x.target_kind,x.target_id,x.title,c.closed_at+interval '30 days' review_due_at
 FROM private.closed_account_offices ca JOIN private.account_closures c USING(user_id) JOIN public.requests r ON r.office_id=ca.office_id AND r.customer_id=ca.customer_id
 CROSS JOIN LATERAL(SELECT 'file'::text target_kind,f.id target_id,f.name title FROM public.files f WHERE f.office_id=r.office_id AND f.request_id=r.id AND f.status<>'removido' AND private.retention_target_visible(f.office_id,'file',f.id) UNION ALL SELECT 'document',d.id,d.title FROM public.documents d WHERE d.office_id=r.office_id AND d.request_id=r.id AND private.retention_target_visible(d.office_id,'document',d.id))x
 WHERE ca.office_id=p_office_id AND r.status IN('concluido','cancelado') AND private.request_in_scope(r,m) AND NOT EXISTS(SELECT FROM private.retention_items i WHERE i.office_id=ca.office_id AND i.target_kind=x.target_kind AND i.target_id=x.target_id)
 ORDER BY x.target_kind,x.target_id,c.closed_at,ca.user_id)
 SELECT (SELECT count(*) FROM eligible),coalesce((SELECT jsonb_agg(to_jsonb(z)) FROM(SELECT * FROM eligible ORDER BY review_due_at,target_kind,target_id LIMIT 5 OFFSET(p_page-1)*5)z),'[]') INTO candidate_total,candidates;
 RETURN jsonb_build_object('policies',policies,'items',items,'holds',holds,'total',total,'page',p_page,'candidates',candidates,'candidate_total',candidate_total,'review_days',30,'scope','document_and_physical_artifacts');END$$;
CREATE FUNCTION private.retention_worker_claim() RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE j private.retention_purges;it private.retention_items;m public.memberships;items jsonb:='[]';o uuid;BEGIN
 PERFORM private.retention_schedule_due();
 -- Same office-before-item ordering as every manager command; no SKIP LOCKED office ambiguity.
 FOR o IN SELECT DISTINCT office_id FROM private.retention_purges WHERE completed_at IS NULL AND next_attempt_at<=clock_timestamp() AND(lease_until IS NULL OR lease_until<=clock_timestamp()) ORDER BY office_id LIMIT 20 LOOP
 PERFORM 1 FROM public.offices WHERE id=o FOR UPDATE;
 FOR j IN SELECT * FROM private.retention_purges WHERE office_id=o AND completed_at IS NULL AND next_attempt_at<=clock_timestamp() AND(lease_until IS NULL OR lease_until<=clock_timestamp()) ORDER BY authorized_at LIMIT 20 FOR UPDATE LOOP
 SELECT * INTO it FROM private.retention_items WHERE id=j.item_id;
 SELECT * INTO m FROM public.memberships WHERE office_id=o AND user_id=j.authorized_by AND active AND role_code IN('owner','admin');
 IF m.id IS NOT NULL AND private.team_user_active(j.authorized_by,o) AND private.team_permissions_for_member(m.id) @> ARRAY['foundation.access','archives.manage','requests.read','customers.read'] AND private.retention_request_scope_as((SELECT r FROM public.requests r WHERE r.office_id=o AND r.id=it.request_id),m,private.team_permissions_for_member(m.id)) IS TRUE AND private.retention_target_visible_as(o,it.target_kind,it.target_id,j.authorized_by) AND (it.target_kind<>'file' OR private.team_permissions_for_member(m.id) @> ARRAY['files.read','files.manage']) AND (it.target_kind<>'document' OR private.team_permissions_for_member(m.id) @> ARRAY['documents.read']) AND NOT EXISTS(SELECT FROM private.account_retention_holds WHERE office_id=o AND user_id=it.user_id AND data_class=it.data_class AND released_at IS NULL) THEN
 UPDATE private.retention_purges SET token=gen_random_uuid(),lease_until=clock_timestamp()+interval '5 minutes',attempts=attempts+1,next_attempt_at=clock_timestamp()+make_interval(secs=>least(86400,60*power(2,least(attempts,10)))::integer) WHERE id=j.id RETURNING * INTO j;
 items:=items||jsonb_build_array(jsonb_build_object('id',j.id,'token',j.token,'office_id',o,'objects',j.objects));
 ELSE UPDATE private.retention_purges SET next_attempt_at=clock_timestamp()+interval '1 hour' WHERE id=j.id;END IF;
 IF jsonb_array_length(items)>=2 THEN RETURN jsonb_build_object('items',items);END IF;
 END LOOP;END LOOP;RETURN jsonb_build_object('items',items);END$$;
CREATE FUNCTION private.retention_worker_complete(p_id uuid,p_token uuid) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE j private.retention_purges;it private.retention_items;BEGIN SELECT * INTO j FROM private.retention_purges WHERE id=p_id;
 IF j.id IS NULL THEN RAISE EXCEPTION 'RETENTION_NOT_FOUND' USING ERRCODE='PT404';END IF;
 PERFORM 1 FROM public.offices WHERE id=j.office_id FOR UPDATE;SELECT * INTO j FROM private.retention_purges WHERE id=p_id FOR UPDATE;
 IF j.token IS DISTINCT FROM p_token THEN RAISE EXCEPTION 'RETENTION_CONFLICT' USING ERRCODE='PT409';END IF;
 IF j.completed_at IS NOT NULL THEN RETURN jsonb_build_object('completed',true);END IF;
 IF j.lease_until IS NULL OR j.lease_until<clock_timestamp() OR EXISTS(SELECT FROM private.retention_items ri JOIN private.account_retention_holds h ON h.office_id=ri.office_id AND h.user_id=ri.user_id AND h.data_class=ri.data_class WHERE ri.id=j.item_id AND h.released_at IS NULL) OR EXISTS(SELECT FROM jsonb_array_elements(j.objects)obj JOIN storage.objects s ON s.bucket_id=obj->>'bucket' AND s.name=obj->>'object_path') THEN RAISE EXCEPTION 'RETENTION_CONFLICT' USING ERRCODE='PT409';END IF;
 SELECT * INTO it FROM private.retention_items WHERE id=j.item_id FOR UPDATE;
 IF it.target_kind='document' THEN PERFORM private.retention_redact_document(j.id,p_token);END IF;
 IF it.target_kind='file' THEN UPDATE public.files SET status='removido',name='arquivo-eliminado.pdf',updated_at=clock_timestamp() WHERE office_id=it.office_id AND id=it.target_id;UPDATE private.file_cleanup_reservations SET removed_at=clock_timestamp() WHERE file_id=it.target_id AND plan_id=j.cleanup_plan_id;END IF;
 UPDATE private.retention_items SET purged_at=clock_timestamp() WHERE id=it.id;UPDATE private.retention_purges SET completed_at=clock_timestamp() WHERE id=j.id;
 PERFORM private.team_audit(j.office_id,j.authorized_by,'retention.purge_completed','retention',it.id,gen_random_uuid(),'{}');RETURN jsonb_build_object('completed',true);END$$;
-- Structured business/financial/audit rows have independent purposes. The document
-- adapter below erases only the expressly classified document and its own source snapshots.
DO $$DECLARE n text;args text;call text;role_name text;BEGIN
 FOR n,args,call,role_name IN SELECT * FROM(VALUES
 ('retention_policy_set','p_office_id uuid,p_input jsonb','p_office_id,p_input','authenticated'),
 ('retention_classify','p_office_id uuid,p_input jsonb','p_office_id,p_input','authenticated'),
 ('retention_hold','p_office_id uuid,p_input jsonb','p_office_id,p_input','authenticated'),
 ('retention_reserve','p_office_id uuid,p_id uuid,p_revision integer','p_office_id,p_id,p_revision','authenticated'),
 ('retention_state','p_office_id uuid,p_page integer','p_office_id,p_page','authenticated'),
 ('retention_worker_claim','','','service_role'),('retention_worker_complete','p_id uuid,p_token uuid','p_id,p_token','service_role'))v(n,args,call,role_name) LOOP
 EXECUTE format('CREATE FUNCTION public.%I(%s) RETURNS jsonb LANGUAGE sql SECURITY INVOKER SET search_path='''' AS $f$SELECT private.%I(%s);$f$',n,args,n,call);
 EXECUTE format('REVOKE ALL ON FUNCTION public.%I(%s),private.%I(%s) FROM PUBLIC,anon,authenticated,service_role',n,args,n,args);
 EXECUTE format('GRANT EXECUTE ON FUNCTION public.%I(%s),private.%I(%s) TO %I',n,args,n,args,role_name);
 END LOOP;END$$;
ALTER FUNCTION private.documents_access21(uuid,uuid,text,uuid) SECURITY DEFINER;
ALTER FUNCTION private.wf_gate(private.document_publications,public.memberships) SECURITY DEFINER;
REVOKE ALL ON FUNCTION private.retention_actor(uuid),private.retention_target_visible(uuid,text,uuid),private.retention_target_visible_as(uuid,text,uuid,uuid),private.retention_request_scope_as(public.requests,public.memberships,text[]),private.retention_customer_scope_as(public.customers,uuid,text[]),private.retention_reserve_as(uuid,uuid,integer,uuid,uuid),private.retention_schedule_due(),private.retention_deadline(private.retention_items),private.retention_document_blocked(uuid,uuid),private.retention_version_fence(),private.documents_access21_before_retention(uuid,uuid,text,uuid),private.wf_gate_before_retention(private.document_publications,public.memberships) FROM PUBLIC,anon,authenticated,service_role;
REVOKE ALL ON FUNCTION private.documents_access21(uuid,uuid,text,uuid),private.wf_gate(private.document_publications,public.memberships) FROM PUBLIC,anon,authenticated,service_role;

CREATE FUNCTION private.retention_closure_disposable() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$BEGIN DELETE FROM private.internal_notifications WHERE recipient_id IN(SELECT id FROM public.memberships WHERE user_id=NEW.user_id);RETURN NEW;END$$;
CREATE TRIGGER retention_closure_disposable AFTER INSERT ON private.account_closures FOR EACH ROW EXECUTE FUNCTION private.retention_closure_disposable();
REVOKE ALL ON FUNCTION private.retention_closure_disposable() FROM PUBLIC,anon,authenticated,service_role;

-- Redaction is an exact, narrow exception to immutable payloads. Evidence IDs, hashes,
-- actor IDs, dates, financial obligations and event rows remain unchanged.
CREATE FUNCTION private.retention_redaction_allowed(o uuid,d uuid) RETURNS boolean LANGUAGE sql VOLATILE SECURITY DEFINER SET search_path='' AS $$
 SELECT EXISTS(SELECT FROM private.retention_redaction_context c JOIN private.retention_purges j ON j.id=c.purge_id AND j.token=c.token JOIN private.retention_items i ON i.id=j.item_id
 WHERE c.backend_pid=pg_backend_pid() AND c.transaction_id=txid_current() AND j.completed_at IS NULL AND j.lease_until>clock_timestamp() AND i.office_id=o AND i.target_kind='document' AND i.target_id=d AND i.reserved_at IS NOT NULL AND i.purged_at IS NULL
 AND NOT EXISTS(SELECT FROM private.account_retention_holds h WHERE h.office_id=i.office_id AND h.user_id=i.user_id AND h.data_class=i.data_class AND h.released_at IS NULL)
 AND NOT EXISTS(SELECT FROM jsonb_array_elements(j.objects)obj JOIN storage.objects s ON s.bucket_id=obj->>'bucket' AND s.name=obj->>'object_path'));
$$;
CREATE FUNCTION private.retention_redaction_guard() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE allowed text[];after_json jsonb;before_json jsonb;BEGIN
 IF TG_OP<>'UPDATE' OR NOT private.retention_redaction_allowed(OLD.office_id,(to_jsonb(OLD)->>CASE WHEN TG_TABLE_NAME='documents' THEN 'id' ELSE 'document_id' END)::uuid) THEN RAISE EXCEPTION 'DOCUMENT_CONFLICT' USING ERRCODE='PT409';END IF;
 after_json:=to_jsonb(NEW);before_json:=to_jsonb(OLD);
 CASE TG_TABLE_NAME
 WHEN 'document_revisions' THEN allowed:=ARRAY['input','source','source_customer_id','author_name'];
 IF NEW.input<>'{}' OR NEW.source<>'{}' OR NEW.author_name<>'Registro preservado' THEN RAISE EXCEPTION 'DOCUMENT_CONFLICT' USING ERRCODE='PT409';END IF;
 WHEN 'document_intake_apply_commands' THEN allowed:=ARRAY['input'];
 IF NEW.input<>'{}' THEN RAISE EXCEPTION 'DOCUMENT_CONFLICT' USING ERRCODE='PT409';END IF;
 WHEN 'document_participants' THEN allowed:=ARRAY['snapshot','label'];
 IF NEW.snapshot<>'{}' OR NEW.label<>'Participante' THEN RAISE EXCEPTION 'DOCUMENT_CONFLICT' USING ERRCODE='PT409';END IF;
 WHEN 'document_publications' THEN allowed:=ARRAY['title','content'];
 IF NEW.title<>'Documento eliminado' OR NEW.content<>'[Documento eliminado]' THEN RAISE EXCEPTION 'DOCUMENT_CONFLICT' USING ERRCODE='PT409';END IF;
 WHEN 'document_versions' THEN allowed:=ARRAY['title','content','snapshot','author_name'];
 IF NEW.title<>'Documento eliminado' OR NEW.content<>'' OR NEW.snapshot<>'{}' OR NEW.author_name<>'Registro preservado' THEN RAISE EXCEPTION 'DOCUMENT_CONFLICT' USING ERRCODE='PT409';END IF;
 WHEN 'documents' THEN allowed:=ARRAY['title'];
 IF NEW.title<>'Documento eliminado' THEN RAISE EXCEPTION 'DOCUMENT_CONFLICT' USING ERRCODE='PT409';END IF;
 ELSE RAISE EXCEPTION 'DOCUMENT_CONFLICT' USING ERRCODE='PT409';END CASE;
 IF (after_json-allowed) IS DISTINCT FROM (before_json-allowed) THEN RAISE EXCEPTION 'DOCUMENT_CONFLICT' USING ERRCODE='PT409';END IF;RETURN NEW;
END$$;
DROP TRIGGER immutable ON private.document_revisions;
CREATE TRIGGER immutable BEFORE UPDATE OR DELETE ON private.document_revisions FOR EACH ROW EXECUTE FUNCTION private.retention_redaction_guard();
DROP TRIGGER immutable ON public.document_participants;
CREATE TRIGGER immutable BEFORE UPDATE OR DELETE ON public.document_participants FOR EACH ROW EXECUTE FUNCTION private.retention_redaction_guard();
DROP TRIGGER document_publications_immutable ON private.document_publications;
CREATE TRIGGER document_publications_immutable BEFORE UPDATE OR DELETE ON private.document_publications FOR EACH ROW EXECUTE FUNCTION private.retention_redaction_guard();
DROP TRIGGER document_versions_immutable ON private.document_versions;
CREATE TRIGGER document_versions_immutable BEFORE UPDATE OR DELETE ON private.document_versions FOR EACH ROW EXECUTE FUNCTION private.retention_redaction_guard();
DROP TRIGGER document_intake_apply_commands_immutable ON private.document_intake_apply_commands;
CREATE TRIGGER document_intake_apply_commands_immutable BEFORE UPDATE OR DELETE ON private.document_intake_apply_commands FOR EACH ROW EXECUTE FUNCTION private.retention_redaction_guard();
-- Preserve ordinary documents21 edits until a document is fenced; after that only exact redaction.
CREATE FUNCTION private.retention_document_record_guard() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$BEGIN
 IF private.retention_document_blocked(OLD.office_id,OLD.id) AND NOT(private.retention_redaction_allowed(OLD.office_id,OLD.id) AND TG_OP='UPDATE' AND NEW.title='Documento eliminado' AND (to_jsonb(NEW)-'title')=(to_jsonb(OLD)-'title')) THEN RAISE EXCEPTION 'DOCUMENT_CONFLICT' USING ERRCODE='PT409';END IF;IF TG_OP='DELETE' THEN RETURN OLD;END IF;RETURN NEW;END$$;
CREATE TRIGGER retention_document_record_guard BEFORE UPDATE OR DELETE ON public.documents FOR EACH ROW EXECUTE FUNCTION private.retention_document_record_guard();
CREATE FUNCTION private.retention_redact_document(p_id uuid,p_token uuid) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE j private.retention_purges;i private.retention_items;BEGIN
 SELECT * INTO j FROM private.retention_purges WHERE id=p_id AND token=p_token AND completed_at IS NULL AND lease_until>clock_timestamp() FOR UPDATE;
 SELECT * INTO i FROM private.retention_items WHERE id=j.item_id AND target_kind='document' AND reserved_at IS NOT NULL AND purged_at IS NULL FOR UPDATE;
 IF i.id IS NULL OR EXISTS(SELECT FROM private.account_retention_holds h WHERE h.office_id=i.office_id AND h.user_id=i.user_id AND h.data_class=i.data_class AND h.released_at IS NULL) OR EXISTS(SELECT FROM jsonb_array_elements(j.objects)obj JOIN storage.objects s ON s.bucket_id=obj->>'bucket' AND s.name=obj->>'object_path') THEN RAISE EXCEPTION 'RETENTION_CONFLICT' USING ERRCODE='PT409';END IF;
 INSERT INTO private.retention_redaction_context VALUES(pg_backend_pid(),txid_current(),j.id,p_token);
 UPDATE private.document_intake_apply_commands SET input='{}' WHERE office_id=i.office_id AND document_id=i.target_id;
 UPDATE private.document_revisions SET input='{}',source='{}',author_name='Registro preservado' WHERE office_id=i.office_id AND document_id=i.target_id;
 UPDATE public.document_participants SET snapshot='{}',label='Participante' WHERE office_id=i.office_id AND document_id=i.target_id;
 UPDATE private.document_publications SET title='Documento eliminado',content='[Documento eliminado]' WHERE office_id=i.office_id AND document_id=i.target_id;
 UPDATE private.document_versions SET title='Documento eliminado',content='',snapshot='{}',author_name='Registro preservado' WHERE office_id=i.office_id AND document_id=i.target_id;
 UPDATE public.documents SET title='Documento eliminado' WHERE office_id=i.office_id AND id=i.target_id;
 DELETE FROM private.retention_redaction_context WHERE backend_pid=pg_backend_pid() AND transaction_id=txid_current();
END$$;
REVOKE ALL ON FUNCTION private.retention_redaction_allowed(uuid,uuid),private.retention_redaction_guard(),private.retention_document_record_guard(),private.retention_redact_document(uuid,uuid) FROM PUBLIC,anon,authenticated,service_role;
-- Purged documents disappear from ordinary archive discovery instead of failing its whole query.
CREATE OR REPLACE FUNCTION private.documents_accessible_for_closure(p_office_id uuid,p_document_id uuid) RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$BEGIN PERFORM private.documents_access21(p_office_id,(SELECT request_id FROM public.documents WHERE office_id=p_office_id AND id=p_document_id),NULL,p_document_id);RETURN true;EXCEPTION WHEN SQLSTATE 'PT403' OR SQLSTATE 'PT404' OR SQLSTATE 'PT409' THEN RETURN false;END$$;
