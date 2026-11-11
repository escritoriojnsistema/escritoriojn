import test from 'node:test';
import assert from 'node:assert/strict';
import type {Session} from '@supabase/supabase-js';
import {paths,portalForPath} from '../src/app/routes';
import {chooseSessionPortal,readSessionPortal,rememberSessionPortal,forgetSessionPortal} from '../src/features/auth/sessionPortal';
const uid='22222222-2222-4222-8222-222222222222',sid='11111111-1111-4111-8111-111111111111';
const session=(id=sid,suffix='test')=>({user:{id:uid},access_token:`e30.${Buffer.from(JSON.stringify({sub:uid,session_id:id})).toString('base64url')}.${suffix}`} as Session);
function storage(){const values=new Map<string,string>();return{getItem:(key:string)=>values.get(key)??null,setItem:(key:string,value:string)=>{values.set(key,value);},removeItem:(key:string)=>{values.delete(key);},values};}
test('todos os caminhos privados/clientes e aliases têm portal explícito',()=>{
 for(const path of [paths.clientPanel,paths.clientAccount,paths.clientRequests,paths.clientPayments,paths.clientNotifications,paths.clientAttachments,paths.clientDocuments,paths.clientDocumentCatalog])assert.equal(portalForPath(`${path.toUpperCase()}/`),'client',path);
 for(const path of [paths.panel,paths.documents,paths.settingsCategories,paths.settingsAccess,paths.settingsPrivacy,paths.teamManagement,paths.audit,paths.archives,paths.cash,paths.expenses,paths.quick])assert.equal(portalForPath(path),'team',path);
 for(const path of [paths.home,paths.authenticated,paths.invitation,'/desconhecida','/privacidade'])assert.equal(portalForPath(path),undefined,path);
});
test('preferência nunca contém token, dados ou permissões; refresh conserva, outra sessão não herda',()=>{
 const store=storage(),s=session();rememberSessionPortal(s,'client',store);assert.equal(readSessionPortal(s,store),'client');assert.equal(readSessionPortal(session(sid,'rotated'),store),'client');assert.equal(readSessionPortal(session(uid),store),undefined);
 const saved=[...store.values.values()].join();assert.ok(!saved.includes(s.access_token));assert.ok(!saved.includes('permissions'));
 forgetSessionPortal(session(uid),store);assert.equal(readSessionPortal(s,store),'client');forgetSessionPortal(s,store);assert.equal(readSessionPortal(s,store),undefined);
});
test('marcador legado inválido/storage indisponível não amplia autoridade nem persiste token bruto',()=>{
 const store=storage(),s={...session(),access_token:'opaque-private-token'};rememberSessionPortal(s,'team',store);assert.equal(store.values.size,0);
 const denied={getItem:()=>{throw Error();},setItem:()=>{throw Error();},removeItem:()=>{throw Error();}};
 assert.doesNotThrow(()=>rememberSessionPortal(session(),'team',denied));assert.equal(readSessionPortal(session(),denied),undefined);assert.doesNotThrow(()=>forgetSessionPortal(session(),denied));
});
test('restauração legada escolhe vínculo real; preferência fixada não troca de papel após revogação',()=>{
 assert.equal(chooseSessionPortal(['employee','client'],undefined,'client'),'client');assert.equal(chooseSessionPortal(['employee','client'],undefined,'team'),'team');assert.equal(chooseSessionPortal(['employee','client']),'team');
 assert.equal(chooseSessionPortal(['employee'],undefined,'client'),'team');assert.equal(chooseSessionPortal(['client'],undefined,'team'),'client');
 assert.equal(chooseSessionPortal(['client'],'team','client'),'team');assert.equal(chooseSessionPortal(['employee'],'client','team'),'client');
});
