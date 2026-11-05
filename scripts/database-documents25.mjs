const claims={owner:JSON.stringify({sub:'00000000-0000-4000-a000-000000000201',session_id:'00000000-0000-4000-c000-000000000201'})};
export async function raceRelease25({sql,openSql,until}){
 const f=JSON.parse(sql(`SELECT jsonb_build_object('office',p.office_id,'publication',p.id,'revision',d.revision,'charge',c.id,'due',a.due_cents,'version',a.version) FROM private.document_publications p JOIN public.documents d ON d.office_id=p.office_id AND d.id=p.document_id AND d.revision=p.revision JOIN private.charges c ON c.office_id=d.office_id AND c.request_id=d.request_id CROSS JOIN LATERAL private.charges_amounts(c.office_id,c.id)a WHERE p.office_id='00000000-0000-4000-e000-000000000201' AND private.wf_approved(p) ORDER BY p.created_at DESC LIMIT 1;`).trim());
 const request=`SELECT public.document_release_command('${f.office}','${f.publication}',jsonb_build_object('kind','request','expected_revision',${f.revision},'expected_event_id',NULL,'reason','Solicitação concorrente de laboratório','expires_at',clock_timestamp()+interval '1 day'),gen_random_uuid())`;
 const race=async(label,firstSql,secondSql,code)=>{
  const first=openSql();let second;
  try{first.child.stdin.write(`BEGIN;SET ROLE authenticated;SET request.jwt.claims='${claims.owner}';${firstSql};\n\\echo RELEASE25_HELD\n`);await until(()=>first.output().includes('RELEASE25_HELD'));
   second=openSql();second.child.stdin.end(`SET application_name='release25_${label}';SET ROLE authenticated;SET request.jwt.claims='${claims.owner}';SELECT test.expect_error($q$${secondSql}$q$,'${code}','25 race: ${label}');`);
   await until(()=>sql(`SELECT EXISTS(SELECT FROM pg_stat_activity WHERE application_name='release25_${label}' AND wait_event_type='Lock');`).trim()==='t');first.child.stdin.end('COMMIT;\n');await first.result;return await second.result;
  }finally{first.child.kill();second?.child.kill();}
 };
 let out=await race('same_expected_event',request,request,'PT409');
 const event=sql(`SELECT id FROM private.document_exception_events25 WHERE office_id='${f.office}' AND publication_id='${f.publication}' ORDER BY created_at DESC,id DESC LIMIT 1;`).trim();
 const authorize=`SELECT public.document_release_command('${f.office}','${f.publication}',jsonb_build_object('kind','authorize','expected_revision',${f.revision},'expected_event_id','${event}','reason','Decisão após avaliação do saldo'),gen_random_uuid())`;
 const adjust=`SELECT public.charges_mutate('${f.office}','${f.charge}',${f.version},jsonb_build_object('kind','adjust','delta_cents',1,'reason','Mudança financeira durante autorização','installments',jsonb_build_array(jsonb_build_object('due_date',current_date::text,'amount_cents',${Number(f.due)+1}))),gen_random_uuid())`;
 out+=await race('financial_change_after_wait',adjust,authorize,'PT409');
 try{out+=await race('session_revoked_after_wait',`RESET ROLE;SELECT id FROM public.offices WHERE id='${f.office}' FOR UPDATE;UPDATE auth.sessions SET not_after=clock_timestamp()-interval '1 second' WHERE id='00000000-0000-4000-c000-000000000201'`,`SELECT public.document_release_state('${f.office}','${f.publication}',1)`,'PT401');}
 finally{sql(`UPDATE auth.sessions SET not_after=NULL WHERE id='00000000-0000-4000-c000-000000000201';`);}
 return out;
}
