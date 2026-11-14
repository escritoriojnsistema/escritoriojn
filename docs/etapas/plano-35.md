# Etapa 35 — aplicativo instalável

Base conferida: main `e71b477`, Etapa34 e correções de anexos/rodapé publicadas. Fonte: [manual35 no Drive](https://drive.google.com/file/d/1fPB2HYtzUP4ksOL01-i3bjXSe4anfEo0/view), AGENTS, Livro e portal-pwa. Pedido14/11/2026 autoriza implementar todas as camadas e publicar exclusivamente GitHub→Vercel, sem Actions.

Objetivo: instalação PWA com identidade JN, instruções Android/Chrome e iPhone/Safari, shell público offline, sem operação offline nem cache privado. Reusar React/Vite, Express, sessão/portais e padrão Equipe/Convites. Não há mudança de schema, Auth, Storage, grants ou dependências. Supabase conferido:79 migrations, última20261113140739.

Abordagem: service worker próprio, allowlist exata somente da página pública offline e ícones. Navegações usam rede e fallback somente se a rede falhar; API, Auth, Storage, PDFs, relatórios e bundles da aplicação não são cacheados pelo worker. Não haverá skipWaiting, claim ou reload automático: versão nova só assume após fechar as abas, preservando comandos/arquivos em memória e guardas existentes. Hash do build versiona cache; ativação remove apenas caches JN antigos. Workbox/cache de app autenticado acrescentariam superfície desnecessária a este escopo.

## Tarefas e verificação

- [x] 1. Testes RED→GREEN em `tests/pwa35.test.ts`: instalação/cache exatos, falhas HTTP, tráfego privado sem interceptação, navegação sem rede e atualização sem ativação forçada; manifesto e PNGs. Implementar `public/sw.js`, `public/offline.html`, `public/manifest.webmanifest`, `public/icons/*`, versionamento em `vite.config.ts` e metadados em `index.html`.
- [x] 2. Instruções públicas em `/instalar` (`src/features/pwa/InstallPage.tsx`), atalho no menu compartilhado e registro silencioso em produção (`src/features/pwa/register.ts`, `src/main.tsx`). Usar estilo/padrão público atual, sem banner/loader. Instruções explicam fechar abas somente após concluir operações; sem botão que recarregue operações.
- [x] 3. Barra inferior: equipe autorizada Caixa/Solicitações/Clientes + Ajustes; fallback sem ampliar acesso. Portal conserva atalhos próprios. Testar perfis, permissões por escritório e largura320–1440. Preservar busy, seleção exata de portal, anexos e leitura34.
- [x] 4. Browser real contra build de produção: manifesto/registro, instalação simulada e orientações iOS, offline/reabertura/retorno, cache sem bytes privados, atualização aguardando abas. Rodar Node completo, tipos/build, regressões de navegação/portal/loading/34/anexos e revisar diff. Screenshots Desktop/Mobile.
- [ ] 5. GitHub PR→Vercel preview/produção, conferir HTTPS/MIME/no-store/rotas e APIs401; nenhuma alteração direta Vercel. Supabase readback79/última preservados. Atualizar AGENTS/LIVRO/fecho com evidências e limites, sem declarar instalação física que não foi observada.

## Pontos de revisão

Cache não aceita query/redirect/erro; navegação não transforma API/PDF em HTML offline. Atualização não assume aba aberta. Links do menu obedecem busy. Safari sem prompt recebe instrução manual. Nenhum cargo ou soma entre escritórios cria atalho não autorizado. Instalação física Android/iPhone permanece conferência humana quando dispositivos não disponíveis.
