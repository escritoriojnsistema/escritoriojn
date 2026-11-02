import test from 'node:test';import assert from 'node:assert/strict';import {createHash} from 'node:crypto';
import {execFileSync} from 'node:child_process';import {mkdtemp,writeFile,rm} from 'node:fs/promises';import {tmpdir} from 'node:os';import {join} from 'node:path';
import {renderDocumentPdfV2} from '../supabase/functions/document-artifacts/renderer-v2.ts';
import {renderDocumentPdf} from '../supabase/functions/document-artifacts/renderer.ts';
const input={title:'Contrato de imóvel rural',protocol:'DOC-TESTE',content:'João e Álvaro declaram a compra por R$ 10.000,00.\nA descrição da área será preservada.',created_at:'2026-11-01T00:00:00Z',signature_policy:'physical'};
test('22: PDF final v2 conserva todas as páginas numeradas sem folhas extras de rodapé',async()=>{
 const value={...input,content:Array.from({length:160},(_,i)=>`Cláusula ${i+1}: João e Sônia conferem as obrigações.`).join('\n')};const bytes=await renderDocumentPdfV2(value);assert.deepEqual(bytes,await renderDocumentPdfV2(value));const dir=await mkdtemp(join(tmpdir(),'jn-final22-'));try{await writeFile(join(dir,'final.pdf'),bytes);const text=execFileSync('pdftotext',['-layout',join(dir,'final.pdf'),'-'],{encoding:'utf8'}),pages=text.split('\f').filter(p=>p.trim());assert.ok(pages.length>2);for(const[i,p]of pages.entries()){assert.ok(p.includes(`${i+1}/${pages.length}`));assert.match(p,/Cópia digital/);}assert.match(text,/Cláusula 160/);}finally{await rm(dir,{recursive:true,force:true});}
});
test('PDF: bytes determinísticos, PDF real, acentos, paginação e limite',async()=>{
 const a=await renderDocumentPdf(input),b=await renderDocumentPdf(input);assert.match(Buffer.from(a).subarray(0,8).toString(),/^%PDF-1\./);assert.deepEqual(a,b);assert.equal(createHash('sha256').update(a).digest('hex').length,64);
 const many=await renderDocumentPdf({...input,content:Array(700).fill('Cláusula de pagamento e obrigações das partes.').join('\n')});assert.ok(many.length>a.length);assert.ok(many.length<3145728);
});
test('PDF: glifo ausente falha em vez de sumir e rejeita texto acima do contrato',async()=>{
 await assert.rejects(()=>renderDocumentPdf({...input,content:'Cláusula 🦄'}),/GLYPH/);
 await assert.rejects(()=>renderDocumentPdf({...input,content:'x'.repeat(50001)}),/VALIDATION/);
});
