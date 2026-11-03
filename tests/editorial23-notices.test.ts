import test from 'node:test';
import assert from 'node:assert/strict';
import {notificationKinds,type AccountNotice} from '../shared/notifications';
import {notices} from '../server/modules/notifications/dto';
import {noticeDestination,noticeText} from '../src/features/notifications/presentation';
const id='11111111-1111-4111-8111-111111111111';
const kinds=['document_review_pending','document_approved','document_returned','document_rejected','document_withdrawn'] as const;
const base={id,created_at:'2026-11-03T12:00:00Z',read_at:null,can_open:true,request_id:id,protocol:'JN-2026-000001',attendant_name:null};
for(const kind of kinds)test(`editorial23: aviso ${kind} limita DTO e apresenta texto fixo`,()=>{
 assert.ok(notificationKinds.includes(kind));
 const page=notices({items:[{...base,kind,reason:'SEGREDO',actor_name:'AUTOR PRIVADO',document_id:id,content:'CONTEÚDO PRIVADO'}],total:1,unread:1,page:1,page_size:3});
 assert.deepEqual(Object.keys(page.items[0]).sort(),['id','kind','created_at','read_at','can_open','request_id','protocol','attendant_name'].sort());
 assert.doesNotMatch(JSON.stringify(page),/SEGREDO|PRIVADO|reason|actor_name|document_id|content/);
 assert.match(noticeText(page.items[0]),/documento/);
 assert.equal(noticeDestination(kind,false),kind==='document_review_pending'?'/documentos?aba=reviews':'/solicitacoes');
 if(kind!=='document_review_pending')assert.equal(noticeDestination(kind,true),'/minhas-solicitacoes');
});
test('editorial23: aviso revogado descarta referência e tipo arbitrário é rejeitado',()=>{
 const page=notices({items:[{...base,kind:'document_approved',can_open:false}],total:1,unread:1,page:1,page_size:3});
 assert.equal(page.items[0].request_id,null);assert.equal(page.items[0].protocol,null);
 assert.throws(()=>notices({items:[{...base,kind:'document_private_reason'}],total:1,unread:1,page:1,page_size:3}));
 assert.doesNotMatch(noticeText({...base,kind:'document_approved'} as AccountNotice),/entregue|assinado|quitado/);
});
