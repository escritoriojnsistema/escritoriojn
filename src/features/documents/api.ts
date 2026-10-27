import type {DocumentDetail,DocumentPage,DocumentOptions,DocumentOptionKind,DocumentOperation,ParticipantInput} from '../../../shared/documents';
import {supabase} from '../auth/browser';
import {authenticatedFetch} from '../auth/authenticatedFetch';
import {sessionScope} from '../auth/sessionScope';
export class DocumentsError extends Error {constructor(public status:number,public code?:string){super(status===401?'Sua sessão foi encerrada. Entre novamente.':status===403?'Seu acesso documental mudou.':status===404?'Documento ou fonte não encontrado.':status===409?'O documento mudou. Seu texto local foi preservado. Reabra para conferir a versão atual.':status===422?'Confira os campos e as pendências do documento.':'Não foi possível confirmar a gravação. Repita a mesma tentativa.');}}
async function request<T>(path: string, method: 'POST', body: unknown, signal?: AbortSignal): Promise<T> {
  if (!supabase) throw new DocumentsError(503);
  const controller = new AbortController();
  let changedSession = false;
  let unsubscribe: (() => void) | undefined;
  try {
    signal?.throwIfAborted();
    const { data, error } = await supabase.auth.getSession();
    if (error || !data.session?.access_token) throw new DocumentsError(401);
    const started = sessionScope(data.session);
    const subscription = supabase.auth.onAuthStateChange((_event, next) => {
      if (!next || next.user.id !== data.session!.user.id || sessionScope(next) !== started) {
        changedSession = true;
        controller.abort();
      }
    });
    unsubscribe = () => subscription.data.subscription.unsubscribe();
    const response = await authenticatedFetch(`/api/documents${path}`, {
      method, body: JSON.stringify(body), cache: 'no-store',
      headers: { Authorization: `Bearer ${data.session.access_token}`, 'Content-Type': 'application/json' },
      signal: AbortSignal.any([controller.signal, AbortSignal.timeout(25_000), ...(signal ? [signal] : [])]),
    }, data.session);
    const result: unknown = await response.json();
    signal?.throwIfAborted();
    const current = await supabase.auth.getSession();
    signal?.throwIfAborted();
    if (changedSession || current.error || !current.data.session || current.data.session.user.id !== data.session.user.id || sessionScope(current.data.session) !== started) throw new DocumentsError(401);
    if (!response.ok) {
      const code = result && typeof result === 'object' && 'error' in result && result.error && typeof result.error === 'object' && 'code' in result.error ? String(result.error.code) : undefined;
      throw new DocumentsError(response.status, code);
    }
    if (!result || typeof result !== 'object' || !('data' in result) || !result.data || typeof result.data !== 'object') throw new DocumentsError(503);
    return result.data as T;
  } catch (cause) {
    if (signal?.aborted) throw cause;
    if (changedSession) throw new DocumentsError(401);
    throw cause instanceof DocumentsError ? cause : new DocumentsError(503);
  } finally { unsubscribe?.(); }
}
export const documentsApi={
 search:(office_id:string,query:string,page:number,size:number,signal?:AbortSignal)=>request<DocumentPage>('/search','POST',{office_id,query,page,size},signal),
 options:(office_id:string,kind:DocumentOptionKind,request_id:string|null,query:string,page=1,signal?:AbortSignal)=>request<DocumentOptions>('/options','POST',{office_id,kind,request_id,query,page},signal),
 detail:(office_id:string,document_id:string,revision:number|null=null,history_page=1,signal?:AbortSignal)=>request<DocumentDetail>('/detail','POST',{office_id,document_id,revision,history_page},signal),
 create:(body:{office_id:string;request_id:string;request_item_id:string;template_version_id:string;participants:ParticipantInput[];idempotency_key:string},signal?:AbortSignal)=>request<DocumentDetail>('/create','POST',body,signal),
 operate:(office_id:string,document_id:string,operation:DocumentOperation,signal?:AbortSignal)=>request<DocumentDetail>('/operate','POST',{office_id,document_id,operation},signal),
};
export const documentsError=(v:unknown)=>v instanceof DocumentsError?v:new DocumentsError(503);
