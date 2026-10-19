# Etapa08 — vínculos, representantes e duplicidades

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development to implement task-by-task with task review and final whole-branch review.

**Goal:** Entregar a Etapa08 oficial de ponta a ponta preservando histórico, autorização e padrões visuais.
**Architecture:** Extensão do módulo Clientes com estado agregado por RPC e comandos transacionais. Banco é autoridade; API valida e transporta; frontend mantém shell/contexto verificado.
**Tech Stack:** React19/Vite8/TypeScript7, Express5, Supabase PostgreSQL17/Auth.
**Spec:** contrato-08.md e etapa-08.md.

## Global Constraints
React + Vite + TypeScript, Express /api e Supabase; não usar Next.js. Preservar dados/contas existentes e toda a proteção por UID/session_id/escritório/capacidades, inclusive após locks. Não usar user_metadata como autoridade. Nenhum segredo em browser/Git/log/audit.changes. Sem portal documental ativo. Reusar OperationLayout; até quatro atalhos principais de mobile (Início e Conta incluídos), extras na lateral para todos os perfis. Campos mobile16px, alvos44px, foco visível. Sem spinner/loader/overlay visível; rótulos estáveis, bloqueio de repetição e erros honestos. Evitar rolagem por composição compacta, nunca cortar conteúdo/zoom/teclado. Fixtures apenas no laboratório local; nenhum e-mail/conta hospedado de teste. Migração aditiva e replay com migrador NOSUPERUSER/NOBYPASSRLS.

## Review Focus
- Revogação não confundir autoridade por vínculo com permissão de criador/read_all; provar ambos os casos.
- Mesclagem não transferir acesso da origem nem alterar snapshots/referências de documentos antigos.
- Colisões de Auth/portal e confirmações públicas concorrentes não criar associação automática ou deadlock.
- Resposta atrasada após troca de usuário/escritório/permissão não reapresentar estado privado.
- Formulários mobile com erro/zoom/teclado manter ações alcançáveis e sem corte artificial.

### Task1 — domínio, SQL e contratos
**Files:** shared/customerRelations.ts; nova migration gerada pela CLI; tests/database/customer-relations.sql; scripts/test-database.mjs; shared/customers.ts apenas extensões necessárias ao domínio; ajustes SQL do CRUD07 em nova migration.
**Consumes:** customers/memberships/private guards/auditoria existentes.
**Produces:** todas as assinaturas/ações/DTOs de contrato-08.md; documentar payloads exatos em docs/regras/relacionamentos-08.md.
- [ ] Criar testes SQL de requisitos e observar falha por recurso ausente.
- [ ] Implementar migration/contratos e ACLs/constraints/locks/índices.
- [ ] Provar CRUD07 atribuído, revogação, representação/conferência, merge com versões e preservação de fixtures documentais, concorrência e ausência de PII em audit.
- [ ] Executar npm run test:db e npm test; registrar evidências e commit.
- [ ] Revisão de especificação e qualidade; corrigir antes da próxima tarefa.

### Task2 — API e integração de capacidades
**Files:** server/modules/customer-relations/{router,dto,validation}.ts; server/app.ts; shared/team.ts; validação gestão/concessão; tests/customer-relations-api.test.ts e testes de permissões.
**Consumes:** RPCs e DTOs da Task1.
**Produces:** POST state/candidates/command/merge/preview/merge sob /api/customer-relations com Bearer/getUser e RPC únicos, no-store, validação estrita, erros seguros, DTO whitelist.
- [ ] Testes negativos/positivos falham antes da API nova.
- [ ] Implementar router/DTO/validações e atualizar catálogo de capacidades da equipe sem autoatribuir a usuários existentes.
- [ ] Testar autoridade real do banco, payloads inválidos, versões, falha do provedor e stripping de extras; nenhum CPF/evidência em URL/log.
- [ ] npm test e npm run build; registrar e commit.
- [ ] Revisão e correções.

### Task3 — telas e fluxo autenticado
**Files:** src/features/customer-relations/{CustomerRelations,RelationForms,MergeReview,api}.tsx/ts/css conforme tamanho; src/features/customers/CustomersPage.tsx; shared/audit labels; tests/browser/customer-relations-contract.spec.ts; tests/auth/customer-relations.spec.ts; scripts/test-team-ui.mjs/laboratório quando necessário; AGENTS/regras visuais.
**Consumes:** API/DTOs Tasks1–2 e OperationLayout existentes.
**Produces:** Vínculos na ficha e subvisões compactas de atribuição, representantes, conferência, mesclagem/histórico. Sem nova navegação principal.
- [ ] Casos UI/Auth falham antes da interface.
- [ ] Implementar telas usando padrões da ficha e API; sem loaders/spinners, rótulos estáveis e prevenção de repetição.
- [ ] Provar atribuir/revogar, representar/revogar, conferir/revogar e merge completo no Auth lab real, sem portal ativo.
- [ ] Provar mobile/desktop, alturas padrão e rolagem natural em casos extensos; até4 atalhos por papel e isolamento entre sessões/permissões.
- [ ] npm test/build; test:team-ui e test:auth sequenciais; screenshots inspecionados; commit.
- [ ] Revisão da tarefa e revisão final de toda a branch.

### Task4 — validação e entrega
**Files:** docs/etapas/{fecho-08,etapa-08,plano-08}.md, docs/FONTES.md, docs/regras/clientes.md, docs/evidencias/etapa-08/*, LIVRO_RAIZ.md, AGENTS.md.
- [ ] Conferir todos os requisitos oficiais e completar as regras para próximas telas.
- [ ] Medir desempenho sintético e executar checks completos apropriados, sem repetir suítes aprovadas sem mudança/falha nova.
- [ ] PR/CI, migration aditiva hospedada com SQL idêntico testado e contagens/ACL/RLS/advisors conferidos; preservar contas/segredos.
- [ ] Integração/publicação pela autorização permanente desta conversa; validar canônico/rotas/API/bundle e registrar Livro.
- [ ] Fecho com IDs/URLs reais, limites e próximo09 sem iniciar09.
