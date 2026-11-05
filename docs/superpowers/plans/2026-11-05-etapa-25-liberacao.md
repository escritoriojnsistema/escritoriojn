# Etapa25 Implementation Plan

> Execução nesta sessão: executing-plans; testes antes da implementação.

**Goal:** aplicar regra única e exceções financeiras por versão/arquivo.
**Architecture:** estender workflow24, RPCs invoker e funções privadas; retorno validado no Express, painel no seletor existente.
**Tech Stack:** React/Vite/Express/Supabase/Postgres.
**Spec:** ../specs/2026-11-05-etapa-25-liberacao.md

## Constraints
SemActions; GitHub→Vercel; sem dados fictícios hospedados. Preserve dimensões independentes e padrões Equipe/Convites.

## Review Focus
Concorrência financeira, perda de autoridade, validade durante espera, respostas503 e troca de sessão; cobrir nas tarefas correspondentes.

### Task1: banco e contratos
- [x] Testes SQL/API para exceções e gates; observar RED.
- [x] Migration aditiva com avaliar_liberacao25, eventos privados, snapshot financeiro, RPCs, releases e capacidades.
- [x] Contrato compartilhado/whitelist Express e APIs cliente. Executar Node e dois replays SQL limitados.

### Task2: interface
- [x] ContratosUI no editor existente, desktop/mobile e retentativa503.
- [x] ReleasePanel, seletor existente, até4ações, histórico5 e invalidação por sessão.
- [x] Build, Node, SQL, contratosUI, jornada Auth quando disponível; revisar alteração completa.

### Task3: publicação e livro
- [x] Compatibilidade de capacidades antes do schema; Git/PR→Vercel semActions.
- [x] Readback migration/corpos/ACL/contagens, worker preservado, assets/health/barreiras.
- [x] Livro/AGENTS/cartão/fecho/evidências com testes realmente executados e limitações.
