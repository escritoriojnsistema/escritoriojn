# Revisão estática independente — Etapa18, tarefas1/2

Data: 25/10/2026. Escopo: `review-task12.diff`, `contract.md`, cartão18, regras financeiras pertinentes, relatórios das tarefas1/2 e fontes atuais relacionadas. Revisão somente estática: nenhuma suíte executada, nenhuma alteração de implementação, commit ou operação hospedada.

## Vereditos

- **Conformidade com a especificação: APROVADA.** Não identifiquei divergência estática concreta que impeça o aceite das tarefas1/2.
- **Qualidade do código: APROVADA.** Não identifiquei defeito acionável de segurança, concorrência, cálculo ou fluxo nas alterações examinadas.
- **Achados: P0=0, P1=0, P2=0, P3=0.** Não há cenário/arquivo/linha de defeito confirmado a relatar; os pontos abaixo são fundamentos do parecer, não novas verificações dinâmicas.

## Fundamentos examinados

- Banco: `closure_operate` adquire o lock financeiro já existente do escritório e o da sessão e revalida Auth/capacidades após esperas, inclusive antes do replay. Escopo próprio, papel owner/admin e leitura ampliada para revisão de colega são separados. RLS/ACL fecham as duas tabelas, as três RPCs públicas são INVOKER e somente authenticated recebe execução; auxiliares privilegiados mantêm guardas.
- Dinheiro: um único ledger; espécie soma fundo e efeitos físicos líquidos, sem descontar troco novamente. Os digitais são agrupados por meio/destino; reversão lógica16 fica fora dos efeitos de dinheiro. Cartão separa recebido/devolvido, taxa, líquido e créditos liquidados/pendentes, preservando `null` desconhecido. Inteiros, limites por contagem e agregados seguros são validados; diferenças não se anulam por soma entre grupos.
- Histórico/replays: snapshots e decisões append-only, comandos vinculados ao ator/payload e guardados na mesma transação. Ajuste usa grupos imutáveis do fechamento próprio anterior, exige outra sessão própria da mesma unidade e não escreve ledger nem reabre caixa. Revisão única preserva diferença. Replay novo recompõe statement/autoridade atuais sem reescrever `cash_commands.result`; wrapper legado bloqueia novos fechamentos/conciliações e conserva retries autorizados já salvos.
- Compatibilidade: aliases anteriores são preservados por renomeação; apresentação5 acrescenta adaptação/catálogo e default persistido sem editar apresentações1–4. Flag `closures_enabled` permite ativação da UI com o banco correspondente. Suporte às capacidades e renderer5 está presente no runtime; a ordem efetiva da publicação permanece responsabilidade do rollout posterior.
- API/DTO: Bearer do chamador, no-store, whitelist de RPCs, corpos exatos, limite32KB separado do legado8KB, projeção explícita, grupos únicos, vínculos dos registros ao estado e validações dos totais/diferenças/versão/revisão. Falhas não devolvem detalhes privados.
- UI: estado de conferência fica sob a chave de sessão/escritório/caixa/ator/papel/capacidades do `CashStatement`. Requests são abortados na saída; 503 mantém draft/chave, 409 descarta a tentativa e busca estado oficial, 401/403/404 fecham o recurso. Ações extras usam a sidebar/OperationLayout, navegação móvel existente conserva o limite de quatro atalhos; editor substitui o conteúdo principal, sem loader/rótulo transitório e com regras móveis de16px/rolagem natural.

## Evidências e limites

Considerei como evidência fornecida pelo implementador/controlador os dois replays SQL1062+1063 com sete corridas por replay, os resultados Node/API e UI já registrados e o estado informado das rechecagens Auth/layout. Não repeti essas suítes e não tratei `ERR_NETWORK_CHANGED` durante startup concorrente de Docker, nem testes ainda em rechecagem, como defeito estático. Este parecer não declara concluídas verificações dinâmicas, build ou rollout ainda em andamento.
