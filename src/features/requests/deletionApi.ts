import type {
  RequestDeletionEligibility,
  RequestDeletionExecuteInput,
  RequestDeletionResult,
} from '../../../shared/requestDeletion';
import { supabase } from '../auth/browser';
import { authenticatedFetch } from '../auth/authenticatedFetch';
import { sessionScope } from '../auth/sessionScope';

export class RequestDeletionError extends Error {
  constructor(
    public status: number,
    public code?: string,
    serverMessage?: string,
  ) {
    super(
      serverMessage ||
        (status === 401
          ? 'Sua sessão expirou ou foi encerrada. Entre novamente para continuar.'
          : status === 403
            ? 'Seu acesso não permite excluir esta solicitação definitivamente.'
            : status === 404
              ? 'Solicitação ou operação não disponível no seu escopo.'
              : status === 409
                ? 'A solicitação mudou de estado ou já possui exclusão em andamento. Atualize a tela.'
                : status === 422
                  ? 'Esta solicitação não atende às regras de exclusão definitiva.'
                  : 'Não foi possível comunicar com o servidor. Confira o estado da exclusão antes de repetir.'),
    );
  }
}

async function callDeletion<T>(
  path: string,
  body: unknown,
  signal?: AbortSignal,
): Promise<T> {
  if (!supabase) throw new RequestDeletionError(503);
  const controller = new AbortController();
  let changedSession = false;
  let unsubscribe: (() => void) | undefined;

  try {
    signal?.throwIfAborted();
    const { data, error } = await supabase.auth.getSession();
    if (error || !data.session?.access_token) throw new RequestDeletionError(401);
    const started = sessionScope(data.session);
    const subscription = supabase.auth.onAuthStateChange((_event, next) => {
      if (!next || next.user.id !== data.session!.user.id || sessionScope(next) !== started) {
        changedSession = true;
        controller.abort();
      }
    });
    unsubscribe = () => subscription.data.subscription.unsubscribe();

    const response = await authenticatedFetch(
      `/api/request-deletion${path}`,
      {
        method: 'POST',
        body: JSON.stringify(body),
        cache: 'no-store',
        headers: {
          Authorization: `Bearer ${data.session.access_token}`,
          'Content-Type': 'application/json',
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
    ) {
      throw new RequestDeletionError(401);
    }

    if (!response.ok) {
      const errObj =
        result && typeof result === 'object' && 'error' in result && result.error && typeof result.error === 'object'
          ? (result.error as { code?: unknown; message?: unknown })
          : undefined;
      throw new RequestDeletionError(
        response.status,
        typeof errObj?.code === 'string' ? errObj.code : undefined,
        typeof errObj?.message === 'string' ? errObj.message : undefined,
      );
    }

    if (!result || typeof result !== 'object' || !('data' in result) || !result.data) {
      throw new RequestDeletionError(503);
    }
    return result.data as T;
  } catch (cause) {
    if (signal?.aborted) throw cause;
    if (changedSession) throw new RequestDeletionError(401);
    throw cause instanceof RequestDeletionError ? cause : new RequestDeletionError(503);
  } finally {
    unsubscribe?.();
  }
}

export const requestDeletionApi = {
  eligibility: (office_id: string, request_id: string, signal?: AbortSignal) =>
    callDeletion<RequestDeletionEligibility>(`/${request_id}/eligibility`, { office_id }, signal),
  execute: (
    request_id: string,
    input: RequestDeletionExecuteInput,
    signal?: AbortSignal,
  ) => callDeletion<RequestDeletionResult>(`/${request_id}/execute`, input, signal),
  status: (
    office_id: string,
    request_id: string,
    idempotency_key: string,
    signal?: AbortSignal,
  ) =>
    callDeletion<RequestDeletionResult>(
      `/${request_id}/status`,
      { office_id, idempotency_key },
      signal,
    ),
};
