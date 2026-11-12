import {useLayoutEffect,useRef,useState} from 'react';
import {SpeechReader,localPortugueseVoice,type ReadingState} from './speech';
import './reading.css';

export function ReadAloud({text,scope,disabled=false}:{text:string;scope:string;disabled?:boolean}){
 const reader=useRef<SpeechReader|null>(null),[state,setState]=useState<ReadingState>('idle'),[voice,setVoice]=useState<SpeechSynthesisVoice>(),[supported,setSupported]=useState(false),[pause,setPause]=useState(false);
 useLayoutEffect(()=>{
  if(!window.speechSynthesis||typeof SpeechSynthesisUtterance!=='function')return;
  const synth=window.speechSynthesis,instance=new SpeechReader(synth,()=>new SpeechSynthesisUtterance(),setState);reader.current=instance;setSupported(true);setPause(instance.canPause);
  const voices=()=>{instance.stop();try{setVoice(localPortugueseVoice(synth.getVoices()));}catch{setVoice(undefined);}};voices();
  const hide=()=>{if(document.visibilityState==='hidden')instance.stop();};const stop=()=>instance.stop();
  synth.addEventListener('voiceschanged',voices);document.addEventListener('visibilitychange',hide);window.addEventListener('pagehide',stop);
  return()=>{instance.stop();reader.current=null;synth.removeEventListener('voiceschanged',voices);document.removeEventListener('visibilitychange',hide);window.removeEventListener('pagehide',stop);};
 },[]);
 useLayoutEffect(()=>{reader.current?.stop();},[text,scope,disabled]);
 const active=state==='speaking'||state==='paused';
 return <section className="document-reading" aria-label="Leitura em voz alta">
  <div className="reading-controls">{active?<><button type="button" className="team-text-button" onClick={()=>reader.current?.stop()}>Parar leitura</button>{pause&&<button type="button" className="team-text-button" onClick={()=>state==='paused'?reader.current?.resume():reader.current?.pause()}>{state==='paused'?'Retomar leitura':'Pausar leitura'}</button>}</>:<button type="button" className="team-text-button" disabled={disabled||!supported||!voice||!text.trim()} onClick={()=>reader.current?.start(text)}>Ler em voz alta</button>}</div>
  <p className="reading-note">{!supported?'Este navegador não oferece leitura em voz alta. Use o texto na tela ou solicite uma versão acessível ao escritório.':!voice?'Nenhuma voz local em português foi identificada. Instale uma voz no dispositivo ou use o texto na tela. Vozes remotas não são acionadas.':`Voz local indicada pelo navegador: ${voice.lang}. Confira as configurações de voz do dispositivo antes de ler dados sensíveis e use um local reservado. A leitura não substitui a revisão.`}</p>
  <p className="reading-status" role="status" aria-live="polite">{state==='error'?'O dispositivo não conseguiu concluir a leitura. Confira a voz nas configurações e tente novamente, ou use o texto na tela.':state==='paused'?'Leitura pausada.':state==='speaking'?'Leitura em andamento. Se a pausa não funcionar neste dispositivo, use Parar leitura.':''}</p>
 </section>;
}
