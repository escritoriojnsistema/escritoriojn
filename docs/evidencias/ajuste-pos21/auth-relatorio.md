# Compatibilidade de acesso — 27/10/2026

`src/main.tsx` instala `src/lib/browserCompatibility.ts` antes da aplicação. A camada fornece somente APIs ausentes: `AbortSignal.any`, `AbortSignal.timeout`, `AbortSignal.prototype.throwIfAborted` e `crypto.randomUUID`. APIs nativas permanecem intactas. UUID usa exclusivamente `crypto.getRandomValues`, com versão 4/variante RFC; indisponibilidade da fonte segura não recebe substituto fraco.

Cancelamento composto conserva o primeiro motivo, inclusive `null`, sinais previamente cancelados e prazo com `TimeoutError`; listeners dos demais sinais são removidos ao cancelar. Validação de identidade, contexto, permissões, encerramento e armazenamento de sessão não foram alterados. Não há cache de autoridade permissivo nem reescrita dos consumidores existentes.

| Verificação executada | Resultado |
| --- | --- |
| Reprodução anterior: `npm run test:auth -- tests/auth/device-access.spec.ts` | RED: 1 passou/2 falharam sem APIs recentes |
| `node --import tsx --test tests/browser-compatibility.test.ts` antes da implementação | RED: 3 passaram/7 falharam |
| Mesmo comando após implementação | GREEN: 10/10 |
| `npm test` | 219/219, incluindo os 10 de compatibilidade; execução anterior à integração dos demais ajustes pós21 |
| `npm run test:auth -- tests/auth/device-access.spec.ts` após correção, antes de ampliar o arquivo | 3/3 |
| `npm run typecheck` | código 0 |
| `npm run build` | código 0; frontend e TypeScript do servidor |
| `git diff --check` | código 0 |

O lote final foi executado na cópia estável `/workspace/scratch/ajuste-pos21/release-a`, correspondente ao commit `befc5df`, sem editar suas fontes:

```sh
npm run test:auth -- tests/auth/device-access.spec.ts tests/auth/session.spec.ts tests/auth/session-tabs.spec.ts tests/auth/token-renewal.spec.ts tests/auth/operation.spec.ts
```

**41/41 passaram, processo encerrado com código 0.** O lote inclui os cinco casos atuais de dispositivos: sessões independentes, login sem `any`, cliente sem as quatro APIs e bloqueio por 401 sem APIs recentes para equipe/cliente. Inclui ainda portais incorretos, adoção abandonada, encerramento entre abas, falhas de logout, novas sessões concorrentes e renovação legítima após 401 de token anterior. A verificação posterior do laboratório confirmou preservação das invariantes de snapshots/direitos revogados quando aplicável.

Tentativas anteriores preservadas no diagnóstico: o mesmo lote no workspace em edição teve 40 aprovados/1 falha no login inicial do teste `session.spec.ts:25` para manager (`.operation-role` ausente; chamada em `session.spec.ts:26`, antes da simulação de 401). Essa falha não se repetiu na cópia estável: o caso passou em 2,7s. A primeira inicialização da cópia estável terminou por timeout do laboratório antes de executar qualquer teste; a repetição idêntica produziu os 41 aprovados. Não houve alteração de prazos ou autoridade para obter a aprovação. Os workers emitiram somente o aviso de ambiente `NO_COLOR`/`FORCE_COLOR`.

Logs locais: `/workspace/scratch/ajuste-pos21/auth-device-red.log`, `auth-unit-red.log`, `auth-node-green.log`, `auth-device-green.log`, `auth-regressions-green.log`, `auth-release-a-green.log`, `auth-release-a-retry.log` e `auth-build-green.log`, todos sob a mesma pasta.

Validação frontend → API → Auth/PostgREST/banco em laboratório descartável real, com fixtures somente locais. Ausência das APIs simulada em Chromium; aparelhos físicos e login autenticado hospedado não foram exercitados. Nenhuma alteração hospedada, commit ou publicação foi executada por este subtrabalho. A continuidade geral no Livro fica a cargo do coordenador, pois o escopo deste subtrabalho foi restrito aos arquivos de compatibilidade e testes.
