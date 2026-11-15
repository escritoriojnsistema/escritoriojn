import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,mkdir,writeFile,readFile,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {fileURLToPath} from 'node:url';
import {spawn} from 'node:child_process';

test('homologação38: falha de infraestrutura substitui evidência verde anterior por resultado atual reprovado',async()=>{
 const cwd=await mkdtemp(join(tmpdir(),'jn38-evidence-'));
 const directory=join(cwd,'docs/evidencias/etapa-38'),path=join(directory,'carga-local.json');
 try{
  await mkdir(directory,{recursive:true});await writeFile(path,JSON.stringify({passed:true,date:'old-run'}));
  const result=await new Promise<number|null>((resolve,reject)=>{
   const child=spawn(process.execPath,['--import',import.meta.resolve('tsx'),fileURLToPath(new URL('../scripts/test-load38.mjs',import.meta.url))],{cwd,env:{...process.env,PATH:join(cwd,'no-executables')},stdio:'ignore'});
   const timer=setTimeout(()=>{child.kill('SIGKILL');reject(Error('Evidence regression did not finish.'));},20000);
   child.once('error',error=>{clearTimeout(timer);reject(error);});child.once('exit',code=>{clearTimeout(timer);resolve(code);});
  });
  assert.equal(result,1);const report=JSON.parse(await readFile(path,'utf8'));
  assert.equal(report.passed,false);assert.equal(report.error,'LOAD38_FAILED');assert.notEqual(report.date,'old-run');assert.equal(report.hosted_load,false);
 }finally{await rm(cwd,{recursive:true,force:true});}
});
