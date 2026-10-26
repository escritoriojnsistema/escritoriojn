import {existsSync} from 'node:fs';
import {resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
import PDFDocument from 'pdfkit';
import type {ReportRow,ReportSnapshot} from '../../../shared/finance19.js';
import {reportCriteria,reportKindNames,reportMoney,reportSummaryKeys,reportSummaryNames,reportViewNames} from '../../../shared/finance19.js';
import {reportRow,reportSnapshot} from './dto.js';
export const financialExportMaxBytes=3*1024*1024;
export class FinancialExportLimit extends Error{}
export function csvCell(value:string):string{const safe=/^[\s\uFEFF]*[=+\-@]/u.test(value)||/^[ \u00a0]*[\t\r\n]/.test(value)?"'"+value:value;return '"'+safe.replaceAll('"','""')+'"';}
// Only validated integer cents can create trusted numeric CSV cells.
type MonetaryCell={readonly kind:'money';readonly decimal:string};
function monetaryCell(cents:number|null):MonetaryCell|string{
 if(cents===null)return 'Não informado';if(!Number.isSafeInteger(cents))throw Error('Unsafe financial value');
 const value=BigInt(cents),absolute=value<0n?-value:value;
 return {kind:'money',decimal:(value<0n?'-':'')+String(absolute/100n)+','+String(absolute%100n).padStart(2,'0')};
}
function csvValue(cell:string|MonetaryCell):string{return typeof cell==='string'?csvCell(cell):'"'+cell.decimal+'"';}
function source(snapshot:ReportSnapshot,rows:ReportRow[]){const report=reportSnapshot(snapshot),items=rows.map(reportRow);if(items.length!==report.total||new Set(items.map(r=>r.kind+':'+r.id)).size!==items.length||items.some(r=>report.filters.view==='obligations'?r.kind!=='obligation':report.filters.view==='cash'?r.kind!=='cash':['obligation','cash'].includes(r.kind)))throw Error('Incomplete financial snapshot');
 const totals=Object.fromEntries(reportSummaryKeys.map(k=>[k,null])) as Record<string,number|null>;totals.unknown_fee_count=0;
 const sum=(selected:ReportRow[],field:'amount_cents'|'paid_cents'|'balance_cents'|'expected_cents'|'counted_cents')=>{const n=selected.reduce((value,row)=>value+BigInt(row[field]??0),0n);if(n>BigInt(Number.MAX_SAFE_INTEGER)||n<BigInt(-Number.MAX_SAFE_INTEGER))throw Error('Unsafe financial total');return Number(n);};
 if(report.filters.view==='obligations'){totals.contracted_cents=sum(items,'amount_cents');totals.allocated_cents=sum(items,'paid_cents');totals.balance_cents=sum(items,'balance_cents');}
 else if(report.filters.view==='movements'){for(const [metric,kind] of [['received_cents','received'],['expense_cents','expense'],['reversed_cents','reversal'],['refund_cents','refund']] as const)totals[metric]=sum(items.filter(r=>r.kind===kind),'amount_cents');const fees=items.filter(r=>r.kind==='fee');totals.unknown_fee_count=fees.filter(r=>r.amount_cents===null).length;totals.fee_cents=report.filters.service_id||report.filters.customer_id||totals.unknown_fee_count?null:sum(fees,'amount_cents');}
 else {totals.cash_expected_cents=sum(items,'expected_cents');totals.cash_counted_cents=items.some(r=>r.counted_cents===null)?null:sum(items,'counted_cents');totals.divergence_count=items.filter(r=>r.difference_cents!==null&&r.difference_cents!==0).length;}
 if(reportSummaryKeys.some(k=>report.summary[k]!==totals[k]))throw Error('Financial totals mismatch');return {report,items};}
const statuses:Record<string,string>={open:'Aberto',paid:'Pago',cancelled:'Cancelado',zero:'Sem cobrança',confirmed:'Confirmado',closed:'Fechado'};
function summaryValue(key:string,value:number|null){return key.endsWith('_cents')?reportMoney(value):value===null?'Não informado':String(value);}
function metadata(r:ReportSnapshot):[string,string][]{return [['Protocolo',r.protocol],['Escritório',r.office_name],['Emitido por',r.operator_name],['Gerado em UTC',r.created_at],['Visão',reportViewNames[r.filters.view]],['Critério',reportCriteria[r.filters.view]],['Fuso do escritório',r.timezone],['Início inclusivo',r.filters.from_date],['Fim exclusivo',r.filters.until_date],['Limites UTC',`${r.from_utc} até ${r.until_utc}`],['Escopo',r.filters.scope==='own'?'Própria autoria':'Consolidação autorizada'],['Filtros',JSON.stringify(r.filters)],['Registros',String(r.total)]];}
const rowCells=(r:ReportRow):string[]=>[reportKindNames[r.kind],r.occurred_at,r.reference,r.description,r.operator_name,r.unit_name??'Não se aplica',r.method_name??'Não se aplica',r.account_name??'Não se aplica',r.customer_label??'Não se aplica',statuses[r.status]??r.status,reportMoney(r.amount_cents),reportMoney(r.paid_cents),reportMoney(r.balance_cents),reportMoney(r.expected_cents),reportMoney(r.counted_cents),reportMoney(r.difference_cents)];
const headers=['Tipo','Data UTC','Referência','Descrição','Operador','Unidade','Meio','Conta','Cliente','Situação','Valor BRL','Pago BRL','Saldo BRL','Esperado BRL','Contado BRL','Diferença BRL'];
export function financialCsv(snapshot:ReportSnapshot,rows:ReportRow[]):Buffer{
 const {report,items}=source(snapshot,rows),lines:(string|MonetaryCell)[][]=[...metadata(report),...reportSummaryKeys.map(k=>[reportSummaryNames[k],k.endsWith('_cents')?monetaryCell(report.summary[k]):summaryValue(k,report.summary[k])]),[],headers,...items.map(row=>[...rowCells(row).slice(0,10),...[row.amount_cents,row.paid_cents,row.balance_cents,row.expected_cents,row.counted_cents,row.difference_cents].map(monetaryCell)])];
 const output=Buffer.from('\uFEFF'+lines.map(row=>row.map(csvValue).join(';')).join('\r\n')+'\r\n','utf8');if(output.length>financialExportMaxBytes)throw new FinancialExportLimit('Export exceeds limit');return output;
}
function font(name:string){const adjacent=fileURLToPath(new URL(`../../assets/audit-fonts/${name}`,import.meta.url));if(existsSync(adjacent))return adjacent;const packaged=resolve(process.cwd(),'server/assets/audit-fonts',name);if(existsSync(packaged))return packaged;throw Error('Financial font unavailable');}
// Unsupported glyphs remain explicit Unicode references; PDF never silently drops content.
function printable(v:string){return v.replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/g,' ').replace(/[^\u0009\u000a\u000d\u0020-\u024f]/gu,c=>`[U+${c.codePointAt(0)!.toString(16).toUpperCase()}]`);}
export async function financialPdf(snapshot:ReportSnapshot,rows:ReportRow[]):Promise<Buffer>{
 const {report,items}=source(snapshot,rows);
 const doc=new PDFDocument({size:'A4',margins:{top:80,bottom:50,left:44,right:44},autoFirstPage:false,compress:true,info:{Title:'Relatório financeiro - Escritório JN',Author:printable(report.office_name),Subject:report.protocol,CreationDate:new Date(report.created_at),ModDate:new Date(report.created_at)}});
 doc.registerFont('regular',font('OpenSans-Regular.ttf'));doc.registerFont('bold',font('OpenSans-Semibold.ttf'));
 const output:Buffer[]=[];let bytes=0,page=0;
 const result=new Promise<Buffer>((resolveResult,reject)=>{doc.on('data',(chunk:Buffer)=>{bytes+=chunk.length;if(bytes>financialExportMaxBytes){doc.destroy(new FinancialExportLimit('Export exceeds limit'));return;}output.push(chunk);});doc.on('error',reject);doc.on('end',()=>resolveResult(Buffer.concat(output)));});
 result.catch(()=>{});
 doc.on('pageAdded',()=>{page++;doc.font('bold').fontSize(10).fillColor('#103248').text('ESCRITÓRIO JN | RELATÓRIO FINANCEIRO',44,30,{width:507,lineBreak:false});doc.font('regular').fontSize(8).fillColor('#5c7180').text(printable(report.protocol),44,48,{width:507,lineBreak:false});const bottom=doc.page.margins.bottom;doc.page.margins.bottom=0;doc.text(`Página ${page}`,44,doc.page.height-32,{width:507,align:'right',lineBreak:false});doc.page.margins.bottom=bottom;doc.y=80;});
 doc.addPage();doc.font('bold').fontSize(15).fillColor('#103248').text(printable(reportViewNames[report.filters.view]));doc.moveDown(.5);
 const field=(name:string,value:string)=>{doc.font('bold').fontSize(9).fillColor('#103248').text(printable(name+': '),{continued:true});doc.font('regular').fillColor('#243f50').text(printable(value),{width:507});};
 for(const [label,value] of metadata(report))field(label,value);
 doc.moveDown(.5);doc.font('bold').fontSize(12).text('Totais');
 for(const key of reportSummaryKeys){if(report.summary[key]!==null||key==='fee_cents'&&report.filters.view==='movements')field(reportSummaryNames[key],summaryValue(key,report.summary[key]));}
 doc.moveDown(.6);doc.font('bold').fontSize(12).text('Registros');
 if(!items.length)doc.font('regular').fontSize(10).text('Nenhum registro para os filtros selecionados.');
 for(const row of items){if(doc.y>doc.page.height-140)doc.addPage();doc.moveDown(.6);const values=rowCells(row);for(let i=0;i<headers.length;i++){if(i>=10&&[row.amount_cents,row.paid_cents,row.balance_cents,row.expected_cents,row.counted_cents,row.difference_cents][i-10]===null)continue;field(headers[i],values[i]);}doc.moveDown(.3);const y=doc.y;doc.strokeColor('#dce4e8').lineWidth(.5).moveTo(44,y).lineTo(551,y).stroke();}
 doc.end();return result;
}
