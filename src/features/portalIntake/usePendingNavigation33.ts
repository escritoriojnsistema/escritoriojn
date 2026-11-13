import {useEffect} from 'react';
type NavigationLock={state:unknown;url:string;index:unknown;restoring:boolean};
const locks=new Set<NavigationLock>();
// Imported by main before BrowserRouter mounts: window is itself the event
// target, so capture alone cannot precede an already registered router listener.
if(typeof window!=='undefined')window.addEventListener('popstate',event=>{
 const locked=Array.from(locks).at(-1);if(!locked)return;
 // The router must see neither the attempted POP nor its corrective traversal.
 // Its mounted screen and exact in-memory command remain at the locked entry.
 event.stopImmediatePropagation();
 const index=history.state?.idx;
 if(locked.restoring&&index===locked.index){locked.restoring=false;return;}
 if(Number.isInteger(locked.index)&&Number.isInteger(index)&&index!==locked.index){locked.restoring=true;history.go(Number(locked.index)-index);}
 else{history.pushState(locked.state,'',locked.url);locked.restoring=false;}
},true);
// Keep the exact in-memory command/File until its outcome is known.
export function usePendingNavigation33(pending:boolean){useEffect(()=>{
 if(!pending)return;
 const locked:NavigationLock={state:history.state,url:location.href,index:history.state?.idx,restoring:false};locks.add(locked);
 const leave=(e:BeforeUnloadEvent)=>{e.preventDefault();};
 const click=(e:MouseEvent)=>{if(e.target instanceof Element&&e.target.closest('a')){e.preventDefault();e.stopImmediatePropagation();}};
 window.addEventListener('beforeunload',leave);document.addEventListener('click',click,true);
 return()=>{locks.delete(locked);window.removeEventListener('beforeunload',leave);document.removeEventListener('click',click,true);};
},[pending]);}
