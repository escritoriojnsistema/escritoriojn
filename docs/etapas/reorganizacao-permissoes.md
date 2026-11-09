# Reorganização de permissões — 09/11/2026

Base: Etapa27 publicada, sem iniciar28. Alteração no seletor compartilhado deEquipe/convites/delegações e nas autorizações rurais. Publicação em validação até o readback final.

## A — Organização

79permissões configuráveis existentes preservadas, acrescidas de5rurais:84, sem duplicatas, em17grupos. IDs existentes mantidos. Grupos iniciam recolhidos; busca por módulo/nome/código com normalização de acentos abre resultados sem apagar seleção. Expansão individual/todos, recolhimento, totais, seleção individual/em lote e checkboxindeterminado. Foundation obrigatório, escopo não delegável e ações administrativas indisponíveis claramente identificados. Ações internas separadas por consulta, cadastro/emissão, edição/vínculos, conferência/aprovação, configuração e especiais. Dirty indicator e confirmação ao fechar/trocar editor/escritório/aba ou navegar; troca/revogação de identidade continua descartando dados obrigatoriamente.

| Módulo | Permissões |
|---|---:|
| Acesso geral/configurações |3|
| Clientes |7|
| Serviços |8|
| Solicitações/atendimentos |12|
| Anexos dos atendimentos |4|
| Checklists/pendências |4|
| Correções cadastrais |2|
| Documentos |10|
| Modelos documentais |3|
| Cobranças |4|
| Caixa |7|
| Despesas/contas a pagar |4|
| Relatórios financeiros |4|
| Recibos |2|
| Auditoria |4|
| Arquivados do escritório |1|
| Imóveis rurais |5|

Caixa mantém `cash.transfer` para sangria/reforço/transferência: são operações existentes com ledger/limites/idempotência compartilhados; separá-las alteraria regras além da organização solicitada. Recebimento e fechamento próprios conservam o contrato atual deCaixa, sem botões ou permissões fictícios. `archives.manage` atende também acessos/arquivos/contas e fica separado deAuditoria.

## B/C — Lacuna rural corrigida

Antes: rural dependia apenas de customers.read/create/update/read_all. Agora, frontend/menu eRPCs exigem cumulativamente:

| Permissão nova | Operação real | Condições preservadas |
|---|---|---|
| rural.read | Listar e consultar imóveis | customers.read e escopo atual |
| rural.read_all | Ampliar consulta de imóveis do escritório | rural.read + customers.read_all; não amplia Clientes |
| rural.create | Cadastrar imóvel | rural.read + customers.create + cliente autorizado |
| rural.parties.manage | Adicionar pessoa/encerrar período | rural.read + customers.update; preserva histórico |
| rural.records.manage | Associar atendimento/arquivo/exercício | rural.read + customers.update + requests.read + files.read + responsabilidade/escopo10/11 |

Não há edição dos campos principais nem exclusão de imóvel naEtapa27; não foram criados checkboxs para operações inexistentes. Associar arquivo não baixa/libera bytes nem valida quarentena. Relação rural não cria autoridade de portal. Consulta ampliada rural é independente da consulta ampliada deClientes, sempre dentro do escritório e de clientes autorizados.

Migração20261109125636 expande allowlists, catálogo, escopos de gestão e auditoria, e converte somente os direitos rurais anteriormente derivados dos direitos deClientes. Papéis/concessões atuais são preservados; convites pendentes válidos e delegações vigentes recebem escopo equivalente. Convites aceitos/expirados e delegações encerradas não são reescritos. Nada é concedido fora do escopo anterior. As capacidades novas permitem revogação rural independente. Restrições anteriores deClientes continuam cumulativas. Mudança de autoridade mantém o mecanismo existente deepoch/revalidação25; não se desativa proteção para preservar uma autorização sensível desatualizada.

## D — Auditoria e segurança

Inventariados27roteadores e157declarações HTTP, incluindo rotas paramétricas. [Operações/API](../evidencias/permissoes/operacoes.json), [inventário](../evidencias/permissoes/rotas.json), [funções atuais do banco](../evidencias/permissoes/funcoes-banco.json), [catálogo sem duplicação](../evidencias/permissoes/catalogo.json). Referências de função são rastreabilidade estática, não prova isolada de autorização: helpers e condições de escopo/ator/estado completam a decisão.

| Área/API | Autoridade e operações |
|---|---|
| auth/account | Sessão/getUser, UID/session_id, própria conta; não é concessão de gestor |
| team | users.manage e escopo de delegação; owners.create por condição específica; sem promoção própria |
| customers/customer-relations | customers.read/create/update/read_all/relate/verify/merge e escopo08 |
| services/categories/request-levels | services.*, categories.manage, requests.level1/2, política do serviço e papel reservado |
| requests/portal-requests/request-archives | requests.*, requests.archives.manage; escopo/responsável; portal somente próprio |
| attachments/checklists/notifications | files.*, checklists.*; pedido/autoridade atual; avisos pertencem ao destinatário |
| documents/templates/document-commercial/document-workflow | documents.*, templates.*; escopo21, revisão/assinatura/gate25, destinatário, bytes e exceções independentes |
| charges/cash/finance | charges.*, cash.*, expenses.*, receipts.*, finance.reports.*; caixa próprio/ledger e saldos atuais |
| governance | audit.read/export/archives/manage; archives.manage mais autoridade do recurso |
| access-settings/privacy/retention/account-closure | access.manage e papel administrativo; privacidade/retenção degestão owner; titular fecha/exporta a própria conta; worker exige credencial independente |
| rural | cinco permissões novas e dependências/escopos indicados acima |

Todas as APIs privadas inventariadas utilizam verificação de identidade e a autoridade de domínio no banco. Páginas públicas, saúde, notificações próprias, Conta, sessões e serviços de manutenção não viraram permissões administrativas fictícias. Gestão deEquipe usa delegação, não checkboxgenérico que permitiria autoconcessão. Privacidade/retenção continuam exclusivas do superadministrador. Explicação desses acessos aparece no seletor.

`services.courtesy` não é órfã: `services_snapshot` constrói `services.` + modalidade deajuste. `services.approve` participa da política de execução do catálogo. A varredura textual literal sozinha não identificaria esses casos. Nenhuma permissão antiga foi removida por contagem estática.

Restrições existentes owner/admin conservadas para merge, categorias, prazo deacesso, relatórios/arquivo de solicitações, retomada, aprovação de modelos, revogação documental, configuração de relatórios, revisão/ajuste de fechamento e auditoria arquivada/configuração. Funcionário não recebe essas ações por selecionar checkboxnem chamarAPI; o banco mantém os checks de papel. Administrador sem capacidade não ganha acesso pelo título. Superadministrador mantém direitos do papel, apresentados como integrais/não reduzíveis no seletor.

Dependências anteriores continuam aplicadas nas operações/RPCs. O seletor explica as dependências verificadas; não concede implicitamente leitura deoutrosclientes/caixas. Para as novas combinações rurais, team_validate_assignment também rejeita configurações sem os requisitos explícitos. Não se impôs retrospectivamente um conjunto universal de dependências a todas as concessões legadas: isso mudaria contratos de delegação e operações existentes.

## E — Alterações e provas

- Catálogo/classificação em shared/permissionModules.ts; códigos/nomes em shared/team.ts. PermissionFields compartilhado pelos três formulários, sem nova biblioteca. Proteção de rascunho em useUnsavedAccess eTeamPage. RuralPage/menu eRPCs com permissões novas.
- Uma migration adicional, sem apagar permissões/usuários/histórico ou reexecutar migrations27/26.
- 350Node/API passaram; build/typecheck e teste focado de completude/ausência deduplicação aprovados.
- DoisreplaysSQL passaram com1.558linhasPASS (incluem domínios anteriores). Casos novos cobrem administrador/funcionário autorizado e negado, ampliação de escopo, owner, dependência rural e revogação na mesma sessão. Não são1.558testes exclusivos desta correção.
- UI:39cenários passaram no lote inicial;4contratos históricos de navegação encontraram seletores antigos. Foram corrigidos apenas os seletores de retorno/brand, preservando o produtoAuth, e os4passaram na rechecagem. Cenário novo de descarte/restrição de papel passou. Total44cenários distintos aprovados por lotes, sem somar repetições. Busca, lote/indeterminado, persistência após recarga, recolhimento sem perda, Desktop1440/Mobile360, papéis e regressões deEquipe/Rural cobertos.
- Jornada real local Auth/PostgREST/Express: concessão persistida pelaAPIdaEquipe; administrador sem direito rural negado; funcionário autorizado; autoelevação negada; revogação comJWTda mesma sessão; Clientes legado eowner preservados. Banco/SDK reais locais; UI usoufixtures separadas. Nenhuma conta/fixture ou e-mail hospedado usado.

## F — Limites e publicação

Não foram criadas funções de edição/exclusão rural, transmissão oficial ou módulos28–30. A matriz/inventário não substitui homologação humana de todas as combinações de negócio. Não houve benchmark de carga, SMTPexterno, aparelho físico ou nova jornadaStorage: o fluxo de bytes não foi alterado. Persistência UI foi testada com API interceptada, e concessão/revogação efetiva foi testada separadamente comAuth/API/banco reais locais.

Publicação e conferências hospedadas pendentes até o registro final abaixo; fluxo exclusivamenteGitHub→Vercel/semActions. Não declarar produção ou migration aplicadas apenas pelo build local.
