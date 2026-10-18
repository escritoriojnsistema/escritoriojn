const invalid = 'Link inválido ou expirado. Solicite outro link e abra neste mesmo navegador.';
const browser = 'Não foi possível reconhecer a solicitação deste link. Solicite um novo link neste navegador e abra o e-mail mais recente aqui, sem usar uma janela anônima.';
const unavailable = 'Não foi possível confirmar o link por uma falha de conexão ou do serviço. Verifique sua conexão e solicite um novo link.';

// Only known codes/status select public messages; provider text may contain secrets.
export function callbackFailure(error: unknown): string {
  const code = error && typeof error === 'object' && 'code' in error ? String(error.code) : '';
  const status = error && typeof error === 'object' && 'status' in error ? Number(error.status) : 0;
  const name = error && typeof error === 'object' && 'name' in error ? String(error.name) : '';
  if (code === 'pkce_code_verifier_not_found' || code === 'bad_code_verifier') return browser;
  if (code === 'otp_expired' || code === 'flow_state_expired' || code === 'flow_state_not_found') return 'Este link expirou ou já foi utilizado. Solicite um novo link e abra o e-mail mais recente.';
  if (status >= 500 || status === 0 && (name === 'AuthRetryableFetchError' || name === 'TypeError')) return unavailable;
  if (status === 429 || code === 'over_request_rate_limit') return 'Muitas tentativas. Aguarde antes de solicitar um novo link.';
  return invalid;
}
