# Banco — correção de concorrência das opções21

Status: **validado localmente**, 27/10/2026 UTC. Nenhuma alteração hospedada, fixture remota ou concessão individual. Os ensaios usam PostgreSQL 17 descartável e migrador `NOSUPERUSER NOBYPASSRLS`.

A RPC `private.document_options` primeiro obtinha `FOR SHARE` no escritório pelo gate sem ação e depois tentava `FOR NO KEY UPDATE` pelo gate com ação. Duas consultas paralelas podiam conservar os respectivos locks SHARE e esperar mutuamente pela promoção; o erro observado era `40P01` em `documents_access21`, propagado pela RPC de opções.

A migration incremental criada pelo CLI obtém `FOR NO KEY UPDATE` no escritório antes do primeiro gate, depois de verificar a identidade. O gate original continua verificando novamente identidade, capacidades, vínculo e escopo após a espera, inclusive no fim da consulta. As regras de seleção de ação, filtros, wrappers, ACLs, PDF8 e a migration aplicada permanecem intactos. As consultas de opções do mesmo escritório agora aguardam umas às outras; esta serialização é a contrapartida da correção mínima, pois o gate com ação já exigia esse lock. Não há mudança de tabelas ou assinatura que exija novos tipos TypeScript.

## RED → GREEN

O teste inicia 16 conexões reais `authenticated` com `document_options` para `requests`, `templates`, `customers` e `items`, no mesmo escritório. Uma barreira advisory independente libera as chamadas simultaneamente; não reproduz nem inspeciona o código de locks. Antes da migration, `JN_DB_DOCUMENTS21_ISOLATED=1 node scripts/test-database.mjs > /tmp/options21-red.log 2>&1` terminou com falha: **15/16 deadlocks**, com contexto de `FOR NO KEY UPDATE` em `offices`. Após a migration, o comando abaixo terminou com código 0, 249 linhas PASS e zero deadlocks:

```sh
JN_DB_DOCUMENTS21_ISOLATED=1 node scripts/test-database.mjs > /tmp/options21-final2.log 2>&1
node --check scripts/database-documents21.mjs
node --check scripts/test-database.mjs
```

Em ambos os replays vazios, as 16 RPCs passaram; o tempo total após liberar a barreira foi 370,5 ms e 256,5 ms, respectivamente. O teste também confirma que a revogação de `documents.read`, a mudança do responsável e a exclusão da sessão enquanto a chamada espera no escritório produzem 403, 403 e 401; cliente recebe 403. As corridas e regressões anteriores de edição, escopo, cliente fonte, sessão e replay também passaram. ACL, wrappers, snapshots e corpos históricos seguem cobertos pelos testes SQL existentes.

A carga existente de 1.001 documentos confirmou a página 200 com cinco itens e histórico paginado; `EXPLAIN ANALYZE` registrou 19,433 ms na consulta de página. Esses tempos são medições locais, sem SLA de produção.

## Arquivos e rastreabilidade

- `supabase/migrations/20261027162946_documents21_editor_options_lock_fix.sql`: SHA-256 `d6f5b9aa983ddfaa9e7003f705644a614f23e9ccfa7f1c78e9ce8ab559022ad9`.
- `scripts/database-documents21.mjs`: SHA-256 `e378b9486a01eb8aea6aa6b4c013febd49dadf614b8f6a225457dc6ceda72c5b`.
- A migration foi criada com `npx --yes supabase migration new documents21_editor_options_lock_fix` (CLI 2.122.0). O nome inclui `_documents21_editor` para a ordem do runner.

Rollback, se necessário, requer nova migration revisada que restaure a definição anterior; isso reintroduziria o deadlock. A aplicação e verificação hospedadas pertencem ao fluxo de publicação autorizado pelo responsável; este ensaio não executou deploy, Actions nem mutação remota. Auth/API/UI de ponta a ponta são tratados separadamente pelo controlador.
