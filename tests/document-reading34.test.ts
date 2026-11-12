import {test} from 'node:test';
import assert from 'node:assert/strict';
import {SpeechReader,localPortugueseVoice,type ReadingState} from '../src/features/documentReading/speech';

function device(voices:SpeechSynthesisVoice[]){
 const spoken:SpeechSynthesisUtterance[]=[],states:ReadingState[]=[];let cancels=0;
 const synth={getVoices:()=>voices,speak:(u:SpeechSynthesisUtterance)=>spoken.push(u),cancel:()=>{cancels++;},pause:()=>{},resume:()=>{}};
 const reader=new SpeechReader(synth,()=>({} as SpeechSynthesisUtterance),s=>states.push(s));
 return {reader,spoken,states,get cancels(){return cancels;},synth};
}
const voice=(lang:string,localService:boolean)=>({lang,localService,name:'Fictícia',voiceURI:lang,default:false}) as SpeechSynthesisVoice;
test('34: does not speak at construction and never selects a remote/unknown voice',()=>{
 const remote=voice('pt-BR',false),local=voice('pt-PT',true),br=voice('pt-BR',true);
 assert.equal(localPortugueseVoice([remote,local,br]),br);assert.equal(localPortugueseVoice([remote]),undefined);
 const d=device([remote]);assert.equal(d.spoken.length,0);d.reader.start('Conteúdo privado');assert.equal(d.spoken.length,0);assert.equal(d.states.at(-1),'unavailable');
 assert.equal(localPortugueseVoice([voice('en-US',true)]),undefined);
});
test('34: explicit start speaks the visible text with a local Portuguese voice and pause/resume/stop',()=>{
 const d=device([voice('pt-BR',true)]);d.reader.start('Versão visível.');assert.equal(d.spoken[0].text,'Versão visível.');assert.equal(d.spoken[0].lang,'pt-BR');assert.equal(d.spoken[0].voice?.localService,true);
 d.reader.pause();assert.equal(d.states.at(-1),'paused');d.reader.resume();assert.equal(d.states.at(-1),'speaking');d.reader.stop();assert.equal(d.states.at(-1),'idle');assert.ok(d.cancels>0);
});
test('34: old callbacks cannot speak another chunk or alter a newer reading',()=>{
 const d=device([voice('pt-BR',true)]);d.reader.start('Documento antigo. '.repeat(40));const old=d.spoken[0].onend!,oldError=d.spoken[0].onerror!;
 d.reader.stop();d.reader.start('Nova versão');old.call(d.spoken[0],{} as SpeechSynthesisEvent);oldError.call(d.spoken[0],{} as SpeechSynthesisErrorEvent);
 assert.equal(d.spoken.length,2);assert.equal(d.states.at(-1),'speaking');assert.equal(d.spoken[1].text,'Nova versão');
});
test('34: reads long Unicode text in ordered bounded chunks and completes',()=>{
 const d=device([voice('pt-PT',true)]),text='Ação jurídica 😀. '.repeat(300);d.reader.start(text);
 for(let i=0;i<d.spoken.length;i++){assert.ok([...d.spoken[i].text].length<=220);d.spoken[i].onend!.call(d.spoken[i],{} as SpeechSynthesisEvent);}
 assert.equal(d.spoken.map(x=>x.text).join(' ').replace(/\s+/g,' ').trim(),text.trim());assert.equal(d.states.at(-1),'idle');
});
test('34: device errors stop without exposing text and empty text never speaks',()=>{
 const d=device([voice('pt-BR',true)]);d.reader.start('  ');assert.equal(d.spoken.length,0);d.reader.start('Privado');d.spoken[0].onerror!.call(d.spoken[0],{} as SpeechSynthesisErrorEvent);assert.equal(d.states.at(-1),'error');
 d.synth.speak=()=>{throw Error('device');};d.reader.start('Privado');assert.equal(d.states.at(-1),'error');
});
test('34: voice enumeration failure is explained without an uncaught action error',()=>{
 const d=device([]);d.synth.getVoices=()=>{throw Error('device unavailable');};
 assert.doesNotThrow(()=>d.reader.start('Conteúdo privado'));assert.equal(d.states.at(-1),'error');assert.equal(d.spoken.length,0);
});
test('34: pause is unavailable on devices without both controls',()=>{
 const d=device([voice('pt-BR',true)]);d.synth.pause=undefined as never;assert.equal(d.reader.canPause,false);d.reader.start('Versão visível');d.reader.pause();assert.equal(d.states.at(-1),'speaking');d.reader.stop();
});
test('34: stopping a paused reading lets the next document speak instead of queueing silently',()=>{
 let paused=false;const audible:string[]=[];const states:ReadingState[]=[];
 const device={getVoices:()=>[voice('pt-BR',true)],get paused(){return paused;},speak:(u:SpeechSynthesisUtterance)=>{if(!paused)audible.push(u.text);},cancel:()=>{},pause:()=>{paused=true;},resume:()=>{paused=false;}};
 const reader=new SpeechReader(device,()=>({} as SpeechSynthesisUtterance),s=>states.push(s));reader.start('Antigo');reader.pause();reader.stop();reader.start('Novo');assert.deepEqual(audible,['Antigo','Novo']);assert.equal(states.at(-1),'speaking');
});
