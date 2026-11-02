import {useEffect,type RefObject} from 'react';
import type {Session} from '@supabase/supabase-js';
import {ActivityDeadline,activitySnapshot,humanActivityAllowed} from '../../../shared/sessionActivity';
import {authenticatedFetch} from './authenticatedFetch';
import {endBrowserSession} from './browser';
import {sessionScope} from './sessionScope';

/** Read/refresh/focus never call the mutation. Only trusted input sends a bounded heartbeat. */
export function useSessionActivity(current:RefObject<Session|null>,scope:string){
 useEffect(()=>{
  if(!scope)return;
  const controller=new AbortController(),clock=new ActivityDeadline();
  let timer:number|undefined,pending=false,lastHuman=-Infinity;
  const channel=typeof BroadcastChannel!=='undefined'?new BroadcastChannel('jn-session-activity'):null;
  const same=()=>!!current.current&&sessionScope(current.current)===scope;
  function schedule(){
   if(timer!==undefined)window.clearTimeout(timer);
   const remaining=clock.remaining(performance.now());
   if(remaining===undefined||!same())return;
   if(remaining===0){void endBrowserSession(current.current!);return;}
   timer=window.setTimeout(schedule,Math.min(remaining,2147483647));
  }
  async function report(human=false){
   if(pending||!same()||controller.signal.aborted)return;
   const expected=current.current!;pending=true;
   // The request start bounds network delay conservatively. Local wall time is irrelevant.
   const started=performance.now();
   try{
    const response=await authenticatedFetch('/api/auth/activity',{
     method:human?'POST':'GET',cache:'no-store',headers:{Authorization:`Bearer ${expected.access_token}`,...(human?{'Content-Type':'application/json'}:{})},
     ...(human?{body:'{}'}:{}),signal:AbortSignal.any([controller.signal,AbortSignal.timeout(12000)]),
    },expected);
    if(!same()||controller.signal.aborted||!response.ok)return;
    const body:unknown=await response.json();if(!body||typeof body!=='object'||!('data' in body))return;
    const snapshot=activitySnapshot(body.data);
    if(`${snapshot.user_id}:${snapshot.session_id}`!==scope||!same()||controller.signal.aborted)return;
    clock.observe(snapshot,started);schedule();
    // A notification only asks other tabs to read the official deadline; its payload grants nothing.
    if(human)channel?.postMessage({scope});
   }catch{/* Existing deadline remains in force; unavailable reads never extend it. */}
   finally{pending=false;}
  }
  const interaction=(event:Event)=>{
   const now=performance.now();if(!humanActivityAllowed(event,lastHuman,now)||pending)return;
   if(clock.remaining(now)===0){schedule();return;}
   lastHuman=now;void report(true);
  };
  const read=()=>{void report();};
  const visible=()=>{if(document.visibilityState==='visible')read();};
  const otherTab=(event:MessageEvent)=>{if(event.data&&event.data.scope===scope)read();};
  for(const name of ['pointerdown','pointermove','keydown','touchstart','wheel'])window.addEventListener(name,interaction,{passive:true});
  window.addEventListener('focus',read);document.addEventListener('visibilitychange',visible);channel?.addEventListener('message',otherTab);
  read();
  return()=>{controller.abort();if(timer!==undefined)window.clearTimeout(timer);for(const name of ['pointerdown','pointermove','keydown','touchstart','wheel'])window.removeEventListener(name,interaction);window.removeEventListener('focus',read);document.removeEventListener('visibilitychange',visible);channel?.close();};
 },[scope,current]);
}
