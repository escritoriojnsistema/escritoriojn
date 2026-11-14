import test from 'node:test';
import assert from 'node:assert/strict';
import {createServer} from 'node:http';
import {app} from '../server/app.ts';
import {defaultOperationsPolicy,validOperationsPolicy,quotaStatus,growthEstimate} from '../shared/operations36.ts';
import {apiLogRecord36} from '../server/telemetry36.ts';
test('36: logs contain only bounded technical fields and never private path/query data',()=>{
 const log=apiLogRecord36('POST','/requests/private-customer?token=secret',503,3001.122,'server-id');assert.deepEqual(log,{event:'api_request36',request_id:'server-id',method:'POST',group:'requests',status:503,duration_ms:3001.1});assert.equal(JSON.stringify(log).includes('secret'),false);assert.equal(apiLogRecord36('PRIVATE','/customer-name',400,10,'id').group,'other');
});
test('36: pending policy is valid, private keys/secrets/unknown fields are rejected',()=>{
 assert.equal(validOperationsPolicy(defaultOperationsPolicy),true);
 for(const change of [{private_key:'secret'},{recipient_public_key:'-----BEGIN PRIVATE KEY-----\nsecret'},{budget_cents:-1},{rpo_hours:0},{daily_copies:0},{storage_quota_bytes:1.2},{currency:'BTC'}])assert.equal(validOperationsPolicy({...defaultOperationsPolicy,...change}),false);
 assert.equal(validOperationsPolicy({...defaultOperationsPolicy,responsible:'Responsável de teste',budget_cents:10000}),true);
});
test('36: missing or stale measurements never become green zero; alerts at70/85/100%',()=>{
 assert.equal(quotaStatus(null,100).level,'unknown');assert.equal(quotaStatus(0,null).level,'unknown');
 for(const [used,level] of [[0,'ok'],[69,'ok'],[70,'warning'],[85,'critical'],[100,'exceeded']] as const)assert.equal(quotaStatus(used,100).level,level);
 assert.equal(quotaStatus(20,100,false).level,'unknown');
 assert.equal(quotaStatus(1,0).level,'exceeded');assert.equal(quotaStatus(0,0).level,'ok');
 assert.deepEqual(growthEstimate(100,1024,12,2),{retained_bytes:2457600});assert.equal(growthEstimate(null,1024,12,2),null);
});
test('36: server supplies one request_id on successful and failed API responses, ignoring spoofed ID',async t=>{
 const server=createServer(app);await new Promise<void>(r=>server.listen(0,'127.0.0.1',r));t.after(()=>new Promise<void>(r=>server.close(()=>r())));const origin=`http://127.0.0.1:${(server.address() as {port:number}).port}`;
 const health=await fetch(origin+'/api/health',{headers:{'X-Request-Id':'spoofed-private-id'}});assert.equal(health.status,200);assert.match(health.headers.get('X-Request-Id')??'',/^[a-f0-9-]{36}$/);
 const missing=await fetch(origin+'/api/unknown?token=must-not-log');const body=await missing.json();assert.equal(body.error.request_id,missing.headers.get('X-Request-Id'));assert.notEqual(body.error.request_id,health.headers.get('X-Request-Id'));
});
