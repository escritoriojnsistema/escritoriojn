import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {mkdir,writeFile} from 'node:fs/promises';

// Fixed canonical origin, no cookies/Bearer or provider keys. No authenticated writes.
const origin='https://escritoriojn.vercel.app',checks=[];
const resources=[['/','text/html'],['/login','text/html'],['/area-cliente','text/html'],['/instalar','text/html'],['/configuracoes/importacao','text/html'],['/manifest.webmanifest','application/manifest+json'],['/sw.js','javascript'],['/offline.html','text/html'],['/icons/app-192.png','image/png'],['/icons/app-512.png','image/png'],['/icons/apple-touch-icon.png','image/png'],['/api/health','application/json']];
const privateRoutes=[['/api/auth/context','GET'],['/api/customers/search','POST'],['/api/requests/search','POST'],['/api/cash/payment','POST'],['/api/document-workflow/artifact','POST'],['/api/document-workflow/delivery-command','POST'],['/api/portal-documents/page','POST'],['/api/imports/preview','POST'],['/api/imports/apply','POST'],['/api/operations/state','POST']];
try{
 for(const [path,type] of resources){
  const response=await fetch(origin+path,{redirect:'error',signal:AbortSignal.timeout(30000)}),bytes=Buffer.from(await response.arrayBuffer());
  assert.equal(response.status,200,path);assert.ok(response.headers.get('content-type')?.includes(type),path+' MIME');
  const cache=response.headers.get('cache-control')??'';assert.match(cache,path.startsWith('/icons/')||path==='/offline.html'?/must-revalidate/:/no-store/,path+' cache');
  checks.push({path,status:response.status,content_type:response.headers.get('content-type'),cache_control:cache,sha256:createHash('sha256').update(bytes).digest('hex')});
 }
 for(const [path,method] of privateRoutes){
  const response=await fetch(origin+path,{method,headers:{'Content-Type':'application/json'},...(method==='POST'?{body:'{}'}:{}),redirect:'error',signal:AbortSignal.timeout(30000)});
  assert.equal(response.status,401,path);assert.match(response.headers.get('cache-control')??'',/no-store/);assert.match(response.headers.get('x-request-id')??'',/^[0-9a-f-]{36}$/);
  const body=await response.json();assert.ok(body.error);assert.ok(!('data' in body));
  checks.push({path,method,status:response.status,cache_control:response.headers.get('cache-control'),request_id_present:true});
 }
 console.log('PASS38: '+checks.length+' canonical HTTPS resources and anonymous private API barriers.');
}catch(error){console.error(error.message);process.exitCode=1;}
finally{
 await mkdir('docs/evidencias/etapa-38',{recursive:true});await writeFile('docs/evidencias/etapa-38/https-publicado.json',JSON.stringify({date:new Date().toISOString(),origin,passed:!process.exitCode,checks,hosted_private_login:false,hosted_fixtures:false},null,2)+'\n');
}
