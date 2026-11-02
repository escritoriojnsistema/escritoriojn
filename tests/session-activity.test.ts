import test from 'node:test';
import assert from 'node:assert/strict';
import { activitySnapshot, ActivityDeadline, humanActivityAllowed, accessPolicyState } from '../shared/sessionActivity.js';

const uid='00000000-0000-4000-a000-000000000001', sid='00000000-0000-4000-c000-000000000001';
const state={user_id:uid,session_id:sid,server_time:'2026-11-02T12:00:00.000Z',expires_at:'2026-11-02T12:30:00.000Z',idle_minutes:30};
test('deadline usa intervalo do servidor e relógio monotônico, sem depender do relógio civil local',()=>{
 const clock=new ActivityDeadline();clock.observe(activitySnapshot(state),100);
 assert.equal(clock.remaining(1100),1799000);
 assert.equal(clock.remaining(1800100),0);
});
test('resposta antiga e refresh não ampliam deadline; sessão expirada permanece encerrada',()=>{
 const clock=new ActivityDeadline();clock.observe(activitySnapshot(state),100);
 clock.observe(activitySnapshot({...state,server_time:'2026-11-02T11:59:59Z',expires_at:'2026-11-02T13:00:00Z'}),1000);
 assert.equal(clock.remaining(1100),1799000);
 assert.equal(clock.remaining(1800100),0);
 clock.observe(activitySnapshot({...state,server_time:'2026-11-02T12:30:01Z',expires_at:'2026-11-02T13:00:00Z'}),1801100);
 assert.equal(clock.remaining(1801100),0,'resposta tardia nunca ressuscita uma sessão encerrada');
});
test('somente interação humana explícita e limitada pode enviar heartbeat',()=>{
 for(const type of ['focus','mousemove','visibilitychange','timer','poll'])assert.equal(humanActivityAllowed({type,isTrusted:true},0,20000),false);
 assert.equal(humanActivityAllowed({type:'keydown',isTrusted:false},0,20000),false);
 assert.equal(humanActivityAllowed({type:'pointerdown',isTrusted:true},0,14999),false);
 assert.equal(humanActivityAllowed({type:'keydown',isTrusted:true},0,15000),true);
});
test('DTOs rejeitam UID/session_id inválidos, campos internos e políticas fora dos limites',()=>{
 assert.deepEqual(activitySnapshot({...state,secret:'omit'}),state);
 for(const bad of [{...state,user_id:'bad'},{...state,session_id:'bad'},{...state,idle_minutes:0},{...state,expires_at:'bad'}])assert.throws(()=>activitySnapshot(bad));
 const p={audience:'team',idle_minutes:15,revision:1,updated_at:state.server_time};
 assert.equal(accessPolicyState({can_manage:true,policies:{team:p,client:{...p,audience:'client'}},audience:'team'}).policies.team.idle_minutes,15);
 assert.throws(()=>accessPolicyState({can_manage:true,policies:{team:{...p,idle_minutes:1441}},audience:'team'}));
});
