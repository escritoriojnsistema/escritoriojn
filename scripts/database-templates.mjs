const office='00000000-0000-4000-e000-000000000201';
const claims=n=>JSON.stringify({sub:`00000000-0000-4000-a000-000000000${n}`,session_id:`00000000-0000-4000-c000-000000000${n}`});
export const raceTemplates=async({sql,openSql,until})=>{
 const id=sql('SELECT id FROM test.templates_saved20;').trim();
 let output='';
 const race=async(label,firstStatement,secondStatement,state='PT409',actor=201)=>{
  const first=openSql();let second;
  try{
   first.child.stdin.write(`BEGIN;SET ROLE authenticated;SET request.jwt.claims='${claims(201)}';${firstStatement};\n\\echo TEMPLATE_LOCK_HELD\n`);
   await until(()=>first.output().includes('TEMPLATE_LOCK_HELD'));
   second=openSql();second.child.stdin.end(`SET application_name='jn_templates_${label}';SET ROLE authenticated;SET request.jwt.claims='${claims(actor)}';SELECT test.expect_error($q$${secondStatement}$q$,'${state}','20 race: ${label}');`);
   await until(()=>sql(`SELECT EXISTS(SELECT FROM pg_stat_activity WHERE application_name='jn_templates_${label}' AND wait_event_type='Lock');`).trim()==='t');
   first.child.stdin.end('COMMIT;\n');await first.result;return await second.result;
  }finally{first.child.kill();second?.child.kill();}
 };
 const save=n=>`SELECT public.template_save('${office}','${id}',test.template_definition20(),${n},'Concorrencia edicao',gen_random_uuid())`;
 output+=await race('two_edits',save(2),save(2));
 let vid=sql(`SELECT id FROM public.template_versions WHERE template_id='${id}' AND number=3;`).trim();
 output+=await race('edit_before_approve',save(3),`SELECT public.template_approve('${office}','${id}','${vid}',3,'Aprovar versao ultrapassada',gen_random_uuid())`);
 vid=sql(`SELECT id FROM public.template_versions WHERE template_id='${id}' AND number=4;`).trim();
 const approve=`SELECT public.template_approve('${office}','${id}','${vid}',4,'Aprovar versao concorrente',gen_random_uuid())`;
 output+=await race('two_approvals',approve,approve);
 // Revocations are committed under the same office lock used by real team mutations.
 for(const kind of ['manage','approve','read','session']){
  const actor=kind==='approve'?206:202;
  const first=openSql();let second;
  const permission=`templates.${kind}`;
  const mutation=kind==='session'?`DELETE FROM auth.sessions WHERE id='00000000-0000-4000-c000-000000000${actor}'`:`DELETE FROM private.team_member_permissions WHERE membership_id='00000000-0000-4000-b000-000000000${actor}' AND permission_code='${permission}'`;
  const statement=kind==='read'?`SELECT public.template_detail('${office}','${id}',1)`:kind==='approve'?`SELECT public.template_approve('${office}','${id}','${vid}',4,'Autoridade revogada',gen_random_uuid())`:save(4);
  try{
   first.child.stdin.write(`BEGIN;SELECT id FROM public.offices WHERE id='${office}' FOR UPDATE;${mutation};\n\\echo TEMPLATE_REVOKE_HELD\n`);
   await until(()=>first.output().includes('TEMPLATE_REVOKE_HELD'));
   second=openSql();second.child.stdin.end(`SET application_name='jn_templates_revoke_${kind}';SET ROLE authenticated;SET request.jwt.claims='${claims(actor)}';SELECT test.expect_error($q$${statement}$q$,'${kind==='session'?'PT401':'PT403'}','20 race: revoke ${kind} while waiting');`);
   await until(()=>sql(`SELECT EXISTS(SELECT FROM pg_stat_activity WHERE application_name='jn_templates_revoke_${kind}' AND wait_event_type='Lock');`).trim()==='t');
   first.child.stdin.end('COMMIT;\n');await first.result;output+=await second.result;
  }finally{
   first.child.kill();second?.child.kill();
   sql(kind==='session'?`INSERT INTO auth.sessions(id,user_id)VALUES('00000000-0000-4000-c000-000000000${actor}','00000000-0000-4000-a000-000000000${actor}') ON CONFLICT DO NOTHING;`:`INSERT INTO private.team_member_permissions(membership_id,permission_code)VALUES('00000000-0000-4000-b000-000000000${actor}','${permission}') ON CONFLICT DO NOTHING;`);
  }
 }
 output+=sql(`SELECT test.assert_true((SELECT latest_version=4 FROM public.templates WHERE id='${id}') AND(SELECT count(*)=4 FROM public.template_versions WHERE template_id='${id}') AND(SELECT count(*)=3 FROM private.template_approvals WHERE template_id='${id}') AND(SELECT count(*)=7 FROM public.audit_events WHERE target_id='${id}' AND action LIKE 'templates.%'),'20: concurrent edits approvals revocations preserve version and exact audit count');`);
 return output;
};
export const benchmarkTemplates=({sql})=>{
 // 1,000 distinct library entries; use supported RPCs so integrity and audit participate.
 const result=sql(`SET ROLE authenticated;SET request.jwt.claims='${claims(201)}';DO $$DECLARE n integer;BEGIN FOR n IN 1..1000 LOOP PERFORM public.template_save('${office}',NULL,test.template_definition20()||jsonb_build_object('code','BENCH-'||lpad(n::text,4,'0')),0,'Carga sintetica local',gen_random_uuid());END LOOP;END $$;
 EXPLAIN(ANALYZE,BUFFERS)SELECT public.templates_page('${office}','',100,5);
 SELECT test.assert_true(public.templates_page('${office}','BENCH-',200,5) @> '{"total":1000,"page":200,"page_size":5}' AND jsonb_array_length(public.templates_page('${office}','BENCH-',200,5)->'items')=5,'20: indexed office library pagination1000 preserves total and bounded page');
 DO $$DECLARE n integer;t uuid;BEGIN SELECT id INTO t FROM test.templates_saved20;FOR n IN 4..9 LOOP PERFORM public.template_save('${office}',t,test.template_definition20(),n,'Historico paginado sintetico',gen_random_uuid());END LOOP;END $$;
 SELECT test.assert_true(jsonb_array_length(public.template_detail('${office}',(SELECT id FROM test.templates_saved20),1)->'versions')=5 AND public.template_detail('${office}',(SELECT id FROM test.templates_saved20),2)->'versions'->0->>'number'='5' AND jsonb_array_length(public.template_detail('${office}',(SELECT id FROM test.templates_saved20),3)->'versions')=0,'20: history exactly5 per page descending without truncating total');`);
 return result;
};
