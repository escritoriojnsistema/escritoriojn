# Etapa 02 — publicação técnica e telas responsivas

Pedido de 17/10/2026: corrigir Vercel e adaptar entrada/telas como https://escritoriojnsite.vercel.app/, preservando React + Vite e manual. O pedido autoriza reparar o projeto novo já identificado; o sistema antigo é apenas referência pública.

## Diagnóstico comprovado
- Vercel `escritoriojn` (`prj_PSltYIXuu3V50lKKVKhFwINMODBq`) falhou no commit Git `87d4321` durante npm install; etapa 01 `9fab3ae` ainda só local.
- Reprodução do manifest antigo: ERESOLVE por esbuild ^0.25 versus peerOptional ^0.27/^0.28 do Vite 8.3.4. Etapa 01 já removeu dependência direta desnecessária e fixou versões/lockfile. Não usar force/legacy-peer-deps.
- Logs detalhados Vercel retornam 403 no escopo escritorio-jn; CLI sem autenticação Vercel disponível. Metadados e Git estão acessíveis. Não atribuir uma linha remota não lida à reprodução local.
- Capturas públicas da entrada, equipe, cliente e recuperação em desktop/mobile. Nenhum login ou dado privado acessado.

## Incremento e interfaces
1. Testes de regressão para POST tipado `/api/validate`, erros JSON, rotas profundas e navegação/back/forward; observar falha antes de implementar.
2. Manter Express compartilhado; Vercel Functions exportam o app sem listen; `/api` nunca cai na SPA e `/assets` inexistente permanece 404. Instalação com npm ci.
3. Router React convencional, telas públicas navy/claro/dourado, foto pública da referência servida localmente, acessos cliente/equipe/recuperação e status técnico separado. Formulários visuais desativados até etapa 04, com aviso explícito; sem enviar senhas ou inventar sucesso de login/e-mail.
4. PageLoading, títulos e links permanentes; mobile 320/360, tablet 768, desktop 1440, zoom e teclado. Não esconder overflow para mascarar.
5. npm ci/typecheck/test/build; navegador, preview local, revisão independente; Git push em branch e conferir deploy Git. Reparação técnica do projeto existente autorizada pelo pedido, sem contratar plano ou lançar operação comercial.

Sem SQL, tabelas, conexão a banco antigo ou alteração de Auth. Supabase continua para etapa 03. Atualizar Livro com status real de Git/CI/preview/alias, inclusive bloqueio externo quando houver.

## Encerramento

Itens 1–5 implementados e verificados; evidências e limites em fecho-02.md. A revisão encontrou dois P2, ambos corrigidos com testes RED→GREEN. Git/CI e publicação técnica no alias público passaram; preview protegido/logs internos continuam inacessíveis pelo conector. Não iniciar Etapa 03 automaticamente.
