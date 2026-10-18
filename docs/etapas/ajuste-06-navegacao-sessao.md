# Ajuste posterior à Etapa 06 — navegação e preparação de sessão

## Escopo e aceite

React + Vite permanece. Todos os perfis usam o mesmo shell responsivo. A barra inferior móvel exibe no máximo quatro destinos autorizados, priorizando Início, Equipe, Auditoria e Conta; Arquivados e próximos módulos ficam no menu lateral quando excederem esse limite. Perfis com menos opções não recebem botões fictícios.

Trocas de rota não apagam o contexto já validado da mesma sessão. A revalidação ocorre em segundo plano; uma resposta 401/403 ou falha de verificação continua bloqueando acesso. Não cachear privilégios em armazenamento persistente nem confiar em metadata. O backend e as RPCs continuam validando cada operação. Sem indicadores de carregamento de páginas/listagens; cabeçalhos e navegação aparecem imediatamente, resultados chegam em segundo plano e erros/vazios reais continuam explícitos. Envios continuam protegidos contra repetição e mostram seu resultado.

Logo e retorno ao início respeitam o portal autenticado. Acesso público à raiz com sessão autorizada retorna ao painel correspondente. Apenas a ação Sair encerra a sessão por navegação. Revogação, expiração real e bloqueios de segurança continuam válidos.

## Prazo individual — preparação solicitada para etapas futuras

O manual v4 não define uma etapa própria de preferências de sessão. Encaixe: **Conta → Segurança** para consulta/alteração própria; **Equipe → Editar acesso** para gestão autorizada de terceiros; cadastro de clientes na Etapa07 deve consumir a mesma política. Não criar uma etapa fictícia nem antecipar cadastro completo.

- Valores permitidos: 10, 15, 30 (padrão), 60 minutos ou nunca. Interpretação proposta: inatividade, aguardando eventual correção do usuário.
- Preferência individual por identidade Auth, independente do papel e do dispositivo; ausência de preferência equivale a30. Não mudar configuração global do Supabase para simular prazo por pessoa.
- Gestão de terceiros: somente proprietário e administrador com delegação específica, dentro do escritório e do prazo autorizado; sem autoconcessão. Permissão proposta `sessions.manage`, separada de `users.manage`. Política própria não concede gestão de terceiros.
- Contrato futuro: GET/PATCH autenticados de política própria; gestão de terceiros exige vínculo e capacidade atuais. Autor e identidade vêm da sessão verificada, nunca do payload. Gravar política com constraint dos valores, RLS/ACL restrita e auditoria mínima transacional. Não confiar em localStorage/user_metadata como autoridade.
- Aplicação futura: validar expiração por `session_id` no servidor/banco, registrar atividade humana de forma limitada e não renovar prazo com refresh automático, consulta periódica ou foco. Tombstone de sessão expirada impede ressurreição por heartbeat/refresh. Revalidar após lock em ações críticas. Convergência entre abas/dispositivos sem copiar tokens.
- `Nunca` desativa somente o prazo automático da aplicação: saída explícita continua funcionando; revogação administrativa e invalidação pelo Supabase continuam obrigatórias. Não prometer sessão que sobreviva a remoção de credenciais, bloqueio de conta ou limpeza do navegador.
- Aceite futuro: todas as cinco opções por perfil, isolamento de contas/escritórios, concorrência entre mudança de política e atividade, reload/abas suspensas, offline/retorno, prazo expirado sem reativação, exclusão de sessão do provedor e auditoria com rollback.

**Limite desta entrega:** prepara o contrato e os pontos de integração. Não exibe seletor sem persistência nem promete que o prazo individual já está ativo. A sessão atual continua sob o SDK oficial do Supabase. Não há migration ou alteração de contas reais neste ajuste.

## Plano executável e evidências

- [x] Reproduzir por contrato de navegador: cinco atalhos do owner; menu desaparecendo durante conferência lenta; raiz pública fora da operação.
- [x] Centralizar seleção dos quatro atalhos e destino autenticado; manter verificação em segundo plano somente para a mesma sessão.
- [x] Retirar loaders de navegação/listagem e evitar chunk de rota suspendendo toda a aplicação; preservar erros e bloqueios.
- [x] Provar todos os perfis em mobile/desktop, foco/modal, revogação e sessão diferente. Node30/build, Auth real30, contratos48 e público34 passaram antes do último reforço; seis contratos focados do reforço também passaram. Regressão definitiva no CI antes do merge.
- [ ] Revisar, atualizar normas/Livro, publicar via PR/CI/Vercel e conferir alias público. Não tocar contas reais/SMTP/templates.

Base: main568a71b; baseline Node30/30. Manual: https://drive.google.com/file/d/1PjG_-IkoUxLFxejjoU1mYZhB5X_GxW96/view . Autorização técnica de publicação mantida do fluxo anterior.

## Revisão e decisões

- Corrigido P2: Governance comparava bytes de token após resposta, gerando401 falso ao renovar a mesma sessão. Agora exige mesmo UID/session_id; teste RED→GREEN e controles logout/nova sessão.
- Corrigido P2: Team e Governance podiam reapresentar estado local de sessão anterior no mesmo escritório. Chaves privadas do router incluem sessão/autoridade; convite/reset usam sessão. Login/callback/provider não são remontados na adoção. Três reproduções RED→GREEN: SID novo, UID novo e função diferente mantendoSID. Mesmo refresh/permissões mantém editor.
- Revisão independente por leitura não encontrou outroP1/P2 após as correções. Screenshots fictícios360 inspecionados: quatro atalhos e menu completo, alvos44px e conteúdo sem corte.
- Banco/backend: sem mudançaSQL/API/RLS; API/RPC continuam verificando cada operação. Leitura hospedada confirmou seis migrations, quatro identidades, um vínculo ativo e SELECT direto de auditoria negado. Sem alterações em contas/SMTP/templates/Edge/env.
- Publicação e evidência final serão preenchidas após CI e conferência do alias. Preview protegido/env/logs403 conhecidos, sem contorno. Auth autenticado é provado em laboratório/CI, sem contas hospedadas.
