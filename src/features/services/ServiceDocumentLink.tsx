import {useEffect,useRef,useState} from 'react';
import {Link} from 'react-router-dom';
import type {DocumentPublicOffer,TemplateFolder} from '../../../shared/modelCommercial';
import type {TemplatePage} from '../../../shared/templates';
import {serviceMoney} from '../../../shared/services';
import {paths} from '../../app/routes';
import {CommercialError,commercialApi} from '../documentCommercial/api';
import {modelApi} from '../documentCommercial/modelApi';

/** The document catalog is the source of the offering; Services only links it. */
export function ServiceDocumentLink({office,serviceId,canLink,enabled}:{office:string;serviceId:string;canLink:boolean;enabled:boolean}){
 const [linked,setLinked]=useState<DocumentPublicOffer|null>(),[folders,setFolders]=useState<TemplateFolder[]>(),[templates,setTemplates]=useState<TemplatePage>(),[folder,setFolder]=useState(''),[template,setTemplate]=useState(''),[busy,setBusy]=useState(false),[error,setError]=useState(''),[feedback,setFeedback]=useState('');
 const [input,setInput]=useState(''),[query,setQuery]=useState(''),[page,setPage]=useState(1);
 const alive=useRef(true),key=useRef<string|null>(null);
 function resetSelection(){setTemplate('');setTemplates(undefined);key.current=null;setError('');}
 useEffect(()=>{const timer=setTimeout(()=>setQuery(input.trim()),250);return()=>clearTimeout(timer);},[input]);
 useEffect(()=>{alive.current=true;return()=>{alive.current=false;};},[]);
 useEffect(()=>{
  if(!enabled){setLinked(null);return;}
  const controller=new AbortController();setLinked(undefined);setError('');
  void modelApi.serviceOffer(office,serviceId,controller.signal).then(v=>{if(!controller.signal.aborted)setLinked(v);}).catch(e=>{if(!controller.signal.aborted){setLinked(null);if(!(e instanceof CommercialError&&[403,404].includes(e.status)))setError(e instanceof Error?e.message:'Não foi possível consultar o documento vinculado.');}});
  return()=>controller.abort();
 },[office,serviceId,enabled]);
 useEffect(()=>{
  if(!canLink||linked!==null)return;
  const controller=new AbortController();
  void commercialApi.folders(office,controller.signal).then(v=>{if(!controller.signal.aborted)setFolders(v.folders);}).catch(e=>{if(!controller.signal.aborted&&!(e instanceof CommercialError&&e.status===403))setError(e instanceof Error?e.message:'Não foi possível consultar as pastas.');});
  return()=>controller.abort();
 },[office,canLink,linked]);
 useEffect(()=>{
  if(!folder){setTemplates(undefined);setTemplate('');return;}
  const controller=new AbortController();setTemplates(undefined);setTemplate('');
  void commercialApi.templates(office,folder==='unfiled'?null:folder,folder==='unfiled','approved',query,page,5,controller.signal).then(v=>{if(!controller.signal.aborted)setTemplates(v);}).catch(e=>{if(!controller.signal.aborted)setError(e instanceof Error?e.message:'Não foi possível consultar os modelos da pasta.');});
  return()=>controller.abort();
 },[office,folder,query,page]);
 function attach(){
  if(!template||busy||!canLink)return;
  const attempt=key.current??(key.current=crypto.randomUUID());
  setBusy(true);setError('');setFeedback('');
  void modelApi.attachOffer(office,serviceId,template,attempt).then(v=>{if(!alive.current)return;key.current=null;setLinked(v);setFeedback('Documento vinculado ao serviço.');}).catch(e=>{if(!alive.current)return;const status=e instanceof CommercialError?e.status:503;if(status!==503)key.current=null;setError(status===409?'Este serviço ou modelo já tem vínculo, ou o serviço exige campos/checklist que impedem o catálogo. Ajuste o serviço e tente de novo.':e instanceof Error?e.message:'Não foi possível vincular o documento.');}).finally(()=>{if(alive.current)setBusy(false);});
 }
 if(!enabled)return null;
 if(linked===undefined)return null;
 return <section className="service-document-link" aria-label="Documento vinculado ao serviço">
  <h2>Documento e pasta</h2>
  {linked?<><dl className="service-facts"><div><dt>Modelo</dt><dd>{linked.name} · {linked.template_code}</dd></div><div><dt>Pasta</dt><dd>{linked.folder_name?`${linked.folder_name} (${linked.folder_category})`:'Sem pasta'}</dd></div><div><dt>Categoria e preço</dt><dd>{linked.service_category} · {serviceMoney(linked.price_cents)} · versão do serviço {linked.offer_revision}</dd></div>{linked.service_checklist.length>0&&<div><dt>O que o cliente envia</dt><dd>{linked.service_checklist.join(' · ')}</dd></div>}</dl><p className="customer-note">O cliente vê modelo, pasta, código, categoria e preço antes de solicitar. <Link to={`${paths.documents}?aba=models`}>Ajustar oferta em Documentos</Link></p></>:canLink?<><p className="customer-note">Selecione a categoria da pasta e o documento aprovado. O vínculo usa o preço e a versão vigentes do serviço; depois ele pode ser detalhado em Documentos.</p><div className="service-form-grid"><label className="team-field">Pasta<select value={folder} disabled={busy} onChange={e=>{resetSelection();setFolder(e.target.value);setPage(1);}}><option value="">Selecione a pasta</option><option value="unfiled">Sem pasta</option>{folders?.map(f=><option key={f.id} value={f.id}>{f.category} · {f.name}</option>)}</select></label><label className="team-field">Buscar documento<input type="search" value={input} maxLength={120} disabled={busy||!folder} onChange={e=>{setTemplate('');key.current=null;setError('');setInput(e.target.value);setPage(1);}}/></label><label className="team-field">Documento<select value={template} disabled={busy||!templates||query!==input.trim()} onChange={e=>{key.current=null;setError('');setTemplate(e.target.value);}}><option value="">{folder?'Selecione o documento':'Escolha a pasta primeiro'}</option>{templates?.items.filter(t=>t.current_version!==null&&!t.demonstration).map(t=><option key={t.id} value={t.id}>{t.code} · {t.name}</option>)}</select></label></div>{folder&&templates&&<nav className="team-pagination" aria-label="Paginação de documentos para vínculo"><button type="button" className="team-text-button" disabled={busy||page<=1} onClick={()=>{resetSelection();setPage(p=>p-1);}}>Anterior</button><span>{page}/{Math.max(1,Math.ceil(templates.total/templates.page_size))} · {templates.total} modelos</span><button type="button" className="team-text-button" disabled={busy||page*templates.page_size>=templates.total} onClick={()=>{resetSelection();setPage(p=>p+1);}}>Próxima</button></nav>}{folder&&templates&&templates.items.every(t=>t.current_version===null||t.demonstration)&&<p className="customer-note">Nenhum modelo aprovado encontrado nesta pasta e busca. Aprove um modelo em Documentos antes de vincular.</p>}<button type="button" className="primary-button" disabled={busy||!template} onClick={attach}>Vincular documento</button></>:<p className="customer-note">Nenhum documento vinculado. A gestão pode vincular em Documentos ou nesta tela com templates.manage.</p>}
  {feedback&&<p role="status" className="form-feedback">{feedback}</p>}{error&&<p role="alert" className="form-feedback error">{error}</p>}
 </section>;
}
