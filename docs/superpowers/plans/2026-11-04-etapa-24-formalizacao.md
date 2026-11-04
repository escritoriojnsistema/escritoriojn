# Etapa 24 — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [x]`) syntax for tracking.

**Goal:** Formalizar assinatura externa/física por publicação, preservando original e gate de entrega.
**Architecture:** Estender workflow23 com configuração/eventos privados imutáveis, upload11, autorização de saída própria e worker que entrega os bytes validados. DTO tipado único entre SQL/API/UI; frentes com arquivos separados e integração final no coordenador.
**Tech Stack:** React/Vite/TypeScript, Express, Supabase/PostgreSQL/Edge, GitHub→Vercel.
**Spec:** docs/superpowers/specs/2026-11-04-etapa-24-formalizacao.md (aprovada pelo usuário em04/11).

## Global Constraints

- Nenhum GitHub Actions; publicação somente GitHub→Vercel. Sem fixtures/grants/contas reais hospedadas.
- Manter quatro abas/atalhos, padrão Equipe, inputs16px/alvos44px, sem loader/spinner/overlay/rótulo pendente.
- Nenhuma assinatura eletrônica liberada por quarentena ou hash fornecido pelo navegador.
- Revisões/PDFs históricos intactos; service_role somente Edge.
- Pedido de aprovação já resolvido pelo usuário: executar sem nova confirmação rotineira.

## Review Focus

- Validação em arquivo diferente, assinatura inválida, quarentena e scanner ausente: bloquear integralmente.
- Revogação/estorno/edição durante leitura de bytes: reautorizar e comparar referência exata.
- Handoff antes da assinatura: cobrar sem liberar documento nem criar ciclo.
- Troca de identidade/autoridade e falha503: descartar resposta antiga/preservar tentativa exata.
- Modalidade física legada: manter representação e histórico sem fabricar evidência criptográfica.

## Task 1: Contrato e banco (responsável banco)

Files: shared/documentSignatures.ts (coordenador define), migration aditiva, tests/database/documents24.sql, scripts/test-database.mjs.
Interfaces: RPC document_signature_state(p_office_id,p_publication_id,p_page default1); document_signature_command(p_office_id,p_publication_id,p_command,p_idempotency_key); document_signature_authorize(p_office_id,p_publication_id,p_receipt) retorna contrato de artefato. Tipos em shared/documentSignatures.ts. Final document_artifact_authorize seleciona original externo validado.
- [x] Escrever testes SQL para configure/import/validate/physical/revoke, capacidades/escopo, conflito/idempotência, legado, gate/financeiro e revisões.
- [x] Executar e observar RED antes da migration.
- [x] Criar migration por CLI e implementar configuração/eventos imutáveis/RLS/ACL/FKs/índices; alterar guardas atuais sem duplicar workflow.
- [x] Executar dois replays SQL, revisar saída e corrigir regressões.

## Task 2: API/worker (coordenador)

Files: server/modules/document-workflow/router.ts, supabase/functions/document-artifacts/handler.ts, shared/documentSignatures.ts, tests/documents24-api.test.ts, tests/document-artifacts-worker.test.ts.
Interfaces: endpoints /signature-state e /signature-command, body {office_id,publication_id,page} e {office_id,publication_id,command,idempotency_key}; /artifact action signing além de generate/download.
- [x] Escrever testes de payload/whitelist/privacidade e hash/bytes/autoridade, observar RED.
- [x] Validar/projetar DTOs; worker usa RPC separada de saída e aceita original externo somente por referência autorizada, rechecando hash/tamanho/referência após leitura.
- [x] Testes focados e regressões API/worker/PDF verdes; hashes propagados ao proxy e conferidos antes de resposta.

## Task 3: Interface e capacidades (responsável frontend)

Files: src/features/documentWorkflow/SignaturePanel.tsx, WorkflowPanel.tsx, api.ts, CSS existente; shared/team.ts e allowlistsTS pertinentes; testesUI próprios.
Interfaces: SignatureState/Command e endpoints Task2; uploadAttachment reutilizado com limite efetivo máximo3MiB/política11 e seleção por arquivo oficial. Estado retorna request_id para anexos.
- [x] Escrever contratosUI para configuração/saída/upload/validação física/externa/negações/semloaders, observar RED.
- [x] Seção Formalização dentro de Versões e PDF; seletor+formulário, no máximo4ações principais na tela inteira. Evidência e hash explícitos, nenhum loginGOV.BR embutido.
- [x] Reusar upload11, refletir quarentena, reter idempotência503 e impedir troca de payload, limpar em401/403/sessão e revalidação segura.
- [x] ContratosUI320/360/768/1440 e typecheck verdes.

## Task 4: Integração e revisão

- [x] npm test, npm run typecheck, npm run build, SQL2replays, UI afetada e jornada local Auth/API/bytes conforme laboratório disponível; medir endpoints autenticados.
- [x] Revisão independente da branch com foco nos cinco riscos acima; corrigir achados com regressões.
- [x] Atualizar Livro/AGENTS/fecho24 e evidências reais, incluindo bloqueio por scanner hospedado se presente.

## Task 5: Publicação e conferência

- [x] Commit/PR por GitHub; rollout compatível de worker/schema/runtime. Não aplicar schema antes do worker compatível.
- [x] GitHub→Vercel; consultar migration history apósGit antes de qualquer applymanual. Comparar corpos/ACLs e arquivos do worker com fonte testada.
- [x] Confirmar build/commit/assets/health/barreiras anônimas, conservar contagens reais. Registrar limitações sem alegar teste autenticado hospedado se não executado.
