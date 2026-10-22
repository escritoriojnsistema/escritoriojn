# Correções pós13 — Conta, notificações, Cobranças e rapidez

Base: c4e6e7a; Etapa13 publicada. Escopo autorizado pelo usuário em22/10/2026, incluindo publicação GitHub→Vercel, sem Actions e sem nova confirmação. Não iniciar14.

## Restrições globais

- React/Vite/Express/Supabase existentes; preservar dados, isolamento por UID/session_id, permissões e guardas401/403. Não persistir dados privados/permissões em disco no navegador.
- Todos os perfis owner/admin/employee/client, desktop/mobile; mesmos padrões OperationLayout/Equipe. No máximo4atalhos mobile;44px/alvo;16px/input mobile; foco acessível; rolagem natural quando necessária.
- Sem spinners/overlays/rótulos temporários; bloquear repetição; preservar mensagens e rascunho da mesma sessão em falha transitória.
- Não expor PII das fotos; fixtures fictícias somente locais. Publicação exclusivamente GitHub→Vercel.

## Tarefa1 — interface e notificações

Mover Salvar alterações e Solicitar/Acompanhar correção para área de ações fora do quadro de Conta. Adicionar Cancelar na edição para restaurar dados oficiais sem chamada de gravação; no cliente Cancelar descarta a proposta e retorna à Conta. Revisar aplicação de correções e notificações com ações alinhadas, fora do quadro de campos, acessíveis e responsivas. Cancelar edição não cancela solicitação já enviada nem altera estado de negócio.

Abrir notificação deve marcá-la lida automaticamente e retirar sua contribuição do sino sem clique adicional; usar endpoint/RPC existente, com isolamento e falhas seguras. Navegação deve abrir o destino imediatamente; persistir leitura em componente/serviço com ciclo de vida que sobreviva à navegação, cancelando na troca da sessão/autoridade. Não perder o envio por unmount da caixa, não ocultar falhas, não marcar outras notificações como lidas. Revisar idempotência e filtro de não lidas.

Cobranças deve aproveitar a largura/padding de Equipe, especialmente busca/filtros e lista, preservando layout compacto já implementado. Evitar limites genéricos em todos os forms. Verificar320/360/768/1440/1920.

Testes de regressão primeiro: ação externa/cancelamento por papel, aplicação, leitura automática+badge+falha+troca de sessão, largura comparável. Rodar contratos UI afetados, reportar contagem/comandos/logs.

## Tarefa2 — diagnóstico de rapidez e integração (controlador)

Medir/reproduzir login/navegação, identificar viagens duplicadas e regras de montagem/revalidação. Remover esperas evitáveis sem cache de autoridade nem enfraquecer autenticação. Backend deve continuar revalidando sessão e acesso. Verificar região Vercel vs Supabase; não prometer latência física zero. Testes de regressão e evidência mensurável.

## Fecho

Revisão independente do diff, build/testes pertinentes; publicação e verificação canônica. Conferir Supabase/GitHub/Vercel/raiz e atualizar Livro/AGENTS com mudanças, limites e evidências reais.

## Implementação e evidência

- Conta mantém formulário nativo com submit externo associado por id; Cancelar restaura nome/CPF/e-mail oficial ou intenção de e-mail já pendente e limpa mensagens. Cliente pode descartar proposta antes do envio. Aplicação pode restaurar proposta e conferência sem cancelar negócio.
- NotificationReadProvider permanece acima das rotas; fila em memória por autoridade/escritório/aviso, AbortController e respostas antigas ignoradas. Cada falha conserva sua retentativa. Leitura confirmada solicita resumo oficial do sino; não reduz contador sem confirmação. Nenhum dado privado persiste em cache no disco.
- Cobranças aproveita largura de Equipe em320/360/768/1440/1920; editor conserva limite760px. Capturas fictícias no diretório de evidências, inspecionadas visualmente pelo controlador.
- Backend executa getUser e my_access_context em paralelo, ambos obrigatórios e com comparação de UID. RPC é STABLE INVOKER, com RLS/sessão vigentes. Mutações continuam depois da autenticação. Não alterou schema, índices, RLS, capacidades nem dados hospedados.
- Supabase hosted ca-central-1 ACTIVE_HEALTHY; VercelAPI iad1, portanto não houve mudança arbitrária de região.18migrations/5Auth/5vínculos/1ficha/1pedido/0cobranças preservados.4RPCs afetadas públicas INVOKER, anônimo semEXEC, autenticado comEXEC. Laboratório oficial local aplica migrations existentes e verifica Auth/REST/Storage/SMTP sem fixtures hospedadas.
- Benchmark7amostras com125ms por leitura independente: mediana sequencialSDK256,792ms, endpoint atual132,207ms. É ensaio controlado local; não estabelece SLA da rede ou promete latência zero. Login já usava uma consulta de contexto; regressões reais confirmam que foco/reload revalidam e401/logout não ressuscitam sessão.
- Revisão independente detectou P2 de perda de mensagem ao abrir outro aviso; corrigido com mapa de falhas e teste RED→GREEN. Revisão final aprovou ambas tarefas, sem achados pendentes. [Parecer](../evidencias/ajuste-pos13/revisao.md).

Validação final agregada e publicação: registrar em verificação/publicação após os respectivos comandos, sem somar reexecuções como novos casos. Tentativas históricas interrompidas/falhas de fixtures não contam como aprovação. Próxima etapa14 somente mediante novo pedido.

Validação final:115Node/API,77UI afetados,59E2E públicos locais,34fluxosAuth reais locais; o cenário de aviso foi reexecutado com assert explícito read_at no banco(1pass, sem somar como caso distinto). Build completo e auditprodução0. Revisão final aprovada sem pendências. [Sumário versionado](../evidencias/ajuste-pos13/verificacao.json). Logs completos locais ignorados porGit; hashes no sumário. Publicação canônica será registrada no fecho.
