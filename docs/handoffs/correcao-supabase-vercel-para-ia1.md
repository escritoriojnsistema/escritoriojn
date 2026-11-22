# Correção Supabase e Vercel — entrega para a IA 1

## Estado verificado em 22/11/2026

- Repositório `escritoriojnsistema/escritoriojn`. A branch `ia2/correcao-supabase-vercel` inclui a entrega anterior `dba2b00` e a correção de Caixa `07a0d8fc4b8994e3be3e9d7d51f1cd088ae53a9f`. A base remota inspecionada foi `main` em `5a07955a5faf841785c8e112694453642b3c95b1`. O arquivo `docs/handoffs/correcao-frontend-backend-para-ia2.md` não apareceu no workspace, nos refs remotos examinados ou na busca do GitHub. A integração abaixo usa os contratos existentes no repositório e o handoff anterior disponível.
- Supabase `mcsuoxnubpqenyvbefee` ativo, PostgreSQL 17, organização `escritoriojn` no plano Free. A consulta de produção encontrou 87 migrations, com última versão `20261122121500`. As quatro migrations históricas da evolução permanecem aplicadas e preservadas.
- Em produção havia 5 solicitações, 2 cobranças, 0 pagamentos, 0 unidades, 0 contas, 0 métodos, 0 sessões, 0 provedores, 0 terminais e 0 autorizações financeiras. Havia 0 linhas em `public.files` e 2 objetos no Storage. Os dois buckets são privados. Nenhuma fixture financeira ou de arquivos foi gravada no projeto.
- As Edge Functions ativas eram `retention`, `team-invitations`, `account-closure`, `private-attachments` e `document-artifacts`. `request-deletion-cleanup` ainda não consta no projeto hospedado.
- A inspeção revisou ACLs e RLS do Caixa e dos provedores, o isolamento dos wrappers, as políticas de Storage, as capacidades por papel, logs agregados sem dados pessoais e os advisors. Produção apresentou 195 avisos informativos de RLS sem policy, 48 FKs sem índice, 286 índices sem uso e o aviso Auth sobre proteção de senhas vazadas. As tabelas privadas revisadas estão fechadas e atendidas por RPC. Os advisors não justificaram mudanças indiscriminadas de RLS ou índices.

## Correção de Caixa, permissões e dados pessoais

A primeira unidade em `cash_configure` depende de `cash.read` e `cash.manage` atuais no escritório. A conta depende da unidade e o método depende de conta de destino compatível. As RPCs existentes funcionaram com o cadastro vazio. A configuração real deve ser feita por um gestor autorizado com os dados reais do escritório.

O filtro anterior reutilizava o escopo operacional da solicitação. Um proprietário ou administrador podia ler a solicitação e ainda assim ficar impedido de liquidar sua cobrança porque outra pessoa estava responsável pelo atendimento.

A nova migration `20261122193331_cash_receiving_scope_and_provider_options.sql` aplica o mesmo predicado financeiro à lista `cash_eligible_charges`, ao recebimento canônico `payment_operate_authorized`, ao lançamento correspondente no livro do Caixa e ao pedido de autorização manual. O proprietário pode operar no escritório com os requisitos financeiros vigentes. O administrador com `requests.read_all` e capacidades financeiras necessárias pode listar cobranças conforme a classificação de atendimento e o escopo concedido. A confirmação direta continua exigindo `payments.manual.approve` efetiva. Os demais operadores conservam o fluxo de autorização dentro de seu escopo, inclusive tarefas documentais assumidas no Caixa.

O pagamento continua exigindo sessão própria aberta, valor e saldo coerentes em centavos, método e conta compatíveis, chave de idempotência, evidência e operador. O filtro preserva rascunhos do portal e limites por escritório. O módulo de estornos e devoluções mantém seu escopo anterior. O teste consultou a conta do próprio cliente e verificou a negativa de consulta em outro escritório. Nenhum grant geral ou concessão automática foi feita para administradores.

## Opções de recebimento para Bancos e Pagamentos

A configuração completa do Caixa usa `cash.read`. O frontend atual chama essa configuração na primeira página e converte uma rejeição em estado nulo. Isso pode ocultar uma negativa de autorização para um administrador apto a gerenciar provedores.

A nova RPC `payment_provider_receiving_options(p_office_id uuid, p_unit_id uuid, p_page integer)` exige papel `owner` ou `admin`, `settings.access` e `payments.providers.manage`. Ela retorna:

- `units` com `id` e `name`.
- `accounts` com `id`, `unit_id`, `name` e `type` (`bank` ou `digital`).
- `units_total`, `accounts_total`, `unit_id`, `page` e `page_size` (50).

As unidades e contas retornadas precisam estar ativas. Uma conta em espécie é rejeitada como destino de provedor. Quando a unidade está ausente e a conta é válida, `payment_provider_save` resolve a unidade do próprio cadastro. As assinaturas de Caixa, cobrança e configuração de provedor existentes permanecem.

A IA 1 deve chamar essa RPC por uma rota autenticada da área de provedores, paginar até os totais e representar respostas distintas para lista vazia, `PT403 / PROVIDERS_FORBIDDEN`, validação e indisponibilidade. A concessão de `cash.read` ou `cash.manage` permanece ligada ao trabalho no Caixa.

## Exclusão, webhook e integração restante

As três migrations da entrega `dba2b00` precedem a nova migration. Elas preservam as FKs, o histórico e os grants registrados. A reserva de exclusão congela operações incompatíveis, conserva os metadados durante a limpeza e só confirma depois da remoção pela API oficial. Arquivos compartilhados e retidos bloqueiam a exclusão.

O contrato inicial previa que, após a RPC retornar `processing`, o Express chamaria `POST /functions/v1/request-deletion-cleanup` com o Bearer do usuário e `{ "office_id": "…", "operation_id": "…" }`. A função revalida a autoridade pelo banco e retorna o resultado da operação. O status autoritativo continua em `request_deletion_status`. Os detalhes de autorização, retomada e projeção esperada estão no [handoff da entrega anterior](ia2-para-ia1-integracao-final.md).

Pix, cartão, terminais e liquidação automática permanecem desativados. O banco reserva a identidade de provedor/escritório/ambiente e registra evidências idempotentes. O Express ainda precisa do contrato real do fornecedor e de uma identidade técnica aprovada para o ingresso qualificado. O webhook legado permanece fechado ao reconhecimento financeiro. Nenhuma evidência externa gera pagamento ou alocação sem o futuro contrato de conciliação oficial. Credenciais de provedor, webhook e terminais devem ser inseridas, pela pessoa autorizada, somente após contratação e homologação.

## Vercel e variáveis

O deploy de produção `dpl_J35nQwdMfizCch7WfD2Yrg4CYQj1` falhou porque o plano Hobby rejeitou `*/15 * * * *`. A branch usa `0 6 * * *` na rota autenticada `/api/payment-checkout/cron/reconcile`. A rotina existente faz manutenção de pendências, incluindo expiração, e não confirma pagamentos. A execução diária é aceitável para essa manutenção porque as RPCs críticas conferem o vencimento na hora da operação.

O GitHub acionou o preview `dpl_3cB54Ljr1YsNzB3nPy5Uo6XRBKZc` do commit `07a0d8f`. A Vercel marcou `READY` e o health protegido respondeu HTTP 200. No preview, a rota de manutenção retornou `503 / CRON_SECRET_UNCONFIGURED`, como esperado fora do ambiente que possui o segredo. As variáveis públicas dessa branch de preview apontam para um destino inerte de teste, isolando os dados reais. A prévia valida o build e a rota de saúde, enquanto os fluxos com dados são verificados localmente. A produção continua no alias anterior. [Build da prévia na Vercel](https://vercel.com/escritorio-jn/escritoriojn/3cB54Ljr1YsNzB3nPy5Uo6XRBKZc)

`CRON_SECRET` foi configurado como variável sensível da Vercel apenas para Production. O nome legado `PAYMENT_RECONCILIATION_CRON_SECRET` continua suportado como override pelo Express e não está cadastrado. Nenhuma variável específica de fornecedor foi inventada. A Edge usa as variáveis de runtime do Supabase e pode usar `REQUEST_DELETION_WORKER_SECRET` se houver retomada técnica configurada. A integração GitHub → Vercel permanece o caminho de publicação. [Limites oficiais de cron](https://vercel.com/docs/cron-jobs/usage-and-pricing#hobby-scheduling-limits)

## Testes e próximo aceite

A execução focada em PostgreSQL 17 reproduziu 91 migrations. A nova suíte verificou a primeira configuração, a conta em espécie e a bancária, erro de método incompatível, pagamentos parciais do proprietário e do administrador autorizado, os três canais, isolamento da cobrança do portal, bloqueio entre escritórios, replay, Caixa encerrado, leitura privada da conta e opções bancárias paginadas. O runner oficial em um replay passou com 2.336 verificações. Os 448 testes Node, oito cenários Playwright e o build passaram. O entrypoint da Edge passou no `deno check`.

Por orientação do responsável, a entrega usa o único Supabase existente e executa as fixtures de Auth, REST e Storage em laboratório local. O teste de exclusão verificou Auth e REST reais, os dois objetos no Storage, concorrência, preservação do compartilhado, falha parcial e retomada. A leitura de produção posterior à prévia confirmou 87 migrations, 5 solicitações, 2 cobranças e 2 objetos no Storage. A Edge precisa ser publicada após autorização de produção. A integração com o Express está na seção abaixo. Antes de promover, conferir o novo handoff da IA 1, confirmar o backup e o caminho de recuperação, comparar o histórico das quatro migrations incrementais com o projeto e executar a validação integrada. A publicação comercial de pagamentos exige também o fornecedor homologado.

## Ajustes de notificações, exclusão e documentos

- A migration `20261122204000_request_notification_and_document_context.sql` mantém `{ok:true}` em `notifications_read`, inclusive para notificações cujo atendimento foi removido. A API aceita a confirmação legada somente quando o ID coincide. O portal retorna à lista quando o detalhe deixa de existir e trata painéis opcionais indisponíveis sem invalidar a solicitação.
- O Express aciona `request-deletion-cleanup` na execução e na retomada, com o Bearer do solicitante. Ele lê o estado final em `request_deletion_status`. Se o worker falhar ou demorar, a interface oferece **Verificar situação da exclusão**. As regras de preservação e as garantias de idempotência vêm de `20261122185509_evolution_request_deletion_storage_first.sql`.
- `smart_request_context` retorna contexto somente para item documental autorizado e aceita que ainda não exista cobrança. `document_intake_open_from_request` serializa a abertura e devolve `{context, document}`, preservando o contrato de `/api/smart-documents/conference/start`. A página abre o documento vinculado diretamente em **Revisão**. Depois da decisão autorizada, abre **Texto** no mesmo editor. Validação de preenchimento, revisão independente e proteção de revisões publicadas continuam valendo.
- `request_detail` retorna `rural_workflow` e `specialized_workflow` para a equipe. A interface também exige as permissões de leitura já existentes. CCIR/CAR exige categoria específica ou serviço CCIR/CAR em categoria rural. Previdenciário e Jurídico usam suas categorias. Solicitações antigas sem categoria registrada usam o vínculo operacional configurado.
- A prévia GitHub → Vercel usa o Supabase inerte da branch. A ativação no único Supabase existente depende da janela de produção autorizada, da conferência do histórico, da aplicação das migrations pendentes e da publicação do worker com as variáveis de runtime. A validação local usa apenas dados fictícios.

A validação desta rodada reproduziu as 92 migrations em PostgreSQL 17. Passaram o teste de leitura da notificação, o fluxo SQL de documento contratado mesmo sem cobrança e a retomada no navegador. A suíte Node passou com 448 testes e o build local concluiu.
