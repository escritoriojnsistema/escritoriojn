import test from 'node:test';import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';import {createHash} from 'node:crypto';
import {reportInputV8} from '../server/modules/governance/reportV8.js';
import {reportInputV7} from '../server/modules/governance/reportV7.js';
import type {AuditReport,AuditEvent} from '../shared/governance.js';
test('documentos21: Auditoria8 traduz decisões e conserva apresentação7 e seus hashes',()=>{
 const report={renderer_version:8,contract_version:1,count:1,protocol:'JN-AUD-TESTE',office_name:'Escritório',actor_name:'Equipe',created_at:'2026-10-26T00:00:00Z',view:'recent',cutoff:'2026-10-01T00:00:00Z',filters:{action:'',actor_id:'',from:'',until:''}} as AuditReport;
 const events=[{id:'evento',action:'documents.prepared',actor_id:'ator',actor_name:'Equipe',occurred_at:report.created_at,target_type:'document',target_id:'modelo',outcome:'success',request_id:'solicitacao',changes:{}}] as AuditEvent[];
 assert.equal(reportInputV8(report,events).events[0].actionLabel,'Preenchimento documental concluído');assert.equal(reportInputV8(report,events).events[0].targetLabel,'Documento em preenchimento');assert.equal(reportInputV7({...report,renderer_version:7},events).events[0].actionLabel,'Evento de outro módulo');
 const manifest=JSON.parse(readFileSync('docs/evidencias/etapa-20/apresentacao7.json','utf8'));for(const [path,hash] of Object.entries(manifest.files??manifest.hashes??{})){assert.equal(createHash('sha256').update(readFileSync(path)).digest('hex'),hash,path);}
});
