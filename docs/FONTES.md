# Fontes da etapa 01 — 17/10/2026

- [Pasta ESCRITÓRIO JN no Drive](https://drive.google.com/drive/folders/1pE86dlRijaxJSm4R_2PoLTivcm-FKImf).
- [Cartão etapa 01](https://drive.google.com/file/d/1Z1Y-vm5Hdw_JkSpQ91NUiia2YlGBSFxq/view): copiado para `etapas/etapa-01.md` sem alteração de requisitos.
- [Prompt inicial v4](https://drive.google.com/file/d/12UloZJFeT3owARHJpLVx1hs5BxJZ0p4j/view): implementar somente a base, concluir parte independente e registrar bloqueios exatos.
- [Manual v4](https://drive.google.com/file/d/1PjG_-IkoUxLFxejjoU1mYZhB5X_GxW96/view): usado para recuperar a seção Comece aqui; o fetch do PDF devolveu o texto completo, mas as etapas posteriores não foram implementadas.
- [Arquitetura](https://drive.google.com/file/d/1s6eynKIg9n4iRqkc8cOMA9o3VtJDsb3y/view) e [operação](https://drive.google.com/file/d/1WuCFqJSFGkA3RYArqeCt13ZRIsPEJT3d/view): cópias locais em `ARQUITETURA.md` e `regras/operacao.md`.
- [Etapa 02](https://drive.google.com/file/d/1s4q1VjYmFIY8iZWixurKPmdj-0at0dYn/view): apenas fronteira e próximo checkpoint, não iniciada.
- Documentação oficial Vite consultada via Context7: [configureServer/configurePreviewServer](https://vite.dev/guide/api-plugin.html).

O repositório acessível `escritoriojnsistema/escritoriojn` contém uma base React criada em 16/10/2026; o manual identifica o sistema anterior como `escritoriojnsite/escritoriojnsite`. Nenhum código ou estado do sistema anterior foi copiado.

Os arquivos COMECE_AQUI/AGENTS/LIVRO_RAIZ originais citados pelo pacote não foram localizados nos arquivos acessíveis do Drive nem na árvore do repositório. Foram criadas versões curtas novas com essa limitação explícita. Não foram herdadas conclusões de implementação do sistema anterior.

## Referência visual e deploy da etapa 02

- Usuário indicou https://escritoriojnsite.vercel.app/ como referência. Entrada, `/login`, `/login-cliente` e `/recuperar-senha?area=client` observados anonimamente em desktop/mobile; nenhum dado autenticado acessado.
- Foto pública da própria referência, obtida pelo endpoint de otimização `_next/image` com largura 1920 e formato WebP (80.344 bytes), salva em `public/images/recepcao-jn.webp`. Apenas o asset visual foi reutilizado; nenhuma conta, ID de banco ou estado da aplicação antiga foi copiado.
- [Vercel Express](https://vercel.com/docs/frameworks/backend/express) e [Vite na Vercel](https://vercel.com/docs/frameworks/frontend/vite) consultados para a integração. A documentação oficial atual admite exportar Express; trechos genéricos de habilidades que recomendam substituir Express/React por Next não se aplicam à stack fixa deste projeto.
- Vercel novo: projeto `prj_PSltYIXuu3V50lKKVKhFwINMODBq`, escopo `escritorio-jn`, Git `escritoriojnsistema/escritoriojn`. A referência antiga não é destino de publicação.

## Etapa 03

- [Cartão 03](https://drive.google.com/file/d/1QLuUAdrEM7vxn84nZ2Qgdy6ZuxVJPo0d/view) e [regras de acesso](https://drive.google.com/file/d/1xn4cMTGlCneQODBBeZQq3k9pss-MFjM3/view): cópias em `etapas/etapa-03.md` e `regras/acesso.md`.
- [Changelog Supabase](https://supabase.com/changelog.md) consultado em 17/10/2026; aviso TLS de 10/11/2026 não exige mudança do SQL da fundação. Documentação de [RLS](https://supabase.com/docs/guides/database/postgres/row-level-security), incluindo schemas privados e EXECUTE, consultada pelo conector oficial.

## Etapa 04

- [Cartão 04](https://drive.google.com/file/d/1B3H-aL9nn1e0pmWUpbuUA_ktFomxvChP/view), copiado em etapas/etapa-04.md. Regras de acesso vigentes preservadas.
- Documentação Supabase consultada via conector oficial: [getUser](https://supabase.com/docs/reference/javascript/auth-getuser), [PKCE](https://supabase.com/docs/guides/auth/sessions/pkce-flow), [exchangeCodeForSession](https://supabase.com/docs/reference/javascript/auth-exchangecodeforsession), [resetPasswordForEmail](https://supabase.com/docs/reference/javascript/auth-resetpasswordforemail), [sessões](https://supabase.com/docs/guides/auth/sessions), [URLs](https://supabase.com/docs/guides/auth/redirect-urls) e [custom SMTP](https://supabase.com/docs/guides/auth/auth-smtp). Versão SDK fixada 2.118.0, CLI 2.121.0. Assinaturas/fluxo de PASSWORD_RECOVERY também conferidos no código instalado.
- Ambiente oficial reduzido GoTrue 2.197.0/PostgREST 16.4/Mailpit 1.31.3/PostgreSQL 17, imagens fixadas por digest. Projeto local é somente laboratório descartável. Não comprova a entrega SMTP externa.

## Etapa05 — 18/10/2026

- [Cartão05](https://drive.google.com/file/d/1X-pGsosU6kb6DmQIo4oQ_ZoI1XIcojcd/view), cópia exata em etapas/etapa-05.md. [Cartão06](https://drive.google.com/file/d/1BCd1j9trg6XO7oDnhxfSnmBjFkIVWyk2/view) lido somente como fronteira: painel de auditoria/arquivamento não antecipado. Manual v4 e regras vigentes relidos nos tópicos afetados.
- Documentação Supabase: [headers de autenticação Edge](https://supabase.com/docs/guides/functions/auth-headers), [inviteUserByEmail](https://supabase.com/docs/reference/javascript/auth-admin-inviteuserbyemail), [setSession](https://supabase.com/docs/reference/javascript/auth-setsession) e SMTP/URLs já referenciados. SDK fixado2.118.0: admininvite não suporta PKCE; callback implicit limitado ao convite, enquanto recuperação atual permanece PKCE. JWT da plataforma mantido ligado conforme documentação atual, além do getUser/RPC no handler.
- Causa da senha temporária confirmada no [GoTrue2.197.0 signupVerify](https://github.com/supabase/auth/blob/v2.197.0/internal/api/verify.go#L313): senha vazia e invited_at preenchido geram credencial temporária durante confirmação. Prova real do laboratório reproduziu o comportamento e orientou a conferência de alteração posterior à identidade.
- Inventário por Plugin Management confirmou Drive, Supabase, GitHub e Vercel instalados; catálogo da sessão inclui as17 habilidades do projeto. Recursos acionados por finalidade, sem instalar serviço novo ou transmitir dados a plugins não pertinentes.

## Etapa06

- [Cartão06 oficial](https://drive.google.com/file/d/1BCd1j9trg6XO7oDnhxfSnmBjFkIVWyk2/view) obtido no Drive e copiado em etapas/etapa-06.md; manual v4 consultado nos tópicos auditoria, Arquivados, titular e retenção. Modelo técnico em privacidade/governanca-06.md não atribui prazos ou bases jurídicas.
- [SignOut](https://supabase.com/docs/reference/javascript/auth-signout), getUser, setSession e SDK2.118.0 instalados conferidos: setSession não aceita AbortSignal, SupportedStorage é extensão pública; guard é avaliado antes da gravação. Changelog consultado em18/10; TLS de10/11 já documentado na03, stack atual Node24/Chromium e serviço hospedado preservados. CLI2.121.0 gerou migration audit_privacy_archives.
