import test from 'node:test';
import assert from 'node:assert/strict';
import {createElement as h} from 'react';
import {Link} from 'react-router-dom';
import type {AccessContext} from '../shared/access';
import {OperationBack,operationParent,splitOperationReturn} from '../src/features/operation/OperationBack';
const context=(role:string,permissions:string[])=>[{role_code:role,permissions}] as AccessContext[];
test('retornos diretos têm pais internos seguros sem depender de histórico ou state',()=>{
 for(const path of ['/configuracoes/categorias','/configuracoes/acessos','/configuracoes/privacidade','/configuracoes/arquivados','/equipe','/auditoria','/arquivados']){
  assert.deepEqual(operationParent(path,context('owner',['settings.access']),false),{path:'/configuracoes',label:'Voltar às configurações'});
  assert.deepEqual(operationParent(path,context('employee',['audit.read']),false),{path:'/painel',label:'Voltar ao início'});
 }
 assert.equal(operationParent('/painel',context('owner',[]),false),undefined);
 assert.equal(operationParent('/area-cliente',context('client',[]),true),undefined);
 assert.deepEqual(operationParent('/MINHA-CONTA/',context('client',[]),true),{path:'/area-cliente',label:'Voltar ao início'});
 assert.deepEqual(operationParent('//external.example',context('owner',[]),false),{path:'/painel',label:'Voltar ao início'});
});
test('atalhos financeiros só retornam ao caixa quando o pai é autorizado',()=>{
 for(const path of ['/atendimento-rapido','/cobrancas','/despesas','/relatorios-financeiros']){
  assert.equal(operationParent(path,context('employee',['cash.read']),false)?.path,'/caixa');
  assert.equal(operationParent(path,context('employee',['requests.read','charges.read']),false)?.path,'/caixa');
  assert.equal(operationParent(path,context('employee',['charges.read']),false)?.path,'/painel');
 }
});
test('retorno contextual conserva handler e disabled e as outras ações ficam no menu',()=>{
 const onClick=()=>{};
 const button=h('button',{disabled:true,onClick},'Voltar à lista');
 const extra=h('button',{},'Histórico de revisões');
 const split=splitOperationReturn([button,extra]);
 assert.equal(split.back?.props.disabled,true);assert.equal(split.back?.props.onClick,onClick);
 assert.equal((split.actions as unknown[]).length,1);
});

test('retorno contextual de link não chama handler nem navega enquanto pendente',()=>{
 let called=0,prevented=0;const link=h(Link,{to:'/configuracoes',onClick:()=>{called++;}},'Voltar às configurações');
 const props={pathname:'/configuracoes/acessos',contexts:context('owner',['settings.access']),client:false,contextual:link};
 const pending=OperationBack({...props,busy:true})!;pending.props.children.props.onClick({preventDefault:()=>{prevented++;}});
 assert.equal(prevented,1);assert.equal(called,0);assert.equal(pending.props.children.props['aria-disabled'],true);
 OperationBack({...props,busy:false})!.props.children.props.onClick({preventDefault:()=>{prevented++;}});assert.equal(called,1);
});
