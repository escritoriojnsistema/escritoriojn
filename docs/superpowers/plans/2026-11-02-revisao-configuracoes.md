# Revisão das configurações, catálogo e acessos

Pedido atual: auditar o trabalho da outra IA e concluir todas as camadas, preservando Etapa22 e correções anteriores. Base Git/Vercel8cba4fc; banco tem três migrations posteriores sem fonte em main. Recuperadas integralmente de schema_migrations:20261102154519,20261102160847,20261102161221. Não reaplicar no hospedado. Novo SQL deve corrigir incrementalmente e ser testado em banco descartável.

## Escopo autorizado e decisões

- Configurações no menu da equipe reúne Auditoria, Arquivados, Equipe e convites, Categorias e Acessos. `settings.access` libera a entrada; cada destino conserva sua própria capacidade. Owner recebe seed de capacidades; demais usuários só por concessão explícita em Equipe/convites. Configuração sensível continua owner/admin.
- Categorias centralizadas por escritório, criadas/renomeadas/excluídas por `categories.manage`; todos os seletores e catálogos usam fonte oficial, com IDs estáveis e preservação de snapshots históricos. Abranger serviços comuns, documental, rural/fiscal e previdenciário/jurídico do manual até40, sem criar preços/serviços fictícios ou ativar módulos futuros.
- Solicitações do cliente começam por categoria; Documentos abre pasta→modelo disponível vinculado a serviço/preço real. Protocolo oficial nasce atomicamente no servidor e aparece após envio/lista/detalhe. Cliente vê título/preço/checklist externo e campos necessários, nunca texto/variáveis internas do modelo. Entrega conserva pagamento/identidade/aprovação/assinatura atuais. Checklist interno/cliente por serviço reutiliza implementação existente.
- Acessos permite políticas separadas equipe/cliente, presets15/30/60/120/180min e personalizado5–1440min; `access.manage` para owner/admin. Inatividade efetiva por sessão, registrada no servidor; timers/atividade humana no browser sem polling renovar atividade. Expirado nega API/RPC mesmo Bearer válido; nunca reativa por refresh/aba. Servidor controla tempo, fonte e autoridade. Sem revogar contas reais para testar.
- Modelos: excluir tira das listas sem opção Mostrar excluídos; conserva histórico/FKs. Editar aprovado cria nova versão rascunho, renomear preserva título nas próximas versões. Abas Rascunhos/Aprovados com pastas coerentes e refresh de pasta/lista funcional. Funcionário autorizado consulta modelos aprovados; cliente só catálogo publicado. Não aprovar64minutas nem inventar valores.
- Solicitações concluídas/canceladas: relatório e prazo de arquivamento como Auditoria, com política persistida e arquivo lógico; `requests.archives.manage` owner/admin, sem apagar pedido/financeiro/documentos. Acompanhamento do cliente preservado. Arquivados integra o hub existente; exportação auditada e limitada, sem conteúdo privado indevido.

## Tarefas e verificação

- [x] Recuperar/auditar SQL aplicado, reconciliar assinaturas/API e corrigir regressões de escopo/idempotência/locks.
- [x] Categorias fonte única + UI/admin + seletores de serviço/solicitação/catálogo.
- [x] Inatividade real banco/API/browser + tela Acessos.
- [x] Modelos, estados/pastas/exclusão/edição/título e visibilidade.
- [x] Arquivamento de solicitações, relatório/política e integração em Arquivados.
- [x] Hub Configurações/permissões/rotas; testes Node, SQL/Auth local pertinente, UI320/360/768/1440; build/TS; revisão integrada de permissões, privacidade e continuidade.
- [ ] Livro/fecho, GitHub→Vercel sem Actions, readback Supabase sem duplicar migrations, assets/barreiras/contagens reais.

Arquivos compartilhados (root integra): shared/team.ts, app/router/routes, navigation/OperationLayout, server/app.ts, scripts/test-database.mjs e Livro/AGENTS. Demais domínios em arquivos próprios para trabalho independente conforme habilidade dispatching-parallel-agents.

As migrations corretivas foram geradas pela CLI com seus timestamps reais, posteriores à maior versão já aplicada. As três migrations recuperadas conservam exatamente o SQL do histórico hospedado; não serão reaplicadas.
