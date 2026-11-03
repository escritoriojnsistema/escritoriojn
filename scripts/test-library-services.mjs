import {spawn} from 'node:child_process';
import {randomBytes,randomUUID} from 'node:crypto';
import {setTimeout as delay} from 'node:timers/promises';
import {createClient} from '@supabase/supabase-js';
import {createAuthLab} from '../tests/auth/lab.mjs';
// Real local GoTrue/PostgREST/PostgreSQL. Storage schema only: no file operation.
let lab,server;
try{
 lab=await createAuthLab({storage:false});await lab.migrate();
 const admin=createClient(lab.url,lab.serviceRoleKey,{auth:{persistSession:false,autoRefreshToken:false}}),password=`Local-${randomBytes(24).toString('hex')}!`,users={};
 for(const name of ['manager','portalclient']){const {data,error}=await admin.auth.admin.createUser({email:`${name}@example.test`,password,email_confirm:true});if(error||!data.user)throw Error('Local Auth fixture failed');users[name]=data.user.id;}
 const office=(await lab.sql(`SELECT private.provision_owner('${users.manager}','Escritório local de regressão','${randomUUID()}');`,'migrator')).trim();
 await lab.sql(`INSERT INTO public.profiles(id,display_name) VALUES('${users.portalclient}','Cliente fictício');INSERT INTO public.memberships(office_id,user_id,role_code) VALUES('${office}','${users.portalclient}','client');`,'migrator');
 const env={...process.env,VITE_SUPABASE_URL:lab.url,VITE_SUPABASE_PUBLISHABLE_KEY:lab.anonKey,AUTH_LAB_URL:lab.url,AUTH_LAB_PASSWORD:password,AUTH_LAB_OFFICE:office,AUTH_LAB_DB_CONTAINER:lab.databaseContainer};
 server=spawn('node',['node_modules/vite/bin/vite.js','--host','127.0.0.1','--port','3005','--strictPort'],{env,stdio:'ignore'});
 const deadline=Date.now()+20000;
 while(true){try{if((await fetch('http://127.0.0.1:3005/api/health')).ok)break;}catch{}if(Date.now()>deadline||server.exitCode!==null)throw Error('Local API did not start');await delay(200);}
 const code=await new Promise((resolve,reject)=>{const child=spawn('node',['node_modules/@playwright/test/cli.js','test','--config','playwright.auth.config.ts','tests/auth/library-services-repair.spec.ts'],{env,stdio:'inherit'});child.on('error',reject);child.on('exit',resolve);});
 if(code!==0)process.exitCode=1;
}catch(error){console.error(error.message);process.exitCode=1;}finally{server?.kill('SIGTERM');await lab?.close();}
