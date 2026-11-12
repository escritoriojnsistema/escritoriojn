import {getDocument,GlobalWorkerOptions} from 'pdfjs-dist';
import workerUrl from 'pdfjs-dist/build/pdf.worker.min.mjs?url';
GlobalWorkerOptions.workerSrc=workerUrl;

/** Extracts only the bytes already authorized by the existing artifact gate. */
export async function pdfText(bytes:Blob,signal:AbortSignal):Promise<string>{
 if(signal.aborted)throw new DOMException('Aborted','AbortError');
 if(bytes.size>3145728)throw Error('Este PDF excede o limite de leitura. Solicite uma versão acessível ao escritório.');
 const data=new Uint8Array(await bytes.arrayBuffer());if(signal.aborted)throw new DOMException('Aborted','AbortError');
 const task=getDocument({data,verbosity:0,useWorkerFetch:false,disableFontFace:true,useSystemFonts:true,enableXfa:false,stopAtErrors:true,maxImageSize:0});
 const abort=()=>{void task.destroy();};signal.addEventListener('abort',abort,{once:true});
 const timeout=setTimeout(abort,20000);task.onPassword=abort;
 try{
  const pdf=await task.promise;if(pdf.numPages>120)throw Error('Este PDF tem muitas páginas para leitura no dispositivo. Solicite uma versão acessível ao escritório.');
  let text='';
  for(let n=1;n<=pdf.numPages;n++){
   if(signal.aborted)throw new DOMException('Aborted','AbortError');
   const page=await pdf.getPage(n);try{const content=await page.getTextContent();let line='';for(const item of content.items){if('str'in item){line+=item.str+(item.hasEOL?'\n':' ');}}text+=line.trim()+'\n\n';}finally{page.cleanup();}
   if(text.length>150000)throw Error('O texto excede o limite de leitura. Solicite uma versão acessível ao escritório.');
  }
  if(!text.trim())throw Error('Este PDF não contém texto selecionável. Solicite uma versão acessível ou ajuda ao escritório.');
  return text.trim();
 }finally{clearTimeout(timeout);signal.removeEventListener('abort',abort);await task.destroy();}
}
