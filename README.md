# Escritório JN

Base nova da **Etapa 01** do manual v4: React + Vite + TypeScript, API Express `/api` e tela inicial responsiva. O indicador de saúde consulta a API real. Não há login, dados de negócio ou banco conectado nesta etapa.

## Executar

Requisitos: Node **24.19.0** (`nvm use`) e npm **11.x**. As versões das dependências e o lockfile estão fixados.

```bash
npm ci
npm run dev
```

- Aplicação: http://localhost:3000
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

## Verificar

```bash
npm run typecheck
npm test
npx playwright install chromium
npm run test:e2e
```

Para Chromium já instalado: `PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH=/usr/bin/chromium npm run test:e2e`. Os testes usam porta 3000 e dados sintéticos sem banco. Falhas geram traces em `test-results/` (ignorado no Git).

## Organização e continuidade

- `src/features/home/`: consulta tipada e estado carregando/sucesso/erro com repetição.
- `server/app.ts`: health público e JSON 404 para `/api` desconhecida, sem dados sensíveis.
- `shared/api.ts`: contratos seguros; backend não é importado pelo frontend.
- `docs/etapas/`: cartões oficiais, plano e fecho com evidências.
- `AGENTS.md` e `LIVRO_RAIZ.md`: regras curtas e ponto exato de retomada.

O health mede disponibilidade do processo da API. Não comprova Supabase, autenticação ou prontidão de produção. Configuração de publicação/rotas da Vercel pertence à etapa 02; Supabase/banco/RLS à 03; login à 04. Não reutilizar credenciais ou IDs antigos por padrão e nunca colocar secret/service_role em `VITE_*`.

Veja `docs/FONTES.md`, `docs/PLUGINS.md` e `docs/etapas/fecho-01.md`. Próximo passo: **Etapa 02**, após o aceite da 01 e confirmação dos destinos externos.
