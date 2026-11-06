import test from 'node:test';
import assert from 'node:assert/strict';
import {validClosure,closureNotice} from '../shared/accountClosure.js';
import {zipDocuments} from '../server/modules/account-closure/zip.js';
test('encerramento exige um motivo, ciência e oferta de exportação sem autoridade arbitrária',()=>{
 const v={reason:'privacy',observation:'',acknowledged:true,export_offered:true};
 assert.equal(validClosure(v),true);
 for(const bad of [{...v,reason:['privacy','other']},{...v,reason:''},{...v,acknowledged:false},{...v,export_offered:false},{...v,user_id:'arbitrary'},{...v,observation:'x'.repeat(1001)}])assert.equal(validClosure(bad),false);
 assert.match(closureNotice,/não estabelece um prazo universal/);
 assert.match(closureNotice,/confirmação de identidade e titularidade/);
 assert.match(closureNotice,/sem cobrança adicional por documentos já pagos/);
});
test('ZIP guarda todos os bytes com nomes seguros e diretório central',()=>{
 const pdf=Buffer.from('%PDF-1.7\nfixture');const zip=zipDocuments([pdf,pdf]);
 assert.equal(zip.readUInt32LE(0),0x04034b50);
 assert.ok(zip.includes(pdf));assert.ok(zip.includes(Buffer.from('documento-2.pdf')));
 assert.equal(zip.readUInt32LE(zip.length-22),0x06054b50);assert.equal(zip.readUInt16LE(zip.length-12),2);
 assert.throws(()=>zipDocuments([]));
});
test('ZIP pode ser lido por ferramenta independente sem alterar assinatura/bytes',async()=>{
 const {mkdtemp,writeFile,rm}=await import('node:fs/promises');const {tmpdir}=await import('node:os');const{join}=await import('node:path');const{execFileSync}=await import('node:child_process');
 const dir=await mkdtemp(join(tmpdir(),'jn-closure-'));try{const pdf=Buffer.from('%PDF-1.7\nSigned fixture\n'),path=join(dir,'documents.zip');await writeFile(path,zipDocuments([pdf,pdf]));const output=execFileSync('python3',['-c',"import zipfile,sys;z=zipfile.ZipFile(sys.argv[1]);assert len(z.namelist())==2;assert z.testzip() is None;sys.stdout.buffer.write(z.read('documento-2.pdf'))",path]);assert.deepEqual(output,pdf);}finally{await rm(dir,{recursive:true,force:true});}
});
