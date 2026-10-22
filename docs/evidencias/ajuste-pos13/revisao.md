# Revisão independente pós13 — Tarefa1 e Tarefa2

Veredito final após scoped rereview: Tarefa1 aprovada; Tarefa2 aprovada. Achado P2 corrigido e fechado; sem achados pendentes P0/P1/P2/P3. Revisão estática do pacote único e dos fontes pertinentes, sem editar o projeto, commit, push ou repetir suites.

## Achado P2 — uma leitura nova apaga a falha de outra notificação

Local: `src/features/notifications/NotificationReadProvider.tsx:16-17`.

Reprodução pelo fluxo de código: abrir aviso A; POST read retorna503; banner de falha e retry permanecem no destino. Voltar à caixa, abrir aviso B na mesma sessão: `setFailure(undefined)` executa incondicionalmente ao iniciar B. Se B concluir com sucesso, A segue não lida e sua falha/retry desaparecem do destino. Duas falhas concorrentes também se substituem, pois o estado armazena somente um item. Isso contraria a exigência explícita de não ocultar falhas e preservar mensagens da mesma sessão em falha transitória.

Correção sugerida: manter falhas por chave office/id e remover apenas a falha da leitura confirmada (ou, no mínimo, não limpar/substituir falha de uma chave diferente). Acrescentar regressão A503 → abrir B200 → falha/retry A ainda disponíveis. Não é perda de dado de negócio, mas quebra concreta do tratamento de falha autorizado.

## Conformidade observada

- Salvar/Solicitar/Acompanhar fora do quadro Conta; aplicação e Cancelar fora do fieldset. Cancelar restaura snapshot/proposta local, não chama gravação, não cancela solicitação existente. Cliente retorna à Conta pelo Link.
- Provider acima das rotas mantém leitura durante navegação, deduplica office/id, aborta controllers na troca de sessão/contextos/papel/permissões e descarta resultados tardios. Badge não é reduzido otimisticamente pela leitura; confirmação dispara resumo oficial. Novo fluxo não usa metadata nem armazenamento privado como autoridade.
- Cobranças remove limite geral de largura e restringe760px ao editor; testes registrados cobrem320/360/768/1440/1920. Nenhuma alteração em navegação/atalhos, stack ou regras globais44px/16px.
- auth/context sobrepõe somente duas leituras independentes do mesmo Bearer. Aguarda ambas antes de resposta, valida identidade do provedor, estrutura e UID de cada contexto. my_access_context é SQL STABLE SECURITY INVOKER e current_permissions continua conferindo sessão e acesso vigentes no banco. Nenhuma mutação foi paralelizada e nenhum cache de autoridade foi introduzido.
- Benchmark declara corretamente provedor HTTP fictício e não transforma redução de espera local em promessa de latência hosted.

## Evidências conferidas nos arquivos existentes

- `docs/evidencias/ajuste-pos13/node.log`:115 testes,115pass,0fail.
- `docs/evidencias/ajuste-pos13/build.log`: build Vite concluído; relatório do controlador informa typecheck+server no mesmo comando.
- `docs/evidencias/ajuste-pos13/auth-real.log`:34pass(2.0m), com post-check do laboratório preservado.
- `docs/evidencias/ajuste-pos13/auth-green.log`:2pass, incluindo gates da sobreposição read-only e bloqueio de acesso não verificado.
- `docs/evidencias/ajuste-pos13/task1-final-focused.log`:21pass/2fail históricos (employee1440 e troca da sessão).
- `docs/evidencias/ajuste-pos13/task1-notifications-confirm.log`:12pass(14.3s), cobrindo novamente os dois cenários falhos, todos os papéis360/1440, erro/retry e resumo inicial.

Limite: revisão não executou nem inspecionou produção; publicação/verificação canônica e atualização de Livro/AGENTS seguem com controlador. PNGs existem, mas o parecer funcional usa fonte e logs, sem afirmar inspeção visual independente.

## Scoped rereview da correção P2

Pacote `/tmp/pos13-task1-review-fix.diff` e fonte final inspecionados. P2 fechado: falhas agora são mantidas por office:id; iniciar B conserva A, sucesso remove somente a chave concluída, falhas concorrentes não se substituem. Guardas de authority/controller e deduplicação permanecem. Não identifiquei regressão nova no fix.

Evidência conferida sem repetir suites: `task1-review-p2-red.log` tem1falha esperada contra implementação anterior; `task1-review-p2-green.log` tem3pass(4.3s), incluindo A503→B200→retryA200; `task1-final-extra.log` tem2pass(4.9s), incluindo leitura idempotente/filtro oficial e Cancelar cliente. O ajuste de troca da sessão passa a verificar a nova autoridade no painel onde possui acesso, evitando exigir sino em destino negado.

CSS adicional de e-mail cliente conferido no fonte: `.operation-account .operation-details > .account-email-detail { grid-column:1/-1; }`, com classe no campo correspondente. Escopo restrito, sem mexer em44px/16px, atalhos ou autoridade. Esta correção está no fonte final, embora não apareça no pacote específico P2.
