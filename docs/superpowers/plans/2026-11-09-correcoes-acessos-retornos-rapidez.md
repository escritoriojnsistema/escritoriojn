# Correções após28 — plano incremental

Base publicada: `9772f32`, Livro/AGENTS e Etapa28 conferidos. Pedido: explicar dependências das telas01–28; corrigir retornos ausentes/escondidos; reduzir demora de primeira abertura e login de todos os perfis. Preservar permissões, sessão, dados e fluxos. Não iniciar29; semActions; publicaçãoGitHub→Vercel.

- [x] Inventariar cartões01–28, rotas, navegação e pré-requisitos; classificar falta de acesso versus dependência de contexto, explicando especialmente28 sem inventar integrações ou dados.
- [x] Capturar os fluxos atuais de Configurações/equipe/mobile; localizar retornos existentes e ausentes. Tornar retorno adaptado visível na área principal, com destino interno seguro/estado de edição/pending preservado, sem superar quatro ações principais nem duplicar controles de detalhe já adequados.
- [x] Reproduzir e medir primeira pintura/entrada com cachefrio, sessão restaurada, login e autoridade verificada; investigar bundle, chamadas e backend. Corrigir causas demonstradas, mantendo proteção401/403 e nenhuma permissão por cache não verificado.
- [x] Testar regressões de navegação/acesso/retornos, sessão/portal/identidade e abertura/login nos quatro perfis. Registrar medições antes/depois e limites reais; revisão independente.
- [ ] Conferir Supabase/Backend e publicar porGitHub→Vercel. Atualizar Livro/AGENTS/fecho com mapa de acesso e provas. Nenhum teste com conta pessoal hospedada nem fixtures remotas.

Responsabilidades: diagnóstico de performance emAuth/entrada/bundle; retornos emOperationLayout/componentes e fluxos internos; mapa/dependências pelo coordenador. Alterações em arquivos compartilhados exigem coordenação.
