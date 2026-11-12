import {useEffect,useState} from 'react';
import {ReadAloud} from './ReadAloud';

export function PdfReading({bytes,scope,pdfUrl,title}:{bytes:Blob;scope:string;pdfUrl?:string;title?:string}){
 const [result,setResult]=useState<{bytes:Blob;text:string}>(),[error,setError]=useState(''),[open,setOpen]=useState(!pdfUrl);
 useEffect(()=>{if(!open||result?.bytes===bytes)return;const c=new AbortController();setError('');
  void import('./pdfText').then(m=>m.pdfText(bytes,c.signal)).then(text=>{if(!c.signal.aborted)setResult({bytes,text});}).catch(e=>{if(!c.signal.aborted)setError(e instanceof Error&&/^Este PDF |^O texto /.test(e.message)?e.message:'Não foi possível extrair o texto deste PDF. Ele pode estar protegido ou usar uma fonte incompatível. Use o PDF ou solicite uma versão acessível ao escritório.');});
  return()=>c.abort();
 },[bytes,scope,open]);
 return <><details className="pdf-reading" open={open} onToggle={e=>setOpen(e.currentTarget.open)}><summary>Texto e leitura do PDF</summary><p className="reading-note">Texto extraído do mesmo PDF autorizado. A ordem pode variar em tabelas e colunas; confira o arquivo original para diagramação e assinaturas. A extração permanece neste dispositivo.</p>
 {error&&<p role="status" className="form-feedback error">{error}</p>}
 {result?.bytes===bytes&&open&&<><ReadAloud key={scope} scope={scope} text={result.text}/><div className="reading-text" tabIndex={0} aria-label="Texto extraído do PDF">{result.text}</div></>}
 </details>{!open&&pdfUrl&&<iframe title={title??'PDF autorizado'} src={pdfUrl+'#toolbar=0'}/>}</>;
}
