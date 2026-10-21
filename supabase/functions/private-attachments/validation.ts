/** Structural byte checks only; successful validation NEVER means malware-free. */
const maxBytes=10*1024*1024;
export type ByteMetadata={name:string;mime_type:string;size_bytes:number;sha256:string};
export type ByteResult={outcome:'validated'|'rejected';sha256?:string;size_bytes:number;mime_type?:string|null;reason?:'hash_mismatch'|'type_mismatch'|'size_mismatch'|'invalid_content'};
const ascii=(bytes:Uint8Array)=>new TextDecoder('ascii').decode(bytes);
function pngValid(b:Uint8Array){
 if(b.length<57)return false;let offset=8,header=false,data=false;
 while(offset+12<=b.length){
  const length=new DataView(b.buffer,b.byteOffset+offset,4).getUint32(0);if(length>maxBytes||offset+12+length>b.length)return false;
  const kind=ascii(b.slice(offset+4,offset+8));if(!/^[A-Za-z]{4}$/.test(kind))return false;
  if(!header){if(kind!=='IHDR'||length!==13)return false;const view=new DataView(b.buffer,b.byteOffset+offset+8,13);if(!view.getUint32(0)||!view.getUint32(4))return false;header=true;}
  else if(kind==='IHDR')return false;
  if(kind==='IDAT')data=true;
  if(kind==='IEND')return length===0&&data&&offset+12===b.length;
  offset+=length+12;
 }
 return false;
}
function jpegValid(b:Uint8Array){
 if(b.length<20||b[0]!==255||b[1]!==216||b.at(-2)!==255||b.at(-1)!==217)return false;
 let pos=2,frame=false;
 while(pos<b.length-2){
  if(b[pos++]!==255)return false;while(b[pos]===255)pos++;const marker=b[pos++];
  if(marker===0||marker===216||marker===217||marker===undefined)return false;
  if(marker===1||(marker>=208&&marker<=215))continue;
  if(pos+2>b.length)return false;const length=(b[pos]<<8)|b[pos+1];if(length<2||pos+length>b.length-2)return false;
  if([192,193,194,195,197,198,199,201,202,203,205,206,207].includes(marker)){if(length<8||!(b[pos+3]|b[pos+4])||!(b[pos+5]|b[pos+6]))return false;frame=true;}
  if(marker===218)return frame&&length>=6&&pos+length<b.length-2;
  pos+=length;
 }
 return false;
}
function detectedMime(b:Uint8Array):string|null{
 if(b.length>=8&&ascii(b.slice(0,5))==='%PDF-')return 'application/pdf';
 if(b.length>=8&&[137,80,78,71,13,10,26,10].every((n,i)=>b[i]===n))return 'image/png';
 if(b.length>=3&&b[0]===255&&b[1]===216&&b[2]===255)return 'image/jpeg';
 return null;
}
export async function validateAttachmentBytes(bytes:Uint8Array,expected:ByteMetadata):Promise<ByteResult>{
 const base={size_bytes:bytes.length};
 if(bytes.length<1||bytes.length>maxBytes||bytes.length!==expected.size_bytes)return {...base,outcome:'rejected',reason:'size_mismatch'};
 const mime_type=detectedMime(bytes),extension=expected.name.split('.').at(-1)?.toLowerCase();
 if(!mime_type||mime_type!==expected.mime_type||!(mime_type==='application/pdf'?extension==='pdf':mime_type==='image/png'?extension==='png':['jpg','jpeg'].includes(extension??'')))return {...base,outcome:'rejected',mime_type,reason:'type_mismatch'};
 const valid=mime_type==='application/pdf'?/^%PDF-\d\.\d(?:\r?\n|\r)/.test(ascii(bytes.slice(0,16)))&&/%%EOF[\t\n\r ]*$/.test(ascii(bytes.slice(-1024))):mime_type==='image/png'?pngValid(bytes):jpegValid(bytes);
 if(!valid)return {...base,outcome:'rejected',mime_type,reason:'invalid_content'};
 const sha256=Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',Uint8Array.from(bytes))),b=>b.toString(16).padStart(2,'0')).join('');
 if(sha256!==expected.sha256)return {...base,outcome:'rejected',mime_type,sha256,reason:'hash_mismatch'};
 return {...base,outcome:'validated',mime_type,sha256};
}
