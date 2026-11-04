# Fecho — Etapa 24

Implementação e homologação local sobre main1e45dd3/Etapa23, com especificação/execução aprovadas pelo usuário e retomada incremental. [Contrato24](etapa-24.md), [verificação local](../evidencias/etapa-24/verificacao-local.json), [publicação/readback](../evidencias/etapa-24/publicacao.json). Publicado pelo [PR82](https://github.com/escritoriojnsistema/escritoriojn/pull/82), merge `6b60aaa6f5744ba60af973787603979b3e8f0f1d`, árvore `0a376051c853cd9d3869ba3ed73187060e04fa11` igual à homologada; Vercel `59Fm6a2Y2VRwCCATjH8oF6h9yYp7` SUCCESS em https://escritoriojn.vercel.app.

## Entrega

Formalização na aba existente Versões e PDF, por seletor que mostra uma área de trabalho por vez. Configuração de modalidade/signatários/saída; exportação própria para assinatura; importação pelo Anexos11; conferência humana externa por hash/signatários/evidência; ato físico com data/custódia/cartório; invalidação e histórico. Capacidades independentes/delegáveis, seed sóowner, sem concessões individuais automáticas. Quatro abas, padrões Equipe/Convites, Desktop em duas colunas, mobile44px/16px, sem loaders e com tentativas503 preservadas.

Saída não é entrega final e exige configurar signatários antes de exportar. Handoff financeiro pode preceder assinatura, permitindo cobrar sem ciclo. Download final exige todas as condições e devolve o original externo validado com SHA256/tamanho/referência conferidos antes/depoisStorage. Nova revisão exige formalização própria; renderers/PDFs antigos intactos. Legado físico conserva autoria/motivo/data sem inventar signatários, arquivo ou prova criptográfica.

## Provas

300Node/API,961PASS SQL em dois replays vazios sob migrador limitado (70PASS24 incluindo concorrência de evento/sessão revogada após lock),39contratosUI23/24 e mais4larguras após compactaçãoDesktop, build/TS e auditprodução0. Capturas fictícias320/360/768/1440 inspecionadas. Revisão independente encontrou P2 saída sem signatários que impedia configurar depois: reproduzido RED removendo guarda somente em memória; corrigido com `signature_setup` e dois replaysGREEN. Revisão complementar da UI sem novosP1/P2.

Jornada Auth/PostgREST/Postgres/Storage/worker/API e navegador móvel reais locais:1teste aprovado10,8s. Upload/download idênticos:8937bytes, SHA256 `0713cd7f4b34fcf5aa10722df86a53e9763bfddf538874773f13939b9b839ba0`, diferente do PDFbase. Quarentena/scanner ausente, hash/signatário divergentes, revogação, troca de revisão, capacidade/sessão encerrada, escritório alheio e cliente sem acesso interno exercitados.20amostras autenticadas de signature-state: p50=43ms/p95=57ms,1104bytes e1requisição navegador por amostra; medição local, sem SLA hospedado nem promessa de atraso zero.

Ajuste de teste preexistente: exportação1001eventos falhava comECONNRESET porque socketHTTP fictício expirava durante renderização síncrona. A/B comprovado; apenas keepAliveTimeout do provedor de teste aumentado, preservando asserções/renderer/produto. LaboratórioOpenAPI agora repete falhas transitórias dentro de deadline20s, com fetch limitado e mesmasRPCs esperadas; errosSQL não são ocultados. Locators/fixtures Auth atualizados para UI/categorias reais.

## Limites

Scanner clean e assinatura no PDF foram fixtures explicitamente fictícias, somente no laboratório descartável. A prova comprova preservação e guardas, não assinatura criptográfica real, validade jurídica ou antivírus real. Storage executou filesystem oficial pinned/digests verificados, montado readonly em chroot com bytes emtmpfs, contornando apenas falta de disco do driverDockerVFS; código do provedor não foi substituído por mock. Nenhum dado/Auth/grant/serviço/tarifa/PDF de teste hospedado.

No ambiente hospedado, pipeline11 sem scanner mantém quarentena e bloqueia conferência/entrega eletrônica; responsável precisa resolver configuração real pelo procedimento autorizado. Não guardar credenciaisGOV.BR nem alegar integraçãoITI/cartório. Sem jornada autenticada com contas reais ou aparelho físico. Conector administrativoVercel403 preexistente: acompanhar Git/status/domínio público, sem contorno de proteção nem deployCLI/API Vercel. GitHub Actions desativado e não utilizado. Etapa25 não iniciada.

## Publicação

Rollout compatível: PR81/merge8f1f8e76 publicou aceitação das duas capacidades; Vercel5sYpSD5uSUCCESS. Worker compatível document-artifacts21ACTIVE/JWT,8fontes iguais ao local e barreira anônima401 conferidas antes do schema. PR82 publicou o restante; migration20261104130612 aplicada automaticamente:24comandos normalizados na mesma ordem e13corpos MD5 idênticos ao SQL testado. NÃO reaplicar. ApósGit worker22ACTIVE/JWT com7fontesTS iguais ao local;8assets canônicos iguais ao build, health/páginas200,6APIsprivadas401 e3testesPlaywrightpúblicos360/1440 aprovados. Três wrappersINVOKER autenticados, semEXEC anônimo;2tabelasprivadasRLS/ACLfechadas. Contagens reais5Auth/5vínculos/17grantsindividuais e0documentos/publicações/arquivos/eventos mantidas;53migrations. Advisors semERROR/novoWARN;INFO deRLSprivadafechada/índicessemuso esperados. Proteção de senhas vazadas desativada permanece aviso preexistente, sem alteração automática: [referência Supabase](https://supabase.com/docs/guides/auth/password-security#password-strength-and-leaked-password-protection).
