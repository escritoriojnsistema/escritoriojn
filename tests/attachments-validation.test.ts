import test from 'node:test';
import assert from 'node:assert/strict';
import {validateAttachmentBytes} from '../supabase/functions/private-attachments/validation.ts';
import {validUploadInput,validProcessInput} from '../server/modules/attachments/validation.js';
import {attachmentCleanupPlan} from '../server/modules/attachments/dto.js';

const id='00000000-0000-4000-d000-000000000111';
const pdf=new TextEncoder().encode('%PDF-1.4\n1 0 obj\n<< /Type /Catalog >>\nendobj\n%%EOF\n');
const sha=Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',pdf)),b=>b.toString(16).padStart(2,'0')).join('');
const expected={name:'documento-ficticio.pdf',mime_type:'application/pdf',size_bytes:pdf.length,sha256:sha};
test('anexos11: validação de bytes não confunde formato com aprovação antimalware',async()=>{
 assert.deepEqual(await validateAttachmentBytes(pdf,expected),{outcome:'validated',sha256:sha,size_bytes:pdf.length,mime_type:'application/pdf'});
 for(const [bytes,metadata,reason] of [
  [pdf,{...expected,sha256:'0'.repeat(64)},'hash_mismatch'],
  [pdf,{...expected,size_bytes:pdf.length+1},'size_mismatch'],
  [pdf,{...expected,name:'documento.png',mime_type:'image/png'},'type_mismatch'],
  [new TextEncoder().encode('<html>forjado</html>'),{...expected},'size_mismatch'],
  [new TextEncoder().encode('%PDF-1.4\nsem final'),{...expected,size_bytes:18},'invalid_content'],
 ] as const){const value=await validateAttachmentBytes(bytes,metadata);assert.equal(value.outcome,'rejected');assert.equal(value.reason,reason);}
 const append=new Uint8Array([...pdf,...new TextEncoder().encode('<script>evil()</script>')]);
 assert.equal((await validateAttachmentBytes(append,{...expected,size_bytes:append.length})).reason,'invalid_content');
 assert.equal((await validateAttachmentBytes(new Uint8Array(10*1024*1024+1),{...expected,size_bytes:10*1024*1024+1})).reason,'size_mismatch');
});
test('anexos11: imagem com assinatura parcial/truncada é rejeitada',async()=>{
 const png=Uint8Array.from(Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+a9d8AAAAASUVORK5CYII=','base64'));
 const pngSha=Buffer.from(await crypto.subtle.digest('SHA-256',png)).toString('hex');
 const metadata={name:'imagem.png',mime_type:'image/png',size_bytes:png.length,sha256:pngSha};
 assert.equal((await validateAttachmentBytes(png,metadata)).outcome,'validated');
 const truncated=png.slice(0,-4);assert.equal((await validateAttachmentBytes(truncated,{...metadata,size_bytes:truncated.length})).reason,'invalid_content');
 assert.equal((await validateAttachmentBytes(Uint8Array.from([255,216,255,217]),{name:'imagem.jpg',mime_type:'image/jpeg',size_bytes:4,sha256:'0'.repeat(64)})).reason,'invalid_content');
});
test('anexos11: intenção/processo recusam campos de autoridade, URLs, nomes enganosos e limites',()=>{
 const input={request_id:id,request_item_id:null,...expected,classification:'documento',idempotency_key:id};
 assert.ok(validUploadInput(input));
 for(const change of [{size_bytes:0},{size_bytes:10*1024*1024+1},{size_bytes:1.5},{name:'../documento.pdf'},{name:'arquivo.pdf.exe'},{name:'falso\u202epdf.pdf'},{mime_type:'text/html'},{sha256:'bad'},{created_by:id},{status:'disponivel'},{object_path:id}])assert.equal(validUploadInput({...input,...change}),false,JSON.stringify(change));
 assert.ok(validProcessInput({action:'validate',args:{intent_id:id}}));
 assert.ok(validProcessInput({action:'copy',args:{source_file_id:id,target_request_id:id,target_item_id:null,idempotency_key:id}}));
 assert.equal(validProcessInput({action:'validate',args:{intent_id:id,clean:true}}),false);
 assert.equal(validProcessInput({action:'release',args:{intent_id:id}}),false);
 assert.equal(validProcessInput({action:'copy',args:{source_url:'https://evil.test',target_request_id:id,target_item_id:null,idempotency_key:id}}),false);
});
test('anexos11: plano revisável projeta objetos exatos e rejeita contagem ou estado incoerente',()=>{
 const candidate={id,name:'ficticio.pdf',status:'rejeitado',object_path:'PRIVATE',created_by:'PRIVATE'};
 const plan={id,expires_at:'2026-10-21T12:00:00Z',count:1,orphan_count:2,items:[candidate],private:'PRIVATE'};
 assert.deepEqual(attachmentCleanupPlan(plan),{id,expires_at:plan.expires_at,count:1,orphan_count:2,items:[{id,name:'ficticio.pdf',status:'rejeitado'}]});
 for(const change of [{count:2},{items:[]},{items:[candidate,candidate],count:2},{items:[{...candidate,status:'quarentena'}]},{items:[{...candidate,status:'disponivel'}]}])assert.throws(()=>attachmentCleanupPlan({...plan,...change}));
});
