import {useEffect,useRef,useState} from 'react';
import {Link,useNavigate} from 'react-router-dom';
import {paths} from '../../app/routes';
import {CommercialError} from './api';
import {smartDocumentsApi,type SmartRequestContext} from '../smartDocuments/api';
import {RequestsError} from '../requests/api';

const documentsPath=`${paths.documents}?aba=issued`;

export function IntakeRequestItem({office,requestId,itemId,canCreate,disabled,onFailure}:{
 office:string;requestId:string;itemId:string;canCreate:boolean;disabled:boolean;onFailure:(e:RequestsError)=>void
}){
 const navigate=useNavigate();
 const [context,setContext]=useState<SmartRequestContext|null>(null);
 const [error,setError]=useState('');
 const [busy,setBusy]=useState(false);
 const attempt=useRef<{key:string;controller:AbortController}|null>(null);

 useEffect(()=>{
  const controller=new AbortController();
  setContext(null);
  setError('');
  void smartDocumentsApi.requestContext(office,requestId,itemId,controller.signal).then(value=>{
   if(!controller.signal.aborted)setContext(value);
  }).catch(error=>{
   if(!controller.signal.aborted&&error instanceof CommercialError&&error.status===401)onFailure(new RequestsError(401));
  });
  return()=>{controller.abort();attempt.current?.controller.abort();};
 },[office,requestId,itemId,onFailure]);

 function destination(documentId:string,needsReview:boolean){
  return {office_id:office,document_id:documentId,document_entry:needsReview?'review':'text'};
 }

 async function start(){
  if(disabled||!canCreate||context?.can_start!==true||busy||attempt.current&&!attempt.current.controller.signal.aborted)return;
  const controller=new AbortController();
  const key=attempt.current?.key??crypto.randomUUID();
  attempt.current={key,controller};
  setBusy(true);
  setError('');
  try{
   const result=await smartDocumentsApi.conferenceStart(office,requestId,itemId,[],key,controller.signal);
   if(!controller.signal.aborted)navigate(documentsPath,{state:destination(result.document.id,result.context.needs_review)});
  }catch(error){
   if(controller.signal.aborted)return;
   if(error instanceof CommercialError&&error.status===401)onFailure(new RequestsError(401));
   if(error instanceof CommercialError&&[403,404,422].includes(error.status)){
    setContext(null);
    setError('O documento não está disponível para este item com seu acesso atual.');
   }else{
    setError('Não foi possível abrir o documento. Tente novamente.');
   }
   if(error instanceof CommercialError&&error.status!==503)attempt.current=null;
  }finally{
   if(!controller.signal.aborted){
    if(attempt.current)controller.abort();
    setBusy(false);
   }
  }
 }

 if(!context&&!error)return null;
 if(!context?.document_id&&(context?.can_start!==true||!canCreate)&&!error)return null;
 return (
  <section className="service-section">
   <h2>{context?.intake?.model_name??'Documento da solicitação'}</h2>
   {error&&<p role="alert" className="form-feedback error">{error}</p>}
   {context?.document_id?(
    <Link className="primary-button" to={documentsPath} state={destination(context.document_id,context.needs_review)}
      aria-disabled={disabled||undefined} onClick={event=>{if(disabled)event.preventDefault();}}>
     {context.needs_review?'Revisar documento':'Abrir documento'}
    </Link>
   ):context?.can_start===true&&canCreate&&(
    <button className="primary-button" disabled={disabled||busy} onClick={()=>void start()}>
     {busy?'Abrindo documento…':'Criar documento'}
    </button>
   )}
  </section>
 );
}
