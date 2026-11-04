const claims=JSON.stringify({sub:'00000000-0000-4000-a000-000000000201',session_id:'00000000-0000-4000-c000-000000000201'});
export const raceSignatures24=async({sql,openSql,until})=>{
 const fixture=JSON.parse(sql(`SELECT jsonb_build_object('office',p.office_id,'publication',p.id,'revision',d.revision) FROM private.document_publications p JOIN public.documents d ON d.office_id=p.office_id AND d.id=p.document_id AND d.revision=p.revision WHERE p.office_id='00000000-0000-4000-e000-000000000201' AND private.wf_approved(p) ORDER BY p.created_at DESC LIMIT 1;`).trim());
 const command=`SELECT public.document_signature_command('${fixture.office}','${fixture.publication}',jsonb_build_object('kind','configure','expected_revision',${fixture.revision},'expected_event_id',NULL,'reason','Decisão concorrente de teste','mode','external','exit_policy','before_settlement','expected_signers',jsonb_build_array('Pessoa local')),gen_random_uuid())`;
 let output='';
 const race=async(label,firstSql,secondSql,error)=>{
  const first=openSql();let second;
  try{
   first.child.stdin.write(`BEGIN;${firstSql};\n\\echo SIGNATURE24_HELD\n`);
   await until(()=>first.output().includes('SIGNATURE24_HELD'));
   second=openSql();second.child.stdin.end(`SET application_name='signature24_${label}';SET ROLE authenticated;SET request.jwt.claims='${claims}';SELECT test.expect_error($q$${secondSql}$q$,'${error}','24 race: ${label}');`);
   await until(()=>sql(`SELECT EXISTS(SELECT FROM pg_stat_activity WHERE application_name='signature24_${label}' AND wait_event_type='Lock');`).trim()==='t');
   first.child.stdin.end('COMMIT;\n');await first.result;return await second.result;
  }finally{first.child.kill();second?.child.kill();}
 };
 output+=await race('same_expected_event',`SET ROLE authenticated;SET request.jwt.claims='${claims}';${command}`,command,'PT409');
 try{
  output+=await race('revoked_session_after_lock',`SELECT id FROM public.offices WHERE id='${fixture.office}' FOR UPDATE;UPDATE auth.sessions SET not_after=clock_timestamp()-interval '1 second' WHERE id='00000000-0000-4000-c000-000000000201'`,`SELECT public.document_signature_state('${fixture.office}','${fixture.publication}',1)`,'PT401');
 }finally{sql(`UPDATE auth.sessions SET not_after=NULL WHERE id='00000000-0000-4000-c000-000000000201';`);}
 return output;
};
