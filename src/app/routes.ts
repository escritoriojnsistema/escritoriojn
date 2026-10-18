export const paths = { home: '/', team: '/login', client: '/login-cliente', recovery: '/recuperar-senha', status: '/status', signup: '/cadastro', callback: '/auth/callback', reset: '/redefinir-senha', panel: '/painel', clientPanel: '/area-cliente', authenticated: '/acesso', teamManagement: '/equipe', invitation: '/convite', account: '/conta', clientAccount: '/minha-conta' } as const;
export function normalizePathname(pathname: string): string { return pathname.replace(/\/+$/, '').toLowerCase() || '/'; }
export const pageTitles: Record<string, string> = {
  [paths.home]: 'Seu processo em boas mãos', [paths.team]: 'Área da Equipe',
  [paths.client]: 'Área do Cliente', [paths.recovery]: 'Recuperação de acesso', [paths.status]: 'Status do sistema', [paths.signup]: 'Cadastro de cliente', [paths.callback]: 'Confirmação de acesso', [paths.reset]: 'Nova senha', [paths.panel]: 'Área de operação', [paths.clientPanel]: 'Área de operação', [paths.authenticated]: 'Verificação de acesso',
  [paths.teamManagement]: 'Equipe e convites', [paths.invitation]: 'Convite para a equipe',
  [paths.account]: 'Conta', [paths.clientAccount]: 'Conta',
};
