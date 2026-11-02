import test from 'node:test';
import assert from 'node:assert/strict';
import {writeFile,mkdtemp,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {execFileSync} from 'node:child_process';
import {renderDocumentPreview} from '../supabase/functions/document-artifacts/preview-renderer.ts';

test('22: prévia privada determinística, acentos e RASCUNHO em todas as páginas, sem cortes',async()=>{
 const input={title:'Declaração de João e Sônia',protocol:'DOC-TESTE',content:Array.from({length:160},(_,i)=>`Cláusula ${i+1}: João, Sônia e Álvaro confirmam a descrição, condições e obrigações.`).join('\n'),created_at:'2026-11-02T12:00:00Z',revision:2};
 const a=await renderDocumentPreview(input),b=await renderDocumentPreview(input);assert.deepEqual(a,b);
 const dir=await mkdtemp(join(tmpdir(),'jn-preview22-'));
 try{await writeFile(join(dir,'preview.pdf'),a);const content=execFileSync('pdftotext',['-layout',join(dir,'preview.pdf'),'-'],{encoding:'utf8'});const pages=content.split('\f').filter(p=>p.trim());assert.ok(pages.length>2);for(const [i,p] of pages.entries()){assert.match(p,/RASCUNHO/);assert.match(p,/Revisão 2/);assert.ok(p.includes(`${i+1}/${pages.length}`));}assert.match(content,/João, Sônia e Álvaro/);assert.match(content,/Cláusula 160/);}finally{await rm(dir,{recursive:true,force:true});}
});
