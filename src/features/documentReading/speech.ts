export type ReadingState='idle'|'speaking'|'paused'|'unavailable'|'error';
type Device=Pick<SpeechSynthesis,'getVoices'|'speak'|'cancel'> & Partial<Pick<SpeechSynthesis,'pause'|'resume'|'paused'>>;
export function localPortugueseVoice(voices:SpeechSynthesisVoice[]){
 const local=voices.filter(v=>v.localService===true&&/^pt(?:[-_]|$)/i.test(v.lang));
 return local.find(v=>/^pt[-_]BR$/i.test(v.lang))??local[0];
}

/** Owns only this reader's utterances. No text is persisted or logged. */
export class SpeechReader{
 private generation=0;private chunks:string[]=[];private current?:SpeechSynthesisUtterance;private state:ReadingState='idle';
 constructor(private device:Device,private utterance:()=>SpeechSynthesisUtterance,private notify:(s:ReadingState)=>void){}
 get canPause(){return typeof this.device.pause==='function'&&typeof this.device.resume==='function';}
 private update(s:ReadingState){this.state=s;this.notify(s);}
 stop(){this.generation++;this.chunks=[];const active=this.current;this.current=undefined;if(active){active.onend=null;active.onerror=null;try{this.device.cancel();if(this.device.paused)this.device.resume?.();}catch{/* no private device error in UI */}}this.update('idle');}
 start(text:string){
  this.stop();if(!text.trim())return;
  let voice:SpeechSynthesisVoice|undefined;try{voice=localPortugueseVoice(this.device.getVoices());}catch{this.update('error');return;}if(!voice){this.update('unavailable');return;}
  const chars=Array.from(text.trim());
  while(chars.length){let end=Math.min(chars.length,220);if(end<chars.length){const boundary=chars.slice(0,end).join('').search(/\s+\S*$/u);if(boundary>80)end=Array.from(chars.slice(0,end).join('').slice(0,boundary)).length;}this.chunks.push(chars.splice(0,end).join('').trim());}
  const generation=this.generation;
  const next=()=>{if(generation!==this.generation)return;const text=this.chunks.shift();if(!text){this.current=undefined;this.update('idle');return;}
   try{const u=this.utterance();this.current=u;u.text=text;u.lang=voice.lang;u.voice=voice;u.rate=1;u.onend=next;u.onerror=()=>{if(generation===this.generation){this.stop();this.update('error');}};this.update('speaking');this.device.speak(u);}
   catch{this.stop();this.update('error');}
  };next();
 }
 pause(){if(this.state!=='speaking'||!this.canPause)return;try{this.device.pause!();this.update('paused');}catch{this.stop();this.update('error');}}
 resume(){if(this.state!=='paused'||!this.canPause)return;try{this.device.resume!();this.update('speaking');}catch{this.stop();this.update('error');}}
}
