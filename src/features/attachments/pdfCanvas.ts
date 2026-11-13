import {AnnotationMode,getDocument,GlobalWorkerOptions,type RenderTask} from 'pdfjs-dist';
import workerUrl from 'pdfjs-dist/build/pdf.worker.min.mjs?url';
GlobalWorkerOptions.workerSrc=workerUrl;

const maxBytes=10*1024*1024,maxPixels=8_000_000;
function aborted(){return new DOMException('Aborted','AbortError');}

/** Rasterizes only an already authorized, hash-checked Blob. No PDF interaction layer is mounted. */
export async function pdfCanvas(bytes:Blob,pageNumber:number,width:number,dpr:number,signal:AbortSignal){
 if(signal.aborted)throw aborted();
 if(bytes.size>maxBytes)throw Error('Este PDF excede o limite de visualização de 10 MiB.');
 const data=new Uint8Array(await bytes.arrayBuffer());if(signal.aborted)throw aborted();
 const options={data,verbosity:0,useWorkerFetch:false,disableFontFace:true,useSystemFonts:true,enableXfa:false,isEvalSupported:false,stopAtErrors:true,maxImageSize:maxPixels,canvasMaxAreaInBytes:maxPixels*4,disableAutoFetch:true,disableStream:true,disableRange:true};
 const task=getDocument(options);
 let render:RenderTask|undefined,timedOut=false;
 const cancel=()=>{render?.cancel();void task.destroy().catch(()=>{});};
 const timeout=setTimeout(()=>{timedOut=true;cancel();},20000);
 signal.addEventListener('abort',cancel,{once:true});task.onPassword=cancel;
 try{
  const pdf=await task.promise;
  if(signal.aborted)throw aborted();
  if(pdf.numPages>120)throw Error('Este PDF excede o limite de visualização de 120 páginas.');
  const current=Math.max(1,Math.min(pdf.numPages,pageNumber)),page=await pdf.getPage(current);
  try{
   if(signal.aborted)throw aborted();
   const base=page.getViewport({scale:1});
   if(!Number.isFinite(base.width)||!Number.isFinite(base.height)||base.width<=0||base.height<=0)throw Error('Este PDF tem dimensões inválidas para visualização.');
   const cssScale=Math.min(Math.max(1,width),1200)/base.width;
   const density=Math.max(1,Math.min(Number.isFinite(dpr)?dpr:1,2));
   const scale=Math.min(cssScale*density,Math.sqrt(maxPixels/(base.width*base.height)));
   const viewport=page.getViewport({scale});
   const canvas=document.createElement('canvas');canvas.width=Math.max(1,Math.floor(viewport.width));canvas.height=Math.max(1,Math.floor(viewport.height));
   render=page.render({canvas,viewport,annotationMode:AnnotationMode.DISABLE,background:'#ffffff'});
   await render.promise;
   if(signal.aborted)throw aborted();
   return {canvas,pages:pdf.numPages,page:current};
  }finally{render=undefined;page.cleanup();}
 }catch(error){if(timedOut)throw Error('O PDF excedeu o tempo de visualização. Use o texto ou solicite uma versão acessível.');throw error;}
 finally{clearTimeout(timeout);signal.removeEventListener('abort',cancel);await task.destroy();}
}
