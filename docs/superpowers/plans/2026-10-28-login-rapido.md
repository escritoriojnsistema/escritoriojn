# Login rápido Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Reduzir espera mensurável sem mudar autoridade ou adoção de sessão.

**Architecture:** Projeção compartilhada e RPCdireta na tentativa isolada; SDK oficial confirma adoção. PDFKit fora do coldstart comum.

**Tech Stack:** React/Vite/TypeScript/Express/Supabase.

**Spec:** docs/superpowers/specs/2026-10-28-login-rapido.md

## Global Constraints

- Não mudar motores/fontes/layouts/PDFs históricos.
- Sem cache de permissões, métodos SDKprivados, Authfake, adoção antes verificação ou spinner.
- Somente chaves públicas/Bearer; GitHub→Vercel semActions.

## Review Focus

- RPC vazia/UID divergente/roleerrado deve negar sem apagar login anterior.
- Revogação durante espera continua bloqueando.
- Cancelamento e adoção de outra aba não podem promover sessão velha.
- Banimento/email/session inválidos devem ter paridade real SQL/SDK.
- Primeiro PDF continua correto após import tardio.

### Task1: verificação/adoção
- [ ] CriarRED de contagem/caminho e paridade negativa real.
- [ ] Implementar helper tipado de projeção e RPCdireta em portalLogin, mantendo guardAdoption/setSession.
- [ ] Rodar45Auth anteriores+negativos novos em snapshot estável, medir fases e conferir segurança.

### Task2: coldstart
- [ ] RED provar importapp carrega PDFKit.
- [ ] Mover imports para handlers exportPDF sem alterar engines; conferir hashes.
- [ ] Node/API/build/typecheck e benchmarks cold/warm, revisão, publicação autorizada e Livro.
