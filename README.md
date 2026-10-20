# Escritório JN

Base nova das **Etapas 01–10** do manual v4: React + Vite + TypeScript, API Express `/api`, Supabase Auth/RLS, equipe, governança, clientes/vínculos, catálogo versionado e atendimentos. O checkpoint de testes/publicação está em [LIVRO_RAIZ.md](LIVRO_RAIZ.md).

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

As telas públicas e health funcionam sem `.env`. Login e gestão exigem `VITE_SUPABASE_URL` e `VITE_SUPABASE_PUBLISHABLE_KEY` do projeto autorizado. Nunca usar chave privilegiada nessas variáveis. A porta deve estar livre; o comando não seleciona outra silenciosamente. Para dependências ausentes, execute `npm ci`; para `EBADENGINE`, use `.nvmrc`.

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

Login, logout, cadastro mínimo de cliente e recuperação usam o SDK oficial Supabase. `/equipe` exige `users.manage`; `/convite?id=<uuid>` exige o destinatário autenticado e conferência no servidor. Nenhum cadastro público escolhe papel da equipe. Identidade e autorização atual continuam obrigatórias mesmo com menu ou sessão já abertos.

O conteúdo padrão das cinco telas foi compactado para caber em 320×568, 360×640, 768×1024 e 1440×900. Mensagens longas, zoom e janelas mais baixas podem usar rolagem natural, preservando os controles. Veja `docs/etapas/refino-02-compactacao.md` para medições e limites.

`vercel.json` fixa Vite, `npm ci`, build e `dist`. A Function única `api/index.ts` recebe `/api` antes do fallback SPA; rotas aninhadas chegam ao Express. POST `/api/validate` valida sem persistir. `/api/auth` e `/api/team` usam Bearer, identidade verificada e RPCs com autorização atual. Erros retornam JSON seguro com `request_id`.

Reprodução do manifest Git antigo `87d4321`: `esbuild ^0.25` conflita com o Vite atual. A base atual remove a dependência direta desnecessária e usa lockfile; não é necessário `--force` ou `--legacy-peer-deps`.

## Verificar

```bash
npm run typecheck
npm test
npx playwright install chromium
npm run test:e2e
npm run test:team-ui
npm run test:db
npm run test:auth
```

Para Chromium já instalado: `PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH=/usr/bin/chromium npm run test:e2e`. Os testes usam porta 3000 e dados sintéticos sem banco. Falhas geram traces em `test-results/` (ignorado no Git).

Para executar contra um deploy autorizado: `E2E_BASE_URL=https://url-observada-do-deploy npm run test:e2e`. Essa variável elimina a necessidade de servidor local; não incluir barra final. Não usar os testes contra o sistema antigo de referência.

Banco e Auth requerem Docker Linux: dois replays com migrador sem superusuário/BYPASSRLS, concorrência real e laboratório GoTrue/PostgREST/Mailpit. Não aceitam banco remoto nem usam contas reais. `test:team-ui` sobe Vite3015 com conexão pública fictícia e interceptações explícitas; testa apresentação, não SMTP/banco. Execute as suítes de navegador sequencialmente. Resultados e limites em [fecho-05](docs/etapas/fecho-05.md) e [Supabase](supabase/README.md).

## Organização e continuidade

- `src/features/home/`: consulta tipada e estado carregando/sucesso/erro com repetição.
- `server/app.ts`: health público e JSON 404 para `/api` desconhecida, sem dados sensíveis.
- `shared/api.ts`: contratos seguros; backend não é importado pelo frontend.
- `supabase/migrations/`: fundação de acesso, seed mínimo e RPC com autorização atual; `tests/database/` contém apenas fixtures isoladas.
- `docs/etapas/`: cartões oficiais, plano e fecho com evidências.
- `AGENTS.md` e `LIVRO_RAIZ.md`: regras curtas e ponto exato de retomada.

O health mede disponibilidade do processo da API. Não comprova Supabase, autenticação ou prontidão de produção. Configuração de publicação/rotas da Vercel pertence à etapa 02; Supabase/banco/RLS à 03; login à 04. Não reutilizar credenciais ou IDs antigos por padrão e nunca colocar secret/service_role em `VITE_*`.

Veja `docs/FONTES.md`, `docs/PLUGINS.md` e `LIVRO_RAIZ.md` para o checkpoint verificado e as limitações de publicação técnica.

Etapa06: Auditoria e Arquivados com permissões por escritório, exportação registrada e restauração sem reativar acesso; portais de equipe/cliente separados. Documentação e evidências em [fecho06](docs/etapas/fecho-06.md) e [Livro Raiz](LIVRO_RAIZ.md). React+Vite/Express/Supabase preservados.

Etapa07: `/clientes` cadastra, consulta e edita fichas separadas de contas Auth. CPF/CNPJ e contatos são opcionais; busca POST paginada retorna máscara e respeita escritório/capacidades. Sem `customers.read_all`, a consulta é limitada ao criador até os vínculos da08. Convites de qualquer função reutilizam a máscara automática e validação de CPF. Mobile mantém até quatro atalhos autorizados; demais destinos ficam no menu lateral. Ações mantêm rótulos estáveis durante execução, sem indicadores visuais de carregamento. [Plano07](docs/etapas/plano-07.md).

Etapa10: `/solicitacoes` abre atendimentos presenciais/WhatsApp, preserva versão/preço do serviço e acompanha responsável, notas e histórico. `requests.read` é obrigatório; sem `requests.read_all`, somente criados/atribuídos. `/minhas-solicitacoes` permite ao cliente confirmado abrir mensagem própria para triagem antes da conferência de acervo. A resposta pública exclui equipe/notas/preços/fichas. Classificação interna valida pessoa, participantes, campos e checklist. Conclusão não significa quitação; cancelamento conserva registros e exige conferência manual dos efeitos externos. [Contrato10](docs/etapas/etapa-10.md).
