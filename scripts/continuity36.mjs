import {readFile,writeFile} from 'node:fs/promises';
import {execFileSync} from 'node:child_process';
import {createHash} from 'node:crypto';
import {basename} from 'node:path';
import {packBackup36,unpackBackup36} from '../server/continuity36/bundle.ts';
import {validOperationsPolicy,quotaStatus} from '../shared/operations36.ts';
// Offline operator tool. It never accepts a restore database URL or invokes production SQL.
const [command,...args]=process.argv.slice(2);
try{
 if(command==='pack'){
  const [staging,output,configuration]=args;const exported=JSON.parse(await readFile(configuration,'utf8'));const policy=exported.policy??exported;
  if(!validOperationsPolicy(policy)||!policy.recipient_public_key)throw Error('Configure a chave pública de recuperação antes de empacotar.');
  const receipt=await packBackup36(staging,output,policy.recipient_public_key);await writeFile(output+'.receipt.json',JSON.stringify(receipt,null,2)+'\n',{flag:'wx',mode:0o600});console.log(JSON.stringify(receipt));
 }else if(command==='verify'){
  const [archive,destination,keyFile,expectedHash]=args;console.log(JSON.stringify(await unpackBackup36(archive,destination,await readFile(keyFile,'utf8'),expectedHash)));
 }else if(command==='upload'){
  const [archive,receiptFile,configuration,remote]=args;
  const exported=JSON.parse(await readFile(configuration,'utf8')),policy=exported.policy??exported,receipt=JSON.parse(await readFile(receiptFile,'utf8'));
  if(!validOperationsPolicy(policy)||!policy.external_folder_id||!/^[a-zA-Z0-9_-]{1,64}$/.test(remote??''))throw Error('Configure pasta e remoteDrive do executor.');
  const content=await readFile(archive),hash=createHash('sha256').update(content).digest('hex');if(hash!==receipt.sha256||receipt.format!=='jn-backup36-v1')throw Error('Arquivo/recibo divergente.');
  const target=remote+':'+basename(archive),flags=['--drive-root-folder-id',policy.external_folder_id];
  execFileSync('rclone',['copyto',archive,target,...flags],{stdio:['ignore','pipe','pipe'],timeout:300000});
  const returned=execFileSync('rclone',['cat',target,...flags],{stdio:['ignore','pipe','pipe'],timeout:300000,maxBuffer:256*1024*1024});
  if(createHash('sha256').update(returned).digest('hex')!==hash)throw Error('A cópia externa não passou na conferência de hash.');
  console.log(JSON.stringify({event:'external_copy36',sha256:hash,readback_verified:true,destination:'configured_drive_remote'}));
 }else if(command==='monitor'){
  const [configuration,measurements]=args;const exported=JSON.parse(await readFile(configuration,'utf8')),policy=exported.policy??exported;if(!validOperationsPolicy(policy))throw Error('Configuração inválida');
  const input=JSON.parse(await readFile(measurements,'utf8'));const age=Date.now()-Date.parse(input.observed_at),fresh=Number.isFinite(age)&&age>=-300000&&age<86400000&&input.period===new Date().toISOString().slice(0,7);
  const keys={database_bytes:'database_quota_bytes',storage_bytes:'storage_quota_bytes',transfer_bytes:'transfer_quota_bytes',email_count:'email_quota_count',execution_count:'execution_quota_count',cost_cents:'budget_cents'};
  const result=Object.entries(keys).map(([metric,key])=>{const value=Number.isSafeInteger(input[metric])&&input[metric]>=0?input[metric]:null;return{metric,...quotaStatus(value,policy[key],fresh&&(metric!=='cost_cents'||input.currency===policy.currency))};});
  console.log(JSON.stringify({event:'quota_check36',observed_at:input.observed_at??null,checks:result,upgrade_requested:false}));
  if(result.some(v=>['warning','critical','exceeded'].includes(v.level)))process.exitCode=2;else if(result.some(v=>v.level==='unknown'))process.exitCode=3;
 }else throw Error('Uso: node --import tsx scripts/continuity36.mjs pack <staging> <arquivo.enc> <config.json> | upload <arquivo.enc> <recibo.json> <config.json> <remote-rclone-Drive> | verify <arquivo.enc> <diretório-novo> <chave-privada.pem> <sha256> | monitor <config.json> <medicoes.json>');
}catch(error){console.error(command==='upload'?'Cópia externa não confirmada. Confira a configuração privada do rclone; nenhum upgrade foi solicitado.':error instanceof Error?error.message:'Operação indisponível');process.exitCode=1;}
