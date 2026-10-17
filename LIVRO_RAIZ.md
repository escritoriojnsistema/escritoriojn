# Livro Raiz — Escritório JN

- **Atual:** Etapa 02 — correção Vercel e telas públicas responsivas solicitadas pelo usuário; validação local concluindo, entrega Git/preview em andamento. Etapa 01 preservada no commit 9fab3ae.
- **Base:** `/workspace/escritoriojn-etapa-01`, branch `fix/etapa-02-vercel-responsivo`, origem `escritoriojnsistema/escritoriojn`, base anterior 9fab3ae.
- **Stack:** React + Vite + TypeScript; API Express `/api`; Supabase previsto, sem conexão nesta etapa.
- **Fonte:** manual v4 e cartão 01 no Drive; ver `docs/FONTES.md`.
- **Diagnóstico:** template React existente, sem API/lockfile/README/Livro; três testes utilitários passaram via `node --test`, mas `npm test` não existia.
- **Escopo:** saúde real da API e tela responsiva; sem login, dados jurídicos, tabelas ou integração paga.
- **Destinos:** metadados Vercel confirmam vínculo entre projeto novo `escritoriojn` e GitHub `escritoriojnsistema/escritoriojn`. Pedido atual para corrigir esse deploy autoriza sua reparação técnica; preservar `escritoriojnsite.vercel.app` como referência somente leitura. Supabase permanece sem mutação.
- **Lacuna documental:** COMECE_AQUI/AGENTS/Livro originais do pacote não encontrados; versões curtas criadas a partir do manual, sem inventar histórico.
- **Implementado:** health Express real em dev/preview e API compilada; frontend responsivo com carregamento, erro, timeout e repetição; contratos tipados; lockfile/Node fixos; CI de qualidade preparado.
- **Verificações reais:** npm ci, typecheck, 4 testes Node, 10 E2E Chromium, build frontend/backend e HTTP dev/preview/API compilada passaram; npm audit reportou zero vulnerabilidades. Fecho em `docs/etapas/fecho-01.md`.
- **Revisão independente:** somente leitura por outro agente, sem achados P0/P1/P2/P3; não substitui execução remota do CI.
- **Banco/login:** não se aplica à 01; Supabase/RLS na 03 e login real na 04. Não foram criadas tabelas, credenciais ou contas.
- **Diagnóstico Vercel:** deploys Git do commit 87d4321 falham em npm install. Reprodução isolada confirma ERESOLVE esbuild ^0.25 versus peer do Vite 8.3.4; base atual remove dependência direta e usa npm ci. Logs detalhados remotos recusados com 403; não afirmar linha remota não lida.
- **Implementado na 02:** entrada e telas cliente/equipe/recuperação conforme referência pública, router/lazy/PageLoading, /status com health real, Function Express, POST de validação sem persistência e fallback SPA que exclui API/assets. Auth visual desativado explicitamente até 04.
- **Revisão 02:** dois P2 encontrados (assets inexistentes retornavam HTML e aliases de rota exibiam variante errada); correções com testes RED→GREEN em conferência. Sem P0/P1 identificado.
- **Próximo checkpoint:** comprovar Git/CI/preview e alias do projeto novo; registrar URL/commit/status reais. Etapa 03 não iniciada.
- **Retomada mínima:** AGENTS, este Livro, docs/etapas/plano-02.md e cartão 02; depois cartão 03 apenas quando solicitado.
