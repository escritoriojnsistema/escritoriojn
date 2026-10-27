# Etapa 21 — revisão independente conjunta

Estado após re-review: Tasks1e2 sem achado bloqueante identificado. Os achados e vereditos iniciais abaixo são históricos; a seção final registra a correção validada. Publicação/hospedado permanecem conferência separada do controlador.

Revisão local do conjunto `93c8bf0..a40db5c`, Tasks 1 e 2 e correção transversal `fe637a8..a40db5c`, contra `docs/etapas/etapa-21.md` e `docs/regras/documentos.md`. Veredito: **não aprovar o conjunto ainda**, por P1 de perda de edição durante navegação. Task 1 (SQL): sem achado bloqueante identificado na revisão; Task 2 (TS/API/UI): não aprovada até corrigir o P1. Task 3, publicação e Livro permanecem pendentes.

## Achado

**P1 — reversão local durante save em voo pode ser perdida ao navegar.** Em `src/features/documents/DocumentQueue.ts:16`, `dirty` compara o texto atual com o detalhe anterior, mesmo enquanto uma gravação diferente está em voo. Em `src/features/documents/DocumentEditor.tsx:14`, o bloqueio de links e `beforeunload` só existe quando `dirty` é verdadeiro; a navegação principal continua disponível durante `busy` (`src/features/operation/OperationLayout.tsx:45`). A desmontagem chama `dispose`, que aborta a espera e limpa a fila (`DocumentQueue.ts:21`), sem garantia de cancelar um commit já ocorrido no servidor.

Reprodução por leitura do fluxo: começando com texto O, digitar A e aguardar o autosave iniciar; enquanto a resposta está pendente, voltar o texto a O. A fila marca `dirty=false`, embora A ainda possa ser confirmado. Navegar pela sidebar ou fechar/recarregar a página antes da resposta: a reversão O não é enviada, e um commit de A pode permanecer. A tela também indica “Rascunho salvo” nesse intervalo (`DocumentEditor.tsx:20`). Se a resposta for 503, a mesma classificação permite sair sem reter a tentativa incerta. Isso viola a preservação de digitação posterior e a retenção do corpo/chave em erro incerto. Corrigir a sinalização e a proteção de saída para cobrir intenção em voo/incerta e alterações posteriores, com regressão real de navegação e de 503; não basta apenas mudar o rótulo.

## Três achados da revisão interrompida

1. **ADDRESSED — replay 503 com revisão concorrente.** `DocumentQueue.ts:20` exige revisão esperada, input semântico e fontes/participantes coerentes antes de promover base; resposta posterior produz 409 e mantém rascunho. Testes focais cobrem r3 concorrente, confirmação genuína, noop e mudanças de fonte. A ressalva P1 acima é um caminho distinto de saída com intenção ainda pendente.
2. **ADDRESSED — UUID com caixa distinta.** `shared/documents.ts:25` normaliza identidade em pares e buyer/seller; SQL compara UUID tipado em `supabase/migrations/20261026195437_documents21_editor.sql` e os testes cobrem duplicatas e snapshot canônico.
3. **ADDRESSED — recuperação de 422.** `DocumentQueue.ts:16-20` descarta tentativa rejeitada e permite corrigir com chave nova, inclusive digitação em voo; editor libera 422 (`DocumentEditor.tsx:17`). Testes focais Node e UI cobrem edição, nova gravação, prepare e participantes. 503 e 409 continuam bloqueados, 401/403 limpam dados.

## Avaliação e evidências

Revisados contratos e implementação de gate único, rechecagens após locks/replay, isolamento de fontes históricas, revisão otimista, comandos e snapshots append-only, troca de participantes, DTO/API, resolução tipada, escape HTML e integração editor. Não identifiquei outro achado concreto bloqueante nesta inspeção; isto não prova ausência de defeitos. O HTML na prévia é texto React em `<pre>`, sem interpretação como markup. Revisões usam snapshots de fontes e a troca explícita preserva partes inalteradas e limpa overrides dos papéis alterados.

Relatórios informam dois replays PostgreSQL 17 com migrador limitado, 209 PASS incluindo 12 corridas e regressão 20; testes focais da correção 19 Node e 3 UI. Conferi hashes da migration, testes SQL e log com `banco-verificacao.json`. Logs finais existentes registram 206/206 Node, 13/13 UI e 6/6 Auth real local; build e typecheck constam verdes nos relatórios. Não repeti suítes, conforme escopo; a reprodução do P1 acima é análise estática dos caminhos, não ensaio de navegador executado nesta revisão. Testes locais não comprovam estado hospedado, aplicação da migration ou operações em produção.

Fora de escopo por especificação: etapa 22/document_versions e ciclo editorial, PDF documental, aprovação, assinatura e entrega; IA, cadastro central e novo ledger; publicação, Actions, deploy, fixtures/grants e Auth hospedados. A preservação de 20 e PDFs 1–7 foi considerada pelas evidências de regressão e manifesto, sem concluir publicação ou fechamento.

## Re-review da correção de navegação — `a40db5c..0542230`

**P1 ADDRESSED.** A fila mantém `dirty` quando existe save em voo ou incerto, inclusive se o texto volta ao snapshot anterior (`DocumentQueue.ts:16`). Os guardas existentes de link e `beforeunload` permanecem ativos; confirmação da revisão de A preserva O para nova gravação, enquanto 503 conserva a chave e payload originais. Após 422 de save, a fila recalcula a diferença com a base e não cria nova gravação nem proteção persistente para O igual à base (`DocumentQueue.ts:20`). O conflito 409 conserva proteção e rascunho. Não identifiquei quebra adicional causada pelo delta inspecionado.

Conferidos os logs focais: 14/14 testes Node, 3/3 UI e typecheck sem erro. O teste UI retarda a resposta e verifica link e evento `beforeunload` em voo e após 503; o fechamento efetivo do navegador não foi exercitado. Não repeti suítes. Revisão limitada ao delta; os outros três achados permanecem ADDRESSED conforme registrado acima.

**Veredito atualizado:** Tasks 1 e 2 e seu conjunto não têm achado bloqueante identificado nesta revisão local. Este veredito não conclui Task 3, publicação, verificações hospedadas ou Livro; as suítes finais amplas do controlador ainda estavam em curso nesta re-review.
