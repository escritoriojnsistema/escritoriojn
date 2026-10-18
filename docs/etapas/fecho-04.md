# Etapa 04 — checkpoint de autenticação

**Estado em 18/10: publicação técnica de frontend/API verificada; conferência humana de login/SMTP externo pendente. Site URL e callback canônicos confirmados.** React + Vite preservado. Não avançar à 05 antes da configuração e prova publicadas.

## Entregue

- SDK público único com PKCE/refresh oficial; API Express valida identidade por getUser e contexto comercial vigente. Sem service_role no produto, cookie de autenticação próprio, MFA ou dados de senha no banco da aplicação.
- Login/logout, painel mínimo equipe/cliente, sessão expirada, falta de acesso e indisponibilidade com repetição. Cadastro exclusivamente cliente, confirmação de e-mail, callback seguro e recuperação/nova senha, inclusive após recarregar. Nenhuma funcionalidade futura foi simulada.
- Layout navy/claro/dourado reutilizado; conteúdo padrão cabe nos tamanhos 320×568,360×640,768×1024 e1440×900. Controles de 44px e inputs mobile 16px; conteúdo ampliado pode rolar naturalmente.
- Migration `20261017225649_auth_sessions_client_registration.sql` aplicada no projeto novo. Helper exige sessão Auth vigente, RPC própria invoker, configuração de cadastro privada, trigger cliente/auditoria transacional. Metadata não concede papel/unidade. Desabilitar cadastro impede vínculo/acesso, mas Auth ainda pode conter identidade sem vínculo.
- Pós-migration: 4 contas Auth, 1 perfil, 1 vínculo preservados; cadastro aponta única unidade ativa. API não lê auth.sessions nem executa configuração; anônimo não executa RPC. Não alteradas senhas, metadata, SMTP/templates ou vínculos das contas existentes. Administrador/funcionário/cliente preexistentes continuam sem vínculo até administração autorizada.

## Evidência e limites

- `npm run test:e2e`: 30 testes públicos passaram, incluindo compactação em quatro resoluções e rolagem natural de conteúdo ampliado.
- `npm run typecheck`, `npm test` e `npm run build` passaram; auditoria de dependências de produção: 0 vulnerabilidades.
- `npm run test:db`: 78 verificações em dois replays vazios; migrador sem superusuário/BYPASSRLS. Sessão revogada/expirada, RLS A/B, inatividade, metadata, cadastro cliente, confirmação e ACLs.
- `npm run test:auth`: 9 testes passaram, com login real pelo navegador→API→GoTrue/PostgREST→RLS, senha incorreta, contexto próprio A/B com JWTs reais, falta de vínculo/inatividade, logout bloqueando JWT antigo, signup forjado ainda cliente, confirmação SMTP local, recuperação PKCE/reload/nova senha, link reutilizado, expiração realmente recusada pelo provedor e callback inválido. Também regressão de eventos SDK com token inalterado e mensagens de sessão/API. Falha SMTP 500 é teste de contrato interceptado, não falha externa provocada.
- Laboratório descartável usa PostgreSQL 17 + imagens oficiais GoTrue/PostgREST/Mailpit. Portas somente 127.0.0.1, senhas/chaves fictícias aleatórias em memória, limpeza dos recursos próprios. GoTrue habilita RLS no schema Auth; policies SELECT somente ao migrador local simulam o acesso mínimo de leitura do operador/helper sem BYPASSRLS. No hospedado, postgres tem BYPASSRLS (não superuser); roles da API continuam sem acesso direto às sessões. Não usar esse laboratório como aplicação ou prova de SMTP externo.
- Revisão independente encontrou/corrigiu atualização de sessão, recarga de recuperação e retorno da equipe. Expiração exige prova do redirect otp_expired antes da tela; não depende de faltar verifier no browser.
- [PR 4](https://github.com/escritoriojnsistema/escritoriojn/pull/4), código dbbbef5. [CI 39077364485](https://github.com/escritoriojnsistema/escritoriojn/actions/runs/39077364485) **SUCCESS** nos três jobs: qualidade/build/30 E2E públicos, replay com 78 verificações SQL e 9 testes Auth reais. Commit posterior apenas documental, sem repetir build/testes ou aplicar migration.
- Status GitHub/Vercel do código: success, [deployment](https://vercel.com/escritorio-jn/escritoriojn/8LrZVvzneuzYyqVviMi5FnizsWcd). Isso comprova o status de build informado pela integração; não comprova Auth publicado. Listagem Vercel também retornou 403 por escopo; CLI não disponível. O alias de preview da branch redirecionou ao login vercel.com; não foi contado como resposta da aplicação nem teste Auth. A habilidade Vercel de acesso protegido foi consultada; não há CLI/credencial local para acesso autenticado, e a proteção foi preservada. O site principal anterior respondeu 200 em /, /login e /api/health (JSON ok).

Advisors após aplicação: nenhum WARN de segurança de banco ou desempenho. INFO de RLS sem policy na tabela privada de configuração é intencional (API sem GRANT, operador/helper apenas); [referência do linter](https://supabase.com/docs/guides/database/database-linter?lint=0008_rls_enabled_no_policy). INFO de índices sem uso mantidos por finalidade em base nova. WARN Auth pré-existente listado abaixo.

## Bloqueios na entrega inicial (17/10)

1. Vercel recusou acesso às variáveis por 403/escopo do conector. Necessárias `VITE_SUPABASE_URL` e `VITE_SUPABASE_PUBLISHABLE_KEY` em build e runtime, iguais para frontend/API. Chave publicável apenas, nunca secret/service_role. Não inserir senha SMTP no app. Reconexão/configuração solicitada ao usuário; não contornar proteção.
2. Conector Supabase não expõe Site URL/allowlist. Usuário precisa confirmar canonical `https://escritoriojn.vercel.app` e callbacks permitidos com query da PKCE/área; configuração do preview também precisa seu próprio destino autorizado. Ver roteiro de configuração 04.
3. Entrega de recuperação/confirmação pelo SMTP externo não foi testada. Prova atual é somente Mailpit. Não usar contas reais ou suas senhas em testes automatizados; homologar com conta fictícia autorizada.
4. Aviso Auth pré-existente: [proteção contra senhas vazadas desativada](https://supabase.com/docs/guides/auth/password-security#password-strength-and-leaked-password-protection). Não ativar plano/custo/MFA automaticamente.

## Retomada

Resolver conexão/env/URLs, gerar preview com configuração correta, testar callback e SMTP no ambiente autorizado, conferir CI e então liberar publicação técnica pelo fluxo Git existente. Atualizar Livro/fecho com as provas. Sem DROP/reset, fixtures hospedadas, rebootstrap do proprietário ou cópia de dados do sistema anterior. Reverter código mantém a fundação; para suspender novos vínculos, operador pode desabilitar configuração existente, preservando auditoria.

## Retomada e publicação em18/10

Usuário informou todos os passos concluídos. PR4 integrado (merge e60dccb), build Git/Vercel success: https://vercel.com/escritorio-jn/escritoriojn/5zKk78ZQFb3NSFzFoSjY6FwtyMRC. Frontend canônico novo, bundle com configuração pública do projeto correto, Auth/settings200, signup/email habilitados e confirmação obrigatória. Callback explícito canônico com área aceito pelo provedor; verificação com token inválido retornou303/otp_expired. Site URL padrão observado é https://escritoriojn-escritorio-jn.vercel.app/ e deve ser alinhado ao canônico. Não foram enviados e-mails nem criadas contas de teste hospedadas.

30 E2E públicos passaram após a publicação, mas a investigação adicional encontrou /api/auth/context404 da Vercel (sem request_id) enquanto /api/health 200 e /api/nao-existe404 da aplicação funcionavam. Causa: api/[...path].ts cobria apenas um segmento na plataforma. Duas regressões remotas RED confirmaram a lacuna antes da correção.

Correção: rewrite explícito /api/(.*) para /api, Function única api/index.ts; remoção do alias dinâmico redundante e teste de transporte usando o entrypoint real. Captura sem nome é intencional: o conversor oficial routing-utils injeta parâmetros nomeados não usados na query do destino, incompatíveis com a validação estrita da Auth. Fonte: https://github.com/vercel/vercel/blob/main/packages/routing-utils/src/superstatic.ts (convertRewrites/replaceSegments). Sem mudanças em Auth/RLS/migrations/contas. Typecheck,6 Node/API,build e4 testes públicos Auth locais passaram; conferir a plataforma depois do deploy.

Conector Vercel continua403 para o time e para acesso ao preview protegido; CLI ausente. Não repetir a mesma operação ou retirar proteção. Publicação por Git e verificações pelo domínio público disponíveis. Usuário declarou **Ainda não testei** login/recebimento; manter entrega SMTP e login real publicado como não verificados até a conferência humana com conta autorizada.

## Resultado publicado da correção

[PR 5 integrado](https://github.com/escritoriojnsistema/escritoriojn/pull/5): código 301d1ee, merge e08c0e8. [CI 39082934394](https://github.com/escritoriojnsistema/escritoriojn/actions/runs/39082934394) concluiu SUCCESS nos três jobs: qualidade/typecheck/build/6 Node/API/32 E2E, 78 verificações SQL e 9 testes Auth reais. A primeira tentativa de Auth não executou testes por ECR toomanyrequests: Data limit exceeded ao baixar Mailpit; repetido somente esse job, com sucesso. A mesma suíte Auth 9 também passou localmente nesta retomada. Revisão independente sem achados de produção; falso negativo local com env de arquivo corrigido na regressão.

[Build Vercel do merge aprovado](https://vercel.com/escritorio-jn/escritoriojn/53mqfrLwDJNxc9MS3M8Bu6NgKUwp), publicação confirmada pelo domínio https://escritoriojn.vercel.app/. **32 testes publicados passaram** após a correção, incluindo POST, rotas profundas, assets, comportamento de falha/repetição, callback inválido, proteção do painel e layout em quatro resoluções. /api/auth/context retorna 401 AUTH_REQUIRED com request_id/no-store, inclusive com token inválido e query area=team. /api/modulo/nao-existe retorna 404 NOT_FOUND da aplicação, não 404 da plataforma. /api/health 200 JSON. Conferência adicional no browser: login equipe/cliente, recuperação e cadastro com submit habilitado, sem mensagem antiga e sem rolagem horizontal em 360px.

Confirmação de configuração pública: URL/chave do bundle correspondem ao projeto novo e Auth/settings retorna 200. A API com token inválido alcança a verificação de identidade e recusa 401, sem AUTH_NOT_CONFIGURED. Callback canônico com parâmetros permitido e token sintético recusado no provedor; isso valida o destino/erro, não comprova consumo de link real recebido. Site URL padrão ainda observado no alias https://escritoriojn-escritorio-jn.vercel.app/ às 00:35 UTC, alinhamento ao canônico solicitado ao usuário. Conector/logs/preview Vercel seguem 403; nenhuma mudança de proteção.

Usuário ainda não fez o teste funcional com senha válida/e-mail. Publicação técnica verificada não fecha essa conferência: testar proprietário em /login, sair e tentar /painel, solicitar recuperação pelo formulário e abrir no mesmo navegador. Não coletar senha/link no chat. Não iniciar 05 sem registrar resultado dessa conferência. Commit final é somente de continuidade documental; não reaplica migration nem altera o produto testado.

Atualização às 00:37 UTC: após usuário salvar Site URL, nova verificação no provedor confirmou retorno padrão **https://escritoriojn.vercel.app** e callback explícito **https://escritoriojn.vercel.app/auth/callback**, ambos 303/otp_expired para token sintético inválido. Alinhamento de URL resolvido. Permanece somente a conferência funcional do usuário com senha válida e recebimento externo, além da limitação de acesso do conector Vercel aos logs/preview (a publicação por Git está comprovada).
