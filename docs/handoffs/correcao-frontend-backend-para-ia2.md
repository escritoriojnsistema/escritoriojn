# Entrega Técnica IA 1 → IA 2 — Correção Geral do Escritório JN

**Escopo desta entrega**: Auditoria e correção completa de **Frontend, Backend Express, regras compartilhadas, usabilidade, pagamento manual, configuração inicial de caixa, conta pessoal, Bancos e Pagamentos e autorizações financeiras**, preservando 100% do modelo de autenticação, perfis (`owner`, `admin`, `employee`, `client`), níveis 1/2/3 e sem alterar migrations/RLS/SQL do Supabase nem `vercel.json`.

> **Nota sobre Git e ambiente**: Este ambiente de execução não possui diretório `.git` nem conexão direta com o repositório remoto ou com o Supabase de produção. O commit base informado na solicitação (`5a07955a5faf841785c8e112694453642b3c95b1`) não pôde ser verificado via `git rev-parse HEAD` neste contêiner — a IA 2 deve conferir o `HEAD` antes de aplicar o patch/branch no repositório oficial.

---

## 1. Defeitos encontrados na auditoria e causas corrigidas pela IA 1

| # | Defeito encontrado | Causa raiz | Arquivos alterados (IA 1) | Correção aplicada |
| --- | --- | --- | --- | --- |
| 1 | Ação `"Informar pagamento manualmente"` inacessível a partir de solicitações e cobranças (concentrada somente no extrato do Caixa) | `RequestDetail.tsx` e `ChargesPage.tsx` não possuíam ponto de entrada nem pré-seleção de cobrança para recebimento manual | `shared/manualPaymentFlow.ts`, `src/features/cash/ManualPaymentAction.tsx`, `src/features/requests/RequestDetail.tsx`, `src/features/charges/ChargesPage.tsx`, `src/features/cash/CashPage.tsx`, `src/features/cash/CashStatement.tsx`, `src/features/cash/CashPaymentsPanel.tsx` | Criado componente reutilizável `ManualPaymentAction` integrado em `RequestDetail` (presencial, WhatsApp, portal) e `ChargesPage`, com pré-seleção automática da cobrança, saldo oficial, filtro de formas compatíveis, chave idempotente e banner de retorno no Caixa |
| 2 | Bug RBAC em `CashPaymentsPanel.tsx`: confirmação de pagamento pendente permitia `canRecord` (inclusive `employee` ou `admin` sem `payments.manual.approve`) | Botão `"Confirmar pagamento"` e `submit()` verificavam apenas `canRecord` em vez de `canRecord && canDirectManualPayment` | `src/features/cash/CashPaymentsPanel.tsx`, `shared/manualPaymentFlow.ts` | Restringida confirmação direta exclusivamente a `owner` e `admin` com `payments.manual.approve`; perfis sem permissão direta só veem e submetem `"Solicitar autorização"` |
| 3 | Bloqueio silencioso quando financeiro ou caixa não estava configurado | Botões ficavam escondidos ou genéricos sem explicar o que faltava nem levar o gestor à configuração com retorno | `shared/manualPaymentFlow.ts`, `src/features/cash/ManualPaymentAction.tsx`, `src/features/cash/CashPage.tsx`, `src/features/cash/CashOpeningForm.tsx` | Exibição da mensagem exata exigida (`"Para informar pagamentos, configure uma unidade financeira, uma conta de destino e uma forma de pagamento. Depois, abra seu Caixa."`), checklist de pendências e CTA `"Configurar financeiro"` com retorno à solicitação/cobrança |
| 4 | Configuração inicial do Caixa escondia ações dentro de `<details>` recolhidos e deixava tela em branco quando `cashApi.configuration` falhava | `CashConfigurationPanel.tsx` renderizava `null` quando `configuration` era `null` e colocava formulários dentro de `<details>` fechados | `src/features/cash/CashConfigurationPanel.tsx`, `src/features/cash/CashPage.tsx`, `src/features/cash/cash.css` | Fluxo guiado em 5 passos com status (`Configuração incompleta` / `Aguardando abertura do caixa` / `Configuração concluída`), botões sempre visíveis `"Adicionar unidade"`, `"Adicionar conta"` e `"Adicionar forma"`, distinção explícita entre conta bancária/digital manual interna vs integração bancária automática, e alertas reais com `"Tentar novamente"` em caso de erro |
| 5 | `/configuracoes/bancos-pagamentos` truncava contas em 50 itens e silenciava erros de carregamento como se a lista estivesse vazia | `PaymentProvidersSettings.tsx` chamava `cashApi.configuration(officeId, 1, null).catch(() => setCashConfig(null))` | `src/features/cash/cashConfigLoader.ts`, `shared/manualPaymentFlow.ts`, `src/features/settings/PaymentProvidersSettings.tsx` | Carregamento completo multi-página (`loadAllCashConfigurationPages`), estados explícitos `loading`/`ready`/`forbidden`/`error` com `"Tentar novamente"`, `"Atualizar contas financeiras"`, exclusão explícita de contas inativas e em espécie (com contagem transparente) e link `"Criar ou gerenciar contas no Caixa"` para gestores |
| 6 | Conta pessoal (`/conta`) sem seletor multi-escritório para equipe e sem estado textual claro de carregamento | `AccountPage.tsx` fixava apenas o primeiro escritório da sessão | `src/features/operation/AccountPage.tsx` | Adicionado seletor de escritório para equipe multi-escritório, estado de carregamento textual sem spinner e preservação dos dados em erro transitório |
| 7 | Central de Autorizações sem CTA direto para abrir caixa quando pagamento aprovado aguarda abertura de caixa, e `ManualPaymentApprovalForm` sem retry/estado vazio claro de aprovadores | `ApprovalsPanel.tsx` exibia apenas texto estático de caixa fechado; `ManualPaymentApprovalForm.tsx` não diferenciava erro de rede de lista vazia | `src/features/approvals/ApprovalsPanel.tsx`, `src/features/approvals/ManualPaymentApprovalForm.tsx`, `server/modules/financial-approvals/router.ts`, `server/modules/cash/router.ts` | Adicionado CTA `"Abrir meu caixa"` em `ApprovalsPanel`, recarga automática em conflito `409`, estados de carregamento/erro/vazio com retry em `ManualPaymentApprovalForm`, e mensagens PT-BR específicas por código nos routers Express |
| 8 | **Bloqueio crítico de banco de dados (escopo IA 2)**: `owner` e `admin` com `payments.manual.approve` bloqueados no SQL quando a solicitação está atribuída a outro integrante | `private.cash_eligible_charges` e `private.payment_operate` exigem `private.request_can_work(r, m)` (`assignee_id IS NULL OR assignee_id = m.id`) | **Não alterado pela IA 1** (Regra 4 — pertence à IA 2) | Documentado integralmente na Seção 4 abaixo para migration aditiva da IA 2 |

---

## 2. Lista completa de arquivos criados/modificados pela IA 1

### Criados
- `shared/manualPaymentFlow.ts`
- `src/features/cash/cashConfigLoader.ts`
- `src/features/cash/ManualPaymentAction.tsx`
- `tests/general-correction-ia1.test.ts`
- `tests/browser/general-correction-ia1.spec.ts`
- `docs/handoffs/correcao-frontend-backend-para-ia2.md`

### Modificados
- `src/features/requests/RequestDetail.tsx`
- `src/features/charges/ChargesPage.tsx`
- `src/features/cash/CashPaymentsPanel.tsx`
- `src/features/cash/CashStatement.tsx`
- `src/features/cash/CashConfigurationPanel.tsx`
- `src/features/cash/CashOpeningForm.tsx`
- `src/features/cash/CashPage.tsx`
- `src/features/cash/cash.css`
- `src/features/operation/AccountPage.tsx`
- `src/features/settings/PaymentProvidersSettings.tsx`
- `src/features/approvals/ManualPaymentApprovalForm.tsx`
- `src/features/approvals/ApprovalsPanel.tsx`
- `server/modules/financial-approvals/router.ts`
- `server/modules/cash/router.ts`
- `docs/handoffs/figma-especificacao-evolucao.md`

### Confirmadamente NÃO modificados (escopo exclusivo IA 2)
- `supabase/migrations/**` (nenhuma alteração)
- `supabase/functions/**` (nenhuma alteração)
- `vercel.json` (nenhuma alteração)
- `.env.example` (nenhuma alteração)

---

## 3. APIs, RPCs e permissões esperadas

### Rotas Express utilizadas
- `POST /api/cash/configuration` → RPC `cash_configuration` (paginação de 50 itens; frontend agora carrega todas as páginas até 20 páginas para seletores completos)
- `POST /api/cash/dashboard` e `POST /api/cash/dashboard-filtered` → RPCs `cash_dashboard` / `cash_dashboard_filtered`
- `POST /api/cash/configure` → RPC `cash_configure` (unidade, conta e forma de pagamento)
- `POST /api/cash/open` → RPC `cash_open`
- `POST /api/cash/statement` → RPC `cash_statement`
- `POST /api/cash/eligible-charges` → RPC `cash_eligible_charges`
- `POST /api/cash/payment` → RPC `payment_operate` (`kind: 'record' | 'confirm' | 'reject' | 'settle'`)
- `POST /api/charges/view` → RPC `request_charge_view`
- `POST /api/account/read` e `POST /api/account/save` → RPCs `account_read` / `account_save`
- `POST /api/financial-approvals/approvers` → RPC `financial_approval_eligible_approvers`
- `POST /api/financial-approvals/list` → RPC `financial_approvals_page`
- `POST /api/financial-approvals/manual-payment/request` → RPC `financial_approval_request_manual_payment`
- `POST /api/financial-approvals/:id/decide` → RPC `financial_approval_decide`
- `POST /api/financial-approvals/:id/execute-payment` → RPC `financial_approval_execute_manual_payment`
- `POST /api/payment-providers/state` e rotas de salvamento/validação → RPCs `payment_providers_*`

### Matriz de permissões por perfil
| Ação | Super administrador (`owner`) | Administrador (`admin`) | Funcionário (`employee`) | Cliente (`client`) |
| --- | --- | --- | --- | --- |
| Informar e confirmar pagamento manual diretamente | Permitido (com `cash.open`, `charges.read`, `requests.read` e caixa aberto) | Permitido **somente com `payments.manual.approve`** (+ `cash.open`, `charges.read`, `requests.read`) | **Bloqueado** (sempre exige autorização) | Bloqueado |
| Solicitar autorização de pagamento manual | Desnecessário (confirma direto) | Permitido quando **sem `payments.manual.approve`** (+ `cash.open`, `charges.read`, `requests.read`) | Permitido com `cash.open`, `charges.read`, `requests.read` | Bloqueado |
| Aprovar / recusar pagamento manual | Permitido no próprio escritório | Permitido com `payments.manual.approve` no próprio escritório | Bloqueado | Bloqueado |
| Configurar unidades, contas e formas no Caixa | Permitido (`cash.manage`) | Permitido com `cash.manage` | Bloqueado | Bloqueado |
| Acessar `/configuracoes/bancos-pagamentos` | Permitido (`settings.access` + `payments.providers.manage`) | Permitido com `settings.access` + `payments.providers.manage` | Bloqueado | Bloqueado |
| Editar nome de exibição na Conta pessoal | `/conta` (multi-escritório) | `/conta` (multi-escritório) | `/conta` (multi-escritório) | `/minha-conta` (leitura protegida) |

---

## 4. Requisitos CRÍTICOS de banco de dados / Supabase (Ação obrigatória da IA 2)

> **IMPORTANTE**: Nenhuma alteração SQL foi feita pela IA 1 (Regra 4). Sem as migrations aditivas abaixo aplicadas pela IA 2 no Supabase, o fluxo de Super administrador / Administrador autorizado informando pagamento manual em solicitações atribuídas a outros integrantes continuará sendo barrado pelo banco de dados.

### 4.1 Bloqueio atual identificado no SQL (somente leitura pela IA 1)
1. **`supabase/migrations/20261023153038_cash_payments_portal.sql` (linha ~106 — `private.cash_eligible_charges`)**:
   - Filtra `AND private.request_can_work(r, m) IS TRUE`.
   - `private.request_can_work` (`20261021124414_request_followup_client_notifications.sql`, linhas 161–163) retorna `r.assignee_id IS NULL OR r.assignee_id = m.id`.
   - **Efeito**: Mesmo o `owner` (Super administrador) ou um `admin` com `payments.manual.approve` + `requests.read_all` **não consegue enxergar nem pagar** cobranças de solicitações atribuídas a outro funcionário!
2. **`supabase/migrations/20261024032407_payments_allocations.sql` (linhas ~146 e ~177 — `private.payment_operate`)**:
   - Exige `private.request_can_work(r, m) IS TRUE` para `record` e `confirm`.
   - Além disso, hoje `payment_operate` não valida no SQL a permissão `payments.manual.approve` (ou papel `owner`) quando `status = 'confirmed'` ou `kind = 'confirm'`. Sem essa trava no banco, um operador sem `payments.manual.approve` poderia tentar chamar a API diretamente contornando a UI.
3. **`supabase/migrations/20261122121000_financial_approvals_workflow.sql` (`financial_approval_request_manual_payment` e `financial_approval_execute_manual_payment`)**:
   - Conferir se já está aplicada no ambiente alvo junto com `20261122120000` e `20261122122000`.
   - Garantir que o escopo de leitura/pagamento de cobranças respeite:
     - `owner` ou `admin` com `payments.manual.approve` / `requests.read_all` → acesso às solicitações do **próprio escritório** (`r.office_id = m.office_id`, preservando isolamento estrito entre escritórios e níveis 1/2/3 onde aplicável).
     - `employee` / `admin` sem escopo amplo → acesso conforme `private.request_in_scope(r, m)` / `private.request_can_work(r, m)` dentro do escritório.

### 4.2 Checklist de migration aditiva recomendada para a IA 2
- [ ] Criar nova migration aditiva (nunca editar migrations históricas já aplicadas!) ajustando:
  1. `private.cash_eligible_charges`: permitir que `owner` ou integrante com `payments.manual.approve` + `requests.read_all` liste cobranças elegíveis do próprio escritório mesmo quando atribuídas a outro atendente (`r.office_id = m.office_id`).
  2. `private.payment_operate`:
     - Alinhar a verificação de escopo de solicitação com a mesma regra de escritório/autoridade acima;
     - Exigir `m.role_code = 'owner' OR (m.role_code = 'admin' AND private.has_permission(m.id, 'payments.manual.approve'))` para `kind = 'record'` com `status = 'confirmed'` e para `kind = 'confirm'` (retornando `403` com código `CASH_FORBIDDEN` ou `PERMISSION_REVOKED` caso contrário);
     - Manter bloqueio rigoroso de cross-office (`r.office_id = m.office_id AND s.office_id = m.office_id`) e idempotência por chave única.
  3. Confirmar aplicação e catálogo em `role_permissions` para: `payments.manual.approve`, `charges.discount.approve`, `payments.providers.manage`, `requests.delete`.
  4. Validar que `cash_configuration` retorna todas as contas/unidades/formas ativas e inativas do escritório selecionado corretamente na paginação (`page`, `page_size`), sem vazamento entre escritórios.

---

## 5. Itens dependentes da Vercel / infraestrutura (IA 2)

- Conferir variáveis de ambiente server-side na Vercel (nunca expor segredos em `VITE_*` nem no frontend):
  - `VITE_SUPABASE_URL` e `VITE_SUPABASE_PUBLISHABLE_KEY` (públicas)
  - Credenciais de provedores bancários/PSP/maquininhas e segredos de webhook somente em variáveis server-side / Vault do Supabase quando cada provedor real for homologado.
- Conferir cabeçalhos e rotas de `/api/*` no `vercel.json` (mantido intacto pela IA 1).
- Validar no ambiente real publicado (preview → produção) com contas reais dos 4 perfis (`owner`, `admin` com/sem `payments.manual.approve`, `employee`, `client`).

---

## 6. Testes executados pela IA 1 e resultados

*(Esta seção será atualizada imediatamente após a execução completa da suíte de validação da Fase 9.)*

---

## 7. Limitações reais deste ambiente

1. **Figma**: Sem conector/MCP Figma ativo — especificação completa das 12 telas/estados atualizada em `docs/handoffs/figma-especificacao-evolucao.md` (Seção 7) para espelhamento fiel no Figma.
2. **Git**: Contêiner sem diretório `.git` — não foi possível rodar `git status`/`git log` nem verificar o SHA `5a07955a5faf841785c8e112694453642b3c95b1` localmente.
3. **Banco de dados real**: Testes de API e navegador rodaram com contratos/servidores locais isolados (sem acesso ao projeto Supabase real de produção); a validação end-to-end contra o PostgreSQL real após a migration da Seção 4 cabe à IA 2.
4. **Lockfile (`package-lock.json`)**: Ausente neste contêiner; testes que inspecionam `package-lock.json` (`tests/helpers/auditDependencies.ts`) reportam essa ausência como pré-existente.
