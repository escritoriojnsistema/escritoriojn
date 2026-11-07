# Categorias na abertura de solicitações — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** equipe escolhe categoria central antes de abrir; proprietário abre atendimento, demais membros abrem atendimento quando habilitados e pré-atendimento nos demais casos.
**Architecture:** RPC aditiva `staff_category_request_create(uuid,jsonb,uuid)` deriva a modalidade da identidade vigente e categoria, preservando snapshots e idempotência. O formulário elimina o seletor manual e envia categoria; os fluxos legados de serviços/atalhos continuam disponíveis.
**Tech Stack:** React/Vite/TypeScript, Express, PostgreSQL/Supabase.
**Spec:** pedido do usuário de06/11/2026, correções1–2, e docs/superpowers/specs/2026-11-05-correcoes-integradas.md.

## Global Constraints
Não editar migrations aplicadas, Livro, runner, arquivos de outros domínios. Não publicar/commitar neste domínio. Sem níveis/preços/serviços reais inventados ou fixtures hospedadas. Mesmas guardas de escopo, sessão e capacidades.

## Review Focus
Categoria arquivada/externa negada; nível pendente não habilita equipe; owner não cai em coleta; modo forjado não concede execução; serviço de outra categoria não entra no snapshot escolhido.

### Task1 — Contrato e banco
**Files:** nova migration `staff_category_request_create`; `shared/requests.ts`; `server/modules/requests/{validation,router}.ts`; `tests/request-category-opening.test.ts`; `tests/database/staff-category-opening.sql`.
**Interfaces:** RPC `(p_office_id uuid,p_request jsonb,p_idempotency_key uuid) RETURNS jsonb` usa payload staff com `category_id` e `message`, sem modo. Resultado detalhe oficial existente.
- [x] Escrever e executar testes RED de payload categorizado sem itens/modo forjado.
- [x] Implementar RPC transacional com categoria ativa, modalidade derivada após locks e snapshot canônico antes da atribuição; proteger correspondência dos serviços e idempotência.
- [x] Executar SQL local para owner/admin/employee em níveis independentes, pendentes, categoria inválida/arquivada, retry e mismatch.

### Task2 — Formulário categoria primeiro
**Files:** `src/features/requests/{RequestForm,RequestsPage,api,RequestItems,RequestPicker}.tsx/ts`; `tests/browser/staff-category-opening.spec.ts`.
**Interfaces:** RequestForm recebe papel verificado para apresentação; requestsApi roteia payload categorizado à RPC nova pelo servidor. Banco continua autoridade.
- [x] Verificar browser: categoria sempre visível e seletor de modo ausente. RED visual não foi isolado; RED de contrato Node e permissões SQL registrado nos domínios.
- [x] Exibir modalidade derivada, permitir coleta integral e serviços opcionais na abertura habilitada, mantendo fluxos rápidos anteriores.
- [x] Rodar Node/API, typecheck e browser360/1440; relatar limitações e enviar ao coordenador.

Verificação do domínio:13Node/API/DTO passaram; migration aplicada localmente sob migrator;21asserçõesSQL passaram antes da adição de uma verificação explícita de rollback (22no arquivo final, coordenador executa replay). Typecheck e diffcheck passaram. Browser22/22 passou (14regressõesSolicitações +8novos cenários360/1440), sem fixtures hospedadas. Primeira tentativaUI sem configuraçãoSDK e segunda tentativa completa sem espaço falharam antes de validar o comportamento; retentativa usa configuração fictícia e /dev/shm.
