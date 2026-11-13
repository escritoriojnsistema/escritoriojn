import {useEffect,useRef,useState} from 'react';
import {PdfReading} from '../documentReading/PdfReading';
import './privatePdfPreview.css';

export function PrivatePdfPreview({bytes,scope,title}:{bytes:Blob;scope:string;title:string}){
 const [view,setView]=useState<'pdf'|'text'>('pdf');
 return <div className="private-pdf-preview"><label className="team-field private-pdf-display">Exibição<select value={view} onChange={event=>setView(event.target.value as 'pdf'|'text')}><option value="pdf">PDF</option><option value="text">Texto e leitura</option></select></label>
 {view==='pdf'?<PdfCanvasView bytes={bytes} scope={scope} title={title}/>:<PdfReading key={scope} bytes={bytes} scope={scope}/>}
 </div>;
}
function PdfCanvasView({bytes,scope,title}:{bytes:Blob;scope:string;title:string}){
 const host=useRef<HTMLDivElement>(null),canvas=useRef<HTMLCanvasElement>(null);
 const [width,setWidth]=useState(0),[page,setPage]=useState(1);
 const [result,setResult]=useState<{bytes:Blob;scope:string;page:number;width:number;pages:number}>(),[failure,setFailure]=useState<{bytes:Blob;scope:string;page:number;message:string}>();
 const current=result?.bytes===bytes&&result.scope===scope&&result.page===page&&result.width===width;
 const error=failure?.bytes===bytes&&failure.scope===scope&&failure.page===page?failure.message:'';
 useEffect(()=>{setPage(1);},[bytes,scope]);
 useEffect(()=>{const element=host.current;if(!element)return;const resize=()=>setWidth(Math.max(1,Math.floor(element.clientWidth)));resize();const observer=new ResizeObserver(resize);observer.observe(element);return()=>observer.disconnect();},[]);
 useEffect(()=>{
  if(!width)return;const controller=new AbortController();setFailure(undefined);
  const clear=()=>{if(canvas.current){canvas.current.width=0;canvas.current.height=0;}};clear();
  void import('./pdfCanvas').then(module=>module.pdfCanvas(bytes,page,width,window.devicePixelRatio,controller.signal)).then(value=>{
   if(controller.signal.aborted||!canvas.current)return;
   const target=canvas.current;target.width=value.canvas.width;target.height=value.canvas.height;target.getContext('2d')!.drawImage(value.canvas,0,0);value.canvas.width=0;value.canvas.height=0;
   setResult({bytes,scope,page,width,pages:value.pages});
  }).catch(error=>{if(!controller.signal.aborted)setFailure({bytes,scope,page,message:error instanceof Error&&/^Este PDF |^O PDF /.test(error.message)?error.message:'Não foi possível visualizar este PDF. Use o texto ou solicite uma versão acessível ao escritório.'});});
  return()=>{controller.abort();clear();};
 },[bytes,scope,page,width]);
 const pages=result?.bytes===bytes&&result.scope===scope?result.pages:0;
 return <div ref={host} className="private-pdf-canvas-view">
 <nav className="private-pdf-pagination" aria-label="Páginas do PDF"><button type="button" className="team-text-button" disabled={!current||page<=1} onClick={()=>setPage(value=>value-1)}>Anterior</button><span role="status">{pages?`Página ${page} de ${pages}`:'PDF autorizado'}</span><button type="button" className="team-text-button" disabled={!current||page>=pages} onClick={()=>setPage(value=>value+1)}>Próxima</button></nav>
 {error&&<p role="status" className="form-feedback error">{error}</p>}
 <canvas ref={canvas} hidden={!current||!!error} role="img" aria-label={`${title} — página ${page}`}/>
 </div>;
}
