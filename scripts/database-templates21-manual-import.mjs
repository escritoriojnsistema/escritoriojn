const office='00000000-0000-4000-e000-000000000201';
const call=(key,code,source='https://drive.google.com/drive/folders/local-race')=>`private.import_template_drafts('${office}','${key}','${source}',jsonb_build_array(test.manual_definition21('${code}')))`;
export const raceManualImports21=async({sql,openSql,until})=>{
 let output='';
 const race=async(label,key,code,secondStatement)=>{
  const first=openSql();let second;
  try{
   first.child.stdin.write(`BEGIN;SET ROLE migrator;SELECT ${call(key,code)};\n\\echo MANUAL_IMPORT_LOCK_HELD\n`);
   await until(()=>first.output().includes('MANUAL_IMPORT_LOCK_HELD'));
   second=openSql();second.child.stdin.end(`SET application_name='jn_manual_import_${label}';SET ROLE migrator;${secondStatement};`);
   await until(()=>sql(`SELECT EXISTS(SELECT FROM pg_stat_activity WHERE application_name='jn_manual_import_${label}' AND wait_event_type='Lock');`).trim()==='t');
   first.child.stdin.end('COMMIT;\n');await first.result;output+=await second.result;
  }finally{first.child.kill();second?.child.kill();}
 };
 // Use a new statement after the waited import: an outer pre-wait snapshot cannot see the committed batch.
 await race('exact_replay','race-exact','RACE-EXACT',`CREATE TEMP TABLE import_race_result AS SELECT ${call('race-exact','RACE-EXACT')} result;SELECT test.assert_true((SELECT result FROM import_race_result)=(SELECT result FROM private.template_import_batches WHERE office_id='${office}' AND batch_key='race-exact'),'pós21 race: two real connections replay exact batch')`);
 await race('changed_hash','race-hash','RACE-HASH',`SELECT test.expect_error($q$SELECT ${call('race-hash','RACE-HASH','https://drive.google.com/drive/folders/changed')}$q$,'PT409','pós21 race: changed hash conflicts after wait')`);
 await race('same_code','race-code-a','RACE-CODE',`SELECT test.expect_error($q$SELECT ${call('race-code-b','RACE-CODE')}$q$,'PT409','pós21 race: another batch cannot overwrite allocated code')`);
 output+=sql(`SELECT test.assert_true((SELECT count(*)=3 FROM private.template_import_batches WHERE batch_key LIKE 'race-%') AND(SELECT count(*)=3 FROM public.templates WHERE code IN('RACE-EXACT','RACE-HASH','RACE-CODE')) AND(SELECT count(*)=3 FROM public.audit_events e JOIN public.templates t ON t.id=e.target_id WHERE t.code IN('RACE-EXACT','RACE-HASH','RACE-CODE') AND e.action='templates.saved' AND actor_kind='operator' AND actor_db_role='migrator'),'pós21 race: three batches three versions and three operator events only');`);
 return output;
};

const quoteSql=value=>`'${value.replaceAll("'","''")}'`;
export const verifyManualImportPayload21=({sql,definitions,sourceUrl='https://drive.google.com/drive/folders/local-reviewed-payload'})=>{
 if(!Array.isArray(definitions)||definitions.length===0)throw new Error('JN_TEMPLATE_IMPORT_PAYLOAD_PATH deve conter um array JSON não vazio de definições20.');
 const payload=quoteSql(JSON.stringify(definitions));
 return sql(`BEGIN;
 SELECT count(*) AS payload_documents_before FROM public.documents \\gset
 SELECT count(*) AS payload_approvals_before FROM private.template_approvals \\gset
 SELECT count(*) AS payload_reports_before FROM private.audit_reports \\gset
 SET LOCAL ROLE migrator;
 SELECT private.import_template_drafts('${office}','local-catalog-validation',${quoteSql(sourceUrl)},${payload}::jsonb) AS payload_summary \\gset
 SELECT test.assert_true((:'payload_summary'::jsonb->>'count')::integer=${definitions.length} AND jsonb_array_length(:'payload_summary'::jsonb->'items')=${definitions.length},'pós21 payload: all ${definitions.length} reviewed definitions imported atomically');
 SELECT test.assert_true(private.import_template_drafts('${office}','local-catalog-validation',${quoteSql(sourceUrl)},${payload}::jsonb)=:'payload_summary'::jsonb,'pós21 payload: exact reviewed catalog replay');
 RESET ROLE;
 SELECT test.assert_true((SELECT count(*) FROM public.documents)=:'payload_documents_before'::bigint AND(SELECT count(*) FROM private.template_approvals)=:'payload_approvals_before'::bigint AND(SELECT count(*) FROM private.audit_reports)=:'payload_reports_before'::bigint,'pós21 payload: no approval document or PDF created');
 SET LOCAL ROLE authenticated;
 SET LOCAL request.jwt.claims='{"sub":"00000000-0000-4000-a000-000000000201","session_id":"00000000-0000-4000-c000-000000000201"}';
 SELECT test.assert_true((SELECT bool_and((dto#>'{versions,0}') @> definition AND dto#>'{versions,0,created_by}'='null' AND dto#>'{versions,0,approved_at}'='null' AND dto#>>'{versions,0,source_import_id}'=:'payload_summary'::jsonb->>'id') FROM jsonb_array_elements(:'payload_summary'::jsonb->'items') WITH ORDINALITY items(item,n) JOIN jsonb_array_elements(${payload}::jsonb) WITH ORDINALITY definitions(definition,n) USING(n) CROSS JOIN LATERAL(SELECT public.template_detail('${office}',(item->>'id')::uuid,1) dto) details),'pós21 payload: every reviewed definition round-trips through authorized20 DTO with technical authorship');
 RESET ROLE;
 ROLLBACK;
 SELECT test.assert_true(NOT EXISTS(SELECT FROM private.template_import_batches WHERE office_id='${office}' AND batch_key='local-catalog-validation'),'pós21 payload: validation rollback retains no catalog batch');`);
};
