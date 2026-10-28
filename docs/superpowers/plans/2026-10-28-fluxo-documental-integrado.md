# Fluxo documental integrado Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Conectar catálogo/modelo, solicitação, distribuição, edição/revisão, caixa e entrega privada pós-pagamento.

**Architecture:** Ofertas09↔20 e intakes por item10; versões editoriais22 e produtorEdge de artefatos; gate financeiro13–18/identidade08 e portal existentes. Backend exige autoridade atual, UI exibe projeções fechadas.

**Tech Stack:** React/Vite/TypeScript,Express,SupabaseAuth/Postgres/Storage/Edge,GitHub→Vercel.

**Spec:** docs/superpowers/specs/2026-10-28-fluxo-documental-integrado.md

## Global Constraints

- Preservar histórico/contas/preços/capacidades reais; não aprovar64minutas nem criar preços fictícios.
- Uma fonte09 para preço, um pedido10, um ledger13–18, um login e um gate final por versão/arquivo.
- Campos80/2000Unicode/setetipos,14automáticos preservados; snapshots financeiros/documentais imutáveis.
- Novas tabelas RLS/ACLfechadas/FKscompostas/indexadas,wrappersINVOKER/implementação privada,gates apóslocks.
- Service_role somenteEdge; browser/Express chave pública+Bearer. SemPDFarbitrário/não marcar quarentena clean.
- Nível automático exato e pagamento integral até resposta de negócio; manual superior só com capacidades/escopo.
- Até4ações/atalhos,extras sidebar,Equipe320/360/768/1440,semloaders,rolagemnatural.
- SemActions; rollout compatível GitHub→Vercel e confirmar migrations automáticas antes de applymanual.

## Review Focus

- Mudança de preço/nome/schema após formulário deve gerar409,preservar snapshots e não aumentar cobrança antiga.
- Duas solicitações/uma vaga, heartbeat antigo, revokeapóslock e transfer não podem duplicaratribuição ou vazar trabalho.
- Cliente que informa CPF/e-mail de terceiro não ganha ficha/acervo; presencial/WhatsApp requer identidade08 vigente.
- Pagamento parcial/pendente/estornado/sem cobrança/versão nova/assinaturapendente não libera arquivo final.
- Retry de versão/PDF/caixa/download mantém ids/bytes/eventos e nega armazenamento/URL alternativos.

### Task1: contrato comercial e esquema
Files: shared/modelCommercial.ts; nova migration document_commercial; tests/database/document-commercial.sql; script de corridas próprio.
Interfaces: model_commercial_state/command,document_offers_page/offer_form,document_booking_create,document_intake_view/apply/start,document_presence_state/update,document_dispatch_page. AgenteSQLA publica tipos e assinaturas exatas antes dos consumidores.
- [ ] Criar REDs de metadados/duplicação/arquivo/título/preço/modelo/cliente/80campos/staleversion/slotsconcorrentes.
- [ ] Implementar associação09↔20/intake10/presença/despacho e reuso dehelpers reais,semseedpreço/permissãoindividual.
- [ ] Provar tiposJS/SQL/ACL/FKs/históricos e corridas limitadas; avisar contrato estável.

### Task2: UI/APIcomercial
Files: server/modules/document-commercial,src/features/documentCommercial,TemplatePage/RequestPage integrações coordenadas.
- [ ] REDAPI payloadsfechados/projeçãoclient/preço/manuais e UIEquipe/cliente/níveis/espera.
- [ ] Implementar gestão/preço/duplicar/arquivar/restaurar/título,catálogo/formulário tipado/booking e presença/sidebar; usar RPCsTask1.
- [ ] Verificar320/360/768/1440 e dados propostos nunca viram cadastro/assinatura por inferência.

### Task3: editorial e gateSQL
Files: shared/documentWorkflow.ts; nova migration document_workflow; tests/database/document-workflow.sql e corridas.
Interfaces: document_workflow_state/command;document_artifact_begin/complete/read/authorize;document_cash_queue/command;portal_documents_page; auxiliargate/reconcile_request. Tipos e assinaturas publicados antes de Edge/UI.
- [ ] REDs deprepared→versão/reforçoautoridade/reviewself/signature/financeiro/identidade/ticket/replay/estorno.
- [ ] Implementar versões/decisões/leases/artefatos/handoff/delegaçãofinanceiraestreita/gate/release/eventos;capseedowner.
- [ ] Provar2replays limitados/corridas com13–21,semalterarrequest_can_work globalparaautorizarcaixa.

### Task4: produtorEdge/PDF
Files: supabase/functions/document-artifacts/* e renderer novo/versionado,tests/edge/PDF próprios.
- [ ] RED dePDFfake/hash/caminho/ticket/sessãorevogada/stalelease e Bytepreservation.
- [ ] GerarpreviewRASCUNHO/final com fonteacentos/numeração/limites;preservarbyteStorageprivado comservice_roleapenasEdge e validar snapshot/lease na completion.
- [ ] Testar renderer real Node/Deno/Storage laboratório,bytes/SHA/uploadreplay/negações,semalterar PDFs históricos.

### Task5: UI/APIworkflow e portal
Files: server/modules/document-workflow,src/features/documentWorkflow,DocumentEditor/CashPage integraçõescoordenadas.
- [ ] REDAPI eUIreview/PDF/signature/handoff/cashqueue/portalstatus/downloadrevogado.
- [ ] Implementar comandos reais,previewprivado,revisão/separação de assinatura/caixa,avisos e Meusdocumentos;semLoader/linkpúblico.
- [ ] Verificarbotões/atalhos/responsividade/apagarestadobloboutroUID/sessão;dadossensíveisnãovãoemURL/log.

### Task6: integração e homologação
Files: app/routes/nav,notifications,testrunners,AuthE2E/segurança/financeiro,docs/regras/etapas/Livro/AGENTS.
- [ ] Integrar módulossemrotas/cadastrosduplicados; esquemaantes deconsumodependente ou runtimecompat antesDDLconformeprova.
- [ ] Jornada realcliente/preço/form→slot/espera/transfer→editor→review/PDF→caixa/pay→portaldownload;estorno/revoga/novaversãobloqueia,UUID/anônimonega.
- [ ] Node/API/SQL2replays/corridas/Authreal/StorageEdge/UI4larguras/build/typecheck/auditprodução/revisãoindependente.
- [ ] Publicar GitHub→Vercel+Edge,Supabasehistórico/ACL/bytes/asset/health/negativas/readback semfixtureshospedadas.
- [ ] AtualizarLivro/AGENTS/fechocomprovasreais/configuraçõesnecessárias ependênciasverdadeiras.
