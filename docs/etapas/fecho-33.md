# Etapa 33 — Pedidos digitais

Publicada e verificada em11/11/2026 pelo [PR117](https://github.com/escritoriojnsistema/escritoriojn/pull/117), feature338130ef/mergee996b8d5. PreviewFKCXkQSX e produçãoMJEL3RKK READY, origemGit: https://escritoriojn.vercel.app. ManualDrive33 e regra portal-pwa/RF16 conferidos antes das alterações. Base32: maind905485, AGENTS/Livro/fecho32. Stack preservada: React19.3.1, Vite8.3.4, TypeScript7.0.2, Express5.3.0, SupabaseJS2.118.0, Node24.22.1/npm11.9.0.

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

386testes Node sem falhas; tipos/build aprovados; auditoria de dependências de produção sem vulnerabilidades. Dois replaysSQL vazios completos aprovados:2.203/2.209verificações e duas corridas de fechamento/convite, migrador sem superusuário/BYPASSRLS. Lab real local Auth/REST/Express/Storage: publicação, abertura concorrente com mesma chave, retomada própria, terceiro negado por UUID/nonce/Storage, PDF real em quarentena, confirmação única na fila/responsável, complementação e notificação sem nota interna, booking com campos do modelo+serviço.

20contratosUI33 e93cenários distintos de regressão31/32/catálogo/pedidos/serviços/anexos aprovados. Os18testes de pedidos/retornos foram reconferidos após atualizar a expectativa do retry explícito e resolver colisão local dos rastros. Resultados em [verificacao-local.json](../evidencias/etapa-33/verificacao-local.json). Revisão independente somente leitura não encontrou bloqueios após corrigir retirada da publicação, revisão da versão visível, navegação503 e retomada401/403. Evidências visuais em `docs/evidencias/etapa-33/`.

Migration `20261111190203_portal_intake33.sql` aplicada automaticamente pela integraçãoGit. **NÃO reaplicar.**69instruções normalizadas e34definições canônicas correspondem ao replay local; seis tabelasRLS/ACLfechadas, seis wrappersINVOKER autenticados, helpers fechados, dois triggers de preparação/cota e buckets privados conferidos. Zero registros33 hospedados; nenhuma fixture/Auth/grant criada por esta implementação. Nenhuma nova advertência de segurança ou FK33sem índice. A proteção contra senha vazada desativada é aviso preexistente: https://supabase.com/docs/guides/auth/password-security#password-strength-and-leaked-password-protection.

19cenários públicos hospedados31/32/33 aprovados; health200 e74assets idênticos byte a byte ao build com configuração pública real. Jornadas privadas foram comprovadas no lab local real; não foram usados logins privados hospedados. Integridade:170/173fingerprints exatos; dados de negócio/identidades/memberships/permissões/delegações preservados. Atividade concorrente de login19:54 e manutenção alterou auth.users/session_activities/maintenance_schedule_settings; as sete contas permanecem e não se afirma igualdade integral desses fingerprints de runtime. Nenhuma escritaAuth hospedada foi feita por esta tarefa.

Provas: [publicação](../evidencias/etapa-33/publicacao.json), [schema/integridade](../evidencias/etapa-33/schema-publicado.json), [bundle](../evidencias/etapa-33/bundle-publicado.json). Publicação somente GitHub→Vercel, semActions/deploydireto.

Próxima etapa34 apenas mediante novo pedido. Ler este fecho, Livro/AGENTS, cartão/plano33 e regra afetada; não recriar formulário, protocolo, fila, Storage ou financeiro.

## Aceite

- [x] Manual33 e integrações09/10/11/12/21/31/32.
- [x] PadrãoEquipe/Convites Desktop/Mobile, até4atalhos e demais destinos no menu.
- [x] Uma área por vez, formulários em grade, rolagem natural mínima e controles acessíveis.
- [x] Transições sem loaders; tentativa503/retomada protegidas.
- [x] Backend/frontend e índices/cotas/RLS/ACL conferidos.
- [x] Supabase, GitHub→Vercel e Livro/AGENTS/evidências atualizados.
