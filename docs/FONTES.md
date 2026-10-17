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
