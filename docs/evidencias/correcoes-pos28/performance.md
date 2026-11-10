# Diagnóstico de abertura e entrada após28

Causas comprovadas: `HomePage` retornava `null` enquanto o SDK recuperava/verificava a sessão; o formulário de login aquecia `OperationalRoutes`, mas esse módulo importava estaticamente todas as telas01–28. Assim, abrir o login também transferia e analisava Documentos, Caixa, Rural, Clientes, Configurações e os demais módulos, mesmo para quem só entraria no painel.

A correção mantém o aquecimento do painel pequeno e importa cada tela de negócio somente na abertura da sua rota. A página pública pode aparecer enquanto a sessão é verificada; o painel continua dependendo da autoridade atual. Nenhuma permissão/resposta privada foi persistida para acelerar entrada. O React Router7 já usa `startTransition`: a tela verificada atual e seu menu permanecem enquanto o próximo módulo chega. O teste com o módulo Clientes retido comprova isso em360/1440;403 durante essa espera remove a área privada imediatamente.

O caminho de autenticação foi preservado: senha pelo SDK isolado → RPC com sessão/autoridade atuais → adoção oficial do SDK e contexto descartável da sessão/portal exatos. Não foi removida nenhuma dessas verificações. A reabertura com armazenamento restaurado exige novamente `/api/auth/context`.

## Método

`node --import tsx scripts/measure-entry-pos28.mjs --baseline-root /tmp/jn-pos28-baseline-source`; a origem anterior foi extraída com `git archive 9772f32`, com as mesmas dependências fixadas. Os dois builds usam o mesmo laboratório descartável real GoTrue/PostgREST/PostgreSQL e os mesmos quatro papéis; Storage não é exercitado. Três amostras por caso; Chromium, contexto novo, cache HTTP desabilitado,1440×900,10Mbit/s/60ms e CPU4. A referência anterior e a posterior foram executadas consecutivamente, sem outros testes/builds em paralelo. A primeira exploração teve concorrência de CPU e foi descartada das medições finais.

O JSON separa FCP, bytes transferidos, tempo do clique até painel, refresh até painel e novo contexto com sessão restaurada até painel. Refresh/reabertura terminam na visibilidade do painel, antes da espera adicional por `networkidle`. `form_ready_ms` inclui preenchimento automatizado após `networkidle`; não representa um tempo exato de interatividade. FCP de `/` com sessão restaurada pode ser conteúdo público enquanto a verificação continua: o tempo até painel é a medida separada da entrada privada. As durações de senha/RPC/adoção são registradas individualmente. Servidor estático local sem compressão e três amostras não equivalem a SLA nem a medições de cold start/RTT da produção Vercel.

## Medições finais

Medianas em milissegundos; os valores brutos e as três amostras de cada caso estão em `performance.json`.

| Papel | Refresh até painel, antes→depois | Novo contexto/sessão restaurada até painel | FCP na reabertura | Clique Entrar até painel |
|---|---:|---:|---:|---:|
| Super administrador | 1679→1022 | 2426→1973 | 2152→1116 | 948→965 |
| Administrador | 1645→1098 | 2316→1949 | 1956→1116 | 940→973 |
| Funcionário | 1642→1094 | 2348→2000 | 2064→1080 | 936→942 |
| Cliente | 1644→1040 | 2390→1938 | 2096→1048 | 953→947 |

JavaScript transferido na abertura do login: **1.273.722→580.133 bytes (−54,45%)**, igual nos quatro papéis. O módulo operacional monolítico de724KB passou a um conjunto de roteador/painel/layout de cerca de30KB; as telas de negócio são recursos separados. A página pública anônima manteve FCP na mesma ordem:1088→1044ms, com sobreposição entre amostras. A verificação de credenciais também ficou na mesma ordem; a melhoria é no código transferido, na reabertura e na renderização, sem promessa de eliminar a latência do provedor.

Durações HTTP medianas por fase, incluindo a rede controlada: senha113→116ms, RPC67→67ms e adoção/getUser67→67ms. Não houve remoção de chamadas ou alteração do backend para produzir os ganhos.

## Verificação

Dois testes novos falharam antes da correção: homepage vazia com contexto pendente e telas de negócio transferidas no login. Após a correção, cinco contratos de navegador passaram, incluindo menu preservado360/1440 e403 durante módulo pendente.354 testes Node/API completos passaram; build frontend/servidor e TypeScript passaram. A rodada intermediária concorrente de navegador teve ENOENT no diretório compartilhado de traces; foi repetida isoladamente em diretório próprio, após corrigir o seletor de módulo para aceitar o parâmetro HMR. As jornadas reais do benchmark verificam os quatro papéis, refresh e restauração, com uma senha/RPC/adoção por entrada e sem consulta duplicada ao contexto da API no login.

Dados, migrações, API de autenticação, dependências, PKCE, logout e concessões não foram alterados; nenhuma operação hospedada foi usada neste diagnóstico.
