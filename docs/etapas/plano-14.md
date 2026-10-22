# Plano14 — execução e continuidade

Base9fce03d; contrato em etapa-14.md; autorização integral já registrada, sem nova aprovação. Stack/contas/dados13 e correçõespós13 preservados.

- [x] Diagnóstico: repositório/Livro/Drive14+RF11+fronteira15, schema/permissões remotos18/42 e raiz limpa.
- [x] Domínio: migrationaditiva, cash_units/financial_accounts/payment_methods/cash_sessions/cash_movements/cash_commands, constraints+índices+RLS/ACL, capacidades4owner, helpers/RPCs e autoria/idempotência. Contratos/API schemasfechados/DTO, regressões e corridasreais.
- [x] UI: OperationLayout/Equipe, /caixa/sidebar, Meu caixa/Consolidação/Configuração, rascunhos/cancelamento/erros, paginação3/5 e seletoresconfig50, semloader. Todosperfis/320/360/768/1440/1920 e zoom.
- [x] Integração: laboratório oficialAuth→Express→RPC→Postgres, permissões/isolamentoA/B/owner/cliente/escritório; fundo100=100espécie/zero receita. Regressões13 e pós13.
- [x] Revisões independentesDB/API e frontend/fluxo; corrigir achados e registrar testes reais. Benchmark/segurança/build/dependências.
- [ ] GitHubPR/merge→Supabase/Vercel, reconferir histórico antes deapply, source/schema/bundle iguais, dadospreservados e canônicos. Livro/AGENTS/README/fecho/evidências.

## Contrato entre camadas

shared/cash.ts estável. POST/api/cash/dashboard{office_id,scope:own|all,page,page_size:3|5}→CashDashboard. configuration{office_id,unit_id:null|uuid,page,page_size:50}→CashConfiguration; totais de trêslistas explícitos. configure{office_id,configuration:CashConfigure,idempotency_key}→{resource,configuration}. open{office_id,unit_id,cash_account_id,opening_cents,idempotency_key}→dashboardown1/5.4RPCs invoker correspondentes. Nenhum comando usa operador/horário do navegador. UI fatia retorno de abertura conforme3/5 e usa paginação própria seguinte, sem duplicarconsulta na abertura padrão. Configurações de referência consultadas e acumuladas somente em memória do workspace atual para seletores de páginas visitadas, sempre revalidadas pelo banco ao gravar.

## Evidências/checkpoint

Domínio e UI conectados;117Node/API,1626SQL(813×2;9corridas14/replay),23Auth reais locais,22UI14,52regressões afetadas e62públicos locais aprovados. Build/typecheck browser+server e auditprodução0. Resultados/hashes em ../evidencias/etapa-14/verificacao.json. Duas falhas de artefatos Playwright por runners simultâneos foram repetidas sequencialmente e passaram; não confundir com bug de produto. RevisãoUI sem P0/P1/P2, P3 registrado (elegibilidade do seletor conhece página atual, banco409 impede duplicação). RevisãoSQL/API e publicação em fecho.

## Rollout compatível

1. GitHubPR de runtime/shared/UI/API compatíveis com as quatro capacidades futuras, semmigration/fixturesSQL. Aguardar deployVercel e conferir bundle. Banco18 mantém menu14 oculto até ativação.
2. GitHubPR da árvore completa validada, incluindo migration. A integração Supabase aplica oSQL; reconferir histórico/corpos/RLS/ACL/permissões/contagens antes de qualquerapply. AguardarVercel e verificar canônico62casos eassetexato.
3. PR apenas documental registra commits/deploy/schema/evidências reais no Livro/AGENTS/README/fecho. Nenhuma Action, deployCLI/API, fixture hospedada ou operação financeira de teste. Rollback só código compatível, semDROP/remoção de ledger; não voltar API de permissões pré14 com schema já ativado.
