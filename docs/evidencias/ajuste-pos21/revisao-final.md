# Ajuste pós21 — revisão independente da fase B

Data: 27/10/2026. Parecer: **APROVÁVEL para o rollout da fase B**, sem achados P0/P1/P2 pendentes no escopo revisado. A revisão cobre o contrato de campos manuais, runtime compatível, migration adicional e testes locais. A aplicação hospedada do schema e o cadastro autorizado das 64 minutas ainda precisam do readback de publicação; este parecer não afirma que ocorreram.

Base da comparação: `befc5df6e6fd8954b78bc63de994197a695e8088`. Durante o fechamento, o runtime revisado foi registrado em `ae97d1aed431880312665e7118a7f256a574960c`. A fase A de compatibilidade/Auth e ordenação de locks já publicada pelo PR64 é contexto anterior, não uma entrega nova deste parecer. Não foi alterado código de produção, executada suite grande concorrente, realizado commit/deploy ou escrita hospedada por este revisor.

## Escopo e conclusão técnica

- `shared/templates.ts`, `shared/documents.ts` e `shared/documentRender.ts`: as 14 variáveis automáticas conservam chaves, tipos e fontes. Campos manuais seguem `documento.[a-z][a-z0-9_]{0,63}`, declaração por versão, máximo de 80 variáveis/overrides e sete tipos (`text`, `date`, `money`, `number`, `cpf`, `cnpj`, `tax_id`). Nenhuma chave manual consulta ficha, participante ou preço. Limites de texto 30000, prévia 50000 e participantes 20 permanecem.
- Contrato JS/SQL: texto manual de 2000 pontos Unicode, CPF/CNPJ por checksum e formato canônico, valores/datas/números e obrigatoriedade apresentam regras correspondentes. Nome automático legado de 121–500 caracteres continua aceito no input/DTO, com `invalid_value` no renderer e impedimento de conclusão; nomes novos na UI/resolução conservam 120. Valores contratuais manuais não alteram o snapshot financeiro do serviço.
- API/DTO: modelos aceitam 256kb e documentos 1mb, compatíveis com os limites UTF8 autorizados. Autoria humana aceita o contrato legado sem `source_import_id`; autoria técnica nula exige UUID de importação. Autoria humana com provenance técnica e autoria nula sem provenance são recusadas.
- `TemplateForm`, `TemplateDetail` e `DocumentEditor`: metadados de campos existentes são preservados ao atualizar o texto; somente campos manuais permitem trocar o tipo. A interface identifica preenchimento manual, aplica máscaras e envia dígitos, mostra autoria técnica e exige aprovação humana explícita. Navegação Equipe, até quatro atalhos móveis, rótulos durante ações, ausência de loaders e rolagem natural foram preservados no escopo afetado. Capturas 320/1440 foram inspecionadas, além das evidências automatizadas nas quatro larguras.
- Migration `20261027172917_templates21_manual_import.sql`: função privada `SECURITY INVOKER`, `search_path` vazio e EXECUTE revogado de PUBLIC/anon/authenticated/service_role; lote privado com RLS/ACL fechadas. Hash canônico, chave por escritório, lock inicial do escritório e verificação posterior à espera sustentam replay exato, conflito e atomicidade. FKs compostas/indexadas, CHECKs de autoria e imutabilidade conservam provenance. Auditoria registra operador/`current_user`, ator humano nulo e `changes={}`. Não há aprovação, documento ou PDF na importação.
- Edição/aprovação humana posterior: o fluxo existente conserva o autor real, cria versão sem `source_import_id`, não herda aprovação e mantém a versão técnica anterior. A descoberta21 depende da aprovação humana vigente, inclusive para modelos importados.
- Helpers SQL e novo teste `tests/auth/templates-imported.spec.ts`: o helper do catálogo usa banco descartável e rollback; o teste Auth limita a importação ao laboratório local por URL/container e Docker local explícitos. Sua aprovação e documentos são fixtures fictícias, sem aprovar as 64 minutas reais.

## Evidências verificadas

O revisor leu diffs/código/testes, inspecionou capturas, executou `git diff --check` e conferiu hashes. Os resultados de suites abaixo foram executados pelas frentes/coordenador e conferidos em relatórios e logs; não foram repetidos desnecessariamente por este revisor.

| Verificação | Resultado conferido |
| --- | --- |
| Node/API integrado final (`npm test`) | 228/228, zero falhas, skips ou cancelamentos |
| `npm run typecheck` / `npm run build` | Aprovados; frontend e servidor compilados |
| Auditoria de dependências de produção | Zero vulnerabilidades |
| UI final dos campos manuais e rechecagem financeira1920 | 10/10; sete tipos, 2000 emojis, máscaras/transporte, metadados e autoria técnica |
| Regressão UI anterior | 45/46; timeout isolado de navegação em1920 rechecado com sucesso, sem alteração financeira |
| SQL local final com catálogo64 | 389 linhas PASS, dois replays vazios, dez checks do catálogo e zero ERROR/FAIL |
| Papel SQL | `migrator NOSUPERUSER NOBYPASSRLS`; ACL/RLS, corridas de importação/20/21 e seletores concorrentes verificadas |
| Catálogo adaptado | 64 definições, 1938 campos, 599619 bytes; todos os DTOs20 individuais, autoria técnica, aprovação nula, replay e rollback conferidos |
| Auth real integrado20/21/importação | 4/4 em15,4s; navegador → API → importação SQL local → aprovação humana fictícia → sete campos → autosave → conclusão → versão humana posterior |
| Benchmark documental local | 1001 documentos sintéticos, página limitada, histórico5/página; 18,888ms, sem inferir latência hospedada |

O novo teste Auth também compara `values`, `formatted` e texto resolvido entre JS/SQL, confirma texto de 2000 emojis integral e conserva o total do serviço ao preencher outro valor contratual. Os 41 testes Auth da fase A são evidência anterior de seu commit publicado; não foram somados aos quatro testes desta rodada.

Referências: [contrato](../../superpowers/specs/2026-10-27-ajuste-pos21.md), [relatório de frontend](modelos-frontend-relatorio.md), [relatório de banco](modelos-banco-relatorio.md), [checks finais de banco](modelos-banco-checks.json) e [validação JS do catálogo](catalogo-validacao-js.json). Logs integrados finais de Node, build, typecheck, dependências, SQL e Auth permanecem em `/workspace/scratch/ajuste-pos21/`.

## Hashes conferidos

| Artefato | SHA256 |
| --- | --- |
| `supabase/migrations/20261027172917_templates21_manual_import.sql` | `5b79e42e83fa4eeedc11a993f23efbda5cf067e57b75d97572ce1778bf514a01` |
| `tests/database/templates21-manual-import.sql` | `e0073267694ca7dd3ced5d996723ed16614415a39978bc331cc651edbc12a5c4` |
| `scripts/database-templates21-manual-import.mjs` | `beba0edfed7506f3be9936aba7a727a577f85f5d78abcc13948363711ad9b5a9` |
| `scripts/test-database.mjs` | `79b029a58ea5fd6b8a9a6ebb12688e89cc274149f66cb515a9c716bc66261eae` |
| `tests/auth/templates-imported.spec.ts` | `a2793513f0560787b7588ea26487448971a360215b493161b854345ed79f4f5f` |
| Payload privado final de64 minutas | `aa728c0b65f3b6cb1ed0445a27cb2ad7fb721d438a27e3f80e3e8bab29342bcb` |

## Achados resolvidos e limites

Uma URL privada de origem foi identificada no relatório intermediário de banco e removida antes deste fechamento. O parecer não reproduz origem privada, IDs de fonte, originais ou PII. Não há achado de implementação P0/P1/P2 pendente após a revisão estática e a conferência das evidências finais.

O rollout deve publicar runtime compatível antes do schema, conferir o histórico automático de migrations antes de qualquer aplicação manual e verificar o lote real por leitura após o cadastro. Todas as 64 minutas reais devem permanecer **rascunhos para revisão**, sem aprovação automática. A aprovação fictícia do laboratório não autoriza aprovação de produção. Readback hospedado, assets/saúde/barreiras e estado final do lote pertencem ao fechamento de publicação do coordenador. A etapa22 permanece fora do escopo.
