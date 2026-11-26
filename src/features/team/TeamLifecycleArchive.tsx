import {useEffect,useState} from 'react';
import type {TeamArchiveKind,TeamArchivePage} from '../../../shared/team';
import {teamRoleNames} from '../../../shared/team';
import {teamApi,teamError} from './api';
import {dateLabel} from './TeamFields';

export function TeamLifecycleArchive({office,kind}:{office:string;kind:TeamArchiveKind}){
 const [page,setPage]=useState(1),[data,setData]=useState<TeamArchivePage>(),[error,setError]=useState(''),[revision,setRevision]=useState(0);
 useEffect(()=>{
  const controller=new AbortController();
  setError('');
  void teamApi.archives(office,kind,page,controller.signal).then(value=>{
   if(!controller.signal.aborted)setData(value);
  }).catch(cause=>{
   if(!controller.signal.aborted){setData(undefined);setError(teamError(cause).message);}
  });
  return()=>controller.abort();
 },[office,kind,page,revision]);

 const heading=kind==='expired'?'Links expirados':kind==='accepted'?'Convites arquivados':'Contas da equipe excluídas';
 return <section aria-label={heading}>
  <div className="team-toolbar"><h2>{heading}</h2><button type="button" className="team-text-button" onClick={()=>setRevision(n=>n+1)}>Atualizar</button></div>
  {kind==='expired'&&<p className="team-hint">O e-mail pode receber um novo convite em Equipe e convites.</p>}
  {error&&<p className="form-feedback error" role="alert">{error}</p>}
  {data&&<>{data.items.length?<ul className="team-list">{data.items.map(item=><li key={item.id} className="team-row">
   <div className="team-person"><strong>{item.name??teamRoleNames[item.role_code]}</strong>{item.email&&<span>{item.email}</span>}<small>{dateLabel(item.at)}</small></div>
   {kind==='departed'?<div className="team-row-state">
    <small>{item.archived_requests??0} atendimento(s) arquivado(s) · {item.returned_requests??0} devolvido(s) à fila</small>
    <small>{item.notice==='sent'?'Aviso enviado':item.notice==='pending'?'Aviso pendente de envio':'Envio indisponível'}</small>
   </div>:<span>{teamRoleNames[item.role_code]}</span>}
  </li>)}</ul>:<p className="team-empty">Nenhum registro encontrado.</p>}
  {data.total>5&&<nav className="team-pagination" aria-label="Paginação dos registros arquivados">
   <button type="button" className="team-text-button" disabled={page<=1||data.page!==page} onClick={()=>setPage(n=>n-1)}>Anterior</button>
   <span>Página {data.page} de {Math.ceil(data.total/5)}</span>
   <button type="button" className="team-text-button" disabled={page*5>=data.total||data.page!==page} onClick={()=>setPage(n=>n+1)}>Próxima</button>
  </nav>}</>}
 </section>;
}
