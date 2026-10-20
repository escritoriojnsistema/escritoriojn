# Etapa10 — Plano de implementação

**Goal:** abrir/acompanhar atendimentos e triagem própria com isolamento demonstrado.
**Architecture:** React/Vite reutiliza OperationLayout; Express valida e projeta DTO; PostgreSQL decide autorização, snapshots e histórico atomicamente.
**Spec:** [etapa-10.md](etapa-10.md). Contratos TypeScript em shared/requests.ts.
**Execução:** tarefas por domínio com arquivos exclusivos; revisão integrada independente no fim. Sem Actions. Checkout novo isolado na branch feat/etapa-10-atendimentos.

## Restrições e foco de revisão
- Padrões desktop/mobile existentes, máximo4atalhos, sem loaders, campos16px/alvos44px e rolagem natural.
- Projeção pública deve excluir atores/notas/preços inclusive em erros; UUID e outro escritório não concedem acesso.
- Revogação durante espera/transferência deve bloquear; versão/idempotência e snapshots resistem a concorrência.
- Portal antes da identidade conferida permite só triagem; campos/participantes exigidos somente na classificação interna.
- Catálogo alterado, quantidade/decimal/datas inválidas, fechamento e cancelamento não podem apagar trilha nem produzir quitação.

## Tarefa1 — Banco e contratos
- [x] Escrever e observar testesSQL falharem para abertura/isolamento/snapshot/transferência/portal/cancelamento.
- [x] Migration aditiva gerada por CLI: requests/request_items/assignments/request_history e ACL/capacidades/RPCs. Consome helper services_snapshot09.
- [x] RPCs requests_page(office,query,scope,status,page,size), request_detail(office,id,page), request_options(office,kind,query,page,size), request_create(office,input,idempotency_key,request_id), request_mutate(office,id,expected_version,mutation,request_id).
- [x] Replay sob migrador limitado duas vezes, concorrência e benchmark local; commits somente após integração.

## Tarefa2 — API
- [x] TesteNode para validação/DTO/projeção pública/autenticação/erros/idempotência; observar RED.
- [x] Implementar server/modules/requests/{validation,dto,router}.ts e montar /api/requests. POST /search,/options,/,/:id/detail,/:id/actions.
- [x] Bodies estritos: office_id+{query,scope,status,page,size}; office_id+{kind,query,page,size}; office_id+{request,idempotency_key}; office_id+page; office_id+{expected_version,mutation}.
- [x] Node/API e typecheck verdes. DTO confere portal discriminado e reconstrói whitelist.

## Tarefa3 — Frontend
- [x] Testes de UI com contrato explícito, vazio, abrir/transferir/notas/portal, erro/concorrência e isolamento; observar RED.
- [x] src/features/requests com api/workspace/form/detail/css; integrar routes/App/navigation/OperationLayout/PanelPage e permissões da equipe.
- [x] Reutilizar transporte authenticatedFetch/sessionScope; manter rascunho após falha transitória; idempotency_key estável na repetição; novo rascunho gera nova chave.
- [x] Medir360×640/1440×900,320/zoom/teclado e verificar navegação sem loader/4atalhos.

## Tarefa4 — Integração e publicação
- [x] Regressão local Node/SQL/Auth/UI/build; revisão independente e corrigir achados com teste reproduzível.
- [x] Livro/fecho/README/Supabase atualizados com provas e limites reais.
- [ ] PR/merge viaGitHub, conferir migration automática ANTES de aplicar manualmente; comparar histórico/arquivo, advisors e integridade.
- [ ] Verificar status GitHub–Vercel, asset novo, rotas/APIs públicas e E2E canônico. Rollback somente código preservando banco/histórico.
