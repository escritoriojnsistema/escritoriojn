import test from 'node:test';import assert from 'node:assert/strict';import {mkdtemp,writeFile,mkdir,readFile,symlink,rm} from 'node:fs/promises';import {tmpdir} from 'node:os';import {join} from 'node:path';import {generateKeyPairSync,createHash} from 'node:crypto';
import {packBackup36,unpackBackup36} from '../server/continuity36/bundle.ts';
test('36: encrypted backup restores database and exact object bytes, detects corruption and wrong key',async t=>{
 const root=await mkdtemp(join(tmpdir(),'jn36-test-'));t.after(()=>rm(root,{recursive:true,force:true}));const source=join(root,'source');await mkdir(join(source,'objects'),{recursive:true});
 const bytes=Buffer.from('Synthetic private file36'),hash=createHash('sha256').update(bytes).digest('hex');await writeFile(join(source,'database.dump'),'Synthetic database fixture');await writeFile(join(source,'objects',hash),bytes);
 await writeFile(join(source,'config.json'),JSON.stringify({source:'laboratory',git_commit:'a'.repeat(40),migrations:['1_fixture.sql'],provider_configuration:'separate_required'}));await writeFile(join(source,'storage.json'),JSON.stringify([{bucket:'private',object:'opaque-object',file:'objects/'+hash,sha256:hash,size_bytes:bytes.length}]));
 const keys=generateKeyPairSync('rsa',{modulusLength:3072,publicKeyEncoding:{type:'spki',format:'pem'},privateKeyEncoding:{type:'pkcs8',format:'pem'}}),archive=join(root,'copy.enc');
 const receipt=await packBackup36(source,archive,keys.publicKey);assert.equal(receipt.files,4);assert.equal((await readFile(archive)).includes(bytes),false);
 await unpackBackup36(archive,join(root,'restored'),keys.privateKey,receipt.sha256);assert.deepEqual(await readFile(join(root,'restored','objects',hash)),bytes);assert.equal(await readFile(join(root,'restored','database.dump'),'utf8'),'Synthetic database fixture');
 const tampered=await readFile(archive);tampered[tampered.length-5]^=1;await writeFile(join(root,'bad.enc'),tampered);await assert.rejects(unpackBackup36(join(root,'bad.enc'),join(root,'bad'),keys.privateKey,receipt.sha256));
 const other=generateKeyPairSync('rsa',{modulusLength:3072,privateKeyEncoding:{type:'pkcs8',format:'pem'},publicKeyEncoding:{type:'spki',format:'pem'}});await assert.rejects(unpackBackup36(archive,join(root,'other'),other.privateKey,receipt.sha256));
 await writeFile(join(source,'objects',hash),'wrong');await assert.rejects(packBackup36(source,join(root,'wrong.enc'),keys.publicKey));
});
test('36: backup refuses symlinks and secret-bearing configuration',async t=>{
 const root=await mkdtemp(join(tmpdir(),'jn36-unsafe-'));t.after(()=>rm(root,{recursive:true,force:true}));await writeFile(join(root,'database.dump'),'db');await writeFile(join(root,'storage.json'),'[]');await writeFile(join(root,'config.json'),JSON.stringify({password:'must-not-leak'}));const key=generateKeyPairSync('rsa',{modulusLength:3072,publicKeyEncoding:{type:'spki',format:'pem'},privateKeyEncoding:{type:'pkcs8',format:'pem'}}).publicKey;await assert.rejects(packBackup36(root,root+'.enc',key));await symlink('/etc/passwd',join(root,'alias'));await assert.rejects(packBackup36(root,root+'.enc',key));
});
