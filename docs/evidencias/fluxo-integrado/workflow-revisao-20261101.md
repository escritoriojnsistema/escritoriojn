# Revisão focada do fluxo documental — 2026-11-01

Escopo: leitura de `shared/documentWorkflow*`, migration `20261101144028_document_workflow.sql`, handler e renderer de `document-artifacts`, e contratos de fontes e financeiros pertinentes. Esta revisão não executou testes, migrations, geração ou alterações de dados. A base estava em edição concorrente.

## Achado confirmado

**Alto — conclusão do artefato não revalida a visibilidade das fontes históricas.** `supabase/migrations/20261101144028_document_workflow.sql:194`–`:209` verifica lease, sessão, capacidades e responsabilidade pelo atendimento, mas não aplica o gate de clientes/fontes usado por `private.documents_access21` em `supabase/migrations/20261026195437_documents21_editor.sql:73`–`:82`. Reprodução: operador autorizado inicia geração; antes de concluir, uma fonte histórica ou participante perde visibilidade para ele ou é bloqueado; o serviço conclui com lease ainda válido porque responsabilidade e capacidades permanecem. O arquivo torna-se pronto mesmo após perda de autoridade sobre seu conteúdo. Download interno revalida fontes, mas a conclusão incorreta também alimenta o estado de prontidão do portal, sujeito aos gates próprios do destinatário.

Corrigir com helper que aceite explicitamente o ator original e capacidades atuais, replique a validação das fontes históricas/participantes e serialize a verificação com alterações pertinentes sob a ordem de locks existente. `documents_access21` usa identidade do JWT e não pode ser chamado diretamente pelo service role como substituto. Testar perda de escopo ou bloqueio entre begin e complete, sessão expirada/revogada, e sucesso sem mudança de autoridade. Não foi executada reprodução SQL nesta revisão.

## Comportamentos reavaliados

- O bloqueio `handoff` (`20261101144028_document_workflow.sql:62`) corresponde à sequência exigida: produtor encaminha ao caixa, depois o pagamento integral no ledger libera automaticamente quando os demais gates estão satisfeitos. Retiro o achado anterior. A cobrança é única por atendimento (`20261022012025_charges_obligations.sql:78`). São necessários testes SQL de pagamento parcial, integral e estorno para demonstrar o comportamento.
- A delegação financeira após rejeição editorial (`20261101144028_document_workflow.sql:126`–`:129`) permite recuperação e correção financeira, inclusive estorno/devolução. A rejeição bloqueia liberação independentemente. Retiro o achado anterior; não demonstrado bypass financeiro com base nesse comportamento.
- Assinatura externa permanece bloqueada: `wf_signed` aceita apenas `none` ou evento físico (`:44`–`:45`), e o comando só permite registrar assinatura física (`:114`–`:115`).
- Download de cliente exige vínculo e gate atuais, e o handler reautoriza depois de buscar e verificar tamanho/hash (`:220`–`:230`; `handler.ts:45`–`:53`).
- Geração recebe conteúdo do snapshot do banco, e conclusão é reservada ao service role (`handler.ts:31`–`:42`; migration `:246`–`:248`). O teste existente `tests/document-pdf.test.ts` cobre igualdade de bytes; segundo informação da equipe executora, passou. Esta revisão não o reexecutou.

## Resolução pelo coordenador

A conclusão agora percorre todas as fontes históricas/participantes sob locks por `wf_sources_allowed`, verificando a autoridade do autor do lease e a sessão/conta atuais. O teste SQL executado nega conclusão após bloqueio da fonte e após revogação da sessão; a conclusão válida passa. A revisão independente não foi repetida depois dessa correção. A jornada financeira real local também identificou e corrigiu a ponte de responsabilidade no adaptador anterior15; quitação e estorno foram validados separadamente.
