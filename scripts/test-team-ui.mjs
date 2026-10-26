import { spawn } from 'node:child_process';
import { setTimeout as delay } from 'node:timers/promises';

// Presentation contracts only. All provider and business requests are intercepted
// by the spec; these are fictitious public SDK settings, never hosted credentials.
const env={...process.env,VITE_SUPABASE_URL:'https://team-ui.supabase.co',
  VITE_SUPABASE_PUBLISHABLE_KEY:'sb_publishable_ui_contract_fixture',TEAM_UI_CONTRACT:'1',E2E_BASE_URL:'http://127.0.0.1:3015'};
const children=new Set();
try {
  const server=spawn('node',['node_modules/vite/bin/vite.js','--host','127.0.0.1','--port','3015','--strictPort'],{env,stdio:'ignore'});
  children.add(server);server.on('exit',()=>children.delete(server));
  const deadline=Date.now()+20000;
  while(true) {
    if(server.exitCode!==null)throw new Error('UI contract frontend could not start.');
    try {if((await fetch(`${env.E2E_BASE_URL}/api/health`,{signal:AbortSignal.timeout(1000)})).ok)break;} catch { /* starting */ }
    if(Date.now()>deadline)throw new Error('UI contract frontend did not become ready.');
    await delay(200);
  }
  const code=await new Promise((resolve,reject)=>{
    const child=spawn('node',['node_modules/@playwright/test/cli.js','test','tests/browser/account-contract.spec.ts','tests/browser/adjustments-contract.spec.ts','tests/browser/team-contract.spec.ts','tests/browser/governance-contract.spec.ts','tests/browser/customers-contract.spec.ts','tests/browser/customer-relations-contract.spec.ts','tests/browser/identifiers-contract.spec.ts','tests/browser/loading-contract.spec.ts','tests/browser/services-contract.spec.ts','tests/browser/requests-contract.spec.ts','tests/browser/attachments-contract.spec.ts','tests/browser/checklists-contract.spec.ts','tests/browser/charges-contract.spec.ts','tests/browser/cash-contract.spec.ts','tests/browser/finance-contract.spec.ts','tests/browser/payments-contract.spec.ts','tests/browser/expenses-contract.spec.ts','tests/browser/closures-contract.spec.ts','tests/browser/finance19-contract.spec.ts','tests/browser/templates-contract.spec.ts','tests/browser/corrections-contract.spec.ts','--output','test-results/team-ui',...process.argv.slice(2)],{env,stdio:'inherit'});
    children.add(child);child.on('error',reject);child.on('exit',code=>{children.delete(child);resolve(code);});
  });
  if(code!==0)process.exitCode=1;
} catch(error) {console.error(error.message);process.exitCode=1;}
finally {for(const child of children)child.kill('SIGTERM');}
