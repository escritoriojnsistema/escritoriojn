import test from 'node:test';
import assert from 'node:assert/strict';
import type {AccessContext} from '../shared/access.js';
import {operationNavigation,mobileOperationNavigation} from '../src/features/operation/navigation.js';
const context=(permissions:string[],office_id='11111111-1111-4111-8111-111111111111',role_code:AccessContext['role_code']='employee'):AccessContext=>({office_id,office_name:'Escritório de teste',user_id:'22222222-2222-4222-8222-222222222222',display_name:'Equipe de teste',role_code,permissions});
test('menus: capacidades administrativas independentes continuam acessíveis sem Configurações',()=>{
 const items=operationNavigation([context(['audit.read','archives.manage','users.manage'])],false);
 for(const key of ['audit','archives','team'])assert.ok(items.some(i=>i.key===key),key);
 assert.ok(!items.some(i=>i.key==='settings'));
});
test('menus: agrupamento por Configurações vale por escritório e não esconde outra concessão',()=>{
 const grouped=operationNavigation([context(['settings.access','audit.read','archives.manage','users.manage'])],false);
 assert.ok(grouped.some(i=>i.key==='settings'));for(const key of ['audit','archives','team'])assert.ok(grouped.some(i=>i.key===key),key);
 const mixed=operationNavigation([context(['settings.access']),context(['audit.read'],'33333333-3333-4333-8333-333333333333')],false);
 assert.ok(mixed.some(i=>i.key==='audit'));
});
test('menus: Caixa exige a mesma composição de leitura da tela, sem somar capacidades entre escritórios',()=>{
 for(const permissions of [['expenses.read'],['cash.transfer'],['charges.read']])assert.ok(!operationNavigation([context(permissions)],false).some(i=>i.key==='cash'));
 for(const permissions of [['cash.read'],['requests.read','charges.read']])assert.ok(operationNavigation([context(permissions)],false).some(i=>i.key==='cash'));
 assert.ok(!operationNavigation([context(['charges.read']),context(['requests.read'],'33333333-3333-4333-8333-333333333333')],false).some(i=>i.key==='cash'));
});
test('menus: cliente permanece separado e os quatro atalhos continuam limitados',()=>{
 const items=operationNavigation([context(['settings.access','audit.read','archives.manage','rural.read','customers.read'],'11111111-1111-4111-8111-111111111111','client')],true);
 assert.ok(items.every(i=>!['settings','audit','archives','rural','team','cash'].includes(i.key)));
 assert.ok(mobileOperationNavigation(items).length<=4);assert.equal(mobileOperationNavigation(items).at(-1)?.key,'account');
});

test('menus: cada destino financeiro/administrativo exige a composição do mesmo escritório e papel',()=>{
 const other='33333333-3333-4333-8333-333333333333';
 for(const [key,permissions] of [['expenses',['cash.read','expenses.read']],['reports',['cash.read','finance.reports.read']],['charges',['requests.read','charges.read']],['categories',['settings.access','categories.manage']],['access',['settings.access','access.manage']]] as const){
  for(const role of ['owner','admin','employee'] as const){
   const allowed=!['categories','access'].includes(key)||role!=='employee';
   assert.equal(operationNavigation([context([...permissions],undefined,role)],false).some(i=>i.key===key),allowed,`${role}:${key}`);
  }
  assert.ok(!operationNavigation([context([permissions[0]],undefined,'admin'),context([permissions[1]],other,'admin')],false).some(i=>i.key===key),key);
 }
 const menu=operationNavigation([context(['settings.access','users.manage','audit.read','archives.manage','cash.read','expenses.read','finance.reports.read','requests.read','charges.read','categories.manage','access.manage'],undefined,'owner')],false);
 assert.equal(new Set(menu.map(i=>i.path)).size,menu.length);assert.equal(mobileOperationNavigation(menu).length,4);
});
