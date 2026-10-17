# Escritório JN

Base nova das **Etapas 01 e 02** do manual v4: React + Vite + TypeScript, API Express `/api` e telas públicas responsivas. O indicador de saúde em `/status` consulta a API real. Não há login, dados de negócio ou banco conectado nesta etapa.

## Executar

Requisitos: Node **24.19.0** (`nvm use`) e npm **11.x**. As versões das dependências e o lockfile estão fixados.

```bash
npm ci
npm run dev
```

- Aplicação: http://localhost:3000
- Status da API na interface: http://localhost:3000/status
- Health: http://localhost:3000/api/health
- Resposta: `{"data":{"status":"ok","service":"escritorio-jn-api"}}`

Funciona sem `.env` e sem credenciais externas. A porta deve estar livre; o comando falha sem selecionar outra porta silenciosamente. Se aparecer `vite: not found` ou `ERR_MODULE_NOT_FOUND`, execute `npm ci` na raiz. Para `EBADENGINE`, use a versão indicada em `.nvmrc`.

## Build e preview local

```bash
npm run build
npm run preview
```

Abra http://localhost:4173 e http://localhost:4173/api/health. O mesmo Express é montado antes do fallback da SPA em dev e preview. `dist/` contém o frontend e `dist-server/` a API compilada. `npm run preview` é uma conferência local, não um deploy Vercel.

Para executar somente a API compilada:

```bash
npm start
# http://127.0.0.1:3001/api/health
```

`HOST` e `PORT` são opcionais nesse comando. `.env.example` documenta os nomes; nenhum carregador de `.env` é necessário. Exemplo: `PORT=3002 npm start`. O servidor isolado não serve o frontend.

## Telas e Vercel

As rotas `/`, `/login`, `/login-cliente` e `/recuperar-senha?area=client` seguem a composição pública de https://escritoriojnsite.vercel.app/. A imagem visual foi obtida da própria referência e é servida localmente. As telas internas autenticadas não foram acessadas ou copiadas.

Os formulários de acesso são visuais e explicitamente desativados nesta base; não enviam senhas ou e-mails. Login real pertence à etapa 04, após banco/RLS da 03. Há navegação React sem recarga, carregamento por tela e uma página para URLs desconhecidas.

`vercel.json` fixa Vite, `npm ci`, build e `dist`. `api/index.ts` e `api/[...path].ts` exportam o mesmo Express. O fallback da SPA exclui `/api` e `/assets`. POST `/api/validate` verifica `{ "message": "texto de 1 a 120 caracteres" }` sem persistir ou refletir o conteúdo; erros de tipo/JSON/tamanho/rota retornam JSON seguro.

Reprodução do manifest Git antigo `87d4321`: `esbuild ^0.25` conflita com o Vite atual. A base atual remove a dependência direta desnecessária e usa lockfile; não é necessário `--force` ou `--legacy-peer-deps`.

## Verificar

```bash
npm run typecheck
npm test
npx playwright install chromium
npm run test:e2e
```

Para Chromium já instalado: `PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH=/usr/bin/chromium npm run test:e2e`. Os testes usam porta 3000 e dados sintéticos sem banco. Falhas geram traces em `test-results/` (ignorado no Git).

Para executar contra um deploy autorizado: `E2E_BASE_URL=https://url-observada-do-deploy npm run test:e2e`. Essa variável elimina a necessidade de servidor local; não incluir barra final. Não usar os testes contra o sistema antigo de referência.

## Organização e continuidade

- `src/features/home/`: consulta tipada e estado carregando/sucesso/erro com repetição.
- `server/app.ts`: health público e JSON 404 para `/api` desconhecida, sem dados sensíveis.
- `shared/api.ts`: contratos seguros; backend não é importado pelo frontend.
- `docs/etapas/`: cartões oficiais, plano e fecho com evidências.
- `AGENTS.md` e `LIVRO_RAIZ.md`: regras curtas e ponto exato de retomada.

O health mede disponibilidade do processo da API. Não comprova Supabase, autenticação ou prontidão de produção. Configuração de publicação/rotas da Vercel pertence à etapa 02; Supabase/banco/RLS à 03; login à 04. Não reutilizar credenciais ou IDs antigos por padrão e nunca colocar secret/service_role em `VITE_*`.

Veja `docs/FONTES.md`, `docs/PLUGINS.md` e `LIVRO_RAIZ.md` para o checkpoint verificado e as limitações de publicação técnica.
