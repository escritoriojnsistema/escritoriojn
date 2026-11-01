# Verificação da retomada — 01/11/2026

Base: `bfc78af`, PR68. Trabalho em branch isolada `feat/fluxo-integrado-20261101`. Não foram alterados dados hospedados, contas, preços reais, permissões individuais ou aprovações das minutas.

## Evidência executada

| Verificação | Resultado observado |
|---|---|
| Baseline `npm test` | 233 aprovados antes das alterações |
| `npm test` após integração | 246 aprovados, zero falhas |
| `npm run typecheck` / `npm run build` | aprovados, frontend e servidor |
| `npm audit --omit=dev --audit-level=high` | zero vulnerabilidades |
| SQL A+B, `JN_DB_DOCUMENTS21_ISOLATED=1 node scripts/test-database.mjs` | 549 verificações PASS em dois bancos descartáveis, migrador sem superusuário/BYPASSRLS; preços/contratação/pastas/intake/21, concorrência de vaga e revogação de sessão; jornada financeira descrita abaixo |
| UI histórica de modelos/editor | 32 aprovados em Chromium, incluindo 320/360/768/1440 |
| UI nova de catálogo/pastas/renomeação | 8 aprovados em Chromium, 320/360/768/1440 |
| Público `npm run test:e2e` | 79/80 na rodada; uma navegação `net::ERR_ABORTED` em 1440 passou na repetição isolada. Não houve alteração de tela pública para mascarar a falha |
| PDF e worker, teste focado final | 8 aprovados: PDF real/determinismo/acentos/paginação/glifo/limites e download com revalidação/hash/negações |
| Deno2.9.6 `check` da função e geração real | aprovados; exemplo com acentos gerou9395bytes, duas gerações idênticas |
| `git diff --check` | aprovado |

Os testes UI usam interceptações explícitas e dados fictícios; não são prova de autenticação real. O teste do worker usa servidor Storage/RPC de fixture; o renderer foi executado de verdade em Node e Deno. Não foi concluída uma jornada Auth→Edge→Storage real ou hospedada nesta sessão.

## Jornada financeira comprovada por RPCs reais locais

Documento preparado → publicação de revisão exata → aprovação humana distinta → lease → negação após sessão revogada/fonte bloqueada → conclusão pelo serviço → envio ao caixa → reivindicação por outro operador → cobrança canônica única → caixa próprio → recebimento parcial → portal bloqueado → replay sem duplicação → quitação integral → portal e autorização de arquivo liberados → estorno lógico → portal e novos acessos bloqueados.

As provas usam `payment_operate`, `correction_operate`, `charges_amounts`, `portal_documents_page` e `document_artifact_authorize` reais. O arquivo neste teste SQL é somente metadata de fixture: não declarar que esse teste SQL gerou ou armazenou PDF. O renderer e a leitura/verificação de bytes são testados separadamente.

A prova encontrou e corrigiu a delegação incompleta no adaptador interno `cash_operate_before15`: o recebimento delegado passa sem modificar `request_can_work` global. Fontes históricas são revalidadas na conclusão do artefato; quitação não supera vínculo/revisão/restrição.

## Limitações e infraestrutura

Duas tentativas do laboratório Auth terminaram por falta de espaço do executor Docker; a última falhou ao registrar uma camada da imagem `supabase/storage-api`. Os recursos descartáveis foram encerrados. Esse resultado não prova falha do login do produto e não conta como teste Auth aprovado. O login otimizado já estava na base; não foram medidas latências de conta hospedada ou aparelho físico nesta retomada.

Assinatura eletrônica externa, intake corrigido por nova proposta/aceite e contratação de serviços com campos/checklist/participantes obrigatórios permanecem limitados conforme o checkpoint. Configuração real de modelo/valor/nível e aprovação humana continuam necessárias.

## Publicação

Não houve merge em produção, aplicação manual no Supabase, deployCLI ou GitHub Actions. As migrations e a função `document-artifacts` estão versionadas para revisão. Antes de produção: verificar aprovação para publicação, aplicação automática das migrations pelo GitHub, disponibilidade da função com chave privilegiada somente no runtime Edge e barreiras/bytes nos endereços hospedados. Nunca repetir migration que já conste no histórico.

Logs locais de suporte: `/tmp/jn-node-final.log`, `/tmp/jn-build-final.log`, `/tmp/jn-workflow-final.log`, `/tmp/jn-workflow-final4.log`, `/tmp/jn-focused-ui.log`, `/tmp/jn-integrated-ui2.log`, `/tmp/jn-pdf-final.log`, `/tmp/jn-deno-check.log`, `/tmp/jn-deno-render.log`. Não são arquivos de produção nem evidência de publicação.

Complemento de regressão:35 contratos UI de Solicitações/Caixa aprovados; tela pública1440 aprovada na repetição. O último replay SQL inclui perda do vínculo de identidade após quitação, bloqueio de edição documental pelo caixa delegado e título renomeado no seletor legado. O log final desse complemento é `/tmp/jn-workflow-final4.log`, concluído com saída0 e549verificações PASS;48delas trazem o prefixo workflow. Não houve erro no replay final.
