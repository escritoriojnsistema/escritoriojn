# Banco — Etapa21

Status: **validado localmente**, 27/10/2026 UTC. Nenhuma mutation hospedada, conta real, concessão individual ou seed de negócio. O ensaio usa dois bancos PostgreSQL17 descartáveis e migrador NOSUPERUSER/NOBYPASSRLS.

## Escopo implementado

- Cinco RPCs públicas INVOKER: documents_page, document_options, document_create, document_detail, document_operate. Implementações privadas DEFINER; search_path vazio e ACL explícita. Helpers não são executáveis por authenticated/anon/service_role.
- Cinco tabelas com RLS e ACL fechadas; revisões, participantes, preparações e comandos append-only. FKs RESTRICT e índices verificados em todas as referências, incluindo autor dos comandos e cliente principal histórico (coluna gerada source_customer_id).
- Capacidades documents.read/create/update concedidas somente ao papel owner. Alargamento das allowlists de gestão explícita; nenhum grant individual.
- Gate compartilhado verifica sessão real, vínculo, escritório, capacidades, escopo10, responsabilidade para escrita e fontes08 de todas as revisões. Ordem office→request→document/customer; escritório usa NO KEY UPDATE para escrita e SHARE para consulta. Revalidação depois de espera e nos replays.
- Fonte mesclada histórica exige customers.read_all e nunca segue o alvo. Fonte bloqueada falha mesmo com read_all. Fontes novas exigem cliente ativo no escopo08. Participação não cria direito de portal.
- Captura imutável de modelo20 exato aprovado/vigente, fonte09/10, UTC de emissão e participantes. CPF só quando declarado e PF. Edição local não altera ficha/preço. Troca explícita conserva revisões anteriores e limpa overrides dos papéis trocados.
- Resolução tipada, CPF07, datas0001–9999, dinheiro decimal exato, número até100000/3decimais, extensoBR, pendências e texto literal. Draft incompleto é persistido; prepare incompleto422 sem decisão parcial. Overflow de expansão retorna texto original e pendência, sem truncamento.
- Optimismo por revisão e idempotência por escritório/ator/chave/hash; replay retorna detalhe atual autorizado. Preparação preserva revisão; edição diferente abre nova revisão/draft. Não há document_versions22, PDF documental, aprovação, assinatura, quitação ou entrega.
- Auditoria transacional de quatro ações só com referências e changes={}. Apresentação8 torna-se default; anteriores1–7 e seus corpos permanecem.

## Execução e resultados

Comando final:

```sh
JN_DB_DOCUMENTS21_ISOLATED=1 node scripts/test-database.mjs > /tmp/fix21-sql-final.log 2>&1
node --check scripts/database-documents21.mjs
node --check scripts/test-database.mjs
```

Dois bancos `foundation_replay_a` e `foundation_replay_b`: **209 linhas PASS**, sendo86 da regressão20,110 da21,12 corridas21 e1 conclusão do runner; os testes também contêm asserts internos a blocos DO. Nenhum erro. Todas as migrations foram aplicadas desde banco vazio por migrador limitado.

Cobertura21: cinco RPCs reais, ACL/RLS/capacidades, aprovação/vigência20 para criar, CPF não declarado ausente, dados automáticos09/10, Unicode, autores legados sanitizados08, extenso singular/plural/limites, datas/CPF inválidos, placeholders ausentes/parciais/desconhecidos, HTML literal, overflow de expansão, salvar/replay/conflito, preparação, histórico, troca de partes, imutabilidade, fechamento10 somente leitura, fonte antiga removida bloqueada, mesclagem com/sem read_all, filtros de busca, objetos fechados, índices de FK, defaultAuditoria8 e preservação de corpos anteriores.

Corridas em duas conexões PostgreSQL reais, repetidas nos dois bancos:

1. Duas edições da revisão4: uma confirma e a outra recebe409.
2. Revogação de documents.read durante espera no lock:403.
3. Mudança de responsável durante espera:403.
4. Bloqueio do cliente fonte durante espera:403.
5. Revogação da sessão durante espera:401.
6. Replay depois de revogação de autoridade durante espera:403 sem efeito novo.

Os testes verificam exatamente cinco revisões após as corridas. A geração de1000documentos adicionais usa as próprias RPCs, sem INSERT privilegiado de documento.

## Desempenho

1001documentos e histórico de11revisões. Página200 com5itens e total1001; página201 com1item; histórico5porpágina, total11. `EXPLAIN (ANALYZE, BUFFERS)` da busca:

```text
Result (actual time=19.439..19.439 rows=1 loops=1)
Buffers: shared hit=3943
Planning Time: 0.009 ms
Execution Time: 19.443 ms
```

A versão inicial percorria o gate completo por documento:3463.818ms e112027bufferhits. A implementação final avalia clientes autorizados uma vez com o mesmo predicado do gate, conta candidatos e materializa JSON somente da janela3/5; revalida as linhas retornadas pelo gate. Options items/customers/templates também contam e paginam antes de construir JSON. Esses números são do laboratório descartável, não SLA hospedado.

A correção transversal acrescentou validação de identidade UUID independente de caixa para pares e comprador/vendedor; o teste confirma também que a entrada em maiúsculas produz snapshot canônico. O ensaio anterior de 203 linhas é histórico e foi substituído pelo replay acima.

## RED→GREEN e preservação

- RED inicial: `FAIL: 21: document create RPC exists`, antes da implementação das RPCs.
- Teste de cobertura de FKs encontrou ausência de índice em document_commands.actor_id; adicionado o índice e teste verde.
- Os ensaios também encontraram erros das próprias fixtures (conector de grupo101 no extenso, JSON mal fechado, varianteUUID inválida e tentativa de reabrir pedido concluído). Fixtures foram corrigidas; o banco já recusava os valores inválidos corretamente.
- Comparação de `pg_get_functiondef` antes/depois da21 preserva todos os corpos preexistentes, exceto as três allowlists explicitamente ampliadas: team_scope_for_member, team_validate_assignment e safe_audit_changes. `audit_report_begin`, funções financeiras e renderers históricos permanecem intactos.
- Snapshots de requests, audit_events e audit_reports anteriores permanecem iguais. Regression20 confirma snapshots históricos1–6;21 preserva inclusive os relatórios7 criados pela20.

Migration final: `20261026195437_documents21_editor.sql`, SHA256 `e8b8ab87a3435f124e07e30f1ea75a77dd44f3f8af5c84e998bfede6aab8cbfa`.

## Limites do ensaio

Este relatório cobre banco local e runners SQL. Auth real local/API/UI são verificados pelo controlador em seus relatórios. Publicação, aplicação remota e conferência pósGit ainda pertencem ao controlador; esta tarefa não executou essas ações. Nenhuma fixture ou grant individual foi criado no Supabase hospedado.
