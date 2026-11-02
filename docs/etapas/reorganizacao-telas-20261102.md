# Reorganização de navegação e telas — 02/11/2026

Pedido recebido: eliminar duplicidade de menus/telas, separar o que é do cliente do
que é da equipe, unificar Documentos/Modelos, agrupar o financeiro em Caixa,
renomear Checklist, preparar Serviços por categoria e revisar os títulos de acesso.

## Entregue nesta etapa

- **Menu por papel, sem duplicidade.** `operationNavigation` agora devolve dois
  conjuntos distintos:
  - Cliente: Início, Minhas solicitações, Documentos, Anexos, Meus pagamentos,
    Notificações, Conta.
  - Equipe: Início, Solicitações, Clientes, Documentos, Serviços, Checklist, Caixa,
    Anexos, Notificações, Equipe e convites, Auditoria, Arquivados, Conta.
  Destinos financeiros e documentais deixaram de aparecer como itens separados.
- **Documentos único (equipe).** `/documentos` reúne Modelos e Documentos emitidos
  em abas. `/modelos` redireciona para a tela única e `/solicitar-documento`
  redireciona para Solicitações; não há mais “Modelos documentais” nem “Solicitação
  de documentos” como telas/menus paralelos.
- **Solicitar documento dentro de Solicitações.** O fluxo de catálogo/agendamento
  foi embutido na tela de Solicitações (botão “Solicitar documento”), reutilizando
  pasta, preço e demais dados já publicados.
- **Documentos único (cliente).** `/meus-documentos` reúne “Modelos e preços” e
  “Meus documentos”. O catálogo lista pasta e preço e continua sem expor o conteúdo
  do modelo; `/modelos-disponiveis` redireciona para a tela única.
- **Checklist.** A tela `/pendencias` passou a se chamar somente **Checklist**, com
  descrição explícita dos dois checklists (do cliente e interno da equipe). O modelo
  de checklist interno agora é identificado como “Checklist interno da equipe”.
- **Caixa como área financeira.** Caixa ganhou abas Cobranças, Despesas e
  movimentações e Relatórios financeiros, montadas apenas quando a sessão tem a
  capacidade correspondente. As rotas antigas continuam válidas para links diretos.
- **Serviços.** A categoria é escolhida de uma lista antes de criar/editar
  (`shared/services.ts`) e o campo de checklist foi rotulado como “Checklist do
  cliente”. A tela do serviço ganhou o painel **Documento e pasta**: mostra o
  documento vinculado com pasta, categoria, código e preço, e permite escolher
  categoria da pasta → modelo aprovado e vincular, sem sair de Serviços.
- **Disponibilidade.** Os quadros de “Minha disponibilidade” foram refeitos como
  cartão único no padrão do layout: cabeçalho, indicador de status, grade de campos,
  foco visível e alvos de 44px.
- **Títulos de acesso.** `operationRoleNames` e `teamRoleNames` agora usam
  “Super administrador”, “Administrador”, “Funcionário” e “Cliente”, sem
  “(Proprietário)” duplicado. O catálogo histórico de PDFs de governança foi mantido
  congelado; não foi reescrito.

## Banco de dados desta etapa

Migration `20261102030000_catalog_service_identity.sql`, aplicada no projeto
Supabase de produção como SQL idempotente (`CREATE OR REPLACE`) e conferida por
leitura de catálogo. O histórico `schema_migrations` deve ser reconferido depois do
push; se a integração Git não registrar a versão, aplicar a migration rastreada.

- `private.model_folder_category` deriva a categoria da pasta a partir do tipo
dominante dos modelos da pasta (Contratos, Declarações, Ofícios, Requerimentos ou
Documentos), sem criar um segundo campo editável que possa divergir.
- `model_folders_state` e o catálogo passaram a devolver a categoria da pasta.
- `document_offer_projection` passou a devolver `template_code`, `service_id`,
  `service_code`, `service_category`, `service_checklist`, `folder_name` e
  `folder_category`. A busca do catálogo também encontra pelo código do modelo.
- `document_offer_for_service` lê o documento vinculado a um serviço;
  `document_offer_attach` cria a oferta com os padrões oficiais reutilizando
  `document_offer_manage` (autoridade, locks, versão aprovada, elegibilidade e
  idempotência continuam nessa função).
- ACLs fechadas e `EXECUTE` somente para `authenticated`; as RPCs públicas são
  `SECURITY INVOKER`.

## Pendências que continuam fora desta etapa

1. **Pendência automática "enviada com pendência"** ao abrir solicitação com item
   do checklist faltante: exige novo estado/fluxo no pedido e revisão das regras de
   fechamento.
2. **Formulário único de solicitação de documento** com categoria, pasta, modelo,
   preço e checklist no primeiro passo; hoje o catálogo embutido em Solicitações
   abre a solicitação após a escolha do modelo.
3. **Checklist por documento** além do checklist por serviço: o modelo interno é
   por serviço e o checklist do cliente vem do serviço/modelo; um escopo próprio
   por documento exige nova tabela e vínculo versionado.

## Verificação executada

- `npm run typecheck`: passou.
- `npm run build` (tsc + Vite + servidor): passou; bundles gerados.
- `npm run dev` + `GET /`: HTTP 200 e HTML da SPA servido.
- Testes focados de Serviços, pastas, catálogo documental e contratos de equipe:
  11 passaram após atualizar as fixtures com `category` e a identidade do modelo.
- Banco: funções novas e projeções conferidas no Supabase por consulta ao catálogo
  (`pg_proc` e `pg_get_functiondef`); não há serviços nem ofertas reais, então o
  vínculo não foi exercitado com dados fictícios.
- `npm test` completo não foi repetido nesta rodada; o histórico desta VM é de falha
  somente nos testes de PDF por fonte ausente.
- Ainda não houve commit, push, deploy ou publicação neste checkpoint.
