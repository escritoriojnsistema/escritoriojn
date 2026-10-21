import test from 'node:test';
import assert from 'node:assert/strict';
import {requestDetail,requestOptions,requestPage} from '../server/modules/requests/dto.js';
import {validCreateRequest,validRequestMutation} from '../server/modules/requests/validation.js';
import {emptyService} from '../shared/services.js';

const id='00000000-0000-4000-d000-000000000101',time='2026-10-20T12:00:00Z';
const summary={id,protocol:'JN-2026-000001',title:'Teste fictício',public_status:'recebido',created_at:time,updated_at:time,status:'aberto',origin:'presencial',priority:'normal',created_by:id,assignee_id:id,assignee_name:'Operador fictício',customer_name:null,version:1};
const snapshot={service_id:id,version_id:id,version:1,effective_from:time,quoted_at:time,definition:{...emptyService,code:'XEROX-TESTE',name:'Xerox de Teste',category:'Cópias'},quantity:2,unit_price_cents:50,base_cents:100,total_cents:100,adjustment:{kind:'none',value:0,reason:''}};
const detail={...summary,portal:false,customer_id:null,message:'',priority_reason:'',items:[{id,snapshot,fields:{},participant_ids:[],checklist:[],private:'secret'}],history:[{id,kind:'created',actor_id:id,actor_name:'Operador fictício',reason:'Nota interna fictícia',from_status:null,to_status:'aberto',from_assignee:null,to_assignee:id,created_at:time,secret:'secret'}],history_page:1,history_total:1,can_update:true,can_transfer:true,can_cancel:true,secret:'secret'};

test('atendimentos10: detalhe interno reconstrói whitelist em todas as camadas',()=>{
 const result=requestDetail(detail);assert.equal(result.portal,false);assert.ok(!JSON.stringify(result).includes('secret'));
 assert.ok(!result.portal&&result.items[0].snapshot.total_cents===100);assert.ok(!result.portal&&result.history[0].reason==='Nota interna fictícia');
 const portal=requestDetail({...detail,portal:true,message:'Mensagem própria',services:['Xerox de Teste']});
 assert.deepEqual(Object.keys(portal).sort(),['id','protocol','title','public_status','created_at','updated_at','portal','message','services','assignee_name'].sort());
 for(const change of [{version:'1'},{customer_id:'bad'},{can_update:1},{items:[{...detail.items[0],snapshot:{...snapshot,total_cents:0.5}}]},{history:[{...detail.history[0],actor_id:'bad'}]}])assert.throws(()=>requestDetail({...detail,...change}));
 assert.throws(()=>requestPage({portal:true,items:[summary],page:1,page_size:100,total:1}));
 assert.throws(()=>requestOptions({items:[{id,label:'Xerox',definition:{...emptyService,price_cents:0.5}}],page:1,page_size:3,total:1}));
});

test('atendimentos10: textos multiline, prioridade e revisão manual são estritos',()=>{
 assert.ok(validCreateRequest({origin:'portal',title:'Triagem de Teste',message:'Linha1\nLinha2\tcom detalhe'}));
 assert.equal(validCreateRequest({origin:'portal',title:'Triagem de Teste',message:'Dado\u0000oculto'}),false);
 assert.ok(validRequestMutation({kind:'note',note:'Análise fictícia\nNova linha'}));
 assert.equal(validRequestMutation({kind:'transfer',assignee_id:id,reason:'\n'}),false);
 assert.equal(validRequestMutation({kind:'status',status:'cancelado',reason:'Fictício',cancellation_review:{charges_reviewed:true,refunds_reviewed:true,deliveries_reviewed:true,external_reviewed:false}}),false);
 assert.equal(validRequestMutation({kind:'status',status:'concluido',reason:'Fictício',settled:true}),false);
});
