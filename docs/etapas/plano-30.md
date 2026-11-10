# Etapa 30 — plano e decisões

**Objetivo:** casos especializados e prazos seguros dentro de Solicitações.
**Base:** main6420006, Etapa29 publicada. Manual e RF14 conferidos antes de alterações.
**Arquitetura:** estender núcleo10/11/12/13–26, sem CRM/financeiro paralelos. Configuração de modalidade por serviço versionada; caso captura item e checklist12. Responsável/participantes seguem atribuições10 e participantes cadastrais do item. Handoff/complementação transferem10. Notas append-only privadas; portal recebe apenas etapa/pendência explicitamente compartilhável. Prazos/marcos conferidos manualmente, data/fonte/responsável/alerta/conclusão, sem motor de contagem.

Alternativas: estender rural29 exigiria imóvel artificial e capacidades rurais sem relação com RF14; mini-CRM duplicaria núcleo. Escolha: extensão própria ligada ao pedido, com componentes e controles comuns.

- [x] Banco: specialized_cases/deadlines/configurações/notas/comandos privados, RLS/ACL fechadas, sessão/versão/idempotência e responsabilidade após locks. Quatro capacidades independentes, seed sóowner; concessões explícitas na Equipe.
- [x] Sigilo: classificação médico/estratégico no pipeline11, autorização específica desde upload; filtrar lista/JSON e impedir download/Storage/cópia/referências compartilháveis sem autoridade. Não transformar quarentena em clean.
- [x] API/portal: state/command Bearer/no-store, validação e projeção allowlist; resumo público factual sem campos internos.
- [x] UI: área especializada no detalhe existente, uma área por vez, padrão Equipe/Convites, máximo4 ações primárias, complementos pelo menu, sem loaders;503 conserva tentativa,409 reconfere,401/403 limpa.
- [x] Testes: Node/API/SQL real local/UI320–1440 e regressões; build/TS; revisão independente final.
- [ ] GitHub→Vercel: PR semActions, confirmar deploy e histórico remoto antes de aplicar migration; atualizar Livro/fecho com estado real.

Revisão: chamadas diretas por funcionário; sessão/autoridade revogada; arquivo de outro pedido; sigilo em JSON/lista/bytes; transferência/retry; checklist posterior não muda snapshot; prazo sem fonte/alerta/data; conclusão nunca quita/aprova/entrega. Serviços/preços e concessões reais permanecem configuração do gestor, sem fixtures hospedadas.
