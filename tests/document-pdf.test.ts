import test from 'node:test';import assert from 'node:assert/strict';import {createHash} from 'node:crypto';
import {renderDocumentPdf} from '../supabase/functions/document-artifacts/renderer.ts';
const input={title:'Contrato de imóvel rural',protocol:'DOC-TESTE',content:'João e Álvaro declaram a compra por R$ 10.000,00.\nA descrição da área será preservada.',created_at:'2026-11-01T00:00:00Z',signature_policy:'physical'};
test('PDF: bytes determinísticos, PDF real, acentos, paginação e limite',async()=>{
 const a=await renderDocumentPdf(input),b=await renderDocumentPdf(input);assert.match(Buffer.from(a).subarray(0,8).toString(),/^%PDF-1\./);assert.deepEqual(a,b);assert.equal(createHash('sha256').update(a).digest('hex').length,64);
 const many=await renderDocumentPdf({...input,content:Array(700).fill('Cláusula de pagamento e obrigações das partes.').join('\n')});assert.ok(many.length>a.length);assert.ok(many.length<3145728);
});
test('PDF: glifo ausente falha em vez de sumir e rejeita texto acima do contrato',async()=>{
 await assert.rejects(()=>renderDocumentPdf({...input,content:'Cláusula 🦄'}),/GLYPH/);
 await assert.rejects(()=>renderDocumentPdf({...input,content:'x'.repeat(50001)}),/VALIDATION/);
});
