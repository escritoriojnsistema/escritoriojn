# Revisão independente — ajuste pós12

Revisor somente leitura: /root/review_pos12. Baseab2f1c7; diff de frontend/API/SQL e arquivos novos. Skill requesting-code-review aplicada, sem delegação de implementação.

AchadoP2: reentrada do sino em /notificacoes ignorava state.office_id quando a caixa já estava aberta em outro escritório. Corrigido por location.key e validação do destino em contexts; Inbox anterior desmonta/cancela por escritório. RED comprovado em /tmp/jn-adjust-review-red.log; GREEN em /tmp/jn-adjust-ui-final.log, quatro testes aprovados incluindo a regressão.

Revisor releu a correção e as otimizações finais; nenhumP1/P2 pendente. Rastreou leitura histórica×escrita atual, reclaim, anexos, Storage, leases/cleanup, checklists, projeção de cliente e isolamento de sessão. Não confirmou bypass de escrita nem vazamento ao portal. Diff --check passou. Browser/Docker e publicação foram verificados pelo coordenador.
