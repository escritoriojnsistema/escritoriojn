import type {
  ChargeView,
  ChargeMutation,
  InstallmentInput,
} from "../../../shared/charges";
import { supabase } from "../auth/browser";
import { authenticatedFetch } from "../auth/authenticatedFetch";
import { sessionScope } from "../auth/sessionScope";

export class ChargesError extends Error {
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
              ? "O registro mudou ou a decisão não é permitida. Atualize antes de repetir."
              : status === 422
                ? "Confira valores, parcelas e motivo (5 a 500 caracteres)."
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
  if (!supabase) throw new ChargesError(503);
  const controller = new AbortController();
  let changedSession = false;
  let unsubscribe: (() => void) | undefined;
  try {
    signal?.throwIfAborted();
    const { data, error } = await supabase.auth.getSession();
    if (error || !data.session?.access_token) throw new ChargesError(401);
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
      `/api/charges${path}`,
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
      throw new ChargesError(401);
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
      throw new ChargesError(response.status, code);
    }
    if (
      !result ||
      typeof result !== "object" ||
      !("data" in result) ||
      !result.data ||
      typeof result.data !== "object"
    )
      throw new ChargesError(503);
    return result.data as T;
  } catch (cause) {
    if (signal?.aborted) throw cause;
    if (changedSession) throw new ChargesError(401);
    throw cause instanceof ChargesError ? cause : new ChargesError(503);
  } finally {
    unsubscribe?.();
  }
}
export const chargesApi = {
  view: (
    office_id: string,
    request_id: string,
    history_page = 1,
    signal?: AbortSignal,
  ) =>
    request<ChargeView>(
      "/view",
      "POST",
      { office_id, request_id, history_page },
      signal,
    ),
  create: (
    office_id: string,
    request_id: string,
    installments: InstallmentInput[],
    idempotency_key: string,
    signal?: AbortSignal,
  ) =>
    request<ChargeView>(
      "/create",
      "POST",
      { office_id, request_id, installments, idempotency_key },
      signal,
    ),
  mutate: (
    office_id: string,
    charge_id: string,
    expected_version: number,
    mutation: ChargeMutation,
    idempotency_key: string,
    signal?: AbortSignal,
  ) =>
    request<ChargeView>(
      "/mutate",
      "POST",
      { office_id, charge_id, expected_version, mutation, idempotency_key },
      signal,
    ),
};
export const chargesError = (cause: unknown) =>
  cause instanceof ChargesError ? cause : new ChargesError(503);
