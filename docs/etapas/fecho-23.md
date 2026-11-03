# Fecho — Etapa 23

Implementação e homologação local sobre `39b00ee`, preservando Etapa22 e correções03/11. Fonte oficial e contrato em [etapa-23.md](etapa-23.md). Publicação GitHub→Vercel em preparação; não declarar hospedado até readback do commit, migration e ativos.

## Entrega e decisões

Fila de revisão no HubDocumentos; responsável/prazo/histórico no editor existente; encaminhar, aprovar, rejeitar, devolver e retirar por revisão imutável. Permissão independente `documents.review` em Equipe/convites/delegação. Avisos deduplicados e acompanhamento seguro em Minhas solicitações. Recebimento, assinatura, financeiro e entrega continuam com suas autoridades próprias.

Decisões de implementação: ampliar o workflow publicado evita duplicar autoridade; responsável vazio usa fila compartilhada autorizada; prazo interno não decide automaticamente. Somenteowner recebe a nova capacidade por papel, sem concessões individuais. Essas escolhas conservam a operação e exigem do gestor concessão explícita aos demais revisores.

## Provas

[Registro local](../evidencias/etapa-23/verificacao-local.json):287Node/API,891PASS SQL/2replays vazios sob migrador limitado, build/typecheck e auditprodução0. Jornada Auth real local navega fila/revisor→devolução→correção→aprovação; verifica portal pela API, revogação, replay e decisões HTTP simultâneas200/409 com um único evento terminal.

20amostras HTTP autenticadas por endpoint: fila p50=104ms/p95=170ms; resumo cliente p50=95ms/p95=119ms. Medição local com fixture, sem SLA hospedado. Fila pagina antes das projeções documentais caras; índices editoriais/revisor e escopo por escritório evitam consultas de detalhe de todo o acervo. Interface sem loaders e com rótulos estáveis. Regressão visual112contratos afetados aprovada:106na primeira execução e6na repetição isolada após falhas de timing/timeout;320/360/768/1440. Nenhum runtime foi alterado para essa repetição.

Revisão independente encontrou e corrigiu autoaprovação do remetente vigente após retirada/transferência e impossibilidade de veto em serviço isento. Regressões cobrem ambos em dois replays; re-revisão aprovada sem novosP1/P2. Em serviço isento, encaminhamento explícito fica em análise mas dispensa mantém o gate até veto humano; decisão negativa bloqueia artefato.

## Limites

Laboratório GoTrue/PostgREST/Postgres descartável, somente esquemaStorage; sem novos bytesPDF/SMTP nessa jornada. Sem usuários/grants/serviços/pagamentos fictícios hospedados. Sem aparelho físico ou jornada autenticada com contas reais. Proteção de senhas vazadas desativada é aviso preexistente, não alterado; [referência Supabase](https://supabase.com/docs/guides/auth/password-security#password-strength-and-leaked-password-protection). ConectorVercel403 conhecido: acompanhar Git/status e domínio canônico, sem CLI/API de deploy. GitHub Actions não usado. Etapa24 não iniciada.
