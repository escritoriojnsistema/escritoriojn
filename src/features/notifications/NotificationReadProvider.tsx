import {createContext,useContext,useEffect,useRef,useState,type ReactNode} from 'react';
import {useAuth} from '../auth/AuthProvider';
import {notificationsApi,NotificationsError,noticesChanged} from './api';
const ReadContext=createContext<(office:string,id:string)=>void>(()=>{});
export const useNotificationRead=()=>useContext(ReadContext);
// Above routes: opening a destination cannot abandon its read request.
export function NotificationReadProvider({children}:{children:ReactNode}){
 const auth=useAuth();
 const authority=JSON.stringify([auth.sessionKey,auth.contexts.map(c=>[c.user_id,c.office_id,c.role_code,[...c.permissions].sort()])]);
 const scope=useRef({authority,pending:new Map<string,AbortController>(),done:new Set<string>()});
 const [failures,setFailures]=useState<Record<string,{authority:string;office:string;id:string;message:string}>>({});
 useEffect(()=>{const active=scope.current;return()=>{for(const c of active.pending.values())c.abort();active.pending.clear();};},[authority]);
 if(scope.current.authority!==authority){for(const c of scope.current.pending.values())c.abort();scope.current={authority,pending:new Map(),done:new Set()};}
 function mark(office:string,id:string){
  const active=scope.current,key=office+':'+id;if(auth.status!=='authorized'||!auth.contexts.some(c=>c.office_id===office)||active.pending.has(key)||active.done.has(key))return;
  const controller=new AbortController();active.pending.set(key,controller);
  void notificationsApi.read(office,id,controller.signal).then(()=>{if(controller.signal.aborted||scope.current!==active)return;active.done.add(key);setFailures(old=>{const next={...old};delete next[key];return next;});noticesChanged();}).catch(cause=>{if(!controller.signal.aborted&&scope.current===active)setFailures(old=>({...old,[key]:{authority,office,id,message:cause instanceof NotificationsError?cause.message:'Não foi possível marcar a notificação como lida. Tente novamente.'}}));}).finally(()=>{if(active.pending.get(key)===controller)active.pending.delete(key);});
 }
 const visible=Object.values(failures).filter(failure=>failure.authority===authority);
 return <ReadContext.Provider value={mark}>{visible.map(failure=><div key={failure.office+':'+failure.id} className="notification-read-feedback" role="alert"><p>{failure.message}</p><button className="secondary-button" onClick={()=>mark(failure.office,failure.id)}>Tentar leitura novamente</button></div>)}{children}</ReadContext.Provider>;
}
