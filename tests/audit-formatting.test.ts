import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync,readdirSync} from 'node:fs';
import {auditActionNames} from '../shared/governance.js';
test('audit: catalog covers literal producers from all existing database modules',()=>{
 const produced=new Set<string>();for(const file of readdirSync('supabase/migrations')){const text=readFileSync('supabase/migrations/'+file,'utf8');for(const statement of text.matchAll(/(?:PERFORM private\.(?:emit_business_event|team_audit)\(|INSERT INTO public\.audit_events\b)[\s\S]*?;/g)){for(const action of statement[0].matchAll(/'([a-z_]+\.[a-z_]+)'/g))produced.add(action[1]);}}
 const dynamic=['requests.status_changed','requests.transferred','requests.reclaimed','requests.note_added','requests.triaged','charges.adjusted','charges.cancelled',...['assignment_grant','assignment_revoke','representation_grant','representation_revoke','identity_verify','identity_revoke'].map(a=>'customers.'+a)];
 for(const action of [...produced,...dynamic])assert.ok(auditActionNames[action],`Missing Portuguese audit action: ${action}`);
 assert.ok(produced.size>35,'producer extraction must keep inspecting real code');
});
import {auditActionLabel,auditFieldLabel} from '../shared/governance.js';
test('audit: unknown events remain readable and known account corrections are Portuguese',()=>{assert.equal(auditActionLabel('accounts.correction_applied'),'Correção cadastral aplicada');assert.equal(auditActionLabel('cash.future_event'),'Evento de caixa');assert.equal(auditActionLabel('unknown.raw_tech'),'Evento de outro módulo');assert.equal(auditFieldLabel('unknown_raw_field'),'Informação adicional');});
import {reportInputV1} from '../server/modules/governance/reportV1.js';
import type {AuditReport,AuditEvent} from '../shared/governance.js';
test('audit: contrato PDF v1 traduz ação e retém referências sem código em inglês',()=>{
 const report={id:'id',protocol:'JN-AUD-id',count:1,office_id:'office',office_name:'Escritório JN',actor_name:'Pessoa',created_at:'2026-10-23T00:00:00Z',view:'recent',cutoff:'2026-07-25T00:00:00Z',filters:{action:'accounts.correction_applied',actor_id:'',from:'2026-10-01',until:'2026-10-23'},renderer_version:1,contract_version:1} as AuditReport;
 const event={id:'evento',action:'accounts.correction_applied',actor_id:'ator',actor_name:'Pessoa',target_type:'account_correction',target_id:'registro',outcome:'success',occurred_at:'2026-10-23T00:00:00Z',request_id:'solicitação',changes:{amount_cents:123456}} as AuditEvent;
 const result=reportInputV1(report,[event]);assert.equal(result.events[0].actionLabel,'Correção cadastral aplicada');assert.equal(result.events[0].changes[0].value,'R$ 1.234,56');const negative=reportInputV1(report,[{...event,changes:{delta_cents:-123456}}]);assert.equal(negative.events[0].changes[0].value,'-R$ 1.234,56');assert.ok(!JSON.stringify(result).includes('accounts.correction_applied'));assert.match(result.events[0].reference,/registro/);const translated=reportInputV1(report,[{...event,changes:{role_code:'client',permissions:['users.manage','users.owners.create']}}]);assert.equal(translated.events[0].changes[0].value,'Cliente');assert.ok(!JSON.stringify(translated).includes('users.manage'));
});
