# IA 2 → IA 1 — Integração final de Supabase, banco, segurança e infraestrutura

Data: 22/11/2026 · Branch de entrega: `ia2-evolution-supabase` · Base: `main`
Escopo desta entrega: `supabase/migrations/**`, `supabase/functions/**`, `tests/database/evolution.sql`, `scripts/test-database.mjs` (fixture do runner) e esta documentação. Nenhum arquivo de `src/`, `shared/` ou `server/` foi alterado.

> Leia primeiro a seção 17 (status de homologação). **Não existe Pix nem cartão homologado**: não há instituição contratada, credenciais ou sandbox autorizado nesta execução.

---

## 1. Migrations criadas

Quatro migrations novas, todas idempotentes em banco migrado e reproduzíveis do zero:

| Arquivo | Conteúdo |
| --- | --- |
| `20261122120000_evolution_rbac_and_notifications.sql` | 4 permissões novas, reconstrução dos allowlists de `private.team_member_permissions`, notificações de exclusão/aprovação e `notifications_page` com paginação real |
| `20261122120500_request_deletion_permanent.sql` | tabela de operações, elegibilidade, exclusão definitiva em duas fases, claim/complete da limpeza de Storage, guards de imutabilidade |
| `20261122121000_financial_approvals_workflow.sql` | autorizações financeiras (pagamento manual e desconto), decisão, execução, revogação |
| `20261122121500_payment_providers_and_checkout.sql` | provedores multiprovedor, Pix, cartão online, terminais, intenções, webhooks, varredura de manutenção |

Não há migration corretiva: os defeitos encontrados foram corrigidos no próprio arquivo, porque nenhuma delas foi aplicada em ambiente hospedado ainda.

## 2. Migrations aplicadas e ambientes

| Ambiente | Situação |
| --- | --- |
| PostgreSQL 18 descartável local (bootstrap `tests/database/bootstrap.sql` + 87 migrations) | **Aplicadas e verificadas** — replay completo sem erro de DDL |
| Supabase hospedado `mcsuoxnubpqenyvbefee` | **Não aplicadas**. Este ambiente não tem painel nem credenciais do projeto. O identificador não pôde ser reconfirmado; considere-o *não confirmado* até alguém com acesso ao painel validar |
| Vercel | Nada publicado nesta execução (seção 14) |

Ordem de aplicação no hospedado: exatamente a ordem dos nomes, depois de conferir que as 83 migrations anteriores já constam no histórico remoto. Aplicar em projeto de homologação antes da produção.

## 3. Tabelas novas ou modificadas

Novas (todas em `private`, RLS habilitado, sem `GRANT` para `authenticated`/`service_role`, acesso só por RPC `SECURITY DEFINER`):

- `private.request_deletion_operations`
- `private.financial_approvals`
- `private.payment_providers`
- `private.payment_pix_settings`
- `private.payment_online_card_settings`
- `private.payment_terminals`
- `private.payment_checkout_intents`
- `private.payment_webhook_events`
- `private.payment_provider_commands`

Modificadas: `public.permissions` e `public.role_permissions` (4 permissões novas, só no `owner`), `private.team_member_permissions` (constraints de allowlist), `private.internal_notifications` (uso de `deleted_protocol` com `request_id` nulo), guards `private.request_immutable`, `private.templates_immutable20`, `private.category_intake_snapshot_guard`.

Não foram criadas tabelas equivalentes a `requests`, `files`, `charges`, `payments`, `payment_allocations`, `cash_sessions` etc.: o financeiro existente continua sendo a fonte oficial.

## 4. Funções/RPCs disponíveis (schema `public`)

Exclusão:
`request_deletion_eligibility(p_office_id, p_request_id)` · `request_delete_permanently(p_office_id, p_request_id, p_expected_version, p_expected_status, p_idempotency_key, p_confirmation_ack, p_client_verification_token)` · `request_deletion_status(p_office_id, p_request_id, p_idempotency_key)` · `request_deletion_claim_cleanup(p_office_id, p_limit)` (service role) · `request_deletion_complete_cleanup(p_operation_id, p_deleted_file_ids, p_failed_count, p_error)` (service role).

Autorizações:
`financial_approval_request_manual_payment` · `financial_approval_request_discount` · `financial_approval_decide` · `financial_approval_execute_manual_payment` · `financial_approvals_page` · `financial_approval_eligible_approvers`.

Provedores e checkout:
`payment_providers_state` · `payment_provider_save` · `payment_provider_validate` · `payment_pix_settings_save` · `payment_online_cards_save` · `payment_terminal_save` · `payment_terminal_test` · `payment_terminal_deactivate` · `client_payment_checkout_summary` · `payment_checkout_create_intent` · `payment_checkout_intent_status` · `staff_payment_generate_pix` · `staff_payment_start_terminal` · `payment_operate` · `payment_receipt` · `payment_webhook_ingest` (service role) · `payment_maintenance_sweep` (service role).

Os nomes e os parâmetros posicionais/`:nome` usados por `server/modules/*` foram conferidos e batem com o banco.

## 5. Políticas RLS

- Tabelas novas: `ROW LEVEL SECURITY` habilitado e **nenhuma policy**, porque nenhum papel de cliente/equipe recebe `SELECT`/`INSERT` no schema `private`. O acesso é exclusivamente por RPC `SECURITY DEFINER` que valida escritório, vínculo, permissão efetiva e escopo da solicitação.
- `authenticated` e `service_role` não têm `SELECT` em nenhuma das 9 tabelas (verificado por catálogo).
- Os wrappers `public.*` continuam `SECURITY INVOKER`; a autorização real fica na função `private` correspondente.
- `payment_webhook_ingest` e `payment_maintenance_sweep` têm `EXECUTE` revogado de `authenticated`/`anon` — só `service_role` (o Express as chama com a chave de serviço). Chamadas por usuário retornam `42501`.
- Consultas de checkout/estado de intenção passaram a exigir escopo da solicitação também para a equipe (antes bastava `charges.read`, o que permitia ler cobrança de outro atendimento dentro do mesmo escritório).

## 6. Contratos efetivamente atendidos

- `shared/requestDeletion.ts`: `RequestDeletionEligibility` (todos os campos), `DeletionBlockReason` (todos os valores usados existem no tipo), `RequestDeletionResult` (`status`, `db_deleted`, `storage_cleanup_completed`, `attachments_removed`, `attachments_preserved`, `audit_recorded`, `client_notified`, `idempotent_replay`).
- `shared/paymentCheckout.ts`: `clientPaymentStates` incluindo `available` e `pending_reconciliation`; resumo do checkout com `payment_state` válido para o backend Express (que descarta valores fora da lista).
- `shared/notifications.ts`: notificação de exclusão com `can_open: false`, `request_id: null`, `deleted_protocol` preenchido.
- `shared/financialApprovals.ts` (via `financial_approval_json`): `pending|approved|rejected|expired|revoked|executed`, `can_execute`, valores original/solicitado/final.

## 7. Contratos que exigem ajuste da IA 1

1. **`DeletionBlockReason` sem motivo para anexo compartilhado.** O banco devolve `STATUS_NOT_ELIGIBLE` com `block_message` específico ("…possui anexos compartilhados ou usados por outro registro…"). Sugestão: incluir `SHARED_ATTACHMENT` em `shared/requestDeletion.ts` e mapear a mensagem; hoje a UI mostra a mensagem, mas o código do motivo é genérico.
2. **`payment_state: 'available'`.** O valor `'ready_to_pay'` que existia no SQL não pertence a `clientPaymentStates`; foi corrigido no banco. Se algum componente/teste da IA 1 esperava `'ready_to_pay'`, precisa acompanhar.
3. **Confirmação de provedor não vira recebimento.** O webhook deixa a intenção em `pending_reconciliation` (com `settlement_stage` relatado pelo provedor) e **não** cria `payments`/`payment_allocations`, porque isso exigiria sessão de caixa fictícia. A tela precisa exibir "pagamento confirmado pelo provedor, aguardando conciliação" e o Caixa precisa de uma ação de conciliação autorizada (hoje: confirmação manual com autorização).
4. **`financial_approval_json` não devolve `executed_payment_id`.** Se o frontend precisa abrir o recibo após executar, informe o campo desejado para eu expor no RPC.

## 8. Infraestrutura de exclusão

Fluxo em duas fases, sem `ON DELETE CASCADE` indiscriminado:

1. `request_deletion_eligibility` valida identidade, escritório, vínculo do cliente, responsável, status, classificação do atendimento, permissões efetivas, versão e dependências.
2. `request_delete_permanently` revalida tudo dentro de transação e grava a operação idempotente (`idempotency_key` única por escritório).
3. Se houver anexo exclusivo, a resposta é `processing` com `storage_objects_to_delete`; o backend chama a Edge Function `request-deletion-cleanup`, que remove os objetos pela API oficial do Storage.
4. `request_deletion_complete_cleanup` confirma a limpeza e conclui; falha parcial deixa `storage_cleanup_failed` com retomada (claim expira e volta à fila).
5. Nenhuma escrita em `storage.objects` por SQL.

Dependências preservadas bloqueiam a exclusão (financeiro, reembolsos, documentos formalizados, entregas, retenção, arquivos compartilhados, casos rurais/DITR/especializados, correções de conta). `public.requests` tem 34 FKs; a limpeza cobre as tabelas operacionais exclusivas (histórico, atribuições, checklists, referências de arquivo, uploads, pré-atendimentos, comandos do portal, categorias da solicitação) e depois a própria solicitação.

Exclusão pelo cliente: sem evento em `public.audit_events` e sem notificação. Exclusão pela equipe: evento `requests.deleted` com dados mínimos (protocolo, escritório, ator, status anterior) e notificação sem vínculo com a solicitação apagada.

## 9. Resultado dos testes de Storage

Executados contra o banco local com arquivos fictícios:

- Anexo exclusivo: `processing` → claim (`service_role`) → `complete_cleanup` → `completed`, `attachments_removed = 1`, solicitação ausente do banco.
- Repetição da mesma exclusão: `idempotent_replay = true`, sem segunda remoção.
- Anexo compartilhado (`private.file_references`): bloqueado com mensagem explicativa.
- Anexo com `legal_hold`: bloqueado (`LEGAL_RETENTION`).
- A remoção física do objeto no bucket **não** foi testada: a Edge Function fala com a API do Supabase Storage e este ambiente não tem projeto hospedado nem bucket. Falta validar em homologação.

## 10. Infraestrutura de auditoria e notificações

- Auditoria: `private.emit_business_event(..., 'requests.deleted', ...)`, somente para equipe; o payload não tem anexos, conteúdo ou cópia da solicitação.
- Notificações: `private.internal_notifications` com `kind = 'request_deleted'`, `request_id NULL`, `deleted_protocol`, destinatário = vínculo do cliente. A página (`notifications_page`) devolve `can_open: false` e agrupa as páginas legadas com `OFFSET` correto (bug de paginação corrigido nesta entrega).

## 11. Estrutura de autorizações

`private.financial_approvals` guarda escritório, tipo (`manual_payment`/`discount`), solicitação, cobrança, solicitante, aprovador escolhido, valores original/solicitado/final, forma de pagamento, justificativa, versão da cobrança, criação, expiração, status, decisão, momento e referência da operação executada.

Regras verificadas: aprovador precisa de permissão efetiva (`payments.manual.approve` / `charges.discount.approve`), ser o destinatário, dentro do prazo, com status `pending`, cobrança inalterada e **não pode ser o próprio solicitante**; decisão idempotente; duas decisões concorrentes não se sobrepõem (`FOR UPDATE`); qualquer `charge_event` novo revoga autorizações pendentes; mudança de vínculo/permissão do aprovador também revoga; execução grava pagamento + alocação uma única vez (`409` na repetição).

## 12. Estrutura de pagamentos

`payment_providers` (por escritório, `environment`, métodos, conta/unidade de destino, `credential_ref` — só referência, nunca segredo), `payment_pix_settings`, `payment_online_card_settings`, `payment_terminals`, `payment_checkout_intents` (intenção), `payment_webhook_events` (evento bruto autenticado, `event_id` único por provedor), `payment_provider_commands` (comandos/adaptação).

O financeiro oficial continua em `charges` / `charge_events` / `charge_installments` / `payments` / `payment_allocations` / `payment_reversals` / `payment_refunds` / `cash_sessions`.

## 13. Interfaces de provedores

- `provider_code` é o adaptador (`generic_psp_pix_card`, `generic_pix_bank`, `generic_acquirer_terminal`); o backend Express implementa o HTTP; o banco guarda estado, idempotência e conciliação.
- Webhook: HMAC por provedor (`PAYMENT_WEBHOOK_HMAC_SECRET_*`), verificação sobre o corpo bruto, anti-replay, `event_id` estável, validação de ambiente, referência da intenção, **valor em centavos** (divergência → `amount_mismatch`, nada muda), moeda e conciliação.
- Cartão: apenas intenção/autorização/captura/estorno; nenhum dado de cartão, CVV, PIN ou trilha é armazenado — a tokenização fica no provedor.
- Terminais: cadastro por escritório/unidade/fabricante/modelo/provedor/tipo de integração; teste de disponibilidade; sem acesso direto a USB/Bluetooth/rede local pelo navegador (o contrato é o conector local autenticado, `TERMINAL_LOCAL_AGENT_SHARED_SECRET`).

## 14. Configurações da Vercel

`vercel.json` preservado (rewrites `/api`, `maxDuration: 120`, cron `*/15 * * * *` para `/api/cron/reconcile`, headers `no-store`). Nada foi publicado. Para publicar: confirmar commit/branch, aplicar as migrations em homologação, configurar as variáveis da seção 15, rodar `npm run build` e `npm run test:db` em ambiente com Docker, e só então promover.

## 15. Variáveis de ambiente requeridas

Obrigatórias hoje: `VITE_SUPABASE_URL`, `VITE_SUPABASE_PUBLISHABLE_KEY`, `SUPABASE_SERVICE_ROLE_KEY`, `PAYMENT_RECONCILIATION_CRON_SECRET`.

Por provedor (só quando contratado): `PAYMENT_WEBHOOK_HMAC_SECRET_GENERIC_PSP_PIX_CARD`, `PAYMENT_WEBHOOK_HMAC_SECRET_GENERIC_PIX_BANK`, `PAYMENT_WEBHOOK_HMAC_SECRET_GENERIC_ACQUIRER_TERMINAL`, `PIX_PROVIDER_BASE_URL`, `PIX_PROVIDER_CLIENT_ID`, `PIX_PROVIDER_CLIENT_SECRET`, `CARD_PROVIDER_BASE_URL`, `CARD_PROVIDER_API_KEY`, `TERMINAL_LOCAL_AGENT_SHARED_SECRET`.

Regras: nada de segredo em variável `VITE_*`; certificados/segredos ficam no cofre da Vercel/Supabase e no banco só a referência (`credential_ref`); função de funcionário não lê credencial nem com acesso ao Caixa.

## 16. Recursos habilitados e desabilitados

Habilitados: exclusão definitiva em duas fases, autorizações financeiras, cadastro/validação de provedores, Pix (criação de intenção e ingestão autenticada de evento), cartão (intenção), terminais (cadastro/teste), conciliação pendente e varredura de manutenção.

Desabilitados por falta de provedor/credencial: cobrança Pix real, cobrança de cartão real, operação de terminal real, liquidação e conciliação automática. Com provedor não configurado, o checkout responde `provider_unconfigured`/`PROVIDER_NOT_CONFIGURED` — comportamento esperado.

## 17. Status de homologação

- Banco e contratos: verificados (replay + suíte automatizada).
- Pix: **não homologado** — nenhuma instituição contratada, nenhum sandbox autorizado, nenhuma transação real executada.
- Cartão: **não homologado**, mesma razão.
- Terminais: **não homologado** — fabricante/modelo não escolhidos.
- Storage físico: **não verificado** (sem projeto hospedado).
- Nada nesta entrega autoriza dizer que o Escritório JN recebe Pix ou cartão.

## 18. Pendências de escolha de fornecedor

Definir PSP/banco para Pix (API + webhook + certificado/mTLS quando exigido), credenciadora para cartão (tokenização/formulário hospedado) e fabricante/modelo das maquininhas (nuvem, SDK, TEF ou agente local). Só depois preencher `payment_providers`, segredos e homologar com `payment_provider_validate` + eventos reais de sandbox.

## 19. Limitações de operação comercial

- Confirmação de webhook não lança recebimento no financeiro: fica `pending_reconciliation` até conciliação autorizada. Não abrimos sessão de caixa fictícia.
- Sem provedor, não há QR Code, captura ou liquidação.
- A Edge Function de limpeza depende de `SUPABASE_URL`/`SUPABASE_SERVICE_ROLE_KEY` no runtime das Functions.
- Taxas de cartão são custo financeiro, não desconto ao cliente.

## 20. Checklist para integração final (IA 1)

1. Confirmar `mcsuoxnubpqenyvbefee` no painel e aplicar as 4 migrations em homologação.
2. Rodar `npm run test:db` (Docker) — a suíte `tests/database/evolution.sql` já está ligada ao runner e cobre EVO-01…EVO-12.
3. Ajustar os contratos da seção 7 (`SHARED_ATTACHMENT`, `available`, `pending_reconciliation`, `executed_payment_id`).
4. Exibir `pending_reconciliation` no checkout e criar a ação de conciliação no Caixa.
5. Configurar as variáveis da seção 15 na Vercel (preview antes de produção).
6. Publicar a Edge Function `request-deletion-cleanup` e testar um anexo real em homologação.
7. Manter Pix/cartão/terminal desativados até haver provedor, credenciais e homologação registrada.

---

## Anexo — defeitos encontrados e corrigidos nesta entrega

1. `private.team_member_permissions` rejeitava as 4 permissões novas (violação de CHECK, `23514`).
2. `block_reason` fora do contrato `DeletionBlockReason` da IA 1: cliente ficaria sem motivo na UI.
3. Bloqueio de anexo compartilhado/retido retornava erro de FK (`23001`) em vez de recusa explicada.
4. Mensagem específica do bloqueio era sobrescrita pela mensagem genérica de `STATUS_NOT_ELIGIBLE`.
5. `public.requests` com 34 FKs: exclusão falhava em `private.request_categories`; faltava limpeza de dependências exclusivas e a função de dependências preservadas.
6. Guards de imutabilidade não reconheciam a exclusão autorizada (token `jn.request_deletion_id`).
7. Variável PL/pgSQL `r` colidia com o alias `r` da consulta em `financial_approval_*` (`42702`).
8. Escopo da solicitação ausente nas RPCs de aprovação e de cobrança da equipe (vazamento dentro do escritório).
9. `payment_state = 'ready_to_pay'` não pertencia ao contrato compartilhado; passou a `available`.
10. Webhook aceitava valor divergente e marcava `confirmed/settled` sem lançamento no financeiro; agora valida valor e usa `pending_reconciliation`.
11. `notifications_page` ignorava `OFFSET` nas páginas legadas (notificações repetidas/ausentes).

## Anexo — verificação executada

- Replay completo: `tests/database/bootstrap.sql` + 87 migrations em PostgreSQL 18 descartável → **ALL MIGRATIONS APPLIED (87)**, sem erro.
- `tests/database/evolution.sql`: **12 asserções (EVO-01…EVO-12)** aprovadas na mesma base, em transação com `ROLLBACK` para não contaminar outras suítes.
- Verificações ad hoc adicionais (scripts fora do repositório): exclusão por cliente/equipe com notificação e auditoria, exclusão com anexo exclusivo em duas fases, claim/conclusão por `service_role`, replay idempotente, bloqueio por arquivo compartilhado e por retenção, aprovação manual completa (pagamento + alocação única, saldo zero, dupla execução `409`, revogação por evento de cobrança, pedido fora de escopo `404`), provedor (permissão, validação, Pix settings, terminal), checkout (resumo, intenção, cobrança de outro cliente `404`), webhook (`42501` para `authenticated`, evento válido, duplicata, valor divergente, referência desconhecida, ausência de alocação automática).
- `npx tsc --noEmit`: sem erros.
- `npm test`: 437 aprovados, 11 falhas — **todas** por ausência do binário `pdftotext` (poppler) neste ambiente, em testes de PDF (`tests/finance19-api.test.ts`, `tests/document-preview22.test.ts`, relatórios). Nenhuma falha relacionada a SQL ou a esta entrega.
- `npm run test:db` oficial **não executado**: sem Docker neste ambiente (`/var/run/docker.sock` sem permissão). A suíte foi validada com PostgreSQL real equivalente e ligada ao runner para rodar no CI/ambiente com Docker.
