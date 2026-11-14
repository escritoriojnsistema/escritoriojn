import assert from 'node:assert/strict';
import {execFileSync} from 'node:child_process';
import test from 'node:test';

// A fresh process avoids PDF tests in other files warming the module cache.
// Reintroducing an eager export-engine import would make ordinary Auth/API
// startup pay for PDFKit/fontkit again and fail this contract.
test('API comum inicia sem carregar motores PDF antes de uma exportação',()=>{
 const result=execFileSync(process.execPath,['--import','tsx','--input-type=module','-e',`
  import Module from 'node:module';
  const {app}=await import('./server/app.ts');
  const server=app.listen(0,'127.0.0.1');
  await new Promise(resolve=>server.once('listening',resolve));
  const origin='http://127.0.0.1:'+server.address().port;
  const health=await fetch(origin+'/api/health');await health.text();
  const context=await fetch(origin+'/api/auth/context');await context.text();
  const pdfModules=Object.keys(Module._cache).filter(path=>/\\/(pdfkit|fontkit)\\//.test(path)).map(path=>path.split('/node_modules/').pop());
  server.closeAllConnections();server.close();
  console.log(JSON.stringify({health:health.status,context:context.status,pdfModules}));
 `],{encoding:'utf8',timeout:20000});
 // API diagnostics now emit bounded JSON records as well as this probe result.
 const data=result.trim().split('\n').map(line=>JSON.parse(line)).find(value=>Array.isArray(value.pdfModules));
 assert.ok(data,'O processo novo deve produzir o resultado do diagnóstico PDF.');
 assert.equal(data.health,200);assert.equal(data.context,401);
 assert.deepEqual(data.pdfModules,[],'Auth/health não devem carregar PDFKit/fontkit antes de uma exportação');
});
