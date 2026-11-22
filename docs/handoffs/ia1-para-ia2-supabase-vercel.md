# Documento de Passagem Técnica — IA 1 para IA 2 (Supabase + Vercel)

**Projeto**: Escritório JN  
**Escopo entregue pela IA 1**: Evolução completa de Frontend (React + TypeScript), Backend Express (TypeScript), contratos compartilhados (`shared/`), regras de domínio puras, validações de entrada/saída, gates fail-closed e testes automatizados das Etapas 1 a 6.  
**Escopo exclusivo reservado para a IA 2**: Migrations SQL no Supabase, tabelas/colunas/índices/constraints, políticas RLS, funções RPC e triggers transacionais, limpeza coordenada no Supabase Storage, variáveis de ambiente/segredos, integração real com provedores bancários/PSP/maquininhas, webhooks assinados, jobs/cron e configuração de infraestrutura na Vercel.

---

## 1. Resumo Executivo da Entrega da IA 1

A IA 1 implementou todas as camadas de aplicação (UI, API Express, tipos/validações compartilhadas e suítes de testes) mantendo estrita compatibilidade com a base consolidada até a Etapa 40:

1. **Exclusão Definitiva de Solicitações (Etapa 1)**: fluxo ponta a ponta para cliente e equipe com checagem autoritativa de elegibilidade, modal de confirmação irreversível com copy exato, tratamento de anexos exclusivos/compartilhados/retidos, proteção contra falso sucesso quando o Storage falhar, notificação ao cliente sem link quebrado e auditoria restrita a exclusões feitas pela equipe.
2. **Pagamentos no Portal do Cliente (Etapa 2)**: painel completo de checkout vinculado à cobrança oficial (`charge_id`), detalhamento financeiro transparente, 12 estados oficiais de pagamento, suporte a Pix dinâmico / Copia e Cola e cartões online (crédito à vista, parcelado e débito) condicionados à configuração real do provedor, verificação autoritativa de status e atalho direto a partir do detalhe da solicitação.
3. **Cobrança Eletrônica pela Equipe (Etapa 3)**: emissão de Pix dinâmico pela equipe vinculada à cobrança oficial, compartilhamento manual pelo WhatsApp (`wa.me` + cópia de mensagem, independente da API oficial do WhatsApp) e cobrança integrada em maquininhas com 9 estados operacionais e distinção clara entre autorização, captura e liquidação.
4. **Aprovação de Pagamento Manual (Etapa 4)**: controle granular com permissão `payments.manual.approve`, solicitação formal de autorização no Caixa por operadores sem aprovação direta, seleção de aprovadores elegíveis filtrados no backend, aprovação/recusa/expiração/revogação, execução única dentro de sessão de caixa aberta e invalidação automática por mudança de versão/saldo/permissão.
5. **Aprovação de Desconto Comercial (Etapa 5)**: controle granular com permissão `charges.discount.approve`, solicitação por valor (R$) ou percentual (%) na tela de Cobranças, separação rígida entre desconto comercial e taxa de cartão, aplicação atômica mediante aprovação e trilha unificada na aba `Autorizações` do Caixa.
6. **Configurações → Bancos e Pagamentos (Etapa 6)**: nova seção administrativa sob `/configuracoes/bancos-pagamentos` protegida por `owner`/`admin` + `settings.access` + `payments.providers.manage`, arquitetura agnóstica de provedor e orientada por capabilities (`"Não disponível para este provedor"`), sem coleta ou retorno de senhas bancárias, preservando a navegação agrupada e o limite de 4 atalhos no mobile.

**Comportamento fail-closed garantido**: todas as novas rotas Express capturam `PGRST202` e `42883` (RPC ainda não provisionada pela IA 2) e retornam estados estruturados (`backend_ready: false`, `provider_unconfigured` ou HTTP `503`) sem quebrar o aplicativo e sem nunca simular sucesso.

---

## 2. Inventário Completo de Arquivos e Matriz de Propriedade (File Ownership)

### 2.1 Arquivos Criados pela IA 1
- **Domínio e contratos compartilhados (`shared/`)**:
  - `shared/requestDeletion.ts`
  - `shared/paymentCheckout.ts`
  - `shared/financialApprovals.ts`
- **Backend Express (`server/`)**:
  - `server/modules/request-deletion/router.ts`
  - `server/modules/payment-checkout/router.ts`
  - `server/modules/financial-approvals/router.ts`
  - `server/modules/payment-providers/router.ts`
- **Frontend (`src/`)**:
  - `src/features/requests/deletionApi.ts`
  - `src/features/requests/RequestDeleteModal.tsx`
  - `src/features/payments/checkoutApi.ts`
  - `src/features/payments/ClientCheckoutPanel.tsx`
  - `src/features/payments/PixQrVisual.tsx`
  - `src/features/payments/payments.css`
  - `src/features/approvals/api.ts`
  - `src/features/approvals/ManualPaymentApprovalForm.tsx`
  - `src/features/approvals/DiscountApprovalForm.tsx`
  - `src/features/approvals/ApprovalsPanel.tsx`
  - `src/features/cash/TeamCollectionPanel.tsx`
  - `src/features/settings/paymentProvidersApi.ts`
  - `src/features/settings/PaymentProvidersSettings.tsx`
  - `src/features/settings/paymentProviders.css`
- **Documentação e Testes**:
  - `docs/handoffs/figma-especificacao-evolucao.md`
  - `docs/handoffs/ia1-para-ia2-supabase-vercel.md`
  - `tests/request-deletion.test.ts`
  - `tests/payment-checkout.test.ts`
  - `tests/financial-approvals.test.ts`
  - `tests/payment-providers-api.test.ts`
  - `tests/browser/evolution-ui-contract.spec.ts`

### 2.2 Arquivos Alterados pela IA 1
- `shared/team.ts` (4 novas permissões e rótulos PT-BR)
- `shared/permissionModules.ts` (mapeamento 1:1 das 4 permissões, dependências e flags administrativas)
- `shared/governance.ts` (novas ações, alvos e campos de auditoria)
- `shared/notifications.ts` (5 novos tipos de aviso + campos opcionais `deleted_protocol`, `approval_id`, `approval_summary`)
- `server/modules/notifications/dto.ts` (projeção segura dos novos tipos de notificação)
- `server/app.ts` (montagem dos 4 novos routers sob `/api/*`)
- `src/app/routes.ts` (caminho `settingsPaymentProviders: '/configuracoes/bancos-pagamentos'`)
- `src/app/OperationalRoutes.tsx` (rota lazy de `PaymentProvidersSettings`)
- `src/features/operation/navigation.ts` (entrada em `settingsNavigation` sem alterar menu raiz nem 4 atalhos mobile)
- `src/features/settings/SettingsPage.tsx` (atalho condicional para `Bancos e Pagamentos`)
- `src/features/requests/RequestDetail.tsx` (atalho `"Ver cobrança e pagamento"` + `RequestDeleteSection`)
- `src/features/requests/RequestsPage.tsx` (tratamento de `onDeleted` e `location.state.start_new`)
- `src/features/notifications/presentation.ts`, `NotificationsPage.tsx`, `NotificationDrawer.tsx` (renderização de `request_deleted` e aprovações financeiras)
- `src/features/payments/PaymentsPage.tsx` (integração do `ClientCheckoutPanel`)
- `src/features/charges/ChargesPage.tsx` (integração de `TeamCollectionPanel` e `DiscountApprovalForm`)
- `src/features/cash/CashPage.tsx` (nova aba `Autorizações` + deep-link por notificação)
- `src/features/cash/CashPaymentsPanel.tsx` (gate de `payments.manual.approve` + `ManualPaymentApprovalForm`)

### 2.3 Matriz de Propriedade de Arquivos (Evitar Conflitos de Merge)

| Diretório / Arquivo | Dono Principal | Regra de Colaboração |
| --- | --- | --- |
| `src/**` | **IA 1** | IA 2 não precisa alterar UI; somente ajustar se houver novo campo acordado em contrato |
| `shared/**` | **IA 1** (contrato congelado) | IA 2 deve implementar SQL/RPCs respeitando os tipos exatos já definidos em `shared/` |
| `server/modules/*/router.ts` | **IA 1** (gateway fino) | IA 2 deve plugar a verificação real de assinatura em `/api/payment-checkout/webhooks/:provider` e, se necessário, adapters HTTP de PSP/banco chamados pelo backend |
| `supabase/migrations/**` | **IA 2 (exclusivo)** | IA 1 **não criou nem alterou** nenhuma migration |
| `supabase/functions/**` | **IA 2 (exclusivo)** | IA 2 cria/atualiza Edge Functions (ex.: limpeza de Storage, worker de conciliação, webhook PSP) |
| `vercel.json` / Env Vars / Cron | **IA 2 (exclusivo)** | IA 1 **não alterou** `vercel.json` nem arquivos de deploy |

---

## 3. Origem do Snapshot e Ponto de Partida para IA 2

- **Base do repositório**: Snapshot consolidado após **Etapa 40** (`main 711beb9` + migration local `20261118120000_smart_documents_engine.sql` presente no workspace).
- **Observação de controle de versão**: Este ambiente de execução não contém diretório `.git`; portanto, não há hash de commit gerado localmente. A IA 2 deve aplicar este conjunto de arquivos em uma branch dedicada a partir da `main` atual, confirmar o histórico real de migrations já aplicadas no projeto Supabase hospedado antes de criar novas migrations, e **nunca reaplicar** as 82+ migrations históricas já aplicadas.

---

## 4. Mudanças Necessárias no Banco de Dados (Supabase)

> **Atenção**: A IA 1 não criou arquivos `.sql`. A IA 2 deve criar migrations timestampadas sequenciais após conferir `supabase_migrations.schema_migrations` em produção/homologação.

### 4.1 Novas Permissões no Catálogo RBAC
Inserir (idempotente com `ON CONFLICT DO NOTHING`) nas tabelas de permissões/papéis existentes:
- `requests.delete` — concedida inicialmente a `owner` (e opcionalmente configurável para `admin` via gestão de acessos)
- `payments.manual.approve` — concedida a `owner` (e configurável para `admin`)
- `payments.providers.manage` — concedida a `owner` (e configurável para `admin` junto com `settings.access`)
- `charges.discount.approve` — concedida a `owner` (e configurável para `admin`)

### 4.2 Tabelas de Exclusão Definitiva de Solicitações (Etapa 1)
1. `private.request_deletion_operations`:
   - `id uuid primary key default gen_random_uuid()`
   - `office_id uuid not null references private.offices(id)`
   - `request_id uuid not null` (sem FK `ON DELETE CASCADE` para preservar rastreio após delete)
   - `protocol text not null`
   - `actor_user_id uuid not null`
   - `actor_kind text not null check (actor_kind in ('client', 'team'))`
   - `idempotency_key text not null`
   - `status text not null check (status in ('processing', 'storage_cleanup_failed', 'completed'))`
   - `db_deleted boolean not null default false`
   - `storage_cleanup_completed boolean not null default false`
   - `storage_objects_to_delete jsonb not null default '[]'::jsonb` (lista de `{bucket, path, file_id}` exclusivos)
   - `attachments_removed integer not null default 0`
   - `attachments_preserved integer not null default 0`
   - `client_notified boolean not null default false`
   - `audit_recorded boolean not null default false`
   - `last_error_code text null`
   - `created_at timestamptz not null default now()`
   - `updated_at timestamptz not null default now()`
   - **Constraints/Índices**:
     - `unique (office_id, request_id, idempotency_key)`
     - índice parcial único `unique (office_id, request_id) where status in ('processing', 'storage_cleanup_failed')` (lock de concorrência contra exclusão duplicada).

### 4.3 Tabelas de Provedores Bancários, Pix, Cartões e Maquininhas (Etapa 6)
1. `private.payment_providers`:
   - `id uuid primary key default gen_random_uuid()`
   - `office_id uuid not null references private.offices(id)`
   - `provider_code text not null` (`generic_psp_pix_card`, `generic_pix_bank`, `generic_acquirer_terminal`)
   - `display_name text not null`
   - `institution_label text not null`
   - `environment text not null check (environment in ('sandbox', 'homologation', 'production'))`
   - `status text not null check (status in ('unconfigured', 'configured', 'validated', 'active', 'disabled', 'error'))`
   - `enabled_methods text[] not null default '{}'`
   - `receiving_account_id uuid null` (FK para conta financeira oficial do escritório)
   - `financial_unit_id uuid null` (FK para unidade financeira oficial do escritório)
   - `credential_ref text null` (referência opaca a secret/Vault; **nunca** senha bancária ou chave privada em texto claro)
   - `homologated boolean not null default false`
   - `last_validated_at timestamptz null`
   - `last_sync_at timestamptz null`
   - `last_error_safe text null`
   - `version integer not null default 1`
   - `created_at / updated_at timestamptz not null default now()`
2. `private.payment_pix_settings`:
   - `office_id uuid primary key references private.offices(id)`
   - `provider_id uuid null references private.payment_providers(id)`
   - `enabled boolean not null default false`
   - `dynamic_qr_enabled boolean not null default false`
   - `copy_paste_enabled boolean not null default false`
   - `expiration_minutes integer not null default 30 check (expiration_minutes between 1 and 10080)`
   - `reconciliation_enabled boolean not null default false`
   - `refund_enabled boolean not null default false`
   - `pix_key_masked text null`
   - `updated_at timestamptz not null default now()`
3. `private.payment_online_card_settings`:
   - `office_id uuid primary key references private.offices(id)`
   - `provider_id uuid null references private.payment_providers(id)`
   - `enabled boolean not null default false`
   - `credit_enabled boolean not null default false`
   - `debit_enabled boolean not null default false`
   - `installments_enabled boolean not null default false`
   - `max_installments integer not null default 1 check (max_installments between 1 and 12)`
   - `min_installment_cents integer not null default 2000 check (min_installment_cents > 0)`
   - `fee_policy_note text null`
   - `settlement_days_credit integer null`
   - `settlement_days_debit integer null`
   - `updated_at timestamptz not null default now()`
4. `private.payment_terminals`:
   - `id uuid primary key default gen_random_uuid()`
   - `office_id uuid not null references private.offices(id)`
   - `provider_id uuid null references private.payment_providers(id)`
   - `label text not null`
   - `manufacturer text not null`
   - `model text not null`
   - `provider_name text not null`
   - `serial_masked text null`
   - `connection_mode text not null check (connection_mode in ('cloud_api', 'local_agent_connector'))`
   - `supported_protocols text[] not null default '{}'`
   - `unit_id uuid null`
   - `status text not null check (status in ('active', 'disconnected', 'inactive', 'error'))`
   - `last_heartbeat_at timestamptz null`
   - `last_error_safe text null`
   - `created_at / updated_at timestamptz not null default now()`

### 4.4 Tabelas de Intenções de Pagamento Eletrônico e Webhooks (Etapas 2 e 3)
1. `private.payment_checkout_intents`:
   - `id uuid primary key default gen_random_uuid()`
   - `office_id uuid not null references private.offices(id)`
   - `charge_id uuid not null` (FK para cobrança oficial existente — **nunca** duplicar cobrança)
   - `charge_version_snapshot integer not null`
   - `provider_id uuid not null references private.payment_providers(id)`
   - `terminal_id uuid null references private.payment_terminals(id)`
   - `initiated_by_user_id uuid not null`
   - `channel text not null check (channel in ('portal', 'presencial', 'whatsapp'))`
   - `method text not null check (method in ('pix_qr', 'pix_copy_paste', 'credit_card', 'debit_card', 'installments'))`
   - `state text not null` (os 12 valores de `clientPaymentStates`)
   - `terminal_state text null` (os 9 valores de `terminalOperationStates`)
   - `settlement_stage text not null default 'none' check (settlement_stage in ('none', 'authorized', 'captured', 'settled', 'refunded', 'disputed'))`
   - `amount_cents bigint not null check (amount_cents > 0)`
   - `installments_count integer not null default 1 check (installments_count between 1 and 12)`
   - `installment_amount_cents bigint null`
   - `pix_qr_payload text null`
   - `pix_copy_paste text null`
   - `checkout_url text null`
   - `provider_reference text null`
   - `authorization_code text null`
   - `idempotency_key text not null`
   - `expires_at timestamptz null`
   - `confirmed_payment_id uuid null` (FK para o lançamento financeiro oficial criado após confirmação)
   - `safe_message text null`
   - `created_at / updated_at timestamptz not null default now()`
   - **Constraints**: `unique (office_id, charge_id, idempotency_key)`, `unique (provider_id, provider_reference) where provider_reference is not null`.
2. `private.payment_webhook_events`:
   - `id uuid primary key default gen_random_uuid()`
   - `provider_code text not null`
   - `office_id uuid null`
   - `event_id text not null`
   - `provider_reference text not null`
   - `event_type text not null`
   - `payload_sha256 text not null`
   - `signature_verified boolean not null`
   - `processed_at timestamptz null`
   - `processing_status text not null check (processing_status in ('received', 'processed', 'ignored_duplicate', 'failed'))`
   - `created_at timestamptz not null default now()`
   - **Constraints**: `unique (provider_code, event_id)` (garantia estrita contra replay).

### 4.5 Tabela de Autorizações Financeiras (Etapas 4 e 5)
1. `private.financial_approvals`:
   - `id uuid primary key default gen_random_uuid()`
   - `office_id uuid not null references private.offices(id)`
   - `kind text not null check (kind in ('manual_payment', 'discount'))`
   - `status text not null check (status in ('pending', 'approved', 'rejected', 'expired', 'revoked', 'executed'))`
   - `charge_id uuid not null`
   - `charge_version_snapshot integer not null`
   - `request_id uuid not null`
   - `requester_user_id uuid not null`
   - `approver_user_id uuid not null`
   - `original_cents bigint not null`
   - `requested_amount_cents bigint not null`
   - `discount_mode text null check (discount_mode in ('amount_cents', 'percent'))`
   - `discount_cents bigint null`
   - `discount_percent numeric(5,2) null`
   - `final_cents bigint not null`
   - `card_fee_cents bigint not null default 0`
   - `payment_method_id uuid null`
   - `session_id uuid null`
   - `unit_id uuid null`
   - `destination_account_id uuid null`
   - `operation_date date null`
   - `external_reference text null`
   - `justification text not null`
   - `decision_note text null`
   - `invalidation_reason text null`
   - `idempotency_key text not null`
   - `execution_idempotency_key text null`
   - `executed_payment_id uuid null` (FK para pagamento manual gerado — garante uso único)
   - `expires_at timestamptz not null` (TTL recomendado: 24h para desconto, fim da sessão de caixa ou 4h para pagamento manual)
   - `decided_at timestamptz null`
   - `executed_at timestamptz null`
   - `created_at / updated_at timestamptz not null default now()`
   - **Constraints**: `unique (office_id, requester_user_id, idempotency_key)`, `unique (execution_idempotency_key) where execution_idempotency_key is not null`.

---

## 5. Políticas RLS e Controle de Acesso no Banco

Seguir rigorosamente o padrão de segurança já estabelecido nas 82 migrations existentes do Escritório JN:
- **Todas as novas tabelas devem residir no schema `private`** com `ALTER TABLE ... ENABLE ROW LEVEL SECURITY` e `REVOKE ALL ON ... FROM PUBLIC, anon, authenticated`.
- **Nenhuma exposição direta via PostgREST** às tabelas `private.*`; todo acesso ocorre exclusivamente via wrappers `SECURITY INVOKER` / funções controladas que revalidam:
  1. `auth.uid()` e sessão ativa;
  2. vínculo ativo no `office_id` informado (isolamento estrito multi-escritório);
  3. **Exclusão**: cliente só enxerga/exclui solicitações em que ele é o titular verificado; equipe precisa de `requests.delete` ativo no escritório atual;
  4. **Checkout cliente**: cliente só consulta/cria intenção em `charge_id` pertencente a solicitação própria no escritório atual;
  5. **Cobrança equipe**: exige `charges.read` + `cash.receive` (ou permissão financeira vigente do escritório);
  6. **Aprovações**: listagem de aprovadores retorna **somente** usuários ativos do **mesmo `office_id`** com `role_code = 'owner'` ou (`role_code = 'admin'` + `payments.manual.approve` / `charges.discount.approve`); decisão exige que o ator atual seja o `approver_user_id` designado e mantenha a permissão no momento da decisão;
  7. **Bancos e Pagamentos**: exige `role_code in ('owner', 'admin')` + `settings.access` + `payments.providers.manage` vigentes no `office_id`.

---

## 6. Funções RPC, Triggers e Transações Necessárias

As rotas Express criadas pela IA 1 já chamam exatamente estas funções RPC (assinaturas exatas):

### 6.1 Exclusão Definitiva (`/api/request-deletion`)
1. `request_deletion_eligibility(p_office_id uuid, p_request_id uuid) -> jsonb`
   - Retorna o contrato `RequestDeletionEligibility` (`shared/requestDeletion.ts`), aplicando a mesma matriz de bloqueio (Situações A–E, bloqueios absolutos financeiros/documentais/legais, canal não verificado, anexos exclusivos vs compartilhados vs retidos).
2. `request_delete_permanently(p_office_id uuid, p_request_id uuid, p_expected_version int, p_expected_status text, p_idempotency_key text, p_confirmation_ack boolean, p_client_verification_token text) -> jsonb`
   - Executa em transação serializada/lock `FOR UPDATE`:
     - Verifica replay idempotente;
     - Revalida versão, status, elegibilidade e permissão;
     - Classifica anexos (exclusivos → lista de remoção no Storage; compartilhados/retidos → desvincula sem apagar arquivo);
     - Cria registro em `request_deletion_operations`;
     - Remove a solicitação do banco (`db_deleted = true`);
     - Se `actor_kind = 'team'`: gera notificação `request_deleted` para o cliente (com `deleted_protocol` e `can_open = false`) e registra evento de auditoria `requests.deleted`;
     - Se `actor_kind = 'client'`: **NÃO** gera auditoria interna da empresa (`audit_recorded = false`) e **NÃO** envia notificação de exclusão pela equipe;
     - Dispara limpeza física dos anexos exclusivos via Edge Function / Storage API JWT (nunca `DELETE` direto em `storage.objects`) e só marca `status = 'completed'` após `db_deleted = true AND storage_cleanup_completed = true`.
3. `request_deletion_status(p_office_id uuid, p_request_id uuid, p_idempotency_key text) -> jsonb`
   - Retorna o estado autoritativo de `request_deletion_operations` para reconciliação após timeout ou falha de limpeza de Storage.

### 6.2 Pagamentos Eletrônicos (`/api/payment-checkout`)
4. `client_payment_checkout_summary(p_office_id uuid, p_charge_id uuid) -> jsonb` → retorna `ClientCheckoutSummary`.
5. `payment_checkout_create_intent(p_office_id uuid, p_charge_id uuid, p_expected_charge_version int, p_method text, p_installments_count int, p_idempotency_key text) -> jsonb` → retorna `CheckoutIntent`.
6. `payment_checkout_intent_status(p_office_id uuid, p_intent_id uuid) -> jsonb` → retorna `CheckoutIntent` atualizado de forma autoritativa.
7. `staff_payment_generate_pix(p_office_id uuid, p_charge_id uuid, p_expected_charge_version int, p_amount_cents bigint, p_idempotency_key text) -> jsonb` → retorna `CheckoutIntent`.
8. `staff_payment_start_terminal(p_office_id uuid, p_charge_id uuid, p_expected_charge_version int, p_terminal_id uuid, p_sale_mode text, p_installments_count int, p_amount_cents bigint, p_idempotency_key text) -> jsonb` → retorna `CheckoutIntent`.

### 6.3 Autorizações Financeiras (`/api/financial-approvals`)
9. `financial_approval_eligible_approvers(p_office_id uuid, p_kind text) -> jsonb` → array de `EligibleApprover`.
10. `financial_approvals_page(p_office_id uuid, p_scope text, p_kind text, p_page int) -> jsonb` → `{ items, total, page, page_size }`.
11. `financial_approval_request_manual_payment(p_office_id uuid, p_charge_id uuid, p_charge_version int, p_request_id uuid, p_session_id uuid, p_unit_id uuid, p_destination_account_id uuid, p_payment_method_id uuid, p_approver_user_id uuid, p_amount_cents bigint, p_operation_date date, p_external_reference text, p_justification text, p_idempotency_key text) -> jsonb`.
12. `financial_approval_request_discount(p_office_id uuid, p_charge_id uuid, p_charge_version int, p_request_id uuid, p_approver_user_id uuid, p_mode text, p_discount_cents bigint, p_discount_percent numeric, p_justification text, p_idempotency_key text) -> jsonb`.
13. `financial_approval_decide(p_office_id uuid, p_approval_id uuid, p_decision text, p_expected_charge_version int, p_note text, p_idempotency_key text) -> jsonb`
    - Para `kind = 'discount'` com `decision = 'approve'`: aplica o desconto comercial diretamente na cobrança oficial dentro da mesma transação (incrementando `charge.version`), marca status `executed` (ou `approved` + aplicado), notifica solicitante e grava auditoria `charges.discount_approval_decided`.
    - Para `kind = 'manual_payment'` com `decision = 'approve'`: marca `approved`, notifica solicitante para concluir no caixa aberto e grava auditoria `payments.manual_approval_decided`.
14. `financial_approval_execute_manual_payment(p_office_id uuid, p_approval_id uuid, p_session_id uuid, p_expected_charge_version int, p_idempotency_key text) -> jsonb`
    - Revalida `status = 'approved'`, `expires_at > now()`, `executed_payment_id is null`, versão/saldo da cobrança, sessão de caixa aberta e permissões; cria o lançamento de pagamento manual no caixa oficial e marca a aprovação como `executed` (uso único irreversível).

### 6.4 Provedores e Maquininhas (`/api/payment-providers`)
15. `payment_providers_state(p_office_id uuid) -> jsonb`
16. `payment_provider_save(p_office_id uuid, p_provider_id uuid, p_provider_code text, p_institution_label text, p_environment text, p_enabled_methods text[], p_receiving_account_id uuid, p_financial_unit_id uuid, p_credential_ref text, p_idempotency_key text) -> jsonb`
17. `payment_provider_validate(p_office_id uuid, p_provider_id uuid) -> jsonb`
18. `payment_pix_settings_save(p_office_id uuid, p_provider_id uuid, p_enabled boolean, p_dynamic_qr_enabled boolean, p_copy_paste_enabled boolean, p_expiration_minutes int, p_reconciliation_enabled boolean, p_refund_enabled boolean, p_idempotency_key text) -> jsonb`
19. `payment_online_cards_save(p_office_id uuid, p_provider_id uuid, p_enabled boolean, p_credit_enabled boolean, p_debit_enabled boolean, p_installments_enabled boolean, p_max_installments int, p_min_installment_cents int, p_fee_policy_note text, p_idempotency_key text) -> jsonb`
20. `payment_terminal_save(p_office_id uuid, p_terminal_id uuid, p_provider_id uuid, p_label text, p_manufacturer text, p_model text, p_provider_name text, p_connection_mode text, p_unit_id uuid, p_idempotency_key text) -> jsonb`
21. `payment_terminal_test(p_office_id uuid, p_terminal_id uuid) -> jsonb`
22. `payment_terminal_deactivate(p_office_id uuid, p_terminal_id uuid, p_idempotency_key text) -> jsonb`

### 6.5 Triggers de Invalidação Automática
- Trigger em atualização/cancelamento de cobrança (`charges`): se `version`, `balance_cents` ou `status` mudar, atualizar `private.financial_approvals` com `status in ('pending', 'approved')` para `status = 'revoked'` e `invalidation_reason = 'Cobrança alterada após o pedido de autorização.'`.
- Trigger em revogação de papel/permissão (`memberships` / `role_permissions`): marcar autorizações abertas do aprovador afetado como `revoked`.

---

## 7. Regras de Exclusão Definitiva no Banco e no Supabase Storage

1. **Classificação de anexos**:
   - **Exclusivo**: referenciado apenas pela solicitação em exclusão e sem retenção legal/fiscal → vai para fila/execução de remoção física no Supabase Storage.
   - **Compartilhado**: referenciado também por outra solicitação, cadastro de cliente ou documento aprovado → **NÃO** apagar o arquivo no Storage; remover apenas o vínculo com a solicitação excluída.
   - **Retido**: marcado sob retenção/guarda obrigatória → preservar arquivo no Storage e contabilizar em `retained_preserved_count`.
2. **Remoção física segura**:
   - Seguir a regra já consolidada nas correções pós-34: apagar via **Storage API autenticada** (Edge Function `private-attachments` ou worker dedicado com credencial apropriada), **nunca** via `DELETE FROM storage.objects` em SQL.
   - Se qualquer arquivo exclusivo falhar na remoção, gravar `status = 'storage_cleanup_failed'` e `storage_cleanup_completed = false`. O router Express já bloqueia qualquer resposta `completed` caso `db_deleted` ou `storage_cleanup_completed` seja `false`.
3. **Notificação e Auditoria**:
   - Exclusão pela equipe → insere notificação `kind = 'request_deleted'`, `can_open = false`, `request_id = null`, `deleted_protocol = <protocol>` + registro na auditoria empresarial `requests.deleted`.
   - Autoexclusão do cliente → **sem** notificação `request_deleted` e **sem** registro na auditoria empresarial.

---

## 8. Estrutura para Cobranças e Pagamentos Eletrônicos

- Toda intenção em `payment_checkout_intents` referencia uma `charge_id` oficial já existente.
- Ao receber confirmação autoritativa (webhook verificado ou consulta síncrona ao provedor), uma função transacional deve:
  1. Verificar idempotência (`confirmed_payment_id is null` e evento não processado);
  2. Registrar o pagamento oficial no módulo financeiro/caixa existente (`payments` / alocações), atualizando o saldo da cobrança e gerando o recibo oficial;
  3. Distinguir explicitamente `settlement_stage`:
     - `authorized`: cartão autorizado mas ainda não capturado (não liquida saldo final se política exigir captura);
     - `captured`: captura confirmada pelo adquirente/PSP;
     - `settled`: liquidação financeira efetiva na conta bancária de recebimento;
     - `refunded` / `disputed`: estorno ou chargeback conciliado.
- **Pix QR Code (`pix_qr_payload`)**: quando o provedor retornar imagem raster oficial (`data:image/png;base64,...`, `jpeg` ou `webp`), o componente `PixQrVisual` renderiza o QR Code escaneável diretamente na tela; caso retorne apenas o payload EMVCo em texto, o componente exibe fallback honesto orientando o uso do Pix Copia e Cola sem fabricar matriz visual inválida.
- **Manual WhatsApp Pix Share**: já funciona 100% no cliente/equipe sem API oficial do WhatsApp (`buildManualWhatsAppPixShare`), bastando o `pix_copy_paste` real devolvido pelo provedor.

---

## 9. Fluxo de Aprovação de Pagamento Manual e Desconto

- **Separação financeira obrigatória**:
  - `discount_cents`: desconto comercial concedido pelo escritório (exige `can_discount` ou aprovação via `charges.discount.approve`).
  - `card_fee_cents`: taxa financeira de cartão/parcelamento (registrada separadamente — nunca misturada com desconto comercial).
- **Uso único e anti-replay**:
  - `financial_approval_execute_manual_payment` trava a linha `FOR UPDATE`, valida `status = 'approved'`, `executed_payment_id IS NULL`, `charge.version = expected_charge_version`, `charge.balance_cents >= requested_amount_cents` e sessão de caixa aberta.
- **Notificações automáticas**:
  - Pedido criado → notificação `payment_approval_requested` ou `discount_approval_requested` para `approver_user_id` com `approval_id` e `approval_summary`.
  - Pedido decidido → notificação `payment_approval_decided` ou `discount_approval_decided` para `requester_user_id`.

---

## 10. Provedores Bancários, Pix, Cartões e Maquininhas (Arquitetura Agnóstica)

- O catálogo em `shared/paymentCheckout.ts` (`providerCatalog`) define capabilities por tipo de conector (`pix_dynamic_qr`, `pix_copy_paste`, `pix_query_status`, `pix_reconciliation`, `pix_refund`, `card_credit_cash`, `card_credit_installments`, `card_debit_online`, `card_refund`, `card_dispute_tracking`, `terminal_integrated`, `terminal_local_agent`, `webhook_signed`).
- **Nunca solicitar nem armazenar senha bancária de internet banking ou app bancário**.
- Usar exclusivamente credenciais oficiais de API (OAuth2 `client_id`/`client_secret`, certificados mTLS `.crt`/`.key` ou API keys escopadas do PSP/adquirente) armazenadas em cofres server-side (Supabase Vault / Vercel Encrypted Env Vars), expondo ao frontend apenas `credential_ref` opaco (ex.: `vault://office-01/pix-prod`).

---

## 11. Variáveis de Ambiente e Segredos (Vercel / Supabase)

> **Apenas nomes recomendados — nenhum segredo real foi criado pela IA 1.**

- `PAYMENT_WEBHOOK_HMAC_SECRET_<PROVIDER>` — segredo de verificação criptográfica HMAC/RSA dos webhooks recebidos em `/api/payment-checkout/webhooks/:provider`.
- `PAYMENT_PROVIDER_VAULT_ENCRYPTION_KEY` — chave mestre server-side (somente Supabase Edge / backend seguro) caso credenciais sejam cifradas em envelope.
- `PIX_PROVIDER_BASE_URL` / `PIX_PROVIDER_CLIENT_ID` / `PIX_PROVIDER_CLIENT_SECRET` / `PIX_PROVIDER_MTLS_CERT_B64` / `PIX_PROVIDER_MTLS_KEY_B64` — credenciais oficiais de API Pix do banco/PSP escolhido pelo escritório.
- `CARD_PROVIDER_BASE_URL` / `CARD_PROVIDER_API_KEY` — credenciais do gateway/adquirente de cartão online e/ou terminal em nuvem.
- `TERMINAL_LOCAL_AGENT_SHARED_SECRET` — segredo de assinatura para conector local de maquininha (quando `connection_mode = 'local_agent_connector'`).
- `PAYMENT_RECONCILIATION_CRON_SECRET` — bearer secret para disparar jobs agendados de conciliação e expiração.

---

## 12. Webhooks, Assinatura, Replay, Idempotência e Jobs/Cron

1. **Endpoint já montado pela IA 1**: `POST /api/payment-checkout/webhooks/:provider`
   - Atualmente valida formato do provedor, presença do cabeçalho `x-jn-webhook-signature` / `x-webhook-signature` e schema `WebhookEventEnvelope`, falhando fechado com `503 WEBHOOK_PERSISTENCE_PENDING`.
   - **Ação da IA 2**: validar a assinatura sobre o `rawBody` com comparação em tempo constante (`crypto.timingSafeEqual`), validar timestamp anti-replay (janela ≤ 5 min), gravar em `private.payment_webhook_events` com `ON CONFLICT (provider_code, event_id) DO NOTHING` e atualizar `payment_checkout_intents` + lançamento oficial de pagamento.
   - **Regra crítica do AGENTS.md**: webhook não possui sessão humana; usar identidade de automação dedicada e auditada (nunca conta fictícia de usuário humano).
2. **Jobs/Cron recomendados**:
   - **Expiração de Pix** (a cada 5 min): marcar intenções `awaiting_payment` com `expires_at < now()` como `expired`.
   - **Expiração de aprovações financeiras** (a cada 15 min): marcar `financial_approvals` com `status in ('pending', 'approved')` e `expires_at < now()` como `expired`.
   - **Conciliação bancária / maquininha** (a cada 15 min): consultar provedor para intenções presas em `processing` ou `pending_reconciliation`.
   - **Retentativa de limpeza de Storage** (a cada 10 min): reprocessar `request_deletion_operations` com `status = 'storage_cleanup_failed'`.

---

## 13. Ajustes Necessários na Vercel, Edge Functions e Deploy

- **Vercel Functions / `vercel.json`**:
  - Configurar `maxDuration` adequado nas rotas `/api/payment-checkout/*` e `/api/request-deletion/*` caso o provedor externo ou limpeza de múltiplos anexos demande > 10s.
  - Garantir captura do `rawBody` na rota `/api/payment-checkout/webhooks/:provider` se o provedor exigir validação HMAC sobre o payload bruto exato.
  - Configurar Vercel Cron (ou pg_cron / Supabase Scheduled Edge Functions) para expiração e conciliação.
  - Manter cabeçalhos `Cache-Control: private, no-store` em todas as rotas `/api/*` (já aplicados pelos routers Express).
- **Fluxo de publicação**: manter publicação via GitHub → Vercel (conforme `AGENTS.md`), sem `vercel --prod` manual e sem GitHub Actions de deploy direto.

---

## 14. Contratos Exatos entre Frontend, Express e Supabase

### Convenção de Erros RPC → Express
Todas as RPCs da IA 2 devem sinalizar erros de negócio usando `SQLSTATE 'PT401'`, `'PT403'`, `'PT404'`, `'PT409'`, `'PT422'`, `'PT429'` ou `'PT503'` com a `MESSAGE` igual às chaves mapeadas em `STATUS_MAP` de cada router:
- **`/api/request-deletion`**: `AUTH_REQUIRED` (401), `DELETION_FORBIDDEN` (403), `REQUEST_NOT_FOUND` (404), `DELETION_CONFLICT` / `CONCURRENT_OPERATION` (409), `DELETION_BLOCKED` / `DELETION_VALIDATION` (422), `DELETION_RATE_LIMIT` (429), ou códigos de bloqueio de `deletionBlockMessages`.
- **`/api/payment-checkout`**: `AUTH_REQUIRED` (401), `CHECKOUT_FORBIDDEN` (403), `CHARGE_NOT_FOUND` / `INTENT_NOT_FOUND` / `TERMINAL_NOT_FOUND` (404), `CHARGE_CONFLICT` / `PAYMENT_CONFLICT` (409), `CHECKOUT_VALIDATION` / `METHOD_UNSUPPORTED` (422), `PROVIDER_NOT_CONFIGURED` / `PROVIDER_UNAVAILABLE` (503).
- **`/api/financial-approvals`**: `AUTH_REQUIRED` (401), `APPROVAL_FORBIDDEN` / `PERMISSION_REVOKED` / `WRONG_APPROVER` (403), `APPROVAL_NOT_FOUND` / `CHARGE_NOT_FOUND` (404), `APPROVAL_CONFLICT` / `CHARGE_CHANGED` / `ALREADY_DECIDED` / `ALREADY_EXECUTED` / `APPROVAL_EXPIRED` (409), `APPROVAL_VALIDATION` / `CASH_SESSION_CLOSED` (422).
- **`/api/payment-providers`**: `AUTH_REQUIRED` (401), `SETTINGS_FORBIDDEN` / `PROVIDERS_FORBIDDEN` (403), `PROVIDER_NOT_FOUND` / `TERMINAL_NOT_FOUND` (404), `PROVIDER_CONFLICT` (409), `PROVIDER_VALIDATION` (422).

---

## 15. Feature Flags e Controles de Ativação Segura

- Nenhum módulo é ativado por flag estática no frontend. A ativação é **dirigida por capacidade real do backend**:
  - Sem RPC provisionada (`PGRST202`/`42883`) → `backend_ready: false` / `provider_unconfigured` / `503`.
  - Sem provedor validado/homologado no escritório → checkout eletrônico fica em `provider_unconfigured`, sem habilitar botões de cobrança eletrônica.
  - Sem capability no provedor selecionado → UI exibe `"Não disponível para este provedor"` e bloqueia o recurso.
- Recomenda-se à IA 2 manter `environment = 'sandbox'` / `'homologation'` obrigatório até conclusão de testes reais antes de permitir troca para `'production'`.

---

## 16. Checklist de Testes de Integração Real para a IA 2

- [ ] Replay completo de migrations em banco descartável + verificação de RLS e ACL (nenhum acesso direto a `private.*` por `anon`/`authenticated`).
- [ ] Exclusão definitiva real (cliente e equipe) com verificação física no Supabase Storage: anexo exclusivo removido, anexo compartilhado preservado, falha simulada no Storage impedindo `status = 'completed'`.
- [ ] Verificação de notificação `request_deleted` criada apenas para exclusão pela equipe e auditoria `requests.deleted` ausente em autoexclusão do cliente.
- [ ] Ciclo real de Pix em sandbox do provedor escolhido: geração → pagamento em sandbox → webhook assinado → conciliação → saldo zerado → recibo oficial gerado.
- [ ] Ciclo real de cartão online e maquininha em sandbox/homologação: autorização → captura → liquidação + cenários de recusa, timeout e cancelamento.
- [ ] Fluxo completo de aprovação de pagamento manual e aprovação de desconto com dois usuários reais (`operator` + `owner`/`admin`), incluindo teste de alteração concorrente da cobrança, expiração, revogação de permissão e bloqueio de dupla execução.
- [ ] Teste de webhook com assinatura inválida (401), replay de `event_id` repetido (idempotente sem duplicar pagamento) e payload corrompido (422).

---

## 17. Ordem Recomendada de Execução para a IA 2

1. Conferir histórico real de migrations no Supabase hospedado (`schema_migrations`).
2. Criar migration de permissões RBAC (`requests.delete`, `payments.manual.approve`, `payments.providers.manage`, `charges.discount.approve`) e novos tipos de notificação/auditoria.
3. Criar migration e RPCs da **Etapa 1** (Exclusão definitiva + integração Storage API na Edge Function).
4. Criar migration, triggers e RPCs das **Etapas 4 e 5** (Autorizações financeiras de pagamento manual e desconto).
5. Criar migration e RPCs da **Etapa 6** (Provedores bancários, Pix, cartões online e maquininhas + cofre de credenciais).
6. Criar migration, RPCs, adapters PSP/banco, verificação criptográfica de webhook e cron jobs das **Etapas 2 e 3** (Checkout cliente + cobrança equipe/maquininha).
7. Configurar segredos na Vercel/Supabase, rodar testes de integração real em homologação e validar deploy via GitHub → Vercel.

---

## 18. Riscos, Dependências Externas e Decisões Pendentes

- **Escolha contratual do banco / PSP / adquirente**: nenhum fornecedor comercial foi contratado ou escolhido ainda; custos e tarifas dependem de contrato do escritório.
- **Certificação mTLS / homologação Pix e cartões**: bancos e PSPs exigem emissão de certificado digital e validação de conta PJ antes de produção.
- **Integração física com maquininha**: depende de o equipamento contratado operar via API em nuvem (`cloud_api`) ou exigir conector/agente local instalado no posto de atendimento (`local_agent_connector`).
- **Política jurídica de retenção de anexos**: confirmar quais categorias de documentos possuem guarda legal obrigatória para marcar `retained_preserved_count`.

---

## 19. Critérios de Aceite Final para Homologação Real

O sistema só pode ser considerado pronto para homologação real quando:
1. Todas as 22 RPCs listadas na Seção 6 estiverem aplicadas, cobertas por RLS e respondendo no contrato exato;
2. Nenhum endpoint retornar `PGRST202`/`42883` em ambiente de homologação;
3. Exclusão definitiva comprovar remoção física no Storage (com preservação de compartilhados) sem falso sucesso;
4. Pagamento Pix/cartão só virar `confirmed` mediante confirmação assinada ou consulta autoritativa ao provedor, atualizando o financeiro oficial sem duplicidade;
5. Autorizações financeiras impedirem dupla execução, aplicação sobre cobrança alterada ou aprovação por usuário sem permissão vigente;
6. Todos os testes da IA 1 (`npm test` + Playwright) e os testes de integração real da IA 2 (Seção 16) passarem integralmente.
