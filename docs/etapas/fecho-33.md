# Etapa 33 — Pedidos digitais

Implementação local concluída em11/11/2026; publicação GitHub→Vercel e conferência hospedada em andamento. ManualDrive33 e regra portal-pwa/RF16 conferidos antes das alterações. Base32: maind905485, AGENTS/Livro/fecho32. Stack preservada: React19.3.1, Vite8.3.4, TypeScript7.0.2, Express5.3.0, SupabaseJS2.118.0, Node24.22.1/npm11.9.0.

## Comportamento implementado

- Serviços→detalhe→Pedidos digitais publica explicitamente a versão revisada, campos e checklist público para aberturas do portal, usando services.manage atual. Não publica serviços existentes automaticamente. CategoriaDocumentos conserva modelos/ofertas aprovados21.
- Solicitações→Nova→categoria→Escolher serviço oferece campos09 tipados, quantidade limitada e valor calculado no servidor. O catálogo documental agrega esses mesmos dados ao formulário do modelo aprovado, mantendo o contrato antigo de booking.
- Conferir e anexar cria um único atendimento10/protocolo/item09 em preparação. Anexos usam o pipeline11 privado, políticas vigentes, hash e quarentena. Enviar confirma a distribuição existente por categoria/nível/presença/capacidade. Preparação não entra na fila de trabalho nem concede operação à equipe.
- Status/histórico públicos32, devolução12 e notificações continuam no mesmo atendimento. Complementação separa até80campos do modelo e12do serviço com namespace reservado; revisões append-only conservam o original09. O detalhe autorizado da equipe lê os valores efetivos.
- Publicação retirada, revisão/versionamento ou arquivamento antes do primeiro envio bloqueiam a preparação antiga; seus dados/protocolo continuam consultáveis e podem ser ocultados para reiniciar com a versão vigente. Não altera silenciosamente preço ou autorização. Atendimentos já enviados podem receber complementação sem depender da publicação para novas aberturas.
- Nenhum payload aceita privilégio, preço livre, quitação, cliente ou responsável reservado. Sem novo financeiro, protocolo paralelo, validação automática de checklist ou pagamento online.

## Segurança, repetição e desempenho

Seis tabelas privadas33 têm RLS e ACLs fechadas, acesso somente por RPCs autenticadas/autoridade atual e seis wrappers públicos INVOKER. APIs usam Bearer/no-store, DTOs explícitos, corpos exatos e erros sem dados privados. Nenhuma nova capability ou grant individual. Representação31/contrato comum32 não ganham dados/anexos do outro cliente.

Mesma chave/corpo/sessão reconcilia o mesmo pedido. NonceUUID em sessionStorage por sessão/escritório permite recuperar apenas o protocolo próprio; não armazena payload, token, PII ou File.401/403limpa;503conserva tentativa/arquivo/chave/política e bloqueia navegação até reconciliar. Limite transacional compartilhado entre endpoints novos/antigos:20aberturas reais por10min e100/dia por usuário/escritório; retries não consomem cota. Preparação equivalente recente é recusada por5min; contador registra somente Auth atual, nunca importações ou fixtures.

Índices cobrem escopo/ator/tempo/FKs; locks do escritório serializam comandos antes da revalidação. Busca paginada3mobile/5desktop, sem N+1 para abrir serviço. Não há consulta de retomada sem nonce. API real local:20amostras, p50≈181,60ms/p95≈222,98ms sob outras verificações concorrentes; não representa SLA hospedado nem latência física zero. UI usa a base Equipe/Convites, alvos44px/inputs16px, até4atalhos e demais destinos na sidebar, uma área ativa e nenhum spinner/overlay/rótulo de carregamento.

## Verificação e publicação

386testes Node sem falhas; tipos/build aprovados; auditoria de dependências de produção sem vulnerabilidades. ReplaySQL vazio completo aprovado inicialmente com2.204assertivas, migrador sem superusuário/BYPASSRLS. Lab real local Auth/REST/Express/Storage: publicação, abertura concorrente com mesma chave, retomada própria, terceiro negado por UUID/nonce/Storage, PDF real em quarentena, confirmação única na fila/responsável, complementação e notificação sem nota interna, booking com campos do modelo+serviço.

Contratos UI33 e regressões31/32/catálogo/pedidos/serviços/anexos estão em execução; resultados finais ficam em [verificacao-local.json](../evidencias/etapa-33/verificacao-local.json). Revisão independente somente leitura não encontrou bloqueios após corrigir retirada da publicação, revisão da versão visível, navegação503 e retomada401/403. Evidências visuais em `docs/evidencias/etapa-33/`.

Migration: `20261111190203_portal_intake33.sql`. Antes de qualquer aplicação manual, consultar histórico remoto. Nenhuma fixture/Auth/grant foi criado no ambiente hospedado por esta implementação. Não usar Actions ou deploy direto: somente GitHub→Vercel. Provas de PR/merge/READY, schema, integridade e bundle serão acrescentadas após publicação.

Próxima etapa34 apenas mediante novo pedido. Ler este fecho, Livro/AGENTS, cartão/plano33 e regra afetada; não recriar formulário, protocolo, fila, Storage ou financeiro.
