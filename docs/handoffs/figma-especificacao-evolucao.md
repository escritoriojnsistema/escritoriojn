# Auditoria Inicial (Etapa 0) e Especificação de Telas Figma (Etapa 7) — Escritório JN

**Status do arquivo Figma**: O arquivo Figma do projeto não estava acessível diretamente neste ambiente de execução (sem conector/MCP Figma conectado). Portanto, este documento registra com precisão todas as telas, componentes, fluxos, estados, textos exatos e diretrizes de design alinhados ao design system vigente do Escritório JN (`Executive Navy`, `Brass Gold`, `Alabaster`, tipografia `Newsreader` + `Plus Jakarta Sans`, 4 atalhos no mobile, zero loaders falsos e contraste WCAG 2.2 AA), para aplicação fiel no Figma sem divergência entre design e código.

---

## 1. Matriz de Auditoria Técnica Inicial (Etapa 0)

| Domínio / Funcionalidade | Estado anterior ao Prompt 1 | Lacunas / Riscos identificados | O que foi implementado pela IA 1 | O que depende da IA 2 (Supabase / Vercel) |
| --- | --- | --- | --- | --- |
| **Exclusão definitiva de solicitação (Etapa 1)** | Inexistente (apenas cancelamento/arquivamento de atendimento e exclusão individual de anexo em `files`) | Risco de exclusão sem revalidação de versão/status, quebra de vínculo financeiro/documental, limpeza parcial de Storage ou link quebrado em notificação | Regras puras em `shared/requestDeletion.ts`; router `/api/request-deletion` (`eligibility`, `execute`, `status`); UI em `RequestDeleteModal.tsx` integrado a `RequestDetail.tsx` e `RequestsPage.tsx`; notificação `request_deleted` sem link quebrado e CTA `"Iniciar nova solicitação"` | Tabelas de controle/idempotência, RPCs `request_deletion_eligibility`, `request_delete_permanently`, `request_deletion_status`, coordenação de remoção física de anexos exclusivos no Storage e preservação de anexos compartilhados/retidos |
| **Pagamentos no Portal do Cliente (Etapa 2)** | `PaymentsPage.tsx` exibia apenas cobranças, parcelas, histórico de pagamentos e recibos — sem checkout eletrônico (Pix/Cartão) | Cliente precisava ir manualmente até outra aba ou depender de atendimento manual; sem estados claros para integração não configurada ou em validação | `shared/paymentCheckout.ts` (12 estados oficiais); router `/api/payment-checkout` (`client/summary`, `client/intent`, `intent/status`, `webhooks/:provider`); `ClientCheckoutPanel.tsx` integrado a `PaymentsPage.tsx` e atalho direto em `RequestDetail.tsx` | Tabelas de intenções/transações/webhooks, RPCs `client_payment_checkout_summary`, `payment_checkout_create_intent`, `payment_checkout_intent_status`, integração com provedor bancário/PSP real, verificação criptográfica de webhook e conciliação |
| **Cobrança eletrônica pela Equipe (Etapa 3)** | Equipe criava cobrança e registrava recebimentos manuais no caixa; sem Pix dinâmico ou cobrança integrada em maquininha | Necessidade de vincular Pix e maquininha à cobrança oficial sem duplicar saldo, compartilhar Pix manualmente via WhatsApp sem depender da API oficial e diferenciar autorização/captura/liquidação | Endpoints `/api/payment-checkout/staff/pix` e `/staff/card-terminal`; componente `TeamCollectionPanel.tsx` integrado em `ChargesPage.tsx` com QR Code dinâmico, Copia e Cola, compartilhamento manual para WhatsApp e 9 estados de maquininha | RPCs `staff_payment_generate_pix`, `staff_payment_start_terminal`, integração real com PSP/adquirente/conector de terminal, job de expiração e conciliação |
| **Aprovação de pagamento manual (Etapa 4)** | Recebimento manual liberado diretamente a quem tinha `cash.receive` | Necessidade de exigir aprovação de `owner` ou `admin` com `payments.manual.approve` para operadores sem permissão direta, garantindo uso único e bloqueio por alteração de cobrança | Permissão `payments.manual.approve`; domínio em `shared/financialApprovals.ts`; router `/api/financial-approvals`; `ManualPaymentApprovalForm.tsx` em `CashPaymentsPanel.tsx`; aba `Autorizações` em `CashPage.tsx` (`ApprovalsPanel.tsx`) e notificações acionáveis | Tabela de solicitações de aprovação financeira, TTL/expiração, RPCs `financial_approval_eligible_approvers`, `financial_approvals_page`, `financial_approval_request_manual_payment`, `financial_approval_decide`, `financial_approval_execute_manual_payment` |
| **Aprovação de desconto (Etapa 5)** | Desconto direto apenas para quem tinha `charges.adjust` com `can_discount` | Operador sem permissão direta de desconto não conseguia formalizar pedido com aprovação, separando desconto comercial de taxa de cartão | Permissão `charges.discount.approve`; cálculo puro `calculateCommercialDiscount` (R$ e %); `DiscountApprovalForm.tsx` em `ChargesPage.tsx`; fluxo unificado de análise e decisão em `ApprovalsPanel.tsx` | RPC `financial_approval_request_discount`, aplicação atômica do desconto aprovado na cobrança oficial via `financial_approval_decide`, invalidação por mudança de versão/saldo |
| **Configurações → Bancos e Pagamentos (Etapa 6)** | Ausente; existia apenas `docs/backlog/integracoes/flags.example.json` (documental) | Necessidade de área administrativa agnóstica de provedor, orientada por capabilities, sem senhas bancárias e sem alterar os 4 atalhos mobile | Permissão `payments.providers.manage`; router `/api/payment-providers`; rota `/configuracoes/bancos-pagamentos`; `PaymentProvidersSettings.tsx` com 5 abas (`Bancos e provedores`, `Pix`, `Cartões online`, `Maquininhas`, `Histórico e diagnósticos`) | Tabelas de provedores, configurações Pix/cartão e maquininhas; armazenamento seguro de segredos server-side (Vault/env); RPCs `payment_providers_state`, `payment_provider_save`, `payment_provider_validate`, `payment_pix_settings_save`, `payment_online_cards_save`, `payment_terminal_save`, `payment_terminal_test`, `payment_terminal_deactivate` |
| **Permissões, Auditoria e Notificações transversais** | 4 módulos operacionais + 4 atalhos mobile preservados | Garantir 1:1 de permissões em `permissionModules.ts`, notificações sem vazar dados internos e auditoria só para equipe na exclusão | Atualizados `shared/team.ts`, `shared/permissionModules.ts`, `shared/governance.ts`, `shared/notifications.ts`, `server/modules/notifications/dto.ts`, `NotificationsPage.tsx` e `NotificationDrawer.tsx` | Seed/catálogo de novas permissões em `role_permissions`, triggers de auditoria (`requests.deleted`, `payments.*`, `charges.discount_approval_*`, `payment_providers.*`) e inserção de notificações no banco |

---

## 2. Identidade Visual e Regras Transversais de UI (Figma)

- **Paleta oficial preservada**:
  - Superfície principal: Alabaster (`#F8F9FA` / `#FFFFFF` em cartões)
  - Primária institucional: Executive Navy (`#0F172A` / `#1E293B`)
  - Acento editorial/destaque: Brass Gold (`#B48A3E` / `#9A7228`)
  - Destrutivo/erro: Crimson seguro com contraste ≥ 4.5:1 (`#991B1B` sobre `#FEF2F2`, borda `#FECACA`)
  - Sucesso/confirmado: Emerald sóbrio (`#065F46` sobre `#ECFDF5`)
  - Aviso/aguardando: Amber sóbrio (`#92400E` sobre `#FFFBEB`)
- **Tipografia**: `Newsreader` para títulos de página/seção; `Plus Jakarta Sans` para controles, dados financeiros (`tabular-nums`) e mensagens.
- **Regras estruturais invioláveis**:
  - Barra lateral agrupada preservada (sem criar novos nós raiz).
  - Barra inferior mobile limitada a **exatamente 4 atalhos principais** (`Início`, `Solicitações`, `Clientes`, `Ajustes` ou equivalentes do perfil).
  - **Zero loaders/spinners bloqueantes** ou esqueletos artificiais — estados transitórios usam texto claro nos controles (`Verificando...`, `Excluindo...`, `Atualizando...`).
  - Alvos clicáveis com altura mínima de `44px` em mobile e `16px` em inputs para evitar zoom no iOS.
  - Linguagem 100% em português do Brasil, orientada ao usuário final (zero termos técnicos como `RPC`, `Supabase`, `PGRST202`, `JSON`, `webhook`).

---

## 3. Especificação de Telas — Portal do Cliente

### 3.1 Detalhe da Solicitação com Ação de Exclusão Elegível / Bloqueada
- **Rota**: `/minhas-solicitacoes` (painel de detalhe)
- **Breakpoints**: Desktop `1440px` (split/detail card) · Mobile `375px` / `390px` (coluna única empilhada)
- **Elementos**:
  - Cabeçalho com protocolo, título, etiqueta de situação e ações principais.
  - Atalho financeiro: botão secundário `"Ver cobrança e pagamento"` levando para `/meus-pagamentos` com a cobrança da solicitação destacada.
  - Bloco `"Exclusão definitiva"` ao final da ficha:
    - **Estado Elegível**: botão destrutivo discreto `"Excluir solicitação"` (abre modal de confirmação).
    - **Estado Bloqueado**: aviso claro com motivo específico (ex.: atendimento já iniciado, documento emitido ou cobrança vinculada) e alternativas recomendadas (ex.: `"Falar com o atendimento"`, `"Solicitar cancelamento formal"`).
    - **Estado Indisponível (pré-IA 2)**: bloco oculto/desabilitado sem falsa promessa de exclusão.

### 3.2 Modal de Confirmação de Exclusão Definitiva (Cliente e Equipe)
- **Componente**: `<dialog>` nativo acessível (`aria-modal="true"`, foco gerenciado, fechamento por `Esc` bloqueado durante processamento).
- **Copy obrigatório**:
  - Título: `"Excluir solicitação permanentemente?"`
  - Corpo padrão: `"Esta ação não pode ser desfeita. A solicitação será removida do sistema junto com seus anexos exclusivos."`
  - Adendo obrigatório quando executado pela **Equipe**: `"O cliente será notificado sobre a exclusão da solicitação."`
  - Resumo estruturado: protocolo, título da solicitação, contagem de anexos exclusivos a remover e anexos compartilhados/retidos que serão preservados.
- **Estados**:
  1. `Confirmação`: checkbox obrigatório de ciência + botões `"Cancelar"` e `"Excluir permanentemente"`.
  2. `Processando`: botões desabilitados, mensagem `"Excluindo solicitação e removendo anexos exclusivos..."` (bloqueia fechamento acidental).
  3. `Falha na limpeza de anexos`: estado persistente informando que a remoção física dos arquivos encontrou falha, com botão `"Verificar resultado"` (consulta `/status` pela mesma chave idempotente).
  4. `Conflito / Bloqueio (409 / 422)`: alerta inline explicando que a solicitação mudou de situação ou não é mais elegível, sem fechar abruptamente.

### 3.3 Notificação do Cliente sobre Solicitação Excluída pela Equipe
- **Rotas**: `/notificacoes` e Drawer do sino (`NotificationDrawer`)
- **Copy obrigatório**:
  - Título: `"Sua solicitação foi excluída"`
  - Corpo: `"A solicitação <PROTOCOLO> foi excluída pela equipe do Escritório JN. Caso ainda precise deste serviço, você pode iniciar uma nova solicitação."`
- **Ação obrigatória**:
  - Botão `"Iniciar nova solicitação"` → navega para `/minhas-solicitacoes` com `state: { start_new: true }`.
  - **Proibido**: qualquer link para o registro excluído (`can_open: false`).

### 3.4 Cobrança e Pagamento do Cliente (Checkout)
- **Rota**: `/meus-pagamentos`
- **Breakpoints**: Desktop `1440px` · Mobile `375px` / `390px`
- **Estrutura por cobrança**:
  - **Resumo financeiro (`tabular-nums`)**: Valor original, Desconto aprovado, Acréscimo autorizado, Taxa de cartão (quando aplicável e separada), Total final, Valor já pago e Saldo restante.
  - **Badge de status de pagamento** cobrindo todos os **12 estados oficiais**:
    1. `available` — Disponível para pagamento
    2. `selecting_method` — Escolhendo meio de pagamento
    3. `awaiting_payment` — Aguardando pagamento
    4. `processing` — Processando pagamento
    5. `confirmed` — Pagamento confirmado
    6. `refused` — Pagamento recusado
    7. `expired` — Pagamento expirado
    8. `cancelled` — Pagamento cancelado
    9. `partially_received` — Pagamento parcialmente recebido
    10. `pending_reconciliation` — Divergência pendente de conciliação
    11. `communication_error` — Erro de comunicação com o provedor
    12. `provider_unconfigured` — Provedor não configurado
  - **Seletor de meio de pagamento** (somente meios habilitados pelo escritório):
    - `pix_qr` / `pix_copy_paste` (gera QR Code dinâmico + código Copia e Cola + botão `"Copiar código Pix"` + validade).
    - `credit_card` — Cartão de crédito
    - `installments` — Cartão de crédito parcelado (seletor dinâmico calculado via `computeInstallmentOptions` respeitando parcela mínima e máximo configurado)
    - `debit_card` — Cartão de débito online
  - **Botão de verificação autoritativa**: `"Atualizar situação do pagamento"` (consulta backend — nunca confirma pagamento apenas por ação visual ou retorno de navegador).
  - **Comprovante**: exibido somente após `confirmed` com número do recibo, data e valor confirmado.

---

## 4. Especificação de Telas — Área da Equipe

### 4.1 Detalhe da Solicitação com Exclusão (Equipe)
- **Rota**: `/solicitacoes` (detalhe operacional)
- **Comportamento**:
  - Exibe ação `"Excluir solicitação"` somente quando o backend confirma elegibilidade + permissão `requests.delete`.
  - Bloqueado automaticamente quando o atendimento está `aguardando_cliente` (Situação C) ou possui vínculos financeiros/documentais/legais.
  - Modal apresenta adendo de notificação ao cliente e alerta que a ação ficará registrada na auditoria interna.

### 4.2 Cobrança Eletrônica da Equipe (Pix e Maquininha)
- **Rota**: `/cobrancas` (painel integrado em `ChargesPage.tsx`)
- **Subseções**:
  1. **Cobrança Pix dinâmica**:
     - Vinculada ao `charge_id` oficial (sem duplicar cobrança).
     - Campo de valor (pré-preenchido com saldo aberto, editável até o saldo), botão `"Gerar Pix"`.
     - Após geração: exibe código Copia e Cola, validade, botão `"Copiar código Pix"` e botão `"Enviar pelo WhatsApp (manual)"` que abre `wa.me` com mensagem pronta (independente da API oficial do WhatsApp).
  2. **Cobrança na Maquininha integrada**:
     - Seletor de terminal ativo do escritório/unidade.
     - Seletor de modalidade: `credit_cash` (`Crédito à vista`), `credit_installment` (`Crédito parcelado`), `debit` (`Débito`).
     - Botão `"Enviar para maquininha"` e botão `"Atualizar status"`.
     - Indicador claro dos **9 estados de maquininha**:
       1. `terminal_available` — Maquininha disponível
       2. `terminal_disconnected` — Maquininha desconectada
       3. `awaiting_card` — Aguardando cartão
       4. `processing` — Processando
       5. `authorization_received` — Autorização recebida (aguardando captura)
       6. `capture_confirmed` — Captura confirmada
       7. `refused` — Recusado
       8. `communication_interrupted` — Comunicação interrompida
       9. `pending_reconciliation` — Pendente de conciliação
     - Exibição explícita do estágio de liquidação (`Autorizada`, `Capturada`, `Liquidada`, `Estornada`, `Em contestação`).

### 4.3 Solicitação de Autorização de Pagamento Manual (Caixa)
- **Rota**: `/caixa` (painel `CashPaymentsPanel.tsx`)
- **Fluxo**:
  - Quando operador possui `cash.receive` mas **não** possui `payments.manual.approve` (nem papel `owner`), a confirmação direta é substituída pelo botão `"Solicitar autorização"`.
  - Formulário inline/painel com: cobrança/protocolo, valor solicitado, forma de pagamento manual, seletor de aprovador elegível do mesmo escritório (filtrado pelo backend) e justificativa obrigatória.
  - Estados claros: envio pendente, sem aprovadores elegíveis, backend aguardando ativação (`503`), pedido criado com link para acompanhar na aba `Autorizações`.

### 4.4 Solicitação de Autorização de Desconto (Cobranças)
- **Rota**: `/cobrancas` (`DiscountApprovalForm.tsx`)
- **Fluxo**:
  - Exibido para usuários sem permissão direta de desconto (`!can_discount`) em cobranças abertas com saldo > 0.
  - Alternância entre **Valor em R$** e **Percentual (%)**, com prévia em tempo real de: valor original, desconto comercial solicitado e novo valor final (mantendo taxa de cartão separada).
  - Seletor de aprovador elegível (`owner` ou `admin` com `charges.discount.approve`) e justificativa obrigatória.

### 4.5 Central de Autorizações Financeiras (Aprovador e Solicitante)
- **Rota**: `/caixa` → Aba `Autorizações` (acessível também via deep-link da notificação `"Analisar autorização"`).
- **Filtros**: Escopo (`Todas`, `Para minha análise`, `Minhas solicitações`) e Tipo (`Todos`, `Pagamento manual`, `Desconto`).
- **Cartão de autorização**:
  - Cabeçalho: tipo (`Pagamento manual` ou `Desconto comercial`), status (`Pendente`, `Aprovada`, `Recusada`, `Expirada`, `Revogada`, `Executada`), protocolo e cliente.
  - Resumo numérico: valor original, desconto/valor solicitado, valor final, forma de pagamento, solicitante, aprovador, validade e justificativa.
  - Ações do aprovador (somente quando `can_decide === true` e `status === 'pending'`): campo de observação + botões `"Aprovar"` e `"Recusar"`.
  - Ação de execução única (somente para `manual_payment` com `status === 'approved'` e `can_execute === true`): botão `"Concluir recebimento no caixa"` (exige sessão de caixa aberta).
  - Motivo de invalidação exibido em destaque quando status for `expired` ou `revoked` (ex.: cobrança alterada, saldo insuficiente ou permissão revogada).

---

## 5. Especificação de Telas — Configurações → Bancos e Pagamentos

- **Rota**: `/configuracoes/bancos-pagamentos`
- **Acesso**: Somente `owner` ou `admin` com `settings.access` + `payments.providers.manage`.
- **Estrutura de 5 abas** (sem alterar menu raiz nem atalhos mobile):
  1. **Bancos e provedores**: lista de provedores configurados por escritório, catálogo agnóstico, ambiente (`Sandbox`, `Homologação`, `Produção`), conta de recebimento, unidade financeira, referência opaca de credencial (nunca senha bancária), matriz de capabilities exibindo `"Não disponível para este provedor"` para recursos sem suporte e botão `"Validar conexão"`.
  2. **Pix**: provedor vinculado, ativação de QR Code dinâmico, Copia e Cola, tempo de expiração em minutos, conciliação e estorno (switches desabilitados com rótulo `"Não disponível para este provedor"` quando capability for `false`).
  3. **Cartões online**: provedor vinculado, crédito à vista, débito, parcelamento, limite de parcelas (até 12x), valor mínimo por parcela e política informativa de taxas (separada de desconto comercial).
  4. **Maquininhas**: cadastro por escritório/unidade com apelido, fabricante, modelo, provedor/adquirente, modo de conexão (`API em nuvem` ou `Conector/agente local`), status (`Ativa`, `Desconectada`, `Inativa`, `Erro`), último sinal e ações `"Testar comunicação"` e `"Desativar"`.
  5. **Histórico e diagnósticos**: resumo de prontidão de banco/credenciais, contador de pendências de conciliação e lista de diagnósticos seguros (sem chaves, tokens ou stack traces).

---

## 6. Checklist de Paridade Design ↔ Código

- [x] Todos os 12 estados de pagamento do cliente mapeados e rotulados em PT-BR.
- [x] Todos os 9 estados de maquininha mapeados e rotulados em PT-BR.
- [x] Todos os 6 estados de autorização financeira mapeados e rotulados em PT-BR.
- [x] Copy exato do modal de exclusão e da notificação de exclusão pela equipe preservado.
- [x] Navegação agrupada e limite de 4 atalhos mobile preservados.
- [x] Estados `provider_unconfigured` e `backend_ready: false` previstos sem simulação de sucesso.
