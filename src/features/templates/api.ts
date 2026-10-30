import type {TemplateInput,TemplatePage,TemplateDetail} from '../../../shared/templates';
import type {TemplateFoldersPage,TemplateSearchPage} from '../../../shared/templateFolders';
import {supabase} from '../auth/browser';
import {authenticatedFetch} from '../auth/authenticatedFetch';
import {sessionScope} from '../auth/sessionScope';
export class TemplatesError extends Error {
 constructor(public status:number,public code?:string){super(status===401?'Sua sessão foi encerrada. Entre novamente.':status===403?'Seu acesso não permite esta operação na biblioteca.':status===404?'Modelo não encontrado. Volte à lista.':code==='TEMPLATE_DUPLICATE'?'Este código já existe na biblioteca.':code==='TEMPLATE_FOLDER_NOT_EMPTY'?'A pasta ainda contém modelos. Mova ou exclua os modelos antes de excluir a pasta.':status===409?'O modelo mudou. Reabra e confira a versão antes de continuar.':status===422?'Confira o tipo, as variáveis, o texto, a vigência e o motivo.':'Biblioteca indisponível. Tente novamente com esta mesma tentativa.');}
}
async function request<T>(path: string, method: 'POST', body: unknown, signal?: AbortSignal): Promise<T> {
  if (!supabase) throw new TemplatesError(503);
  const controller = new AbortController();
  let changedSession = false;
  let unsubscribe: (() => void) | undefined;
  try {
    signal?.throwIfAborted();
    const { data, error } = await supabase.auth.getSession();
    if (error || !data.session?.access_token) throw new TemplatesError(401);
    const started = sessionScope(data.session);
    const subscription = supabase.auth.onAuthStateChange((_event, next) => {
      if (!next || next.user.id !== data.session!.user.id || sessionScope(next) !== started) {
        changedSession = true;
        controller.abort();
      }
    });
    unsubscribe = () => subscription.data.subscription.unsubscribe();
    const response = await authenticatedFetch(`/api/templates${path}`, {
      method, body: JSON.stringify(body), cache: 'no-store',
      headers: { Authorization: `Bearer ${data.session.access_token}`, 'Content-Type': 'application/json' },
      signal: AbortSignal.any([controller.signal, AbortSignal.timeout(25_000), ...(signal ? [signal] : [])]),
    }, data.session);
    const result: unknown = await response.json();
    signal?.throwIfAborted();
    const current = await supabase.auth.getSession();
    signal?.throwIfAborted();
    if (changedSession || current.error || !current.data.session || current.data.session.user.id !== data.session.user.id || sessionScope(current.data.session) !== started) throw new TemplatesError(401);
    if (!response.ok) {
      const code = result && typeof result === 'object' && 'error' in result && result.error && typeof result.error === 'object' && 'code' in result.error ? String(result.error.code) : undefined;
      throw new TemplatesError(response.status, code);
    }
    if (!result || typeof result !== 'object' || !('data' in result) || !result.data || typeof result.data !== 'object') throw new TemplatesError(503);
    return result.data as T;
  } catch (cause) {
    if (signal?.aborted) throw cause;
    if (changedSession) throw new TemplatesError(401);
    throw cause instanceof TemplatesError ? cause : new TemplatesError(503);
  } finally { unsubscribe?.(); }
}
export const templatesApi={
 search:(office_id:string,query:string,page:number,size:number,signal?:AbortSignal)=>request<TemplatePage>('/search','POST',{office_id,query,page,size},signal),
 folderSearch:(body:{office_id:string;query:string;page:number;size:number;folder_id:string|null;level:1|2|3|null},signal?:AbortSignal)=>request<TemplateSearchPage>('/folder-search','POST',body,signal),
 foldersPage:(office_id:string,page:number,size:number,signal?:AbortSignal)=>request<TemplateFoldersPage>('/folders/page','POST',{office_id,page,size},signal),
 folderSave:(body:{office_id:string;folder_id:string|null;name:string;level:1|2|3;expected_version:number;reason:string;idempotency_key:string},signal?:AbortSignal)=>request<unknown>('/folders/save','POST',body,signal),
 link:(body:{office_id:string;template_id:string;service_id:string|null;folder_id:string|null;expected_version:number;reason:string;idempotency_key:string},signal?:AbortSignal)=>request<TemplateDetail>('/link','POST',body,signal),
 detail:(office_id:string,template_id:string,page=1,signal?:AbortSignal)=>request<TemplateDetail>('/detail','POST',{office_id,template_id,page},signal),
 save:(body:{office_id:string;template_id:string|null;definition:TemplateInput;expected_version:number;reason:string;idempotency_key:string},signal?:AbortSignal)=>request<TemplateDetail>('/save','POST',body,signal),
 approve:(body:{office_id:string;template_id:string;version_id:string;expected_version:number;reason:string;idempotency_key:string},signal?:AbortSignal)=>request<TemplateDetail>('/approve','POST',body,signal),
};
export const templatesError=(v:unknown)=>v instanceof TemplatesError?v:new TemplatesError(503);
