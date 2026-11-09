# Reorganização de permissões — 09/11/2026

Base: Etapa 27 publicada, sem iniciar 28. Seletor compartilhado de Equipe/convites/delegações e autorizações rurais publicados e conferidos no GitHub, Supabase e Vercel. Detalhes da publicação ao final.

## A — Organização

79 permissões configuráveis existentes preservadas, acrescidas de 5 rurais: 84, sem duplicatas, em 17 grupos. IDs existentes mantidos. Grupos iniciam recolhidos; busca por módulo/nome/código com normalização de acentos abre resultados sem apagar seleção. Expansão individual/todos, recolhimento, totais, seleção individual/em lote e checkbox indeterminado. Acesso básico obrigatório, escopo não delegável e ações administrativas indisponíveis claramente identificados. Ações internas separadas por consulta, cadastro/emissão, edição/vínculos, conferência/aprovação, configuração e especiais. Indicador de alterações não salvas e confirmação ao fechar/trocar editor/escritório/aba ou navegar; troca/revogação de identidade continua descartando dados obrigatoriamente.

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

Caixa mantém `cash.transfer` para sangria/reforço/transferência: são operações existentes com ledger/limites/idempotência compartilhados; separá-las alteraria regras além da organização solicitada. Recebimento e fechamento próprios conservam o contrato atual de Caixa, sem botões ou permissões fictícios. `archives.manage` atende também acessos/arquivos/contas e fica separado de Auditoria.

## B/C — Lacuna rural corrigida

Antes: rural dependia apenas de customers.read/create/update/read_all. Agora, frontend/menu e RPCs exigem cumulativamente:

| Permissão nova | Operação real | Condições preservadas |
|---|---|---|
| rural.read | Listar e consultar imóveis | customers.read e escopo atual |
| rural.read_all | Ampliar consulta de imóveis do escritório | rural.read + customers.read_all; não amplia Clientes |
| rural.create | Cadastrar imóvel | rural.read + customers.create + cliente autorizado |
| rural.parties.manage | Adicionar pessoa/encerrar período | rural.read + customers.update; preserva histórico |
| rural.records.manage | Associar atendimento/arquivo/exercício | rural.read + customers.update + requests.read + files.read + responsabilidade/escopo10/11 |

Não há edição dos campos principais nem exclusão de imóvel na Etapa 27; não foram criados checkboxes para operações inexistentes. Associar arquivo não baixa/libera bytes nem valida quarentena. Relação rural não cria autoridade de portal. Consulta ampliada rural é independente da consulta ampliada de Clientes, sempre dentro do escritório e de clientes autorizados.

Migração 20261109125636 expande allowlists, catálogo, escopos de gestão e auditoria, e traduz as flags rurais anteriormente derivadas de Clientes dentro da mesma fonte (papel, concessão direta, convite ou delegação), inclusive configurações dormentes que continuam sem autoridade até satisfazerem todos os requisitos. Papéis/concessões atuais são preservados; convites pendentes válidos e delegações vigentes recebem escopo equivalente. Convites aceitos/expirados e delegações encerradas não são reescritos. Nada é concedido fora do escopo anterior. As capacidades novas permitem revogação rural independente. Restrições anteriores de Clientes continuam cumulativas. Mudança de autoridade mantém o mecanismo existente de epoch/revalidação25; não se desativa proteção para preservar uma autorização sensível desatualizada.

## D — Auditoria e segurança

Inventariados27 roteadores e157 declarações HTTP, incluindo rotas paramétricas. [Operações/API](../evidencias/permissoes/operacoes.json), [inventário](../evidencias/permissoes/rotas.json), [funções atuais do banco](../evidencias/permissoes/funcoes-banco.json), [catálogo sem duplicação](../evidencias/permissoes/catalogo.json). Referências de função são rastreabilidade estática, não prova isolada de autorização: helpers e condições de escopo/ator/estado completam a decisão.

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
| access-settings/privacy/retention/account-closure | access.manage e papel administrativo; privacidade/retenção de gestão owner; titular fecha/exporta a própria conta; worker exige credencial independente |
| rural | cinco permissões novas e dependências/escopos indicados acima |

Todas as APIs privadas inventariadas utilizam verificação de identidade e a autoridade de domínio no banco. Páginas públicas, saúde, notificações próprias, Conta, sessões e serviços de manutenção não viraram permissões administrativas fictícias. Gestão de Equipe usa delegação, não checkboxgenérico que permitiria autoconcessão. Privacidade/retenção continuam exclusivas do superadministrador. A explicação desses acessos aparece no seletor.

`services.courtesy` não é órfã: `services_snapshot` constrói `services.` + modalidade de ajuste. `services.approve` participa da política de execução do catálogo. A varredura textual literal sozinha não identificaria esses casos. Nenhuma permissão antiga foi removida por contagem estática.

Restrições existentes owner/admin conservadas para merge, categorias, prazo de acesso, relatórios/arquivo de solicitações, retomada, aprovação de modelos, revogação documental, configuração de relatórios, revisão/ajuste de fechamento e auditoria arquivada/configuração. Funcionário não recebe essas ações por selecionar checkbox nem chamar API; o banco mantém os checks de papel. Administrador sem capacidade não ganha acesso pelo título. Superadministrador mantém direitos do papel, apresentados como integrais/não reduzíveis no seletor.

Dependências anteriores continuam aplicadas nas operações/RPCs. O seletor explica as dependências verificadas; não concede implicitamente leitura de outros clientes/caixas. Os requisitos são conferidos cumulativamente pelo backend a cada operação. Concessões diretas, do papel e de delegação podem compor os requisitos: não se exige que cada array isolado seja autossuficiente, pois isso bloquearia convites antigos e acessos legítimos compostos. Flags sem requisitos permanecem inoperantes; não se acrescentam os pré-requisitos implicitamente. A tradução rural mantém cada flag em sua fonte original e preserva a mesma validade/revogação dessa fonte.

### Achados adicionais corrigidos na revisão independente

- O rascunho também precisava de proteção em busca, estado, paginação e atualização da lista: esses controles podiam desmontar o editor. Agora pedem confirmação e preservam o formulário se o usuário cancelar.
- A edição antiga começava por permissões efetivas e podia copiar direitos temporários da delegação para concessões permanentes. O banco agora distingue `direct_permissions`; o formulário salva apenas as permanentes e mostra as herdadas separadamente. O contrato HTTP `permissions_source: direct-v1` recusa formulários antigos com 409/pedido de atualização, inclusive se a delegação expirou entre leitura e salvamento. O marcador é versão de contrato, não concede autoridade; a RPC continua verificando o gestor/escopo. Não houve remoção retrospectiva de concessões permanentes. A base hospedada tem 0 delegações históricas/ativas, portanto não havia delegação hospedada a corrigir retroativamente.
- Um rascunho intermediário da migração exigia todos os requisitos dentro de cada array, o que quebrava a composição de concessões e convites antigos. Foi corrigido antes de publicar, com seeds anteriores à migration e testes dos dois sentidos da divisão direta/delegada, reenvio de convite e perda de autoridade na revogação.

## E — Alterações e provas

- Catálogo/classificação em shared/permissionModules.ts; códigos/nomes em shared/team.ts. PermissionFields compartilhado pelos três formulários, sem nova biblioteca. Proteção de rascunho em useUnsavedAccess e TeamPage. RuralPage/menu e RPCs com permissões novas.
- API de Equipe em `server/modules/team/router.ts` e `src/features/team/api.ts` com contrato versionado de concessões diretas. Testes relevantes em `tests/permission-modules.test.ts`, `tests/team-api.test.ts`, `tests/browser/*-contract.spec.ts`, `tests/database/permission-modules.sql` e `permission-migration-seed.sql`; jornada real em `scripts/test-permissions-real.mjs`. Lista completa de arquivos no diff do PR #102.
- Uma migration adicional, sem apagar permissões/usuários/histórico ou reexecutar migrations 27/26.
- 350 Node/API passaram; build/typecheck e teste focado de completude/ausência de duplicação aprovados.
- Dois replays SQL passaram com 1.575 linhas PASS (incluem domínios anteriores). Casos novos cobrem administrador/funcionário autorizado e negado, ampliação de escopo, owner, dependência rural e revogação na mesma sessão. Não são 1.575 testes exclusivos desta correção.
- UI final: 47 cenários no lote principal; 46 passaram inicialmente e 1 contrato foi ajustado para incluir o marcador HTTP obrigatório, passando na rechecagem. Mais 1 cenário de remoção de atribuição administrativa antiga passou. Total: 48 cenários distintos aprovados por lotes, sem somar repetições. Incluem busca, lote/indeterminado, persistência após recarga, recolhimento sem perda, Desktop 1440 / Tablet 768 / Mobile 360, confirmação nos filtros/paginação, direitos herdados não permanentes e regressões de Equipe/Rural. Testes históricos de navegação tiveram apenas seletores atualizados para o retorno/brand já existentes, sem alteração do produto Auth.

- Jornada real local Auth/PostgREST/Express: concessão persistida pela API da Equipe; administrador sem direito rural negado; funcionário autorizado; autoelevação negada; revogação com JWT da mesma sessão; Clientes legado e owner preservados. Concessão temporária via API, edição apenas das permissões diretas, recusa de formulário antigo e revogação sem materialização também aprovadas. Banco/SDK reais locais; UI usou fixtures separadas. Nenhuma conta/fixture ou e-mail hospedado usado.

## F — Limites e publicação

Não foram criadas funções de edição/exclusão rural, transmissão oficial ou módulos 28–30. A matriz/inventário não substitui homologação humana de todas as combinações de negócio. Não houve benchmark de carga, SMTP externo, aparelho físico ou nova jornada Storage: o fluxo de bytes não foi alterado. Persistência UI foi testada com API interceptada; concessão/revogação efetiva foi testada separadamente com Auth/API/banco reais locais.

Publicação concluída pelo [PR #102](https://github.com/escritoriojnsistema/escritoriojn/pull/102), merge `81502eb`, com o mesmo conteúdo funcional homologado em `7239fe8`. Vercel `E94JofPCGNHEhLU3NqWFpnW7JGdQ` em produção, origem Git, estado READY e status GitHub SUCCESS. Nenhuma Action ou publicação direta por API/CLI foi usada.

A migration `20261109125636` foi aplicada automaticamente pelo Git: os 13 comandos correspondem ao arquivo, na mesma ordem. **Não reaplicar.** As oito definições de funções conferem com um novo replay local limpo; as quatro tabelas rurais mantêm RLS e acesso direto fechado. Os 7 usuários Auth, 7 vínculos e 17 concessões anteriores foram preservados, com hash idêntico. Há agora 22 concessões diretas: as 5 adicionais são traduções rurais equivalentes. Catálogo: 86 códigos, dos quais 84 configuráveis. Nenhum imóvel ou fixture hospedada foi criado.

Os 8 assets canônicos são idênticos ao build local com a configuração pública já publicada; home e health retornam 200. Equipe, consulta rural e comando rural retornam 401 sem sessão. Três verificações Playwright no site canônico passaram: painel exige sessão, autenticação privada bloqueada e rota desconhecida com rastreio. Provas: [schema](../evidencias/permissoes/schema-publicado.json), [bundle](../evidencias/permissoes/bundle-publicado.json) e [verificação consolidada](../evidencias/permissoes/verificacao.json).

O advisor mantém o aviso preexistente de [proteção contra senhas vazadas desativada](https://supabase.com/docs/guides/auth/password-security#password-strength-and-leaked-password-protection). Nenhuma configuração Auth foi alterada nesta correção. Os avisos informativos de RLS sem política pertencem ao desenho existente de acesso por RPC, com ACL direta fechada nas tabelas verificadas.

Sem pendência de implementação identificada nesta revisão. Os limites de homologação acima permanecem explícitos. Próximo uso: atualizar páginas antigas antes de editar acessos; formulários anteriores recebem 409 para evitar salvar direitos temporários como permanentes. Etapa 28 não iniciada.
