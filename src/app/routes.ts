export const paths = { home: '/', team: '/login', client: '/login-cliente', recovery: '/recuperar-senha', status: '/status' } as const;
export function normalizePathname(pathname: string): string { return pathname.replace(/\/+$/, '').toLowerCase() || '/'; }
export const pageTitles: Record<string, string> = {
  [paths.home]: 'Seu processo em boas mãos', [paths.team]: 'Área da Equipe',
  [paths.client]: 'Área do Cliente', [paths.recovery]: 'Recuperação de acesso', [paths.status]: 'Status do sistema',
};
