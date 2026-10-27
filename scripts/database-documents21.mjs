const office='00000000-0000-4000-e000-000000000201';
const claims=n=>JSON.stringify({sub:`00000000-0000-4000-a000-000000000${n}`,session_id:`00000000-0000-4000-c000-000000000${n}`});
export const raceDocuments21=async({sql,openSql,until})=>{
 const row=JSON.parse(sql('SELECT row_to_json(f) FROM test.documents_fixture21 f;').trim());
 let output='';
 // Release a common advisory barrier so real selector RPCs start together.
 // The barrier is unrelated to the office row and does not reproduce lock logic.
 const barrier=openSql(), callers=[];
 try {
  barrier.child.stdin.write("SELECT pg_advisory_lock(210021);\n\\echo OPTIONS_BARRIER_HELD\n");
  await until(()=>barrier.output().includes('OPTIONS_BARRIER_HELD'));
  for(let i=0;i<16;i++){
   const c=openSql(), kind=['requests','templates','customers','items'][i%4];callers.push(c);
   c.child.stdin.end(`SET application_name='jn_options_${i}';SET deadlock_timeout='50ms';SET statement_timeout='15s';SET ROLE authenticated;SET request.jwt.claims='${claims(201)}';SELECT pg_advisory_lock_shared(210021);SELECT test.assert_true(public.document_options('${office}','${kind}',${kind==='items'?`'${row.request_id}'`:'NULL'},'',1)->>'kind'='${kind}','21: concurrent ${kind} options');`);
  }
  await until(()=>Number(sql("SELECT count(*) FROM pg_stat_activity WHERE application_name LIKE 'jn_options_%' AND wait_event='advisory';").trim())===16);
  const started=performance.now();
  barrier.child.stdin.end('SELECT pg_advisory_unlock(210021);\n');await barrier.result;
  const results=await Promise.allSettled(callers.map(c=>c.result));
  const failures=results.filter(r=>r.status==='rejected');
  if(failures.length)throw Error(`Concurrent options failed (${failures.length}/16): ${failures.map(r=>r.reason.message).join('\n')}`);
  output+=`OPTIONS_CONCURRENCY 16 calls 4 kinds elapsed_ms=${(performance.now()-started).toFixed(1)} deadlocks=0\n`;
  output+=results.map(r=>r.value).join('');
 }finally{barrier.child.kill();for(const c of callers)c.child.kill();}
 const input=JSON.stringify({content:'Corrida {{cliente.nome}} {{datas.emissao}}',overrides:{},money_in_words:true});
 const save=(revision,key='gen_random_uuid()')=>`SELECT public.document_operate('${office}','${row.document_id}',jsonb_build_object('kind','save','expected_revision',${revision},'input','${input}'::jsonb,'idempotency_key',${key}))`;
 const race=async(label,firstStatement,secondStatement,state,actor=201)=>{
  const first=openSql();let second;
  try{
   first.child.stdin.write(`BEGIN;${firstStatement};\n\\echo DOCUMENT_LOCK_HELD\n`);
   await until(()=>first.output().includes('DOCUMENT_LOCK_HELD'));
   second=openSql();second.child.stdin.end(`SET application_name='jn_documents_${label}';SET ROLE authenticated;SET request.jwt.claims='${claims(actor)}';SELECT test.expect_error($q$${secondStatement}$q$,'${state}','21 race: ${label}');`);
   await until(()=>sql(`SELECT EXISTS(SELECT FROM pg_stat_activity WHERE application_name='jn_documents_${label}' AND wait_event_type='Lock');`).trim()==='t');
   first.child.stdin.end('COMMIT;\n');await first.result;return await second.result;
  }finally{first.child.kill();second?.child.kill();}
 };
 output+=await race('two_edits',`SET ROLE authenticated;SET request.jwt.claims='${claims(201)}';${save(4)}`,save(4),'PT409');
 const lock=`SELECT id FROM public.offices WHERE id='${office}' FOR UPDATE`;
 sql(`INSERT INTO private.team_member_permissions(membership_id,permission_code) SELECT '00000000-0000-4000-b000-000000000202',p FROM unnest(ARRAY['documents.read','documents.create','documents.update','requests.read','requests.read_all','customers.read','customers.read_all'])p ON CONFLICT DO NOTHING;UPDATE public.requests SET assignee_id='00000000-0000-4000-b000-000000000202' WHERE id='${row.request_id}';`);
 const options=`SELECT public.document_options('${office}','items','${row.request_id}','',1)`;
 try {
  output+=await race('options_revoke',`${lock};DELETE FROM private.team_member_permissions WHERE membership_id='00000000-0000-4000-b000-000000000202' AND permission_code='documents.read'`,options,'PT403',202);
 } finally {sql("INSERT INTO private.team_member_permissions VALUES('00000000-0000-4000-b000-000000000202','documents.read') ON CONFLICT DO NOTHING");}
 try {
  output+=await race('options_scope',`${lock};UPDATE public.requests SET assignee_id='00000000-0000-4000-b000-000000000201' WHERE id='${row.request_id}'`,options,'PT403',202);
 } finally {sql(`UPDATE public.requests SET assignee_id='00000000-0000-4000-b000-000000000202' WHERE id='${row.request_id}'`);}
 try {
  output+=await race('options_session',`${lock};DELETE FROM auth.sessions WHERE id='00000000-0000-4000-c000-000000000202'`,options,'PT401',202);
 } finally {sql("INSERT INTO auth.sessions(id,user_id) VALUES('00000000-0000-4000-c000-000000000202','00000000-0000-4000-a000-000000000202') ON CONFLICT DO NOTHING");}
 output+=sql(`SET ROLE authenticated;SET request.jwt.claims='${claims(205)}';SELECT test.expect_error($q$SELECT public.document_options('${office}','customers',NULL,'',1)$q$,'PT403','21: client denied options');RESET ROLE;`);
 for(const kind of ['capability','scope','customer','session','replay']){
  let mutation,restore,statement=save(5),state='PT403';
  if(kind==='capability'||kind==='replay'){
   mutation="DELETE FROM private.team_member_permissions WHERE membership_id='00000000-0000-4000-b000-000000000202' AND permission_code='documents.read'";
   restore="INSERT INTO private.team_member_permissions VALUES('00000000-0000-4000-b000-000000000202','documents.read')";
   if(kind==='replay'){
    sql(`SET ROLE authenticated;SET request.jwt.claims='${claims(202)}';${save(5,"'00000000-0000-4000-8000-000000000221'::uuid")};`);
    statement=save(5,"'00000000-0000-4000-8000-000000000221'::uuid");
   }
  }else if(kind==='scope'){
   mutation=`UPDATE public.requests SET assignee_id='00000000-0000-4000-b000-000000000201' WHERE id='${row.request_id}'`;
   restore=`UPDATE public.requests SET assignee_id='00000000-0000-4000-b000-000000000202' WHERE id='${row.request_id}'`;
  }else if(kind==='customer'){
   mutation=`UPDATE public.customers SET blocked_at=clock_timestamp() WHERE id='${row.buyer_id}'`;
   restore=`UPDATE public.customers SET blocked_at=NULL WHERE id='${row.buyer_id}'`;
  }else{
   mutation="DELETE FROM auth.sessions WHERE id='00000000-0000-4000-c000-000000000202'";state='PT401';
   restore="INSERT INTO auth.sessions(id,user_id)VALUES('00000000-0000-4000-c000-000000000202','00000000-0000-4000-a000-000000000202')";
  }
  try{output+=await race(`revoke_${kind}`,`${lock};${mutation}`,statement,state,202);}finally{sql(restore);}
 }
 sql(`UPDATE public.requests SET assignee_id='00000000-0000-4000-b000-000000000201' WHERE id='${row.request_id}';`);
 output+=sql(`SELECT test.assert_true((SELECT revision=5 FROM public.documents WHERE id='${row.document_id}') AND(SELECT count(*)=5 FROM private.document_revisions WHERE document_id='${row.document_id}'),'21: races keep one winner and unchanged immutable revisions');`);
 return output;
};
export const benchmarkDocuments21=({sql})=>sql(`
SET ROLE authenticated;SET request.jwt.claims='${claims(201)}';
DO $$DECLARE f record;n integer;doc uuid;t uuid;it uuid;BEGIN
 SELECT * INTO f FROM test.documents_fixture21;
 SELECT p_request_item_id,p_template_version_id INTO it,t FROM (SELECT (public.document_detail(f.office_id,f.document_id,NULL,1)->>'request_item_id')::uuid p_request_item_id,(public.document_detail(f.office_id,f.document_id,NULL,1)->'template'->>'version_id')::uuid p_template_version_id)x;
 FOR n IN 1..1000 LOOP PERFORM public.document_create(f.office_id,f.request_id,it,t,'[]',gen_random_uuid());END LOOP;
 FOR n IN 5..10 LOOP PERFORM public.document_operate(f.office_id,f.document_id,jsonb_build_object('kind','save','expected_revision',n,'input',jsonb_build_object('content','Revisão '||n||' {{cliente.nome}} {{datas.emissao}}','overrides','{}'::jsonb,'money_in_words',true),'idempotency_key',gen_random_uuid()));END LOOP;
END $$;
EXPLAIN(ANALYZE,BUFFERS)SELECT public.documents_page('${office}','',200,5);
SELECT test.assert_true(public.documents_page('${office}','',200,5) @> '{"total":1001,"page":200,"page_size":5}' AND jsonb_array_length(public.documents_page('${office}','',200,5)->'items')=5 AND jsonb_array_length(public.documents_page('${office}','',201,5)->'items')=1,'21: benchmark1001 exact total and bounded page');
SELECT test.assert_true(public.document_detail('${office}',(SELECT document_id FROM test.documents_fixture21),NULL,2)->>'history_total'='11' AND jsonb_array_length(public.document_detail('${office}',(SELECT document_id FROM test.documents_fixture21),NULL,2)->'history')=5 AND public.document_detail('${office}',(SELECT document_id FROM test.documents_fixture21),NULL,2)->'history'->0->>'revision'='6','21: history5/page with exact total11');
RESET ROLE;
`);
