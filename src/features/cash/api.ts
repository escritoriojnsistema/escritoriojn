import type {Expense,ExpenseOperation,FinancialTransfer,TransferOperation,Finance17Page,PaymentReceipt} from '../../../shared/expenses';
import type {CorrectionKind,CorrectionOperation,CorrectionSources} from '../../../shared/corrections';
import type {PaymentOperation,PaymentsPage} from '../../../shared/payments';
import type {CashFilters} from '../../../shared/cash';
import type {FinanceStatement,FinanceOperation,FinanceCharges,ClientFinance} from '../../../shared/finance';
import type {CashDashboard,CashConfiguration,CashConfigurationResult,CashConfigure,CashOpen} from '../../../shared/cash';
import { supabase } from "../auth/browser";
import { authenticatedFetch } from "../auth/authenticatedFetch";
import { sessionScope } from "../auth/sessionScope";

export class CashError extends Error {
  constructor(
    public status: number,
    public code?: string,
  ) {
    super(
      status === 401
        ? "Sua sessão expirou ou foi encerrada. Entre novamente para continuar."
        : status === 403
          ? "Seu acesso não permite esta operação. Verifique com o proprietário."
          : status === 404
            ? "Registro indisponível no seu escopo. Confira a seleção."
            : status === 409
              ? "O registro mudou ou a operação não é compatível com o saldo atual. Confira o estado antes de repetir."
              : status === 422
                ? "Confira unidade, conta, nome e valor em reais."
                : "Não foi possível concluir. Confira sua conexão e tente novamente.",
    );
  }
}
async function request<T>(
  path: string,
  method: "POST" | "PATCH",
  body: unknown,
  signal?: AbortSignal,
): Promise<T> {
  if (!supabase) throw new CashError(503);
  const controller = new AbortController();
  let changedSession = false;
  let unsubscribe: (() => void) | undefined;
  try {
    signal?.throwIfAborted();
    const { data, error } = await supabase.auth.getSession();
    if (error || !data.session?.access_token) throw new CashError(401);
    const started = sessionScope(data.session);
    const subscription = supabase.auth.onAuthStateChange((_event, next) => {
      if (
        !next ||
        next.user.id !== data.session!.user.id ||
        sessionScope(next) !== started
      ) {
        changedSession = true;
        controller.abort();
      }
    });
    unsubscribe = () => subscription.data.subscription.unsubscribe();
    const response = await authenticatedFetch(
      `/api/cash${path}`,
      {
        method,
        body: JSON.stringify(body),
        cache: "no-store",
        headers: {
          Authorization: `Bearer ${data.session.access_token}`,
          "Content-Type": "application/json",
        },
        signal: AbortSignal.any([
          controller.signal,
          AbortSignal.timeout(25_000),
          ...(signal ? [signal] : []),
        ]),
      },
      data.session,
    );
    const result: unknown = await response.json();
    signal?.throwIfAborted();
    const current = await supabase.auth.getSession();
    signal?.throwIfAborted();
    if (
      changedSession ||
      current.error ||
      !current.data.session ||
      current.data.session.user.id !== data.session.user.id ||
      sessionScope(current.data.session) !== started
    )
      throw new CashError(401);
    if (!response.ok) {
      const code =
        result &&
        typeof result === "object" &&
        "error" in result &&
        result.error &&
        typeof result.error === "object" &&
        "code" in result.error
          ? String(result.error.code)
          : undefined;
      throw new CashError(response.status, code);
    }
    if (
      !result ||
      typeof result !== "object" ||
      !("data" in result) ||
      !result.data ||
      typeof result.data !== "object"
    )
      throw new CashError(503);
    return result.data as T;
  } catch (cause) {
    if (signal?.aborted) throw cause;
    if (changedSession) throw new CashError(401);
    throw cause instanceof CashError ? cause : new CashError(503);
  } finally {
    unsubscribe?.();
  }
}
export const cashApi={
 finance17:(office_id:string,session_id:string|null,page=1,signal?:AbortSignal)=>request<Finance17Page>('/finance17','POST',{office_id,session_id,page},signal),
 expense:(office_id:string,operation:ExpenseOperation,signal?:AbortSignal)=>request<{expense:Expense}>('/expense','POST',{office_id,operation},signal),
 transfer:(office_id:string,operation:TransferOperation,signal?:AbortSignal)=>request<{transfer:FinancialTransfer}>('/transfer','POST',{office_id,operation},signal),
 receipt:(office_id:string,payment_id:string,idempotency_key:string,signal?:AbortSignal)=>request<PaymentReceipt>('/receipt','POST',{office_id,payment_id,idempotency_key},signal),
 correction:(office_id:string,operation:CorrectionOperation,signal?:AbortSignal)=>request<FinanceStatement>('/correction','POST',{office_id,operation},signal),
 correctionSources:(office_id:string,session_id:string,kind:CorrectionKind,query='',page=1,signal?:AbortSignal)=>request<CorrectionSources>('/correction-sources','POST',{office_id,session_id,kind,query,page},signal),
 payment:(office_id:string,operation:PaymentOperation,signal?:AbortSignal)=>request<FinanceStatement>('/payment','POST',{office_id,operation},signal),
 payments:(office_id:string,session_id:string,page=1,signal?:AbortSignal)=>request<PaymentsPage>('/payments','POST',{office_id,session_id,page},signal),
 statement:(office_id:string,session_id:string,page=1,signal?:AbortSignal)=>request<FinanceStatement>('/statement','POST',{office_id,session_id,page},signal),
 eligibleCharges:(office_id:string,query:string,page=1,signal?:AbortSignal)=>request<FinanceCharges>('/eligible-charges','POST',{office_id,query,page},signal),
 operate:(office_id:string,operation:FinanceOperation,signal?:AbortSignal)=>request<FinanceStatement>('/operate','POST',{office_id,operation},signal),
 clientFinance:(office_id:string,page=1,history_page=1,signal?:AbortSignal,request_id:string|null=null)=>request<ClientFinance>('/client-finance','POST',{office_id,page,history_page,request_id},signal),
 filteredDashboard:(office_id:string,scope:'own'|'all',page:number,page_size:3|5,filters:CashFilters,signal?:AbortSignal)=>request<CashDashboard>('/dashboard-filtered','POST',{office_id,scope,page,page_size,...filters},signal),
 dashboard:(office_id:string,scope:'own'|'all',page:number,page_size:3|5,signal?:AbortSignal)=>request<CashDashboard>('/dashboard','POST',{office_id,scope,page,page_size},signal),
 configuration:(office_id:string,page=1,unit_id:string|null=null,signal?:AbortSignal)=>request<CashConfiguration>('/configuration','POST',{office_id,unit_id,page,page_size:50},signal),
 configure:(office_id:string,configuration:CashConfigure,idempotency_key:string,signal?:AbortSignal)=>request<CashConfigurationResult>('/configure','POST',{office_id,configuration,idempotency_key},signal),
 open:(office_id:string,input:CashOpen,signal?:AbortSignal)=>request<CashDashboard>('/open','POST',{office_id,...input},signal),
};
export const cashError=(cause:unknown)=>cause instanceof CashError?cause:new CashError(503);
