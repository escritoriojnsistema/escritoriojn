# Etapa 04 — checkpoint de autenticação

**Estado: código implementado e banco aplicado; etapa ainda bloqueada para aceite publicado.** React + Vite preservado. Não avançar à 05 antes da configuração e prova publicadas.

## Entregue

- SDK público único com PKCE/refresh oficial; API Express valida identidade por getUser e contexto comercial vigente. Sem service_role no produto, cookie de autenticação próprio, MFA ou dados de senha no banco da aplicação.
- Login/logout, painel mínimo equipe/cliente, sessão expirada, falta de acesso e indisponibilidade com repetição. Cadastro exclusivamente cliente, confirmação de e-mail, callback seguro e recuperação/nova senha, inclusive após recarregar. Nenhuma funcionalidade futura foi simulada.
- Layout navy/claro/dourado reutilizado; conteúdo padrão cabe nos tamanhos320×568,360×640,768×1024 e1440×900. Controles44px e inputs mobile 16px; conteúdo ampliado pode rolar naturalmente.
- Migration `20261017225649_auth_sessions_client_registration.sql` aplicada no projeto novo. Helper exige sessão Auth vigente, RPC própria invoker, configuração de cadastro privada, trigger cliente/auditoria transacional. Metadata não concede papel/unidade. Desabilitar cadastro impede vínculo/acesso, mas Auth ainda pode conter identidade sem vínculo.
- Pós-migration:4 contas Auth,1 perfil,1 vínculo preservados; cadastro aponta única unidade ativa. API não lê auth.sessions nem executa configuração; anônimo não executa RPC. Não alteradas senhas, metadata, SMTP/templates ou vínculos das contas existentes. Administrador/funcionário/cliente preexistentes continuam sem vínculo até administração autorizada.

## Evidência e limites

- `npm run test:e2e`:30 testes públicos passaram, incluindo compactação em quatro resoluções e rolagem natural de conteúdo ampliado.
- `npm run typecheck`, `npm test` e `npm run build` passaram; auditoria de dependências de produção:0 vulnerabilidades.
- `npm run test:db`:78 verificações em dois replays vazios; migrador sem superusuário/BYPASSRLS. Sessão revogada/expirada, RLS A/B, inatividade, metadata, cadastro cliente, confirmação e ACLs.
- `npm run test:auth`:9 testes passaram, com login real pelo navegador→API→GoTrue/PostgREST→RLS, senha incorreta, contexto próprio A/B com JWTs reais, falta de vínculo/inatividade, logout bloqueando JWT antigo, signup forjado ainda cliente, confirmação SMTP local, recuperação PKCE/reload/nova senha, link reutilizado, expiração realmente recusada pelo provedor e callback inválido. Também regressão de eventos SDK com token inalterado e mensagens de sessão/API. Falha SMTP 500 é teste de contrato interceptado, não falha externa provocada.
- Laboratório descartável usa PostgreSQL 17 + imagens oficiais GoTrue/PostgREST/Mailpit. Portas somente 127.0.0.1, senhas/chaves fictícias aleatórias em memória, limpeza dos recursos próprios. GoTrue habilita RLS no schema Auth; policies SELECT somente ao migrador local simulam o acesso mínimo de leitura do operador/helper sem BYPASSRLS. No hospedado, postgres tem BYPASSRLS (não superuser); roles da API continuam sem acesso direto às sessões. Não usar esse laboratório como aplicação ou prova de SMTP externo.
- Revisão independente encontrou/corrigiu atualização de sessão, recarga de recuperação e retorno da equipe. Expiração exige prova do redirect otp_expired antes da tela; não depende de faltar verifier no browser.
- CI inclui qualidade/build/E2E público, replay SQL e Auth real em job separado. Resultado/PR/preview registrados ao concluir a execução remota.

Advisors após aplicação: nenhum WARN de segurança de banco ou desempenho. INFO de RLS sem policy na tabela privada de configuração é intencional (API sem GRANT, operador/helper apenas); [referência do linter](https://supabase.com/docs/guides/database/database-linter?lint=0008_rls_enabled_no_policy). INFO de índices sem uso mantidos por finalidade em base nova. WARN Auth pré-existente listado abaixo.

## Bloqueios publicados

1. Vercel recusou acesso às variáveis por 403/escopo do conector. Necessárias `VITE_SUPABASE_URL` e `VITE_SUPABASE_PUBLISHABLE_KEY` em build e runtime, iguais para frontend/API. Chave publicável apenas, nunca secret/service_role. Não inserir senha SMTP no app. Reconexão/configuração solicitada ao usuário; não contornar proteção.
2. Conector Supabase não expõe Site URL/allowlist. Usuário precisa confirmar canonical `https://escritoriojn.vercel.app` e callbacks permitidos com query da PKCE/área; configuração do preview também precisa seu próprio destino autorizado. Ver roteiro de configuração 04.
3. Entrega de recuperação/confirmação pelo SMTP externo não foi testada. Prova atual é somente Mailpit. Não usar contas reais ou suas senhas em testes automatizados; homologar com conta fictícia autorizada.
4. Aviso Auth pré-existente: [proteção contra senhas vazadas desativada](https://supabase.com/docs/guides/auth/password-security#password-strength-and-leaked-password-protection). Não ativar plano/custo/MFA automaticamente.

## Retomada

Resolver conexão/env/URLs, gerar preview com configuração correta, testar callback e SMTP no ambiente autorizado, conferir CI e então liberar publicação técnica pelo fluxo Git existente. Atualizar Livro/fecho com as provas. Sem DROP/reset, fixtures hospedadas, rebootstrap do proprietário ou cópia de dados do sistema anterior. Reverter código mantém a fundação; para suspender novos vínculos, operador pode desabilitar configuração existente, preservando auditoria.
