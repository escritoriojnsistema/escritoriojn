import {useEffect} from 'react';
export function useUnsavedAccess(dirty:boolean){
 useEffect(()=>{window.dispatchEvent(new CustomEvent('jn-access-dirty',{detail:dirty}));return()=>{window.dispatchEvent(new CustomEvent('jn-access-dirty',{detail:false}));};},[dirty]);
 useEffect(()=>{
 if(!dirty)return;
 const before=(e:BeforeUnloadEvent)=>{e.preventDefault();e.returnValue='';};
 const click=(e:MouseEvent)=>{const a=(e.target as Element).closest?.('a[href]');if(a&&a.getAttribute('href')!==location.pathname&&!window.confirm('Descartar alterações de acesso ainda não salvas?')){e.preventDefault();e.stopPropagation();}};
 window.addEventListener('beforeunload',before);document.addEventListener('click',click,true);return()=>{window.removeEventListener('beforeunload',before);document.removeEventListener('click',click,true);};
 },[dirty]);
 return (close:()=>void)=>{if(!dirty||window.confirm('Descartar alterações de acesso ainda não salvas?'))close();};
}
