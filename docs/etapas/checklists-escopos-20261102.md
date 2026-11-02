# Correção de telas e checklists por escopo — 02/11/2026

Pedido: corrigir o visual de **Solicitações** e **Minha disponibilidade**, criar
checklists do cliente e do interno por serviço/documento com vínculo e regra de
atendimento presencial, e publicar Supabase + GitHub + Vercel.

## O que mudou

### Solicitações (visual)
- A barra ganhou `request-toolbar`: busca com flex própria, botão de
  atualizar, “Nova solicitação” e “Solicitar documento” com largura própria.
  O botão de documento tinha `width:100%` herdado e estourava a barra,
  espremendo a busca.
- Em telas até 900px a busca ocupa a linha completa e os três botões viram
  alvos de 44px com ícone; o rótulo “Solicitar documento” vira rótulo acessível.

### Minha disponibilidade (visual)
- O bloco ficava com duas colunas dentro do menu de 220px por causa de
  `@media(min-width:901px)` baseado apenas na viewport.
- Agora é sempre uma coluna, sem margem lateral duplicada, alvo de 44px e
  fonte 16px no menu móvel.

### Checklist: cliente × interno
- Migration `20261102023904_checklists_client_internal.sql` aplicada no Supabase:
  - `scope` (`client`/`internal`) em `checklist_model_versions`, com PK
    `(office_id, service_id, scope, version)`. O modelo existente passou a ser o
    escopo interno, preservando versões e histórico.
  - `scope` em `checklist_entries` e limite de posição elevado para 24
    (12 itens por escopo).
  - `checklists_model`/`checklists_publish` ganharam `p_scope` com padrão
    `internal`, mantendo compatibilidade com as chamadas antigas.
  - `checklists_apply` aplica por origem do atendimento:
    - **presencial** → somente o interno (a equipe é quem abre);
    - **portal/whatsapp** → cliente + interno, quando publicados.
    Sem modelo publicado, usa o checklist legado do snapshot (cliente para
    portal/whatsapp, interno para presencial).
  - `checklists_view` devolve `origin` e o `scope` de cada item.
  - O catálogo de documentos (`document_offer_projection`) agora mostra o
    checklist **do cliente** publicado para o serviço; sem modelo, mantém o
    legado do serviço.
- A tela **Checklist** agora tem um bloco visível “Modelos por serviço ou
  documento”, aberto na entrada e recolhido quando um atendimento está
  selecionado, com abas **Checklist do cliente** e **Checklist interno**.
  O editor saiu de dentro do “Histórico e outras opções”.
- Itens exibem o escopo e a contagem separa cliente/interno; a legenda explica
  a regra do atendimento presencial.
- `ServiceChecklists` mostra no detalhe do serviço os dois modelos vinculados e
  leva para a tela de Checklist; a nota do formulário de serviço explica que o
  modelo publicado vale para os próximos atendimentos e que serviços como
  Consultoria, Contabilidade e Atendimento podem ter somente o interno.

## Categorias consultadas
`serviceCategories`: Documentos, Certidões, Registros, Consultoria,
Contabilidade, Fiscal, Trabalhista, Jurídico, Atendimento, Outros. O editor de
checklist menciona essas categorias e não exige checklist do cliente — serviços
internos podem ficar só com o escopo interno. Um documento do catálogo usa o
serviço vinculado a ele.

## Verificações executadas
- `npm run typecheck` — passou.
- `npm run build` — passou.
- 16 testes Node focados (`checklists-validation`, `checklists-api`,
  `services-api`, `model-folders`, `document-commercial-api`,
  `team-frontend`) — passaram, incluindo 2 novos sobre escopos/origem.
- Playwright (Chromium local com libs/fontes extraídas no home, sem sudo):
  `checklists-contract` 12/12 e `requests-contract` 14/14 — passaram.
- Supabase: migration aplicada e conferida (colunas `scope`, PKs, checks,
  ACL `authenticated` sem `anon`, funções com `p_scope`, regra de origem em
  `checklists_apply`, helper no catálogo). Histórico `20261102023904` com o
  mesmo nome do arquivo para a integração Git não reaplicar.
- Imagens de evidência: `docs/evidencias/etapa-12/pendencias-{320,360,1440}.png`
  e `docs/evidencias/etapa-10/detalhe-lista-1440.png`.

## Lacunas
- Sem sessão real no ambiente: login autenticado em produção, publicação de um
  checklist real em serviço existente e aplicação em pedido presencial ficam
  para conferência do gestor (não havia serviços/ofertas cadastrados).
- `tests/database/checklists.sql` (Docker) não rodou por falta de Docker na VM;
  o SQL equivalente foi conferido por catálogo de funções no banco hospedado.
- `npm test` completo não foi repetido; o histórico da VM registra falha apenas
  nos testes de PDF por fonte ausente.