# Login com menos espera — implementação e verificação

Base `38f9c234f32895a65492785a2ac2005545bed432`, 28/10/2026. Escopo do subprojeto A de [login rápido](../../superpowers/specs/2026-10-28-login-rapido.md), executado conforme [plano](../../superpowers/plans/2026-10-28-login-rapido.md). Sem commit, deploy, mudança hospedada, conta pessoal ou fixture em produção por este subtrabalho. A publicação/revisão do conjunto ficam a cargo do coordenador.

## Mudança

O login normal consulta `my_access_context` diretamente pelo cliente Supabase temporário que acabou de autenticar. Isso remove a passagem pelo Express/Vercel e a verificação de identidade duplicada feita nessa passagem. A adoção continua depois da autorização do portal, pelo `supabase.auth.setSession` oficial; o SDK consulta `/auth/v1/user` antes de salvar/notificar a sessão. Não há método privado, resposta Auth fabricada, cache de getUser, permissão por metadata nem novo cache de autoridade.

`shared/access.ts` projeta somente os seis campos públicos, copiando permissões. Valida todas as linhas e seus UIDs antes de filtrar portal/escritório/foundation.access, conserva o limite de100 e distingue forma inválida (`null`) de ausência de acesso (`[]`). O Express reutiliza essa projeção sem alterar suas verificações de identidade, status ou filtros. `/api/auth/context` continua disponível e é usado nas revalidações de foco/reload/intervalo e demais consumidores.

O RPC recebe o JWT real pelo SDK/PostgREST. A cadeia SQL vigente continua a verificar sessão por UID/session_id/not_after, usuário confirmado/não anônimo/não excluído/não banido, perfil/vínculo/escritório/função ativos e capacidades/delegações vigentes, por RLS e `current_permissions`. `my_access_context` não chama diretamente `team_require_identity`: essa diferença foi conferida no diagnóstico; o acesso depende de sua cadeia efetiva de políticas/funções. A RPC isolada não substitui o getUser final do provedor. Cadastro público habilitado controla novos cadastros, não desabilita o login de contas já vinculadas.

Cancelamento, guardAdoption, preservação da sessão anterior, marcador de encerramento, callbacks síncronos e handoff de15s ligado à exata sessão/tokens/portal permanecem como antes. A tentativa antiga não pode sobrescrever outro login. Indisponibilidade do provedor durante a adoção nega o login, mesmo após RPC autorizado.

Os routers de Governança e Financeiro agora importam seus geradores somente dentro do caminho de exportação/verificação, após as validações/leitura de snapshot. Nenhum motor, fonte, adaptador, catálogo, layout ou `finance/export.ts` foi alterado. O primeiro PDF — e o primeiro CSV financeiro, que compartilha o módulo histórico — pode pagar a importação tardia. Autorização final, limites e respostas de erro permanecem. APIs comuns não carregam PDFKit/fontkit.

## RED → GREEN

Antes do código, `node --import tsx --test tests/auth-projection.test.ts tests/api-startup.test.ts` teve **5 falhas esperadas**: projeção ausente e API health/Auth carregando PDFKit/fontkit. O teste de inicialização usa subprocesso novo, executa health200/contexto anônimo401 e inspeciona os módulos realmente carregados.

O novo teste de login foi executado contra o código anterior com GoTrue/PostgREST/banco reais descartáveis. Falhou na contagem: havia password1, adoção/user1, APIcontext1 e RPC no browser0; esperava RPC1/API0. Após a mudança, os quatro perfis passam mesmo com o caminho APIcontext indisponível durante a entrada. Nos testes finais o matcher cobre também query strings. Foco/reload voltam a consultar a API normalmente.

Após a implementação:

| Verificação | Resultado |
|---|---|
| Projeção/coldstart/AuthAPI/paralelismo existentes, lote focado | 7/7 GREEN |
| `npm test`, comando completo | 233/233 GREEN, exit0 |
| `npm run typecheck` | exit0 |
| `npm run build`, frontend e servidor | exit0 |
| Auth real, rodada principal | 69/69 GREEN, exit0,1,9min |
| Auth real, complemento histórico | 6/6 GREEN, exit0,13,9s |
| Auth total distinto desta verificação | **75/75**,10arquivos |
| Manifesto histórico PDF da Etapa21 | 22/22 hashes idênticos |
| Snapshot anterior de motores/adaptadores/fontes/export financeiro | 21/21 arquivos idênticos |

Os75 Auth incluem os45 históricos exatos do fecho pós21 (41dispositivos/sessões/renovação/operação +4modelos/documentos),12fluxos Auth adicionais e18novos deste subprojeto. Os18 novos são quatro perfis,11negações posteriores ao signIn real e três provas de falha/corrida. Nenhum teste fabricou uma sessão ou resposta de autenticação.

As11 negações alteram somente fixtures do banco local enquanto a consulta real do navegador está retida, depois de o provedor ter autenticado: sessão vencida/revogada, conta banida/não confirmada/excluída/anônima, perfil/vínculo/escritório/função/capacidade inativos. RPC e API recusaram acesso, sem adoção no navegador. Os testes de falha de rede de getUser final, preservação de outra sessão válida e RPC antiga após novo login também passaram. Os testes anteriores cobrem portal errado, ausência de vínculo, isolamento de escritórios, metadata sem autoridade, abandono, logout,401antigo, duas abas, nova sessão e renovação legítima.

As negações têm paridade de **acesso**; RPC vazia e erros Auth não precisam produzir o mesmo status intermediário. A API conservou seus contratos existentes. A autorização permanece no servidor/banco, inclusive nas operações posteriores ao login.

Os testes foram executados numa cópia estável privada de fontes, sem `.env` e sem HMR do workspace em edição: `/workspace/scratch/fluxo-integrado/login-auth-snapshot`. Dependências existentes foram compartilhadas somente para leitura. Auth/REST/Storage/SMTP/banco foram reais e descartáveis; o script confirmou as invariantes posteriores e encerrou os laboratórios. O único aviso dos workers foi o conflito de ambiente `NO_COLOR`/`FORCE_COLOR`, sem falha de teste. Não foram retidos traces/screenshots de Auth.

Comandos Auth:

```sh
node scripts/test-auth.mjs flows.spec.ts operation.spec.ts session.spec.ts session-tabs.spec.ts device-access.spec.ts templates-imported.spec.ts login-rpc.spec.ts
node scripts/test-auth.mjs token-renewal.spec.ts templates.spec.ts documents21.spec.ts
```

## Medições

As quatro entradas novas fizeram exatamente **1 password +1 RPCcontext +1 user de adoção +0 APIcontext** antes do painel. A ordem observada foi password → RPC → adoção oficial → painel, sem liberar acesso antes das duas últimas etapas.

| Perfil local | password | RPC | adoção/user | início do request password → painel |
|---|---:|---:|---:|---:|
| proprietário | 118ms | 10ms | 31ms | 215ms |
| administrador | 118ms | 11ms | 32ms | 211ms |
| funcionário | 106ms | 9ms | 30ms | 210ms |
| cliente | 100ms | 12ms | 29ms | 207ms |

Cronometragem no laboratório real local, uma amostra por perfil, sem conta hospedada. Os números incluem respostas observadas pelo Playwright; não são SLA de produção nem tempo de digitação.

Importações frias em cinco processos Node24.19.0 por alvo, cache de módulo novo e cache de disco do SO preservado:

| Alvo | Antes, mediana | Depois, mediana | Intervalo depois |
|---|---:|---:|---:|
| aplicação compilada | 224,03ms | **137,12ms** | 129,47–139,59ms |
| router Auth compilado | 95,52ms | 88,32ms | 86,28–92,77ms |
| aplicação TS/tsx | 416,72ms | **278,96ms** | 251,67–303,93ms |
| router Auth TS/tsx | 164,82ms | 181,20ms | 175,19–189,78ms |

Aplicação compilada: redução local de38,8% e RSS mediano65,7→52,2MB; TS/tsx:33,1%. PDFKit/fontkit ausentes depois em todas as importações. O custo adicional app−Auth compilados ficou48,8ms. PDFKit isolado custava86,79ms; a redução de86,91ms do app é consistente com essa contribuição. Não somar tempos isolados de dependências compartilhadas nem atribuir todo coldstart hospedado a esse módulo.

O diagnóstico anterior mostrou contexto SQL hospedado médio16,95ms e health canônico sem banco1393ms primeiro/240–311ms nas chamadas seguintes. A mudança evita essa passagem no login normal e reduz inicialização das outras APIs. Não mede ainda o ganho autenticado hospedado, latência de dispositivo físico ou rede do usuário. Não promete50ms na rede. Nenhuma região, timeout ou política de sessão foi alterada.

Logs privados de RED/GREEN, build e benchmark ficam em `/workspace/scratch/fluxo-integrado/login-*.log` e `login-import-after.json`. O diagnóstico de leitura está em `login-diagnostico.md` na mesma pasta. Não contêm e-mails/IPs/tokens de usuários hospedados. Próximo gate: revisão independente e verificação do conjunto pelo coordenador antes da publicação GitHub→Vercel.
