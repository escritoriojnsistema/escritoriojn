import test from 'node:test';import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';import {createHash} from 'node:crypto';
import {reportInputV7} from '../server/modules/governance/reportV7.js';
import {reportInputV6} from '../server/modules/governance/reportV6.js';
import type {AuditReport,AuditEvent} from '../shared/governance.js';
test('modelos20: Auditoria7 traduz decisões e conserva apresentação6 e seus hashes',()=>{
 const report={renderer_version:7,contract_version:1,count:1,protocol:'JN-AUD-TESTE',office_name:'Escritório',actor_name:'Equipe',created_at:'2026-10-26T00:00:00Z',view:'recent',cutoff:'2026-10-01T00:00:00Z',filters:{action:'',actor_id:'',from:'',until:''}} as AuditReport;
 const events=[{id:'evento',action:'templates.approved',actor_id:'ator',actor_name:'Equipe',occurred_at:report.created_at,target_type:'template',target_id:'modelo',outcome:'success',request_id:'solicitacao',changes:{}}] as AuditEvent[];
 assert.equal(reportInputV7(report,events).events[0].actionLabel,'Versão de modelo aprovada');assert.equal(reportInputV7(report,events).events[0].targetLabel,'Modelo documental');assert.equal(reportInputV6({...report,renderer_version:6},events).events[0].actionLabel,'Evento de outro módulo');
 const manifest=JSON.parse(readFileSync('docs/evidencias/etapa-19/apresentacao6.json','utf8'));for(const [path,hash] of Object.entries(manifest.files??manifest.hashes??{})){assert.equal(createHash('sha256').update(readFileSync(path)).digest('hex'),hash,path);}
});
