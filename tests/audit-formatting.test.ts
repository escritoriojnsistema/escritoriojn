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
