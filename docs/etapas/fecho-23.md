# Fecho — Etapa 23

Implementação e homologação local sobre `39b00ee`, preservando Etapa22 e correções03/11. Fonte oficial e contrato em [etapa-23.md](etapa-23.md). Publicado via [PR79](https://github.com/escritoriojnsistema/escritoriojn/pull/79), merge `8db53aba6425372d4697c388e9939427941e9a5b`, árvore `acb950a96b274e03882faaf588b436b4b56e473f` igual à homologada; Vercel `CVwAMvj6wQwxwEyjDMGgicy27Nkg` SUCCESS em https://escritoriojn.vercel.app. [Readback](../evidencias/etapa-23/publicacao.json).

## Entrega e decisões

Fila de revisão no HubDocumentos; responsável/prazo/histórico no editor existente; encaminhar, aprovar, rejeitar, devolver e retirar por revisão imutável. Permissão independente `documents.review` em Equipe/convites/delegação. Avisos deduplicados e acompanhamento seguro em Minhas solicitações. Recebimento, assinatura, financeiro e entrega continuam com suas autoridades próprias.

Decisões de implementação: ampliar o workflow publicado evita duplicar autoridade; responsável vazio usa fila compartilhada autorizada; prazo interno não decide automaticamente. Somenteowner recebe a nova capacidade por papel, sem concessões individuais. Essas escolhas conservam a operação e exigem do gestor concessão explícita aos demais revisores.

## Provas

[Registro local](../evidencias/etapa-23/verificacao-local.json):287Node/API,891PASS SQL/2replays vazios sob migrador limitado, build/typecheck e auditprodução0. Jornada Auth real local navega fila/revisor→devolução→correção→aprovação; verifica portal pela API, revogação, replay e decisões HTTP simultâneas200/409 com um único evento terminal.

20amostras HTTP autenticadas por endpoint: fila p50=104ms/p95=170ms; resumo cliente p50=95ms/p95=119ms. Medição local com fixture, sem SLA hospedado. Fila pagina antes das projeções documentais caras; índices editoriais/revisor e escopo por escritório evitam consultas de detalhe de todo o acervo. Interface sem loaders e com rótulos estáveis. Regressão visual112contratos afetados aprovada:106na primeira execução e6na repetição isolada após falhas de timing/timeout;320/360/768/1440. Nenhum runtime foi alterado para essa repetição.

Revisão independente encontrou e corrigiu autoaprovação do remetente vigente após retirada/transferência e impossibilidade de veto em serviço isento. Regressões cobrem ambos em dois replays; re-revisão aprovada sem novosP1/P2. Em serviço isento, encaminhamento explícito fica em análise mas dispensa mantém o gate até veto humano; decisão negativa bloqueia artefato.

## Limites

Laboratório GoTrue/PostgREST/Postgres descartável, somente esquemaStorage; sem novos bytesPDF/SMTP nessa jornada. Sem usuários/grants/serviços/pagamentos fictícios hospedados. Sem aparelho físico ou jornada autenticada com contas reais. Proteção de senhas vazadas desativada é aviso preexistente, não alterado; [referência Supabase](https://supabase.com/docs/guides/auth/password-security#password-strength-and-leaked-password-protection). ConectorVercel403 conhecido: acompanhar Git/status e domínio canônico, sem CLI/API de deploy. GitHub Actions não usado. Etapa24 não iniciada.

## Conferência hospedada

Migration20261103183425 automática apósGit:36comandos originais na mesma ordem e19corpos explícitos idênticos ao SQL testado. NÃO reaplicar.4RPCs públicas invoker autenticadas, zeroEXEC anônimo; eventos privados comRLS e nenhumSELECT/escrita bruta autenticada. documents.review seed somenteowner, zero grants individuais novos.5Auth/5vínculos/17grantsindividuais e0documentos/publicações/eventos preservados.

8assets comSHA256 iguais ao build local público, health/páginas200,seisAPIsprivadas401 e3testesPlaywrightpúblicos360/1440 aprovados. Advisors semERROR/novosWARN;27FKssemíndice preexistentes intactos e2novosINFO de índices ainda sem uso em base sem documentos. Sem Edge/Storage/SMTP/env/contas reais alterados. Fechamento documental seguinte conserva runtime; nenhuma implementação24.
