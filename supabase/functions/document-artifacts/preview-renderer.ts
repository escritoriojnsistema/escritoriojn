import PDFDocument from 'pdfkit';
import {Buffer} from 'node:buffer';
import {documentFontBase64} from './font.ts';
export type PreviewSnapshot={title:string;protocol:string;content:string;created_at:string;revision:number};
/** Internal preview v1. Separate from the published final renderer. */
export async function renderDocumentPreview(input:PreviewSnapshot):Promise<Uint8Array>{
 if(!input.title.trim()||Array.from(input.title).length>120||!input.protocol||input.protocol.length>120||!input.content.trim()||Array.from(input.content).length>50000||!Number.isFinite(Date.parse(input.created_at))||!Number.isSafeInteger(input.revision)||input.revision<1)throw Error('DOCUMENT_PDF_VALIDATION');
 const date=new Date(input.created_at);
 const doc=new PDFDocument({font:'',size:'A4',margins:{top:62,bottom:60,left:54,right:54},bufferPages:true,compress:true,info:{Title:input.title,Author:'Escritório JN',Creator:'jn-preview-v1',Producer:'jn-preview-v1',CreationDate:date,ModDate:date}});
 const chunks:Buffer[]=[];let total=0;
 const result=new Promise<Uint8Array>((resolve,reject)=>{doc.on('data',(part:Buffer)=>{total+=part.length;if(total>3145728){doc.destroy();reject(Error('DOCUMENT_PDF_SIZE'));}else chunks.push(part);});doc.on('error',reject);doc.on('end',()=>resolve(new Uint8Array(Buffer.concat(chunks))));});
 // Register immediately: every error path is consumed even before end().
 result.catch(()=>{});
 try{
 doc.registerFont('DocumentBody',Buffer.from(documentFontBase64,'base64'));doc.font('DocumentBody');
 const font=(doc as unknown as {_font:{font:{hasGlyphForCodePoint:(cp:number)=>boolean}}})._font.font;
 for(const char of input.title+' '+input.protocol+' '+input.content){const cp=char.codePointAt(0)!;if(char!=='\n'&&char!=='\r'&&char!=='\t'&&!font.hasGlyphForCodePoint(cp))throw Error('DOCUMENT_PDF_GLYPH');}
 doc.fontSize(15).fillColor('#103248').text(input.title,{align:'center'}).moveDown(1);
 doc.fontSize(11).fillColor('#161616').text(input.content,{align:'left',lineGap:4,paragraphGap:7});
 const range=doc.bufferedPageRange();if(range.count>100)throw Error('DOCUMENT_PDF_SIZE');
 for(let n=0;n<range.count;n++){
 doc.switchToPage(n);doc.page.margins.bottom=0;doc.font('DocumentBody').fontSize(8).fillColor('#536675');
 doc.text('Escritório JN · '+input.protocol,54,28,{lineBreak:false,width:487});
 doc.text(`${n+1}/${range.count}`,54,805,{lineBreak:false,width:487,align:'right'});
 doc.text(`RASCUNHO · Prévia interna · Revisão ${input.revision} · Sem validade para entrega`,54,780,{width:487,lineBreak:false});
 }
 doc.end();return await result;
 }catch(e){doc.destroy();throw e;}
}
