# Ledger — Etapa 23

Base39b00ee, Etapa22e ajustes03/11 confirmados antes de editar. FonteDrive23lida; banco hospedado com0documentos/publicações/eventos editoriais no início desta rodada.

Ruling: ampliar a infraestrutura editorial publicada, sem segunda tabela de approvals — evita duplicar autoridade e perder integração21/22/financeiro.
Ruling: permissão documents.review independente de templates.approve — segregação solicitada pelo manual; seed apenasowner, demais por concessão explícita.
Ruling: responsável opcional significa fila compartilhada autorizada; prazo interno opcional nunca decide automaticamente — conserva operação quando não há outro revisor configurado.

T1 implementado localmente: contratos, migration20261103183425, capacidade documents.review, fila e decisões por revisão; validação SQL em andamento. Ajustados ambiguidades PLpgSQL, filtro do fixture, whitelist de avisos e flush do trigger22 diferido no teste transacional.
T2/T3 implementados: aba Revisões/editor existente, responsável/prazo/histórico, endpoints tipados, avisos deduplicados e resumo seguro do cliente. Revisão UI escopada aprovada.
Provas locais anteriores preservadas:286Node,19UI novos de revisão+5UI de resultados, build/typecheck aprovados. Novo testeAPI das4rotas aprovado na retomada. Regressão112UI em execução; Auth real local em execução.
Revisão final encontrou P1 autoaprovação do novo remetente após retirada/transferência e P2 veto editorial em serviço isento. Correção e regressões obrigatórias antes da publicação; relatório /workspace/scratch/23-final-review.md.
Banco hospedado reconferido:5Auth/5vínculos/17grantsindividuais,0documentos/publicações/eventos; última migration20261103160413. Nenhum SQL hospedado alterado nesta rodada.
Pendências: concluir SQL2replays/Auth real/performance, corrigir2achados e re-revisar, homologar regressão, publicar GitHub→Vercel e conferir migration/ativos/dados; atualizar Livro/fecho. SemActions.

T1–T4 concluídos:287Node/API,891SQL/2replays,112UI distintos(106+6rechecados),Authreal com2HTTPsimultâneos200/409 eeventoterminalúnico,buildpúblico/TS/auditprodução0. Medições20amostras:fila104/170ms p50/p95;resumo95/119ms. P1/P2 corrigidos e re-revisão independente aprovada. Sem pendências funcionais confirmadas. T5 em andamento: publicação e readback hospedados.
