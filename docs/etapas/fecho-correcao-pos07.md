# Fecho da correção pós07 — cadastro, sessão e rapidez

Verificação em 19/10/2026, 20:50 UTC. A implementação já estava integrada e publicada; esta retomada auditou o estado e corrige o checkpoint documental. Evidências estruturadas em [fechamento.json](../evidencias/correcao-pos07/fechamento.json).

## Resultado por requisito

| Pedido | Estado conferido |
| --- | --- |
| Cliente que cria a própria conta aparece em Clientes | Após confirmar o e-mail, a origem pública gera uma ficha reutilizável quando não existe contato coincidente. Leitura exige `customers.read`; visualizar cadastros de outros criadores exige também `customers.read_all`, no mesmo escritório. |
| Cliente com ficha interna anterior | Contato coincidente mantém uma entrada para conferência, sem duplicar a ficha nem escolher documentos pelo e-mail. Aprovação e associação documental continuam futuras. Ficha interna não cria conta Auth. |
| Logo ou recarga reabre sessão encerrada | Encerramento correlacionado por UID/session_id alcança armazenamento/SDK e outras abas. O marcador nega reativação da sessão anterior; novo login legítimo continua possível. Testes reais do laboratório cobrem os quatro papéis, logo, foco, refresh, reload e concorrência. |
| Demora no login | Contexto já verificado passa uma única vez, em memória, para a mesma sessão/portal: duas consultas imediatas passam a uma. Foco, recarga, API e banco continuam validando acesso. |
| Demora em convites | A API responde após persistir o convite, com envio pendente. `waitUntil` mantém a entrega real; acompanhamento limitado e reenvio explícito preservam estados honestos. |
| Demora no cadastro público | Já usa um único POST real ao Auth, pré-conexão e timeout. A confirmação permanece obrigatória. Não há amostras hospedadas de cadastro/convite na janela consultada para comprovar sua latência completa. |

## Evidências de código, CI e banco

[PR13](https://github.com/escritoriojnsistema/escritoriojn/pull/13) integrada na main em `9623919ad71070b0c5a9b7b1a0848a6ca71cd84d`. O commit testado `711294b78882d6f5a91b3e25244da2ef5175416a` e o merge têm a mesma árvore `1d84d5fb7e1fe56c4d89bf2a118bf2f96b2d3ac4`.

[CI39288012538](https://github.com/escritoriojnsistema/escritoriojn/actions/runs/39288012538) SUCCESS nos três jobs. Logs conferidos nesta retomada:54 Node/API,564 SQL (282×2),59 Auth/SMTP no laboratório,34 E2E públicos e96 contratos de apresentação; typecheck e build passaram. Estes são resultados do CI final existente, não uma nova execução local. As fixtures não representam contas hospedadas nem comprovam SMTP externo.

Nove migrations constam no histórico hospedado. As duas correções aditivas permanecem aplicadas: `20261019163453_customer_registration_registry` e `20261019164337_customer_registration_lock_compatibility`. Seus SHA256 estão no JSON; arquivos versionados conferidos sem alterar SQL. Consulta atual confirma trigger ativo e mutex `FOR NO KEY UPDATE`.

Contagens atuais: cinco contas/quatro confirmadas/cinco vínculos; uma ficha/um contato/uma origem materializada; zero aprovações e zero vínculos materializados quebrados. As três tabelas afetadas têm RLS e nenhum SELECT bruto para anon/authenticated. Esta retomada realizou somente consultas no banco.

## Publicação observada

O [status Vercel do merge](https://vercel.com/escritorio-jn/escritoriojn/BqKJJRDtWouTaaU7CjE2U8pKFXcG) consta como SUCCESS no GitHub. O canônico [escritoriojn.vercel.app](https://escritoriojn.vercel.app/) retornou200 e serve `/assets/index-HnP-NxlU.js`, com os marcadores de encerramento de sessão e de origem pública. Health200; contexto anônimo401; abrir `/clientes` sem sessão terminou em `/login`.

O conector administrativo Vercel retorna403 no time escritorio-jn e não há CLI Vercel disponível neste ambiente. A prova pública e o status Git não verificam variáveis, logs privados ou configuração administrativa. Nenhuma publicação nova foi executada nesta retomada.

## Desempenho observado e limites

Logs Supabase desde16:49:04 UTC, após o merge, sem consultar identificadores pessoais: `/auth/v1/token` (login/refresh juntos) teve seis respostas200, mediana170ms e p95 de431,6ms; `/auth/v1/user` teve140 respostas200, mediana12ms; `my_access_context` teve122 respostas200, mediana38ms. Houve também uma resposta403 de `/auth/v1/user`; acesso negado não foi tratado como operação bem-sucedida.

Os números medem somente o tempo upstream do provedor. Não incluem navegador, conexão, partida da Function Vercel nem entrega SMTP. Cadastro/convite não tiveram amostras nessa janela. O benchmark1390→201ms do convite é sintético, como já registrado; não atribuir esse ganho percentual à produção. Não foram criadas contas nem enviados e-mails hospedados para medir desempenho.

## Integrações e importações preservadas

- Frontend React/Vite/TypeScript usa contratos seguros em `shared/` e módulos em `src/features/`. Código de servidor não entra no bundle; frontend usa somente conexão pública e Bearer.
- Express monta `/api`, verifica identidade e chama RPCs com o Bearer do usuário. PostgreSQL verifica sessão, papel, capacidades e escritório; CPF/CNPJ usam `shared/identifiers.ts`.
- Cadastro público chama Supabase Auth; o bootstrap cria perfil/vínculo de cliente e a confirmação dispara a origem para Clientes. Inclusão interna via API/RPC cria ficha, contatos e auditoria, sem criar login. Não existe importação em massa de clientes nesta etapa.
- Convite persiste pela RPC antes de chamar a Edge `team-invitations`. Só o runtime Edge usa credencial privilegiada para Auth/entrega; ela não é importada na Vercel nem no navegador.
- GitHub usa lockfile e Node da `.nvmrc`. Vercel executa `npm ci`/`npm run build`, serve `dist` e encaminha `/api` à Function Express antes do fallback da SPA.
- Migrations são aplicadas separadamente ao Supabase, uma vez, na ordem versionada. Deploy Git não aplica SQL nem republica a Edge automaticamente. Não repetir bootstrap/backfill nem importar estado do sistema anterior.

## Pendência encontrada na conversa anterior

A [PR14](https://github.com/escritoriojnsistema/escritoriojn/pull/14), aberta em19/10 às16:51 UTC, ainda não foi integrada. Altera uma linha em `shared/governance.ts` para exibir “Cadastro público recebido” na lista/detalhe/filtro da Auditoria. O evento já é registrado pela correção publicada; o rótulo legível é esse complemento pendente. CI39289046673 SUCCESS e preview Ready conferidos. Ela não muda cadastro, sessão, autorização ou migrations. Nenhuma integração/publicação foi executada nesta retomada.

## Habilidades e continuidade

As17 habilidades DEV01–17 já estavam disponíveis e habilitadas na biblioteca MagicPath conectada; não foram duplicadas. As pertinentes a diagnóstico, Auth, testes, segurança e continuidade orientaram esta retomada. Cópia portátil das17 foi exportada e validada separadamente. A sessão não expõe a ferramenta de registro do Plugin Creator; não se afirma instalação global no ChatGPT/Codex.

Preservar a numeração oficial Etapa01–40 do AGENTS deste projeto, que prevalece sobre a convenção genérica MNN-ENN das habilidades. Etapa08, aprovação de acervo e prazo individual por inatividade não foram ativados. O prazo continua apenas contratado em [ajuste06](ajuste-06-navegacao-sessao.md).

Próximo checkpoint: concluir a revisão documental; medir o fluxo completo de cadastro/convite com uma operação real autorizada quando houver amostra, sem declarar resolvida a latência SMTP não medida. Retomar com AGENTS, Livro, este fecho e somente a regra afetada.
