# Etapa 02 — correção Vercel e telas públicas

**Projeto:** Escritório JN. **Data:** 17/10/2026. **Status: APROVÁVEL tecnicamente.**

Endereço canônico: **https://escritoriojn.vercel.app/**. Status da API na interface: `/status`; health real: `/api/health`.

## Resultado e evidências

- Corrigida a entrega Git da base 01 e adicionada a 02 mantendo React + Vite + TypeScript e Express. Manifest antigo 87d4321 reproduziu ERESOLVE esbuild ^0.25 versus peer do Vite; versões/lockfile atuais e npm ci reproduzem a instalação.
- Entrada, equipe, cliente e recuperação seguem a referência pública indicada pelo usuário, com foto servida localmente, navegação SPA e lazy/PageLoading. Sem copiar aplicação Next, banco ou contas antigas. Formulários visuais explicitamente desativados; login real continua na 04.
- Mesma API em dev, preview e Function. POST `/api/validate` sem persistência; JSON seguro para validação/parse/tamanho/rota; API e assets não recebem o fallback SPA.
- Instalação limpa, typecheck, **5 testes Node**, build frontend/backend, audit (zero vulnerabilidades) e diff check passaram. **23 E2E locais**, **5 regressões em preview compilado** e **23 E2E no endereço público** passaram; a rodada pública levou 42,9s.
- Regressões cobrem saúde real, erro/repetição/timeout/offline, contrato inválido, transporte POST/404, rotas profundas/back/forward, aliases com barra final/caixa diferente e telas em 320/360/768/1440. Teclado e CSS zoom 200% conferidos separadamente; não se alega auditoria WCAG integral.
- Revisão independente identificou dois P2 (assets ausentes como HTML200 e variante errada por pathname literal). Corrigidos com testes inicialmente reprovados e depois aprovados. Nenhum P0/P1 identificado.

## Git, CI e hospedagem

- [PR 1](https://github.com/escritoriojnsistema/escritoriojn/pull/1), código `38acb25`, merge `d01702e` em main após [CI SUCCESS](https://github.com/escritoriojnsistema/escritoriojn/actions/runs/39048398539).
- Preview Git `dpl_44bsxu1aY5J99QgBzcNTWMzaNSgo`: READY. HTTP do preview protegido não pôde ser conferido por 403 do conector; a proteção foi preservada.
- Publicação Git de main `dpl_GwRVthDR31ffvwawBdyqZNvvqLNr`: READY, versão `d01702e`. O alias público canônico foi confirmado por metadados e por navegador/API reais; aliases de equipe/Git permanecem protegidos.
- Logs detalhados recusados com 403 e sem credencial Vercel CLI no ambiente. Isso limita a inspeção interna dos logs, sem invalidar as verificações HTTP/E2E executadas no endereço público.
- A alteração posterior de Livro/configuração do runner usa o mesmo código de aplicação; o commit funcional e a primeira versão READY permanecem registrados acima.

## Dados, riscos e retomada

Supabase/banco: **não se aplica** à 02; nenhum SQL, migration, seed, usuário ou segredo copiado. Integração Supabase Preview do GitHub marcou SKIPPED. O sistema de referência antigo permaneceu somente leitura.

Publicação técnica do projeto novo a pedido do usuário, sem contratação, upgrade, autenticação operacional ou piloto comercial. A elegibilidade do plano e homologação completa pertencem à 39. Para investigação de logs/previews, autorizar o projeto/time corretos na conexão Vercel; não desligar proteção global.

Rollback de alterações futuras: preservar como ponto conhecido o deploy READY `dpl_GwRVthDR31ffvwawBdyqZNvvqLNr` e o código `d01702e`; preparar reversão Git revisável. Não retornar automaticamente ao manifest 87d4321 que falhava. Sem rollback de banco nesta etapa.

Próxima etapa oficial: **03**, apenas quando solicitada. Ler AGENTS, Livro, este fecho e cartão 03.

Refinamento posterior da mesma etapa: ver `refino-02-compactacao.md` para a preferência de tela única, medições antes/depois e conferência somente leitura das contas existentes.
