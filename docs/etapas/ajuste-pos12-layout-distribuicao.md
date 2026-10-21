# Ajuste pós12 — layout, distribuição e avisos por conta

Pedido do usuário21/10/2026; baseab2f1c7. Ajuste das etapas10–12, sem iniciar13. Referência visual: Equipe e convites; stack e publicação GitHub→Vercel, sem Actions, preservados. Habilidades aplicadas: diagnóstico/orquestração, planejamento, backend/banco, frontend responsivo, auditoria visual/testes e revisão final.

## Contrato

Busca e filtro alinhados no padrão team-filters em pendências e notificações. Pendências filtra status10 no servidor; notificações filtra leitura/tipo e busca por protocolo/nome do atendente autorizado, sem pesquisar ou retornar texto sensível de pedido. Header com sino/não lidas por conta/escritório, em desktop/mobile, incluindo portal; quatro atalhos inferiores mantidos. Todos os workspaces operacionais usam a mesma largura e margens de Equipe; formulários usam grid responsivo que aproveita a área. Telas públicas mantêm composição própria, com centralização/limites responsivos auditados.

Responsáveis ativos listados com nome/função; diagnóstico hospedado confirmou admin/funcionário sem requests.read, enquanto owner é elegível. Pessoas sem acesso aparecem com explicação e liberação explícita pela gestão autorizada, sem alterar silenciosamente contas hospedadas. Seleção só permite alvo elegível; atribuição é atômica e mantém criador/histórico. Busca inclui função, sem e-mail/CPF nos seletores.

Responsável atual trabalha; criador e integrantes já atribuídos podem acompanhar conforme sessão/capacidades vigentes. Acompanhamento não permite alterar status/notas, transferir, enviar/validar/copiar anexos ou decidir checklist. Owner ou admin com requests.reclaim pode retomar para si dentro de seu escopo; seed somenteowner e concessão/delegação explícita paraadmin. Versão/locks impedem dois responsáveis atuais. Retomada conserva criador e ex-responsável no acompanhamento, sem converter histórico em autoridade de edição.

Cliente do portal acompanha somente seus pedidos. Novo aviso específico de mudança do atendente mostra apenas nome, protocolo e data, sem função/notas/equipe/preço/motivo/terceiros. Vínculo é UID conhecido do pedido, nunca CPF/e-mail/nome. Usuário confirmou: avisar somente a conta já vinculada ao pedido; sem vínculo, manter interno. Sem inventar associação de ficha a Auth.

## Plano de execução

- [x] Capturar referência Equipe e telas atuais com fixtures fictícias locais; registrar larguras/alinhamento em320/360/768/1440/1920 e zoom. Testes de busca/filtro/sino antes das correções.
- [x] Migration aditiva oficial: leitura histórica, trabalho atual, reclaim, diretório de responsáveis, projeção cliente e eventos/avisos por destinatário. Reusar registros10/12,8RPCs12 e operações11. Testar seed/permissões, A×B, ex-responsável somenteleitura, concorrência e privacidade/dedup.
- [x] Contratos/API/DTO e UI conectados: seletores/filtros, sinos, delegação/retomada, acompanhamento e portal. Estados estáveis sem loader e isolamento por UID/sessão/escritório/autoridade.
- [x] Verificação Node/build/SQL limitado/Auth real/contratos UI afetados e capturas; auditoria de todas as rotas; revisão independente final. Corrigir achados com regressões e registrar limites reais.
- [ ] PR/Git→Vercel, consultar histórico Supabase após merge antes de apply, comparar SQL/catálogo, testar canônico e atualizar Livro/fecho. Sem fixtures hospedadas ou alteração automática das contas existentes.

Foco de revisão: autoridade histórica×trabalho atual, bypass em anexos/checklists, destinatário cliente sem PII interna, revogação/retomadas concorrentes, sino sem respostas de outra conta. Rollback somente código, preservando atribuições/histórico/avisos.

Checkpoint: diagnóstico e contrato definidos; implementação em andamento. Vínculo confirmado pelo usuário: somente conta conhecida do pedido.

## Uso e limites

Em Nova solicitação → Responsável, prioridade e nota interna, a seleção mostra nome/função e pesquisa também pela função. Pessoa sem requests.read aparece com impedimento e acesso à gestão autorizada; nenhuma permissão de conta real é concedida automaticamente. A equipe continua configurando capabilities conforme o trabalho permitido (consultar/atualizar/anexos/checklists são independentes).

No detalhe delegado, Ações do atendimento → Retomar atendimento para mim exige motivo e a autoridade atual do servidor. A retomada é para o próprio gestor, preserva criador/atribuições e deixa o anterior em acompanhamento. Pedidos encerrados conservam a imutabilidade das etapas anteriores. A página do cliente mostra o nome atual; os avisos guardam o nome no momento de cada troca, sem função ou motivo interno.

Sino e caixa funcionam em desktop/mobile para todos os perfis ativos, respeitando conta e escritório. Resumo curto/indexado; atualização no foco e a cada30s enquanto visível, sem loaders. Sem push/e-mail externo e sem promessa de latência zero da rede. Vínculo de ficha não cria Auth; sem conta já vinculada ao pedido, a troca permanece interna.

Validação atual:101Node/API aprovados;13execuções Node direcionadas finais aprovadas;66contratos UI distintos aprovados:52ajustes/anexos/checklists (duas repetições isoladas),13solicitações e1paginação. A primeira execução teve dois timeouts de módulos do Vite durante build concorrente; ambos passaram isoladamente sem alterar produto. Build/typecheck e auditprodução0 aprovados;80áreas×viewport verificadas (11equipe+5cliente em5larguras). 14Auth/Storage reais distintos aprovados, incluindo navegação do cliente após as duas trocas, bloqueio de upload já iniciado e fluxo móvel positivo de envio. O envio móvel teve503transitório no conjunto e passou isoladamente; startup local do Storage teve timeout recuperado. 55E2E públicos locais aprovados; publicação Git→Vercel e readback hospedado pendentes. Benchmark em docs/evidencias/ajuste-pos12/benchmark.json não representa SLA hospedado.
