import test from 'node:test';
import assert from 'node:assert/strict';
import {ditrState,ditrResult,validDitrCommand} from '../shared/ditr.js';
const id='28000000-0000-4000-8000-000000000001';
const item={id,property_id:id,exercise:2026,taxpayer_id:id,taxpayer_name:'Maria de teste',request_id:id,internal_protocol:'AT-000001',responsible_name:'Equipe',modality:'original',previous_case_id:null,root_case_id:id,revision:1,version:1,created_at:'2026-11-09T12:00:00Z',can_work:true,service:{charge_id:id,total_cents:20000,paid_cents:20000,balance_cents:0}};
const state={items:[item],total:1,page:1,page_size:5,selected:item,evidence:[],evidence_total:0,calendar:null,requests:[],requests_total:0};
test('28: strips provider/private fields at every DTO boundary without deriving tax payment from paid fee',()=>{
 const value=ditrState({...state,secret:'hidden',items:[{...item,secret:'hidden',service:{...item.service,secret:'hidden'}}],selected:{...item,secret:'hidden'},evidence:[{id,case_id:id,kind:'receipt',file_id:id,external_reference:'EXTERNO-INFORMADO',amount_cents:null,external_date:'2026-11-09',actor_name:'Equipe',created_at:item.created_at,secret:'hidden'}]});
 assert.equal(JSON.stringify(value).includes('hidden'),false);assert.equal(value.selected?.service?.balance_cents,0);assert.equal(value.evidence[0].kind,'receipt');assert.equal('tax_paid' in value.selected!,false);
 assert.deepEqual(ditrResult({id,secret:'hidden'}),{id});assert.deepEqual(ditrResult({id:null}),{id:null});assert.throws(()=>ditrResult({}));
});
test('28: malformed chains, money, dates, official sources and oversized pages fail closed',()=>{
 for(const patch of [{exercise:0},{version:0},{modality:'rectifying',previous_case_id:null},{modality:'original',previous_case_id:id},{service:{...item.service,balance_cents:Infinity}}])assert.throws(()=>ditrState({...state,selected:{...item,...patch}}));
 assert.throws(()=>ditrState({...state,items:Array(6).fill(item)}));
 const calendar={id,exercise:2026,starts_on:'2026-08-01',due_on:'2026-09-30',checked_on:'2026-07-30',source_url:'https://www.gov.br/receitafederal/pt-br',responsible_name:'Equipe',created_at:item.created_at};
 assert.equal(ditrState({...state,calendar}).calendar?.source_url,calendar.source_url);
 for(const source_url of ['https://gov.br.evil.test/x','https://evil.test/gov.br','javascript:alert(1)','https://user@gov.br/x'])assert.throws(()=>ditrState({...state,calendar:{...calendar,source_url}}));
 assert.throws(()=>ditrState({...state,calendar:{...calendar,starts_on:'2026-02-30'}}));
});
test('28: command shape accepts documented operations and rejects forged fields or missing evidence',()=>{
 const create={kind:'create',exercise:2026,request_id:id,modality:'original',previous_case_id:null};
 assert.equal(validDitrCommand(create),true);assert.equal(validDitrCommand({...create,accepted_by_agency:true}),false);assert.equal(validDitrCommand({...create,exercise:'2026'}),false);assert.equal(validDitrCommand({...create,modality:'rectifying'}),false);
 const evidence={kind:'evidence',case_id:id,expected_version:1,evidence_kind:'tax_payment',file_id:id,external_reference:'COMPROVANTE',amount_cents:10000,external_date:'2026-11-09'};
 assert.equal(validDitrCommand(evidence),true);assert.equal(validDitrCommand({...evidence,amount_cents:-1}),false);assert.equal(validDitrCommand({...evidence,file_id:null}),false);assert.equal(validDitrCommand({...evidence,external_date:'2026-02-30'}),false);
 assert.equal(validDitrCommand({...evidence,evidence_kind:'receipt',amount_cents:null,external_reference:''}),false);
});
