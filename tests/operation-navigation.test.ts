import test from 'node:test';
import assert from 'node:assert/strict';
import type {AccessContext} from '../shared/access.js';
import * as navigation from '../src/features/operation/navigation.js';
const {operationNavigation,mobileOperationNavigation,operationSectionKey,operationSectionNavigation,settingsNavigation}=navigation;
const context=(permissions:string[],office_id='11111111-1111-4111-8111-111111111111',role_code:AccessContext['role_code']='employee'):AccessContext=>({office_id,office_name:'Escritório de teste',user_id:'22222222-2222-4222-8222-222222222222',display_name:'Equipe de teste',role_code,permissions});
const caps=['settings.access','users.manage','audit.read','archives.manage','cash.read','expenses.read','finance.reports.read','requests.read','charges.read','categories.manage','access.manage','customers.read','rural.read','files.read','checklists.read','services.read'];
const removed=['attachments','rural','checklists','charges','expenses','reports','team','audit','archives','categories','access','privacy','account'];
for(const role of ['owner','admin','employee'] as const)test(`menu agrupado sem atalhos duplicados: ${role}`,()=>{
 const items=operationNavigation([context(caps,undefined,role)],false);
 assert.deepEqual(items.map(i=>i.key),['home','requests','customers','services','cash','notifications','settings']);
 assert.ok(items.every(i=>!removed.includes(i.key)));
 assert.equal(new Set(items.map(i=>i.path)).size,items.length);
 const mobile=mobileOperationNavigation(items);assert.deepEqual(mobile.map(i=>i.key),['cash','requests','customers','settings']);
});
test('cliente: Anexos fica em Solicitações e Conta em Configurações',()=>{
 const contexts=[context([],undefined,'client')],items=operationNavigation(contexts,true);
 assert.ok(items.every(i=>!removed.includes(i.key)));assert.ok(items.some(i=>i.key==='settings'));
 assert.deepEqual(operationSectionNavigation(contexts,true,'/minhas-solicitacoes').map(i=>i.path),['/minhas-solicitacoes','/meus-anexos']);
 assert.deepEqual(settingsNavigation(contexts[0],true).map(i=>i.path),['/minha-conta']);
 assert.equal(mobileOperationNavigation(items).at(-1)?.key,'settings');
});
test('seções autorizadas continuam acessíveis sem concessão geral de Configurações ou Serviços',()=>{
 const c=context(['audit.read','users.manage','requests.read','checklists.read']);
 assert.ok(operationNavigation([c],false).some(i=>i.key==='settings'));
 assert.deepEqual(settingsNavigation(c,false).map(i=>i.key),['audit','team','account']);
 const services=operationNavigation([c],false).find(i=>i.key==='services');assert.equal(services?.path,'/pendencias');
 assert.deepEqual(operationSectionNavigation([c],false,'/pendencias').map(i=>i.key),['checklists']);
});
test('composições não somam permissões entre escritórios e cargos não concedem acesso',()=>{
 const contexts=[context(['requests.read','customers.read','cash.read','settings.access'],undefined,'admin'),context(['files.read','rural.read','checklists.read','charges.read','categories.manage'],'33333333-3333-4333-8333-333333333333','admin')];
 for(const route of ['/solicitacoes','/clientes','/servicos'])assert.ok(operationSectionNavigation(contexts,false,route).every(i=>!['attachments','rural','checklists'].includes(i.key)));
 assert.ok(!settingsNavigation(contexts[0],false).some(i=>i.key==='categories'));
 assert.ok(!settingsNavigation(contexts[1],false).some(i=>i.key==='categories'));
 assert.ok(!operationNavigation([context([],undefined,'owner')],false).some(i=>i.key==='cash'));
 for(const p of [['expenses.read'],['cash.transfer'],['charges.read']])assert.ok(!operationNavigation([context(p)],false).some(i=>i.key==='cash'));
});
test('rotas internas destacam o grupo correto inclusive com barra final',()=>{
 for(const [path,key] of [['/anexos/','requests'],['/meus-anexos','requests'],['/imoveis-rurais','customers'],['/pendencias','services'],['/cobrancas','cash'],['/despesas','cash'],['/relatorios-financeiros','cash'],['/equipe','settings'],['/conta','settings'],['/minha-conta','settings'],['/configuracoes/acessos','settings']])assert.equal(operationSectionKey(path),key,path);
});
