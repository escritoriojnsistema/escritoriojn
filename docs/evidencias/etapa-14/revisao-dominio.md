# Revisão independente Tarefa1 — Etapa14 DB/API/contrato

Veredito de conformidade: aprovado no escopo revisado.
Veredito de qualidade: aprovado; nenhum achado concreto P0/P1/P2/P3.

Revisão estática da migration20261022134044, shared/cash.ts, shared/team.ts, server/modules/cash/{router,dto}.ts e integração server/app.ts; confrontados brief, relato do implementador e docs/etapas/etapa-14.md. Helpers vigentes de identidade/permissões e migration13 consultados somente para verificar integração. Não houve edição de produto, aplicação remota, commit/push nem repetição das suites.

Evidências e conclusões:
- cash_actor verifica identidade real antes/depois de locks, exige vínculo equipe ativo, foundation.access+cash.read e capacidade adicional. Mutações revalidam novamente após locks de recursos; cliente é explicitamente excluído. cash_open deriva operador da identidade; read_all amplia somente a consulta consolidada.
- Índice único parcial (office_id,operator_id,unit_id) WHERE status='open', serialização pelo escritório e FKs compostas mantêm uma abertura própria por unidade, coerência escritório/unidade/conta e isolamento.
- cash_commands persiste autoria, hash e resultado por escritório/tipo/chave. Retry valida identidade/capacidade antes de retornar; divergência de payload/autoria conflita. Sessão, movimento, comando e evento pertencem à mesma transação, sem captura de exceção que conserve efeito parcial.
- Sessões conservam snapshots de operador/unidade/conta. UPDATE/DELETE das sessões/movimentos são proibidos; guardas restringem inserção ao comando de abertura pendente. Movimento opening único, aplicado zero e numerário derivado somente de movimentos preservam fundo≠receita; abertura exige conta cash ativa e unidade ativa. Destinos cash versus bank/digital são validados nas formas.
- Seis tabelas privadas têm RLS e revogação de ACL de PUBLIC/anon/authenticated/service_role. Wrappers públicos INVOKER, funções privilegiadas em private, search_path vazio e grants apenas das entradas autenticadas. Nenhum cadastro empresarial ou fixture na migration.
- API faz getUser antes de uma RPC, JSON fechado, centavos inteiros limitados a1e12 e erros seguros. DTO projeta campos permitidos inclusive nested; own recusa sessão não própria. Configuração tem páginas50, totais e filtro recuperável; dashboard3/5.
- Comparação estática das seis listas de capacidades confirmou44 capacidades delegáveis idênticas aos44 itens de shared/team.ts; safe_audit contém estas44 mais users.manage/users.owners.create. As quatro cash são seed apenas owner. Contratos anteriores13 conservados; nenhuma função financeira13 foi substituída.

Validação: inspecionado relatório existente de813SQL por replay×2,47checks14/replay incluindo9 asserts de corridas, API11 e tsc servidor; cauda do log DB confirma encerramento verde. Não executei novamente essas suites. Controlador informou117Node,23Auth e22UI; estas validações externas não foram reproduzidas por este revisor.

Limite: revisão somente domínio/API/contrato14. UI/Auth em elaboração e publicação não são cobertas por este veredito. O rollout em duas fases (compatibilidade API/front primeiro; migration aditiva depois) é coerente com a necessidade de não apresentar capacidades novas ao validador Team antigo; precisa dos gates de publicação do controlador.
