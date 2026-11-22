# Entrega da IA 2 para a IA 1

**Estado em 22/11/2026** · Infraestrutura incremental verificada em laboratório descartável. A integração hospedada permanece pendente. Pix, cartão, liquidação automática e terminais permanecem desativados.

**Base** · `escritoriojnsistema/escritoriojn`, `main` no commit `5a07955a5faf841785c8e112694453642b3c95b1`, que contém a entrega e o handoff da IA 1. A branch `ia2/infra-integracao-verificada` parte dessa base e reaproveita correções revisadas da proposta `f48f87d2db184a1f5057b078aa280d6766eec777`. O Git identifica o commit da entrega.

## 1. Inventário e migrations

O conector confirmou o projeto Supabase `mcsuoxnubpqenyvbefee` como referência padrão da branch remota `main`, com PostgreSQL 17. A inspeção de catálogo encontrou 213 tabelas nos schemas público, privado e Storage, 926 funções públicas/privadas, 231 triggers não internos, 1.319 constraints, 765 índices, 29 políticas e dois buckets privados. O histórico remoto contém 87 migrations, com última versão `20261122121500`. As quatro migrations históricas da evolução (`20261122120000`, `20261122120500`, `20261122121000`, `20261122121500`) constavam como aplicadas e conservam o SQL do Git. A branch anterior as editava retroativamente. Esta entrega incorpora os ajustes por migrations novas.

| Migration | Alterações |
| --- | --- |
| `20261122185507_evolution_permissions_approvals.sql` | Allowlist de permissões, paginação unificada de notificações, hash dos pedidos de aprovação e proteções de solicitação, decisão e execução. |
| `20261122185509_evolution_request_deletion_storage_first.sql` | Reserva transacional, proteção do grafo de solicitações/itens/arquivos, lease do worker, remoção após Storage, evento empresarial e aviso persistente. |
| `20261122185511_evolution_checkout_fail_closed.sql` | Gate de verificação do adaptador, snapshot da conexão/destino, registro qualificado de evidências, deduplicação, transições e binding da resposta do provedor. |

**Ambientes** · As três migrations foram destinadas exclusivamente ao laboratório PostgreSQL 17. O Supabase hospedado foi inspecionado em leitura. O catálogo hospedado retornou zero provedores, intenções, autorizações financeiras e eventos bancários, além de zero operações de exclusão. Foram observados dois objetos no Storage. Nenhum objeto, bucket, dado, segredo ou schema hospedado foi alterado nesta entrega.

## 2. Tabelas, políticas e funções

A entrega altera `private.request_deletion_operations`, `private.financial_approvals`, `private.payment_providers`, `private.payment_checkout_intents` e `private.payment_webhook_events`. Reutiliza `private.internal_notifications`, `public.audit_events`, os vínculos atuais do cliente, os catálogos de permissões e o financeiro oficial. A exclusão consulta as dependências reais, incluindo o grafo de FKs de `requests`, `request_items` e arquivos.

As tabelas privadas conservam RLS e ACL fechadas. As RPCs de usuário mantêm wrappers públicos `SECURITY INVOKER` e revalidam sessão, escritório, vínculo, capacidade e escopo conforme a operação. O catálogo de funções conserva o isolamento das operações técnicas. Nenhuma policy abre o acesso direto a anexos, notificações, aprovações ou credenciais. A função existente das políticas do bucket privado rejeita acesso a anexos com exclusão reservada. O Advisor hospedado retornou informações de RLS sem policy em tabelas fechadas e um aviso preexistente sobre verificação de senhas vazadas.

| Área | Contratos do banco |
| --- | --- |
| Exclusão | `request_deletion_eligibility`, `request_delete_permanently`, `request_deletion_status`; nova `request_deletion_cleanup_authorize` para a Edge Function. `request_deletion_claim_cleanup` e `request_deletion_complete_cleanup` continuam restritas ao worker com a identidade já suportada pelo Supabase. |
| Avisos | `notifications_page`, `notifications_summary`, `notifications_read`. `request_deleted` tem `request_id = null`, `deleted_protocol` e `can_open = false`. |
| Autorizações | `financial_approval_eligible_approvers`, `financial_approvals_page`, `financial_approval_request_manual_payment`, `financial_approval_request_discount`, `financial_approval_decide` e `financial_approval_execute_manual_payment`. |
| Checkout | `client_payment_checkout_summary`, `payment_checkout_create_intent`, `payment_checkout_intent_status`, `staff_payment_generate_pix`, `staff_payment_start_terminal`. |
| Configuração | `payment_providers_state`, `payment_provider_save`, `payment_provider_validate`, `payment_pix_settings_save`, `payment_online_cards_save`, `payment_terminal_save`, `payment_terminal_test`, `payment_terminal_deactivate`. |
| Automação bancária | `payment_maintenance_sweep` conserva o contrato de expiração. `payment_webhook_record` e `private.payment_checkout_bind_provider` estão disponíveis para revisão e posterior provisionamento da identidade técnica do adaptador. `payment_webhook_ingest`, legado, retorna `PT503 / PROVIDER_UNAVAILABLE`. |

## 3. Exclusão e Storage

O SQL valida a versão e o status esperados sob lock do escritório e da solicitação. Para anexos, grava a intenção e conserva solicitação, metadados e referências até a limpeza. A pré-validação executa a limpeza SQL em subtransação sempre revertida quando há Storage a processar. A reserva bloqueia alterações incompatíveis e referências novas. O worker reivindica um lease, usa a API oficial do Supabase Storage e reporta cada remoção. A conclusão confere a ausência de cada objeto em `storage.objects` antes da transação final. A operação conserva a fila restante em falha parcial. Uma conclusão repetida devolve o mesmo resultado.

Arquivos compartilhados ou retidos bloqueiam a exclusão. A FK obrigatória de `public.files` ainda exige sua solicitação de origem, portanto a ação apresenta o motivo ao usuário e conserva o pedido e o arquivo. A desvinculação de um arquivo compartilhado precisaria de uma solução própria para preservar o histórico de guarda. Cobranças, alocações, reembolsos, estornos, documentos, entregas e obrigações aplicáveis também bloqueiam. A lista explícita e a pré-validação tratam dependências adicionais com falha segura.

Após a conclusão da equipe, o evento `requests.deleted` contém ator, escritório, momento, protocolo, categoria quando cadastrada e status anterior. O identificador da operação serve de referência independente. O aviso ao cliente persiste sem FK para a solicitação. A exclusão do cliente conserva somente o registro técnico necessário ao replay, com protocolo e estado mínimo. Os detalhes do job e sua lista de caminhos são descartados ao concluir. O prazo de retenção do histórico técnico e a política jurídica de guarda ainda precisam ser fechados antes da liberação hospedada.

### Ajuste da IA 1 para acionar o worker

O router de exclusão atual registra e consulta a intenção. Quando receber `processing` ou retomar um erro técnico, o Express deve chamar `POST /functions/v1/request-deletion-cleanup` com o Bearer original do usuário e JSON `{ "office_id": "…", "operation_id": "…" }`. A função revalida no banco a autoridade sobre a operação e usa sua própria credencial do runtime para a API do Storage. A UI deve continuar consultando a RPC de status com a chave original. Uma resposta HTTP 200 do worker pode conter uma operação em falha e a conclusão exige que ambas as confirmações sejam verdadeiras.

O teste de laboratório acionou o mesmo handler com Auth, PostgREST e Storage locais. Testou referência compartilhada, acesso por outro usuário, duas solicitações concorrentes com a mesma chave, visibilidade privada, falha simulada na segunda remoção com remoção real da primeira e retomada com verificação dos dois objetos e dos metadados. A implantação Edge hospedada não constava no inventário.

## 4. Autorizações e financeiro oficial

As quatro capacidades existentes da evolução são `requests.delete`, `payments.manual.approve`, `charges.discount.approve` e `payments.providers.manage`. A gestão oficial pode agora concedê-las explicitamente. As concessões de papel continuam reservadas ao proprietário. Cobrança operada pela equipe exige `charges.read`, `cash.open` e escopo operacional. Configuração exige administração e a capacidade de gestão de provedores.

A autorização associa solicitante, aprovador, escritório, cobrança e versão, operação, valores, vencimento e decisão. Replay com conteúdo divergente dá conflito. A revogação dos grants invalida autorizações abertas com perda efetiva da capacidade. As RPCs históricas de pagamento e abatimento direto também exigem a autoridade correspondente. O recebimento manual usa método, destino, sessão e valor aprovados, com o mecanismo oficial de Caixa e a referência do pagamento executado. O desconto aprovado modifica a versão da cobrança e reduz primeiro as últimas parcelas, preservando as datas e a numeração. Taxas do cartão ficam no financeiro e não reduzem a dívida nominal do cliente. A expiração bloqueia imediatamente as RPCs de decisão e execução. O sweep pode materializar o estado expirado quando acionado.

O portal usa `finance_client_request` e o vínculo verificado existente. O teste cria a cobrança após a solicitação e confirma sua presença em `cash_client_finance` e no checkout, com saldo oficial mesmo sem provedor. O teste também confirma barreira para quem está fora do escopo. Nenhuma política do portal foi relaxada.

## 5. Provedores, pagamentos e conciliação

A seleção do provedor, conta, ambiente e versão ficam restritos ao escritório. A validação feita na tela confirma a configuração local. Apenas uma verificação real do adaptador vinculada à versão, à conta externa e à conta financeira ativa habilita o checkout. Produção exige também homologação. A intenção congela as referências de conexão e destino para impedir que uma troca de configuração confirme uma intenção anterior. A referência de credencial aceita alias de cofre ou nome de variável. OAuth, tokenização, certificados, renovação e sigilo ficam no runtime e no cofre do provedor escolhido.

O adaptador deve autenticar o protocolo nativo sobre a requisição, validar destinatário e ambiente e passar o envelope normalizado de `payment_webhook_record` com `p_office_id`, `p_provider_id`, `p_environment`, `p_receiver`, `p_event_id`, `p_intent_reference`, `p_transaction_reference`, `p_event_type`, `p_amount_cents`, `p_currency`, `p_occurred_at` e `p_payload_sha256`. O banco guarda referências, valor, horário e hash. A mesma chave e evento são idempotentes. Conteúdo alterado gera conflito. Valor parcial, excedente, pagamento tardio, divergência de transação, estorno ou contestação são evidência para análise. Uma autorização de cartão pode produzir `processing / authorized`. Captura e liquidação têm estados distintos. Transições atrasadas não rebaixam captura ou liquidação.

A evidência válida pode gerar `pending_reconciliation`. Nenhum webhook grava pagamento, alocação, reembolso, recibo ou sessão de Caixa. Isso evita duplicação com uma confirmação manual enquanto o reconhecimento eletrônico comercial ainda depende de contrato de conciliação autorizado. Em homologação, definir o identificador canônico da transação nas duas entradas, vincular ao pagamento oficial existente ou lançar pelo caminho aprovado sob lock, e validar tarifas, estorno, devolução, liquidação e saldo.

Para maquininhas, a estrutura conserva o escritório, unidade, provedor e terminal. A autorização de cobrança é individual e requer disponibilidade recente confirmada pelo conector. O teste da tela falha de forma segura sem conector. A escolha de fabricante define API, SDK, TEF ou agente local autenticado, com credencial por dispositivo. O contrato comercial deverá especificar autenticação, rotação, comandos idempotentes e confirmação após timeout. O projeto guarda somente referências de provedor. Cartão, CVV, PIN e trilha não fazem parte do contrato de persistência.

### Ajustes da IA 1 para ativação futura

- Na exclusão, ligar o worker ao resultado do comando e exibir a falha ou retomada mantendo a mesma chave. Exibir o motivo para anexo compartilhado a partir de `block_message`. O protocolo do aviso abre o fluxo oficial de nova solicitação.
- Em Bancos e Pagamentos, tratar `configured` como configuração local. O teste de terminal sem conector retorna `PT422 / PROVIDER_VALIDATION`.
- No checkout, usar `available` quando houver método real e `PROVIDER_NOT_CONFIGURED` quando estiver indisponível. Mostrar `pending_reconciliation` como evidência em análise, preservando saldo, pagamento e taxa oficiais.
- Implementar o adaptador após selecionar fornecedor. Substituir no Express a chamada ao webhook legado pelo contrato qualificado, com identidade técnica dedicada e escopo auditável para o escritório. Implementar a emissão autoritativa com `private.payment_checkout_bind_provider` e a reconciliação com o financeiro oficial. O adaptador deve verificar a origem e aplicar allowlist do domínio para checkout hospedado. A API genérica existente não provê essas garantias comerciais por si.
- Preservar `executed_payment_id` na projeção de aprovação manual. No fluxo legado, confirmação direta sem permissão retorna `PT403 / CASH_FORBIDDEN` e desconto direto sem permissão retorna `PT403 / CHARGES_FORBIDDEN`. Ajustar o botão de confirmação de recebimento pendente conforme o mesmo gate. Confirmar no teste integrado da IA 1 o DTO, a lista de motivos de bloqueio e a renderização da auditoria mínima.

## 6. Vercel, variáveis e publicação

O domínio [escritoriojn.vercel.app](https://escritoriojn.vercel.app) respondeu com HTTP 200 e `no-store` no health check. O alias aponta para `dpl_HZpkBBct6UTyehPruC9VMnAHqa6E`, estado `READY`, commit `bd96d05a509db9a97ae410a4a269f763282460a9`, origem Git. A tentativa de produção do commit `5a07955` (`dpl_J35nQwdMfizCch7WfD2Yrg4CYQj1`) falhou porque Hobby aceita cron diário. A prévia de `f48f87d` também constava em erro. A configuração desta branch muda o cron para uma execução diária às 06:00 UTC e preserva o Vite, o entrypoint Express, os rewrites, os cabeçalhos e o limite configurado de 120 s. O cron usa a rota segura existente e depende do Bearer configurado. A rotina expira pendências e não executa conciliação bancária.

A inspeção de metadados da Vercel mostrou `VITE_SUPABASE_URL` e `VITE_SUPABASE_PUBLISHABLE_KEY` compartilhados entre Preview e Production, e `SUPABASE_SERVICE_ROLE_KEY` somente em Production. O Supabase mostra apenas a branch remota padrão. A branch desta entrega foi testada localmente. Antes de uma prévia hospedada, associar Preview a um Supabase isolado com fixtures próprias. Não houve deploy, merge, alteração de alias ou cadastro de segredo.

| Escopo | Variáveis e valores esperados |
| --- | --- |
| Vercel, públicas | `VITE_SUPABASE_URL` e `VITE_SUPABASE_PUBLISHABLE_KEY`, cada ambiente apontando para sua instância autorizada. |
| Supabase Edge | `SUPABASE_URL`, `SUPABASE_ANON_KEY` e `SUPABASE_SERVICE_ROLE_KEY`, injetadas pelo runtime. `REQUEST_DELETION_WORKER_SECRET` somente para a identidade técnica de retomada, se configurada. |
| Vercel, servidor | `CRON_SECRET` para o Bearer automático da Vercel. Quando `PAYMENT_RECONCILIATION_CRON_SECRET` também existir, o Express consulta esse nome primeiro, então os valores devem corresponder. |
| Provedor futuro, servidor | Referências documentadas em `.env.example` para HMAC, Pix, cartão e terminais são reservadas. Os nomes e a forma real de guardar OAuth, certificados mTLS e tokens dependem do provedor. |

## 7. Testes, recuperação e checklist de entrada em homologação

- Laboratório PostgreSQL 17 com migrador sem superusuário e sem BYPASSRLS. `tests/database/evolution.sql` cobre 14 grupos, incluindo RBAC oficial, isolamento, exclusão, autorização manual, expiração, rejeição, desconto, parcelas, vínculo tardio de cobrança, ausência de provedor, idempotência e estágios de evidência. O runner `JN_DB_SINGLE_REPLAY=1 npm run test:db` passou com 2.335 verificações. O fluxo documental da Etapa 26 também passou quando o caixa autorizado à tarefa usou a aprovação pontual. O replay focado aplicou as 90 migrations.
- `node --import tsx scripts/test-request-deletion-storage-real.mjs` usa o laboratório Docker Auth/PostgREST/Storage. Se necessário, o laboratório suporta a montagem local da imagem de Storage extraída em `AUTH_LAB_STORAGE_ROOTFS`. Os testes de webhook e UI usam dados separados e fictícios. Nenhum teste representa homologação bancária.
- Build e health check local passaram. Os 448 testes Node e os oito cenários Playwright da evolução passaram. O audit de dependências de produção retornou zero ocorrências.
- Um dump lógico descartável foi restaurado em outro banco local e reproduziu schema, uma fixture, RLS e ACL. Restauração de produção e guarda externa da Etapa 36 seguem pendentes de validação pelo responsável. Antes de aplicar em ambiente hospedado, confirmar snapshot do banco, recuperação independente do Storage, custódia e teste de restauração em ambiente isolado. Em caso de regressão, desligar as operações de entrada, preservar o diário de exclusão e a evidência bancária e corrigir com migration incremental. Rollback do código mantém o schema e os registros novos.
- Sequência para homologação. Preparar banco isolado e confirmar sua referência. Reproduzir as migrations, configurar e testar a Edge Function. Ligar o worker e a consulta de status da IA 1. Testar a API e o fluxo físico na prévia protegida. Definir políticas de retenção e comprovar recuperação. Solicitar o aceite de publicação, confirmar o commit, conferir o histórico para evitar reaplicação automática e usar exclusivamente GitHub → Vercel.
- Sequência comercial independente. Selecionar fornecedor, obter credenciais válidas no sandbox, implantar adaptador e identidade dedicada, testar evento nativo autenticado com conta e valor corretos, cartões, terminais, concorrência, reversões e reconciliação oficial. Habilitar produção apenas após comprovação da homologação.

Permanecem pendentes os testes do Express chamando o worker na prévia, os callbacks reais, a conciliação por transação externa com pagamento manual simultâneo e a recuperação hospedada. Essas dependências impedem declarar conclusão da operação comercial.

[Handoff da IA 1](ia1-para-ia2-supabase-vercel.md) · [Regras financeiras](../regras/financeiro.md) · [Contratos de integração](../backlog/integracoes/contratos.md) · [Continuidade](../etapas/continuidade-36.md)
