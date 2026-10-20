# Comece aqui

Base nova do Escritório JN. Retome por `AGENTS.md`, `LIVRO_RAIZ.md` e o cartão da etapa solicitada em `docs/etapas/`.
O manual v4 do Drive define 40 etapas. A Etapa09 acrescenta catálogo versionado de serviços; não iniciar10 automaticamente nem importar estado do sistema anterior.

Execute `npm ci` e `npm run dev`. Abra `http://localhost:3000` e `/api/health`. Instruções completas em `README.md`.

Login/Auth, RLS, equipe, auditoria, clientes e vínculos já existem. `/servicos` exige capacidade atual; ficha de cliente não cria login. Confira provas e limites de publicação no Livro/fecho09.
Valide localmente com os scripts existentes. GitHub Actions permanece desativado; publicação pela integração GitHub→Vercel.
