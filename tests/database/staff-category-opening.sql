-- Standalone final-schema regression; fictional fixtures rolled back.
BEGIN;
INSERT INTO auth.users(id,email_confirmed_at) SELECT ('00000000-0000-4000-a000-'||lpad(n::text,12,'0'))::uuid,clock_timestamp() FROM generate_series(961,966)n;
INSERT INTO auth.sessions(id,user_id) SELECT ('00000000-0000-4000-c000-'||lpad(n::text,12,'0'))::uuid,('00000000-0000-4000-a000-'||lpad(n::text,12,'0'))::uuid FROM generate_series(961,966)n;
INSERT INTO public.profiles(id,display_name) SELECT ('00000000-0000-4000-a000-'||lpad(n::text,12,'0'))::uuid,'Staff category fixture' FROM generate_series(961,966)n;
INSERT INTO public.offices(id,name) VALUES('00000000-0000-4000-e000-000000000961','Category opening fixture');
INSERT INTO public.memberships(id,office_id,user_id,role_code) SELECT ('00000000-0000-4000-b000-'||lpad(n::text,12,'0'))::uuid,'00000000-0000-4000-e000-000000000961',('00000000-0000-4000-a000-'||lpad(n::text,12,'0'))::uuid,CASE n WHEN 961 THEN 'owner' WHEN 962 THEN 'admin' WHEN 966 THEN 'client' ELSE 'employee' END FROM generate_series(961,966)n;
INSERT INTO private.team_member_permissions(membership_id,permission_code) SELECT ('00000000-0000-4000-b000-'||lpad(n::text,12,'0'))::uuid,cap FROM generate_series(962,965)n CROSS JOIN unnest(ARRAY['foundation.access','requests.read','requests.create','requests.update','services.read','services.perform'])cap ON CONFLICT DO NOTHING;
INSERT INTO private.team_member_permissions(membership_id,permission_code) VALUES('00000000-0000-4000-b000-000000000962','requests.level2'),('00000000-0000-4000-b000-000000000964','requests.level1');
INSERT INTO private.service_categories(id,office_id,name,execution_level) VALUES('00000000-0000-4000-a111-000000000961','00000000-0000-4000-e000-000000000961','Category1 fixture',1),('00000000-0000-4000-a111-000000000962','00000000-0000-4000-e000-000000000961','Category2 fixture',2),('00000000-0000-4000-a111-000000000963','00000000-0000-4000-e000-000000000961','Category3 fixture',3),('00000000-0000-4000-a111-000000000964','00000000-0000-4000-e000-000000000961','Pending fixture',NULL);
SELECT jsonb_build_object('origin','presencial','category_id','00000000-0000-4000-a111-000000000961','title','Staff category test','message','Collected details','customer_id',NULL,'assignee_id',NULL,'priority','normal','priority_reason','','items','[]'::jsonb,'internal_note','Retained note') AS staffvalue \gset
SET ROLE authenticated;
SET request.jwt.claims='{"sub":"00000000-0000-4000-a000-000000000961","session_id":"00000000-0000-4000-c000-000000000961"}';
SELECT public.staff_category_request_create('00000000-0000-4000-e000-000000000961',:'staffvalue',gen_random_uuid()) AS opened \gset
SELECT test.assert_true(:'opened'::jsonb->>'preintake'='false' AND :'opened'::jsonb->>'assignee_id'='00000000-0000-4000-b000-000000000961' AND :'opened'::jsonb->>'category_id'='00000000-0000-4000-a111-000000000961','staff categories: owner gets atendimento with category and no services');
SELECT public.staff_category_request_create('00000000-0000-4000-e000-000000000961',:'staffvalue'::jsonb||'{"category_id":"00000000-0000-4000-a111-000000000964"}',gen_random_uuid()) AS pendingowner \gset
SELECT test.assert_true(:'pendingowner'::jsonb->>'preintake'='false','staff categories: owner never forced into collection for pending level');
SELECT jsonb_build_object('code','CATEGORY-TEST','name','Category fixture service','category','Category1 fixture','unit','unidade','price_cents',100,'effective_from',NULL,'person_required',false,'participants_min',0,'approval_required',false,'signature_required',false,'settlement_required',false,'required_capabilities',jsonb_build_array('services.perform'),'fields','[]'::jsonb,'checklist','[]'::jsonb,'quantity_min',1,'quantity_max',100,'max_discount_bps',0,'max_surcharge_bps',0,'allow_courtesy',false,'allow_price_override',false) AS servicevalue \gset
SELECT public.service_create('00000000-0000-4000-e000-000000000961',:'servicevalue','Fictional local test',gen_random_uuid())->>'id' AS serviceid \gset
SELECT jsonb_build_array(jsonb_build_object('service_id',:'serviceid','quantity',1,'adjustment',jsonb_build_object('kind','none','value',0,'reason',''),'fields','{}'::jsonb,'participant_ids','[]'::jsonb,'checklist','[]'::jsonb)) AS serviceitems \gset
SELECT public.staff_category_request_create('00000000-0000-4000-e000-000000000961',:'staffvalue'::jsonb||jsonb_build_object('items',:'serviceitems'::jsonb),gen_random_uuid()) AS withservice \gset
SELECT test.assert_true(jsonb_array_length(:'withservice'::jsonb->'items')=1,'staff categories: matching service keeps captured snapshot');
RESET ROLE;
SELECT count(*) AS requestsbefore FROM public.requests WHERE office_id='00000000-0000-4000-e000-000000000961' \gset
SELECT last_number AS counterbefore FROM private.request_counters WHERE office_id='00000000-0000-4000-e000-000000000961' \gset
SELECT count(*) AS commandsbefore FROM private.staff_category_request_commands WHERE office_id='00000000-0000-4000-e000-000000000961' \gset
SET ROLE authenticated;
SELECT test.expect_error(format('SELECT public.staff_category_request_create(%L,%L::jsonb,gen_random_uuid())','00000000-0000-4000-e000-000000000961',(:'staffvalue'::jsonb||jsonb_build_object('category_id','00000000-0000-4000-a111-000000000962','items',:'serviceitems'::jsonb))::text),'PT422','staff categories: service category mismatch denied atomically');
RESET ROLE;
SELECT test.assert_true((SELECT count(*) FROM public.requests WHERE office_id='00000000-0000-4000-e000-000000000961')=:'requestsbefore'::bigint AND (SELECT last_number FROM private.request_counters WHERE office_id='00000000-0000-4000-e000-000000000961')=:'counterbefore'::bigint AND (SELECT count(*) FROM private.staff_category_request_commands WHERE office_id='00000000-0000-4000-e000-000000000961')=:'commandsbefore'::bigint,'staff categories: mismatch leaves no request counter or command orphan');
SET ROLE authenticated;

SELECT public.request_create('00000000-0000-4000-e000-000000000961',(:'staffvalue'::jsonb-ARRAY['category_id','message'])||jsonb_build_object('items',:'serviceitems'::jsonb),gen_random_uuid(),gen_random_uuid()) AS quickservice \gset
SELECT test.assert_true(jsonb_array_length(:'quickservice'::jsonb->'items')=1,'staff categories: legacy quick service opening preserved');
RESET ROLE;
SELECT gen_random_uuid() AS oldkey \gset
SELECT private.request_preintake_create_before_category_opening('00000000-0000-4000-e000-000000000961',:'staffvalue'::jsonb-ARRAY['assignee_id','priority','priority_reason','items'],:'oldkey') AS oldrequest \gset
SET ROLE authenticated;
SELECT test.assert_true(public.request_preintake_create('00000000-0000-4000-e000-000000000961',:'staffvalue'::jsonb-ARRAY['assignee_id','priority','priority_reason','items'],:'oldkey')->>'id'=:'oldrequest'::jsonb->>'id','staff categories: existing pre-migration retry preserves request and history');
SELECT public.request_preintake_create('00000000-0000-4000-e000-000000000961',:'staffvalue'::jsonb-ARRAY['assignee_id','priority','priority_reason','items'],gen_random_uuid()) AS legacyowner \gset
SELECT test.assert_true(:'legacyowner'::jsonb->>'preintake'='false','staff categories: legacy mode cannot force owner preintake');
SET request.jwt.claims='{"sub":"00000000-0000-4000-a000-000000000962","session_id":"00000000-0000-4000-c000-000000000962"}';
SELECT public.staff_category_request_create('00000000-0000-4000-e000-000000000961',:'staffvalue',gen_random_uuid()) AS admin1 \gset
SELECT test.assert_true(:'admin1'::jsonb->>'preintake'='true' AND :'admin1'::jsonb->>'can_collect'='true' AND :'admin1'::jsonb->>'can_update'='false','staff categories: admin2 cannot execute level1');
SELECT public.staff_category_request_create('00000000-0000-4000-e000-000000000961',:'staffvalue'::jsonb||'{"category_id":"00000000-0000-4000-a111-000000000962"}',gen_random_uuid()) AS admin2 \gset
SELECT test.assert_true(:'admin2'::jsonb->>'preintake'='false' AND :'admin2'::jsonb->>'assignee_id'='00000000-0000-4000-b000-000000000962','staff categories: explicitly enabled admin gets atendimento');
SET request.jwt.claims='{"sub":"00000000-0000-4000-a000-000000000964","session_id":"00000000-0000-4000-c000-000000000964"}';
SELECT public.staff_category_request_create('00000000-0000-4000-e000-000000000961',:'staffvalue',gen_random_uuid()) AS employee1 \gset
SELECT test.assert_true(:'employee1'::jsonb->>'preintake'='false','staff categories: employee level1 independent of role');
SET request.jwt.claims='{"sub":"00000000-0000-4000-a000-000000000963","session_id":"00000000-0000-4000-c000-000000000963"}';
SELECT public.staff_category_request_create('00000000-0000-4000-e000-000000000961',:'staffvalue'::jsonb||'{"priority":"urgent","priority_reason":"Time sensitive"}',gen_random_uuid()) AS urgentcollect \gset
SELECT test.assert_true(:'urgentcollect'::jsonb->>'priority'='urgent' AND :'urgentcollect'::jsonb->>'priority_reason'='Time sensitive','staff categories: collection preserves urgency and reason');
SELECT gen_random_uuid() AS repeatkey \gset
SELECT public.staff_category_request_create('00000000-0000-4000-e000-000000000961',:'staffvalue',:'repeatkey') AS employee0 \gset
SELECT test.assert_true(:'employee0'::jsonb->>'preintake'='true' AND :'employee0'::jsonb->>'can_collect'='true','staff categories: restricted category automatically collects');
SELECT test.assert_true(public.staff_category_request_create('00000000-0000-4000-e000-000000000961',:'staffvalue',:'repeatkey')->>'id'=:'employee0'::jsonb->>'id','staff categories: retry retains same request');
SELECT test.expect_error(format('SELECT public.staff_category_request_create(%L,%L::jsonb,%L)','00000000-0000-4000-e000-000000000961',(:'staffvalue'::jsonb||'{"title":"Changed"}')::text,:'repeatkey'),'PT409','staff categories: changed retry rejected');
SELECT public.staff_category_request_create('00000000-0000-4000-e000-000000000961',:'staffvalue'::jsonb||'{"category_id":"00000000-0000-4000-a111-000000000963"}',gen_random_uuid()) AS employee3 \gset
SELECT test.assert_true(:'employee3'::jsonb->>'preintake'='false','staff categories: general level3 opens atendimento');
SELECT public.staff_category_request_create('00000000-0000-4000-e000-000000000961',:'staffvalue'::jsonb||'{"category_id":"00000000-0000-4000-a111-000000000964"}',gen_random_uuid()) AS pendingemployee \gset
SELECT test.assert_true(:'pendingemployee'::jsonb->>'preintake'='true','staff categories: pending level remains collection for employee');
SELECT test.expect_error(format('SELECT public.staff_category_request_create(%L,%L::jsonb,gen_random_uuid())','00000000-0000-4000-e000-000000000961',(:'staffvalue'::jsonb||'{"preintake":false}')::text),'PT422','staff categories: forged modality rejected');
SELECT test.expect_error(format('SELECT public.staff_category_request_create(%L,%L::jsonb,gen_random_uuid())','00000000-0000-4000-e000-000000000961',(:'staffvalue'::jsonb||'{"category_id":"00000000-0000-4000-a111-000000000999"}')::text),'PT422','staff categories: foreign or unknown category rejected');
RESET ROLE;
UPDATE private.service_categories SET archived_at=clock_timestamp() WHERE id='00000000-0000-4000-a111-000000000963';
SET ROLE authenticated;
SELECT test.expect_error(format('SELECT public.staff_category_request_create(%L,%L::jsonb,gen_random_uuid())','00000000-0000-4000-e000-000000000961',(:'staffvalue'::jsonb||'{"category_id":"00000000-0000-4000-a111-000000000963"}')::text),'PT422','staff categories: archived category rejected');
RESET ROLE;
SELECT test.assert_true(NOT has_function_privilege('authenticated','private.request_preintake_create_before_category_opening(uuid,jsonb,uuid)','EXECUTE') AND NOT has_function_privilege('anon','public.staff_category_request_create(uuid,jsonb,uuid)','EXECUTE'),'staff categories: no old helper or anonymous bypass');
ROLLBACK;
