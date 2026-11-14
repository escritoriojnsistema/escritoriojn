import {createHash,createPublicKey,createPrivateKey,publicEncrypt,privateDecrypt,randomBytes,createCipheriv,createDecipheriv,constants} from 'node:crypto';
import {lstat,readdir,readFile,writeFile,mkdir,rename,rm} from 'node:fs/promises';
import {resolve,dirname,join} from 'node:path';
import {gzipSync,gunzipSync} from 'node:zlib';
const LIMIT=128*1024*1024;
type Entry={path:string;size_bytes:number;sha256:string};
type StorageEntry={bucket:string;object:string;file:string;size_bytes:number;sha256:string};
const digest=(b:Buffer)=>createHash('sha256').update(b).digest('hex');
function safePath(path:string){return /^(database\.dump|database\/(roles|schema|data)\.sql|config\.json|storage\.json|objects\/[a-f0-9]{64})$/.test(path);}
function validate(files:Map<string,Buffer>){
 if(!files.has('config.json')||!files.has('storage.json')||!files.has('database.dump')&&!['roles','schema','data'].every(n=>files.has(`database/${n}.sql`)))throw Error('Incomplete backup inventory');
 const config=JSON.parse(files.get('config.json')!.toString());
 if(!config||Object.keys(config).sort().join()!==['source','git_commit','migrations','provider_configuration'].sort().join()||!['laboratory','production'].includes(config.source)||!/^[a-f0-9]{40}$/.test(config.git_commit)||config.provider_configuration!=='separate_required'||!Array.isArray(config.migrations)||!config.migrations.every((p:unknown)=>typeof p==='string'&&/^[a-zA-Z0-9_-]+\.sql$/.test(p)))throw Error('Non-secret configuration contract required');
 const inventory:StorageEntry[]=JSON.parse(files.get('storage.json')!.toString());if(!Array.isArray(inventory))throw Error('Invalid Storage inventory');
 const referenced=new Set<string>(),identities=new Set<string>();
 for(const entry of inventory){
  if(!entry||Object.keys(entry).sort().join()!==['bucket','object','file','size_bytes','sha256'].sort().join()||typeof entry.bucket!=='string'||!entry.bucket||typeof entry.object!=='string'||!entry.object||typeof entry.file!=='string'||!/^objects\/[a-f0-9]{64}$/.test(entry.file)||!Number.isSafeInteger(entry.size_bytes)||entry.size_bytes<1||!/^[a-f0-9]{64}$/.test(entry.sha256))throw Error('Invalid object reference');
  const identity=JSON.stringify([entry.bucket,entry.object]);if(identities.has(identity))throw Error('Duplicate object');identities.add(identity);
  const bytes=files.get(entry.file);if(!bytes||bytes.length!==entry.size_bytes||digest(bytes)!==entry.sha256)throw Error('Object bytes/reference mismatch');referenced.add(entry.file);
 }
 if([...files.keys()].some(p=>p.startsWith('objects/')&&!referenced.has(p)))throw Error('Unreferenced object bytes');
 return {config,inventory};
}
export async function packBackup36(source:string,output:string,publicKey:string){
 const root=resolve(source),target=resolve(output);if(target===root||target.startsWith(root+'/'))throw Error('Archive must be outside staging');
 const key=createPublicKey(publicKey);if(key.asymmetricKeyType!=='rsa'||(key.asymmetricKeyDetails?.modulusLength??0)<3072)throw Error('RSA3072 public key required');
 const files=new Map<string,Buffer>();let total=0;
 async function walk(relative=''){
  for(const name of (await readdir(join(root,relative))).sort()){
   const path=relative?relative+'/'+name:name,full=join(root,path),stat=await lstat(full);if(stat.isSymbolicLink())throw Error('Symlinks forbidden');
   if(stat.isDirectory()){if(!['objects','database'].includes(path))throw Error('Unexpected directory');await walk(path);continue;}
   if(!stat.isFile()||!safePath(path)||stat.size>LIMIT||total+stat.size>LIMIT)throw Error('Invalid path or backup exceeds128MiB staging limit');
   const bytes=await readFile(full);total+=bytes.length;if(total>LIMIT)throw Error('Backup exceeds128MiB');files.set(path,bytes);
  }
 }
 await walk();const {config,inventory}=validate(files);
 const manifest:Entry[]=[...files].map(([path,bytes])=>({path,size_bytes:bytes.length,sha256:digest(bytes)}));
 const payload=gzipSync(Buffer.from(JSON.stringify({manifest,files:[...files].map(([path,bytes])=>({path,data:bytes.toString('base64')}))})));
 const secret=randomBytes(32),iv=randomBytes(12),wrapped=publicEncrypt({key,oaepHash:'sha256',padding:constants.RSA_PKCS1_OAEP_PADDING},secret);
 const header=Buffer.from(JSON.stringify({format:'jn-backup36-v1',iv:iv.toString('base64'),wrapped_key:wrapped.toString('base64')}));const length=Buffer.alloc(4);length.writeUInt32BE(header.length);
 const cipher=createCipheriv('aes-256-gcm',secret,iv);cipher.setAAD(header);const ciphertext=Buffer.concat([cipher.update(payload),cipher.final()]);secret.fill(0);
 const archive=Buffer.concat([length,header,ciphertext,cipher.getAuthTag()]);await mkdir(dirname(target),{recursive:true,mode:0o700});await writeFile(target,archive,{flag:'wx',mode:0o600});
 return {format:'jn-backup36-v1',sha256:digest(archive),files:manifest.length,objects:inventory.length,plaintext_bytes:total,encrypted_bytes:archive.length,source:config.source,completed_at:new Date().toISOString()};
}
/** Expected archive hash must be retained independently from the external ciphertext. */
export async function unpackBackup36(archivePath:string,destination:string,privateKey:string,expectedSha256:string){
 const stat=await lstat(archivePath);if(!stat.isFile()||stat.isSymbolicLink()||stat.size>2*LIMIT)throw Error('Invalid archive');
 const archive=await readFile(archivePath);if(!/^[a-f0-9]{64}$/.test(expectedSha256)||digest(archive)!==expectedSha256)throw Error('External archive hash mismatch');
 const size=archive.readUInt32BE(0);if(size<1||size>8192||archive.length<size+20)throw Error('Invalid envelope');
 const header=archive.subarray(4,4+size),h=JSON.parse(header.toString());if(h.format!=='jn-backup36-v1')throw Error('Unsupported backup version');
 const secret=privateDecrypt({key:createPrivateKey(privateKey),oaepHash:'sha256',padding:constants.RSA_PKCS1_OAEP_PADDING},Buffer.from(h.wrapped_key,'base64'));
 const decipher=createDecipheriv('aes-256-gcm',secret,Buffer.from(h.iv,'base64'));decipher.setAAD(header);decipher.setAuthTag(archive.subarray(-16));
 const data=Buffer.concat([decipher.update(archive.subarray(4+size,-16)),decipher.final()]);secret.fill(0);
 const payload=JSON.parse(gunzipSync(data,{maxOutputLength:2*LIMIT}).toString());
 if(!Array.isArray(payload.manifest)||!Array.isArray(payload.files)||payload.files.length!==payload.manifest.length)throw Error('Invalid manifest');
 const files=new Map<string,Buffer>();let total=0;
 for(const item of payload.files){if(!item||typeof item.path!=='string'||!safePath(item.path)||files.has(item.path)||typeof item.data!=='string')throw Error('Unsafe archive entry');const bytes=Buffer.from(item.data,'base64');total+=bytes.length;if(total>LIMIT)throw Error('Backup exceeds limit');files.set(item.path,bytes);}
 const seen=new Set<string>();for(const item of payload.manifest){const bytes=files.get(item.path);if(seen.has(item.path)||!bytes||bytes.length!==item.size_bytes||digest(bytes)!==item.sha256)throw Error('Manifest hash mismatch');seen.add(item.path);}
 validate(files);
 const target=resolve(destination);try{await lstat(target);throw Error('Restore destination already exists');}catch(e){if((e as NodeJS.ErrnoException).code!=='ENOENT')throw e;}
 const temporary=target+'.verified-'+randomBytes(8).toString('hex');await mkdir(temporary,{recursive:true,mode:0o700});
 try{for(const [path,bytes] of files){const full=join(temporary,path);await mkdir(dirname(full),{recursive:true,mode:0o700});await writeFile(full,bytes,{flag:'wx',mode:0o600});}await rename(temporary,target);}catch(e){await rm(temporary,{recursive:true,force:true});throw e;}
 return {files:files.size,plaintext_bytes:total,verified:true};
}
