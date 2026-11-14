import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import vm from 'node:vm';

async function worker(network: (request: unknown) => Promise<Response> = async () => new Response('online')) {
 const listeners = new Map<string,(event:any)=>void>();
 const entries = new Map<string,Response>();
 const removed:string[]=[];
 const calls:unknown[]=[];
 const context={URL,Request,Response,Promise,Set,fetch:async(request:unknown)=>{calls.push(request);return network(request);},
  caches:{open:async()=>({put:async(key:string,response:Response)=>{entries.set(key,response);},match:async(key:string)=>entries.get(key)?.clone()}),keys:async()=>['jn-public-35-old','other-app'],delete:async(key:string)=>{removed.push(key);return true;}},
  self:{location:{origin:'https://jn.test'},addEventListener:(name:string,fn:(event:any)=>void)=>listeners.set(name,fn),skipWaiting:()=>assert.fail('must not force activation'),clients:{claim:()=>assert.fail('must not claim live clients')}}};
 vm.runInNewContext(await readFile('public/sw.js','utf8'),context);
 async function lifecycle(name:string){let done:Promise<unknown>|undefined;listeners.get(name)?.({waitUntil:(p:Promise<unknown>)=>{done=p;}});await done;}
 function request(path:string,mode='cors',method='GET') {let response:Promise<Response>|undefined;listeners.get('fetch')?.({request:{url:`https://jn.test${path}`,mode,method},respondWith:(p:Promise<Response>)=>{response=p;}});return response;}
 return {entries,removed,calls,lifecycle,request};
}
test('35: cache stores only public offline guidance and icons; activation never claims an open app',async()=>{
 const w=await worker();await w.lifecycle('install');
 assert.deepEqual([...w.entries.keys()].sort(),['/offline.html','/icons/app-192.png','/icons/app-512.png','/icons/apple-touch-icon.png'].sort());
 await w.lifecycle('activate');assert.deepEqual(w.removed,['jn-public-35-old']);
});
test('35: API, tokens, PDF, assets and writes bypass the worker, including document navigations',async()=>{
 const w=await worker();
 for(const path of ['/api/account/read','/api/report.pdf','/assets/main.js','/auth/callback?code=secret','/private/file.pdf','/storage/v1/object/private/x','/offline.html?token=secret'])assert.equal(w.request(path),undefined,path);
 for(const path of ['/api/report','/api','/auth/callback?code=secret','/private/file.pdf'])assert.equal(w.request(path,'navigate'),undefined,path);
 assert.equal(w.request('/caixa','navigate','POST'),undefined);assert.equal(w.calls.length,0);
});
test('35: offline private route returns only public guidance, never a previously fetched private response',async()=>{
 let online=true;const w=await worker(async(request)=>{if(!online)throw new TypeError('offline');return new Response(typeof request==='object'&&(request as {url:string}).url.endsWith('/clientes')?'private account A':'public shell');});
 await w.lifecycle('install');assert.equal(await (await w.request('/clientes','navigate'))?.text(),'private account A');
 online=false;assert.equal(await (await w.request('/clientes','navigate'))?.text(),'public shell');
 assert.equal(w.entries.size,4);
});
test('35: HTTP errors are not disguised as offline or persisted',async()=>{
 const w=await worker(async()=>new Response('unavailable',{status:503}));
 await assert.rejects(w.lifecycle('install'));
 assert.equal(w.entries.size,0);assert.equal((await w.request('/caixa','navigate'))?.status,503);
});
test('35: manifest has stable public identity, standalone scope and valid raster sizes',async()=>{
 const manifest=JSON.parse(await readFile('public/manifest.webmanifest','utf8'));
 assert.equal(manifest.id,'/');assert.equal(manifest.start_url,'/');assert.equal(manifest.scope,'/');assert.equal(manifest.display,'standalone');assert.equal(manifest.name,'Escritório JN');
 for(const size of [192,512]){const item=manifest.icons.find((i:any)=>i.sizes===`${size}x${size}`);assert.ok(item);const bytes=await readFile(`public${item.src}`);assert.equal(bytes.subarray(1,4).toString(),'PNG');assert.equal(bytes.readUInt32BE(16),size);assert.equal(bytes.readUInt32BE(20),size);}
});
