# Etapa 23 — revisão editorial

Fonte: cartão oficial `etapa-23.md` do Drive, id `1bIQImuHVK35cpVQsZdMe-m3RxKwEoo12`. Base `39b00ee`: Etapa22 e correções03/11 conferidas antes de implementar. Continuidade em [plano](../superpowers/plans/2026-11-03-etapa-23.md) e [ledger](etapa-23-progresso.md).

## Comportamento

- Documentos → Revisões apresenta fila com revisão exata, preparador, responsável opcional, prazo, pendências e observação; pesquisa/filtro/páginas3mobile/5desktop. Abrir documento reutiliza o editor21 e o histórico22.
- Preparar e encaminhar conserva conteúdo/snapshot imutável. Aprovar, rejeitar, devolver e retirar exigem motivo. Retirada permite reencaminhamento explícito; rejeição/devolução exigem nova revisão. Evento esperado e chave idempotente impedem decisão duplicada ou desatualizada.
- `documents.review` é independente de edição, concedível em Equipe/convites/delegação e seed somenteowner. Leitura/escopo/revisor designado e permissões atuais continuam obrigatórios. Autor/preparador/remetente não se autoaprovam; exceção somenteowner conforme política capturada.
- Avisos usam o inbox transacional existente. Minhas solicitações mostra somente título/revisão/resultado/data: nenhum texto, motivo interno ou autor é liberado. Revisão não registra recebimento, assinatura ou exceção financeira.
- Histórico e PDFs antigos, renderers, preços e snapshots são preservados. Os guards de artefatos consultam a decisão atual; veto editorial impede liberação mesmo se o serviço dispensava revisão.

## Camadas

Migration `20261103183425_document_editorial_review23.sql`: amplia eventos existentes, capacidade, FKs/índices privados, funções de autoridade/fila/histórico e notificações. Sem segunda tabela de aprovação, nova conta ou grant individual hospedado. Wrappers públicos invoker autenticados; tabelas e helpers privados fechados.

Express `/api/document-workflow/{review-queue,reviewers,review-history,request-reviews}` valida payload e projeta whitelist, Bearer e no-store. `command/state/versions` permanecem integrados. Frontend mantém padrão Equipe, alvos44px/inputs16px e rótulos estáveis sem loader; estados privados descartados por sessão/autoridade.

## Validação/publicação

Evidências consolidadas em `fecho-23.md` após completar as verificações e a publicação GitHub→Vercel, sem Actions. Laboratório Auth usa GoTrue/PostgREST/Postgres descartáveis com esquemaStorage; não comprova novos bytesPDF ou SMTP. Jornada hospedada autenticada não é executada com contas reais. Medições locais não constituem SLA nem promessa de atraso zero. Etapa24 não iniciada.
