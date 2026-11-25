export interface LoginRouteState {
  sessionExpired?: boolean;
  passwordUpdated?: boolean;
}

export interface LoginFeedback {
  text: string;
  error: boolean;
}

export function resolveInitialLoginNotice(
  state: unknown,
  currentFeedback: LoginFeedback | null,
): LoginFeedback | null {
  if (currentFeedback) return currentFeedback;
  if (!state || typeof state !== 'object') return null;
  const routeState = state as LoginRouteState;
  if (routeState.sessionExpired) {
    return { text: 'Sua sessão expirou. Entre novamente para continuar.', error: true };
  }
  if (routeState.passwordUpdated) {
    return { text: 'Senha atualizada. Entre com sua nova senha.', error: false };
  }
  return null;
}

export function normalizeLoginEmail(raw: FormDataEntryValue | null): string {
  return String(raw ?? '').trim();
}

export function validateLoginCredentials(email: string, password: string): string | null {
  if (!email) return 'Informe seu e-mail de acesso.';
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return 'Informe um endereço de e-mail válido.';
  }
  if (!password) return 'Informe sua senha para continuar.';
  return null;
}
