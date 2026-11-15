import {spawn} from 'node:child_process';
import {setTimeout as delay} from 'node:timers/promises';

// Presentation only; intercepted providers are never evidence of real API/RLS/Storage.
const env={...process.env,VITE_SUPABASE_URL:'https://team-ui.supabase.co',VITE_SUPABASE_PUBLISHABLE_KEY:'sb_publishable_ui_contract_fixture',TEAM_UI_CONTRACT:'1',E2E_BASE_URL:'http://127.0.0.1:3018'};
const files=['team','grouped-navigation','portal-isolation','document-integrated','document-release','document-signatures','document-deliveries','editorial-review','payments','portal32','imports37','loading','reading34'].map(name=>`tests/browser/${name}-contract.spec.ts`);
const children=new Set();
const start=(args,stdio)=>{const child=spawn(process.execPath,args,{env,stdio,detached:process.platform!=='win32'});children.add(child);child.once('exit',()=>children.delete(child));return child;};
const stop=()=>{for(const child of children)try{process.platform==='win32'?child.kill('SIGTERM'):process.kill(-child.pid,'SIGTERM');}catch{/* Already closed. */}};
for(const signal of ['SIGINT','SIGTERM'])process.once(signal,()=>{stop();process.exit(1);});
try{
 const server=start(['node_modules/vite/bin/vite.js','--host','127.0.0.1','--port','3018','--strictPort'],'ignore');
 const deadline=Date.now()+20000;
 while(true){
  if(server.exitCode!==null)throw Error('Local UI38 frontend exited before becoming ready.');
  try{if((await fetch(env.E2E_BASE_URL+'/api/health',{signal:AbortSignal.timeout(1000)})).ok)break;}catch{/* Starting. */}
  if(Date.now()>deadline)throw Error('Local UI38 frontend did not become ready.');await delay(200);
 }
 // One worker: deterministic geometry/timing on the two-CPU laboratory.
 const child=start(['node_modules/@playwright/test/cli.js','test',...files,'--workers=1','--output','test-results/homologation38',...process.argv.slice(2)],'inherit');
 const code=await new Promise((resolve,reject)=>{child.once('error',reject);child.once('exit',resolve);});
 if(code!==0)process.exitCode=1;
}catch(error){console.error(error.message);process.exitCode=1;}finally{stop();}
