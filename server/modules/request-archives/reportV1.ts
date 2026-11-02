import PDFDocument from 'pdfkit';
import {existsSync} from 'node:fs';
import {resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
import {requestArchiveReportMaxBytes, type RequestArchiveReport} from '../../../shared/requestArchives.js';

// Independent renderer version 1. Never edit the historical Audit PDF renderers.
function font(name:string) {
 const adjacent=fileURLToPath(new URL(`../../assets/audit-fonts/${name}`,import.meta.url));
 const path=existsSync(adjacent)?adjacent:resolve(process.cwd(),'server/assets/audit-fonts',name);
 if(!existsSync(path))throw new Error('Report font unavailable');
 return path;
}
const when=(s:string)=>new Date(s).toISOString().replace('T',' ').replace(/\.\d{3}Z$/,' UTC');
export async function createRequestArchivePdfV1(report:RequestArchiveReport):Promise<Buffer> {
 if(report.renderer_version!==1||report.count!==report.items.length)throw new Error('Incomplete report');
 const generated=new Date(report.created_at);
 const doc=new PDFDocument({autoFirstPage:false,bufferPages:true,size:'A4',margin:44,font:font('OpenSans-Regular.ttf'),pdfVersion:'1.7',info:{Title:'Relatório de solicitações',Author:report.actor_name,Subject:report.protocol,Creator:'Escritório JN',Producer:'Escritório JN',CreationDate:generated,ModDate:generated}});
 doc.registerFont('Regular',font('OpenSans-Regular.ttf'));doc.registerFont('Bold',font('OpenSans-Semibold.ttf'));
 const chunks:Buffer[]=[];let bytes=0;
 const result=new Promise<Buffer>((accept,reject)=>{doc.on('data',(chunk:Buffer)=>{bytes+=chunk.length;if(bytes>requestArchiveReportMaxBytes){doc.destroy(new Error('REQUEST_ARCHIVES_EXPORT_LIMIT'));return;}chunks.push(chunk);});doc.once('error',reject);doc.once('end',()=>accept(Buffer.concat(chunks)));});
 function page(){doc.addPage();doc.font('Bold').fontSize(17).fillColor('#103248').text('Relatório de solicitações');doc.font('Regular').fontSize(8).fillColor('#526977').text(report.protocol).moveDown(0.5);}
 page();
 doc.fontSize(10).fillColor('#103248').text(report.office_name).text(`Emitido por: ${report.actor_name}`).text(`Gerado em: ${when(report.created_at)}`);
 doc.text(`Seleção: ${report.filters.view==='archived'?'Arquivados':'Concluídos recentes'} · ${report.filters.scope==='all'?'Todos os autorizados no escritório':'Meu acompanhamento'}`);
 doc.text(`Status: ${report.filters.status==='concluido'?'Concluído':report.filters.status==='cancelado'?'Cancelado':'Concluídos e cancelados'}`);
 doc.text(`Fechamento em UTC: ${report.filters.from?when(report.filters.from):'sem início'} até ${report.filters.until?when(report.filters.until)+' (exclusive)':'sem fim'}`);
 doc.text(`Total: ${report.count} solicitações`).moveDown();
 for(const item of report.items){
  const line=`${item.protocol} · ${item.status==='concluido'?'Concluído':'Cancelado'}\n${item.title}\nFechamento: ${when(item.closed_at)}${item.archived_at?` · Arquivo manual: ${when(item.archived_at)}`:''}`;
  doc.font('Regular').fontSize(9);const height=doc.heightOfString(line,{width:507})+16;
  if(doc.y+height>760)page();
  doc.font('Regular').fontSize(9).fillColor('#103248').text(line,{width:507}).moveDown(0.8);
 }
 if(!report.count)doc.fontSize(10).text('Nenhuma solicitação corresponde aos filtros.');
 const range=doc.bufferedPageRange();
 for(let i=0;i<range.count;i++){doc.switchToPage(i);doc.font('Regular').fontSize(8).fillColor('#526977').text(`Documento interno · Snapshot oficial · ${i+1}/${range.count}`,44,795,{width:507,lineBreak:false});}
 doc.end();return result;
}
