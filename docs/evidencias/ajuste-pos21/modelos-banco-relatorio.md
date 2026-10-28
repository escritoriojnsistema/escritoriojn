# Ajuste pós21 — campos manuais e importação técnica no banco

Validação concluída em 27/10/2026 somente em PostgreSQL17 descartável. A migration adicional `20261027172917_templates21_manual_import.sql` foi criada com o CLI Supabase2.122.0 usando `supabase migration new templates21_manual_import`. Nenhuma migration anteriormente aplicada foi editada nesta frente. Não houve escrita hospedada, commit, deploy ou importação do acervo real.

## Contrato implementado

- As14 chaves automáticas conservam tipos e fontes. Até80 variáveis/overrides, com manuais `documento.[a-z][a-z0-9_]{0,63}`; tipos text/date/money/number/cpf/cnpj/tax_id. Somente chaves declaradas pela versão são aceitas.
- Texto manual aceita2000 pontos Unicode; controles continuam bloqueados. Overrides dos14 campos legados conservam500 no armazenamento/DTO, inclusive nomes121–500 historicamente aceitos. O renderer mantém120 para nomes, emitindo pendência e bloqueando conclusão. Texto30000, prévia50000, participantes20, datas, centavos e extenso preservados.
- `tax_id` manual valida CPF ou CNPJ conforme os11/14 dígitos, com máscara por espécie;12/13 dígitos, checksum inválido e máscaras malformadas são pendência. CPF/CNPJ manuais usam `private.customers_normalize_identifier`; valores válidos retornam somente dígitos e apresentação com máscara. Inválidos permanecem pendência. Chaves manuais nunca consultam ficha, participante ou preço.
- `private.import_template_drafts(office uuid,batch_key text,source_url text,definitions jsonb)` é SECURITY INVOKER, search_path vazio e EXECUTE revogado de PUBLIC/anon/authenticated/service_role. O proprietário da migration executa como operador técnico. Não há novo GRANT.
- `definitions` é array não vazio de definições20 completas, com `review_required:true`. `batch_key` aceita1–120 caracteres ASCII alfanuméricos/underscore/hífen, começando por alfanumérico. Fonte deve ser URLHTTPS de até2048 caracteres; permanece no lote privado.
- `private.template_import_batches` tem RLS habilitada, nenhuma política pública, ACL fechada, unicidade escritório/chave e SHA256 de `{source_url,definitions}` em JSONB canônico. FKs compostas impedem provenance de outro escritório. Lotes e versões são imutáveis; origem/autoria do registro base também é protegida.
- Retorno persistido exato: `{id,batch_key,payload_digest,count,items:[{id,code,version_id,number:1}]}`. Repetição idêntica conserva IDs/resultado mesmo depois de edição/aprovação humana. Mesma chave com hash divergente ou código existente gera PT409. Validação/falha parcial reverte todo o lote.
- Templates e versões técnicas têm `created_by=NULL` somente com `source_import_id` UUID válido. Versões humanas preservam UID real e `source_import_id=NULL`. O DTO20 inclui source_import_id. Auditoria usa `templates.saved`, `actor_kind=operator`, `actor_id=NULL`, `actor_db_role=current_user` e `changes={}`; não há sessão/autoria humana fabricada.
- Importar não aprova nem cria documento21/PDF. Aprovação humana20 continua explícita e exata; somente depois a versão vigente aparece na descoberta21. Os testes de aprovação/documentos usam somente fixtures genéricas locais e rollback.

## Comandos e resultados

1. `JN_DB_DOCUMENTS21_ISOLATED=1 JN_DB_MANUAL_IMPORT_RED=1 node scripts/test-database.mjs`: RED esperado, `TEMPLATES_VALIDATION` ao declarar `documento.campo_1` antes da migration nova.
2. Regressão adicional observada em PostgreSQL já migrado: nome legado121 era rejeitado no input. O RED confirmou `DOCUMENTS_VALIDATION`; correção restabeleceu500 no input automático, mantendo120 no renderer.
3. Extensão `tax_id` também teve RED esperado `TEMPLATES_VALIDATION` antes da implementação; tests CPF11/CNPJ14/normalização/checksum/12–13/máscara malformada ficaram verdes.
4. `JN_DB_DOCUMENTS21_ISOLATED=1 node scripts/test-database.mjs`: GREEN inicial, exit0, replayA188 verificações e replayB190, incluindo57 novas por replay (114 novas no total); zeroERROR/FAIL. O resumo geral do runner também passou.
5. `node --check scripts/database-templates21-manual-import.mjs`, `node --check scripts/test-database.mjs` e `git diff --check`: passaram.

O runner aplica migrations com `migrator NOSUPERUSER NOBYPASSRLS`, executa regressões20/21 e preservação de funções/históricos antes da migration adicional. Depois testa limites80/81, sufixos64/65, Unicode2000/2001, sete tipos, checksum, obrigatoriedade, fonte manual, prévia50000, ACL dos três papéis, CHECKs/FKs/autoria/índices, rollback, replay antes/depois de edição, aprovação/descoberta e fluxo real de RPC `save/detail/prepare`. Nome500 legado reabre com pendência, `prepare` PT422 e input501 é negado.

Corridas usam conexõesPostgreSQL distintas e barreiras de lock observadas: lote idêntico, hash divergente e disputa pelo mesmo código; também repetem corridas20 de edição/aprovação/revogação e21 de edição/seletores/escopo/sessão. Permanecem exatamente três lotes/versões/eventos técnicos nos três cenários de importação. O assert de replay consulta o lote em statement posterior à espera, respeitando o snapshot READ COMMITTED do PostgreSQL.

O benchmark21 manteve1001 documentos sintéticos, total exato, página limitada e histórico5/página; consulta da página em23,289ms nesta execução compartilhada. Essa medição local não estima latência hospedada. Contagens, hashes e comando final em `modelos-banco-checks.json`; logs locais em `/tmp/jn-manual-import-red.log`, `/tmp/jn-manual-legacy-name-red.log` e `/tmp/jn-manual-tax-id-green.log`.

## Aplicação e continuidade

A mudança depende de runtime que aceite autoria técnica/source_import_id e campos manuais antes da aplicação hospedada. A aplicação remota e o lote real ficam com o fluxo autorizado principal; confirmar histórico automático antes de qualquer aplicação manual. Esta frente não leu nem importou originais do Drive.

A reversão segura após imports exige migration corretiva que preserve provenance, versões e decisões; não remover colunas/constraints nem tornar `created_by NOT NULL` quando já existirem versões técnicas. Não há SQL destrutivo de rollback executado. Advisors hospedados não foram consultados; a validação local conferiu ACL, RLS, invoker, índices/FKs e migrador limitado. Tipos SQL gerados não são consumidos neste repositório; o contrato TypeScript/DTO foi coordenado com a frente compartilhada.

A opção `JN_TEMPLATE_IMPORT_PAYLOAD_PATH=/caminho/catalogo.json` aceita o array de definições autorais completo; `JN_TEMPLATE_IMPORT_SOURCE_URL` identifica a fonteHTTPS. O helper usa somente o container descartável, testa importação/replay/DTO20 individual/ausência de aprovação e documentos, e executa ROLLBACK com verificação de lote ausente. Foi executado com o catálogo final de64 definições nos dois replays vazios. Nenhum conteúdo privado é enviado pelo helper a banco hospedado.


## Verificação integrada final do catálogo

A frente principal executou o helper com o catálogo autoral final de64 definições,1938 campos e599619 bytes em dois bancos vazios. SHA256 do payload privado: `aa728c0b65f3b6cb1ed0445a27cb2ad7fb721d438a27e3f80e3e8bab29342bcb`. Foram 389 linhas PASS no total, dez verificações específicas do catálogo e zeroERROR/FAIL. Todos os64 modelos tiveram round-trip individual pela RPC/DTO20 autorizada, autoria técnica/source_import_id e aprovação nula conferidos; repetição exata e rollback sem reter lote foram confirmados. As corridas import/20/21 e16 seletores concorrentes por replay passaram. Página1001: 18.888ms locais. O payload e a URL de origem permanecem somente no diretório privado e no lote técnico; nenhum original/ID de arquivo foi copiado ao repositório.
