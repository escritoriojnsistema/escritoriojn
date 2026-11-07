# Etapa26 Implementation Plan

> Execução inline com superpowers:executing-plans; revisão final independente.

**Goal:** Entregar somente bytes elegíveis com histórico por canal/destinatário.
**Architecture:** deliveries/eventos privados, hook no release25 e RPCs protegidas; Express conserva proxy24 e revalida entrega antes/depois; painel no fluxo atual.
**Tech Stack:** React/Vite/TypeScript/Express/Supabase PostgreSQL.
**Spec:** docs/superpowers/specs/2026-11-07-etapa-26-entregas.md

## Constraints
Sem Actions/deployCLI/fixtures hospedadas; conservar PDF/worker e permissões existentes. Máximo4atalhos, padrões Equipe, sem loaders. Sem confirmação implícita.

## Review Focus
- Troca de telefone/destinatário entre tentativa e entrega: negar.
- Estorno/revogação/alteração de revisão durante acesso: negar bytes.
- Resposta503: repetir chave/corpo sem nova tentativa.
- Acesso perdido/identidade trocada: descartar histórico/arquivo.
- Histórico antigo: não exigir elegibilidade financeira para apenas consultar evidências.

## Task1: Dados/contratos/API
- [x] Criar testes SQL de ausência RPC, gate pendente, canais/estados, idempotência, destinatário/hash, revogação e ACL; observar RED.
- [x] Criar migration CLI com deliveries/eventos/comandos imutáveis, índices/FKs/RLS/ACL, capabilities owner, wrappers invoker. Hook release25 registra download.
- [x] Contrato shared/documentDeliveries.ts e endpoints delivery-state/command/artifact no router; DTO whitelist e validação estrita. Testar API/SQL.

## Task2: UI conectada
- [x] Testes browser desktop/mobile: selecionar Entregas, destinatário, abrir conversa sem confirmar, impressão bloqueada/permitida,503/retry,401/403.
- [x] DeliveryPanel.tsx usa workflowApi; integrate WorkflowPanel mantendo áreas separadas, sem spinner. Bytes via endpoint protegido; história/ações recolhíveis.
- [x] npm test, build e contratos browser afetados.

## Task3: Fecho/publicação
- [x] Revisão independente e correção verificada dos achados relevantes.
- [ ] Atualizar Livro/AGENTS/cartão/fecho com provas reais, limites e checkpoint27 somente após conclusão26.
- [ ] GitHub→Vercel, conferir schema_migrations/ACL/hashes do SQL, health/barreiras/bundle; sem aplicar duas vezes. Registrar eventual bloqueio externo sem alegar publicação.
