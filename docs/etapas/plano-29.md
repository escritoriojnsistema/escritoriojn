# Etapa 29 — CCIR/CAR

Base: main 379ca43, Livro e fecho pós28; cartão oficial Drive 1DYblNSoJFbZh1xzP-5BCtei7j1qgFJUX e regra especializados.

Objetivo: funcionário prepara no atendimento existente; proprietário recebe o encaminhamento, solicita complementação e registra resultado/evidência. Não criar cadastro, financeiro, checklist ou entrega paralelos.

Arquitetura: configuração versionada associa serviço existente a CCIR/CAR; caso captura item, imóvel27 e checklist12. Comandos com sessão/chave/corpo e versão, fluxo recebido/aguardando_documentos/encaminhado/em_analise/em_preparacao/complementacao/concluido. Encaminhamento e devolução reutilizam transferência10. Resultado é evidência11 protegida; aprovação, cobrança e entrega continuam21–26. Portal recebe só etapa factual e pendência explicitamente compartilhada.

- [ ] Banco: tabelas privadas RLS/ACL, RPCs invoker, autorização vigente após locks, ações reservadas owner mesmo em chamada direta; histórico append-only, referência11 e bloqueio de conclusão genérica.
- [ ] API/contratos: validação estrita, DTO com allowlist, Bearer/no-store, erro sem PII/SQL; testes de payload e falhas.
- [ ] UI: painel no detalhe de Solicitações, padrão Equipe/Convites e layout operacional existente; uma área por vez, ações agrupadas, sem spinner; mesma sessão conserva rascunho, 503 repete chave, 401/403 limpa.
- [ ] Portal: progresso factual no próprio detalhe, sem IDs internos, resultado privado ou motivos internos; regressão de isolamento.
- [ ] Verificação: Node/API, replay SQL completo em banco descartável, UI mobile/desktop e regressões28, build/TypeScript. Conferir Auth/API/dados com laboratório quando disponível.
- [ ] GitHub→Vercel: nenhuma Action/deploy direto. Após Git, reler migrations hospedadas antes de eventual aplicação; comparar comandos/definições. Atualizar Livro/fecho com evidências reais e limitações.

Riscos a testar: funcionário forja transição reservada; retomada/transferência fora do fluxo; cliente de outro pedido; arquivo de outro atendimento/quarentena; retry de outra sessão/corpo ou após revogação; configuração posterior não muda caso anterior; conclusão não libera bytes ou quita tributo.

Configuração/preços/concessões reais pertencem ao gestor, sem fixtures hospedadas. Etapa30 fora do escopo.
