# Correção da 04 — recuperação e campos

## Pedido e limites

Em 18/10/2026 o usuário confirmou recebimento externo da recuperação solicitada pelo sistema, aberta no mesmo navegador, mas recusada como expirada. Solicitou remover quadros internos e sombras dos campos, inclusive autofill, para cliente/equipe e novas telas. Mantidos React + Vite, visual existente, controles de 44px, fontes móveis de 16px e rolagem natural quando necessária.

Nome completo/CPF/função e delegações de cadastro são requisitos futuros explicitamente solicitados; contrato em `docs/regras/acesso.md`. Nesta correção não antecipar formulário de CPF, criação de equipe/proprietário, novas capacidades, schema, templates ou vínculo de acervo. Preservar contas/credenciais e o SMTP existente.

## Diagnóstico e mudança

- **Reprodução real local:** com duas contas fictícias distintas, solicitar recuperação A e depois B no mesmo navegador impedia usar o primeiro e-mail. Teste RED: 9 casos passaram e a nova regressão falhou no callback. AuthJS 2.118 guarda verificadores por fluxo, mas só correlaciona o retorno por `sb_flow_id` com `experimental.appendPkceFlowIdToRedirects` habilitado; antes, o link usava a última referência legada. Flag oficial ativada na versão já fixada, sem copiar tokens ou criar armazenamento próprio. Manter versão fixada e testar esse contrato em atualizações do SDK.
- **Limite da evidência:** isso demonstra um defeito reproduzível, não a causa exata do e-mail do usuário. Logs agregados consultados não identificaram a troca desse link; nenhum token/link pessoal foi coletado e nenhum e-mail real foi disparado. Reuso, expiração do provedor, armazenamento ausente e falha de rede continuam causas distintas.
- **Callback:** captura query/hash antes de limpar a URL; somente PKCE válido é trocado. Mensagens fixas distinguem solicitação não reconhecida, link expirado/usado, limite de tentativas e indisponibilidade. Não exibir texto bruto do provedor nem oferecer repetição da mesma troca: o SDK pode remover o verificador após erro. O botão pede nova solicitação e preserva a área visual equipe/cliente, sem conceder papel por query. Mantidos destinos internos e limpeza de histórico/referrer.
- **URLs hospedadas:** verificação com token sintético inválido retornou 303 para o callback canônico e preservou `area`/`sb_flow_id`. Isso comprova aceitação do destino com parâmetros, não consumo de link real ou alteração de senha no hospedado. Site URL canônico já confirmado na retomada anterior. Templates não alterados.
- **Campos:** RED visual confirmou outline interno dourado de 3px e pintura azul nativa de autofill. Foco passa à borda do wrapper, sem outro quadro/sombra; links e botões mantêm foco visível. Autofill continua habilitado, com pintura recortada ao texto, sem sombra inset. Regra permanente adicionada ao AGENTS para novas telas.

Fontes: [PKCE](https://supabase.com/docs/guides/auth/sessions/pkce-flow), [redirects](https://supabase.com/docs/guides/auth/redirect-urls) e fonte/tipos da versão fixada `@supabase/auth-js` (`ExperimentalFeatureFlags`, `retrievePKCEVerifier`, `_exchangeCodeForSession`). Confirmação local usa GoTrue/PostgREST/PostgreSQL/Mailpit reais e descartáveis; indisponibilidade na troca é contrato 503 interceptado.

## Verificação e publicação

- `npm run test:auth`: **12 passaram**, incluindo recuperação/nova senha/reload, reuso, expiração real do provedor, duas recuperações pendentes A/B, navegador isolado sem liberação e falha 503 sem falsa expiração. Nenhuma fixture hospedada ou mensagem externa de teste.
- `npm run typecheck`, `npm test` (**6 Node/API**) e `npm run build`: passaram.
- Revisão independente somente leitura: sem bloqueadores em PKCE, mensagens, hooks, foco e escopo futuro. `git diff --check` passou.
- `npm run test:e2e`: **34 passaram** na rodada final estável, incluindo campos/autofill via CDP, navegação, erros, API aninhada e layout de 320×568 a 1440×900. Primeiro teste visual identificou uma regra posterior que reiniciava o recorte de autofill; corrigida a cascata. Primeira rodada teve também recarga abortada pelo navegador; não reproduzida na execução final estável. Comparação visual confirmou ausência do quadro/pintura azul/sombra e preservação da borda de foco. Sem afirmar cobertura de todos os gerenciadores de senha/navegadores.
- CI, publicação e conferência remota: pendentes antes do merge.
- Backend, banco/RLS e migrations: nenhuma alteração necessária nesta correção; teste Auth continua verificando navegador → API → dados e isolamento existente. Replay SQL será registrado pelo CI, sem aplicar migration no hospedado.

Aceite externo ainda exige uma nova recuperação pelo sistema após o deploy e conferência do usuário; não afirmar que o e-mail pessoal já abriu/alterou a senha. Etapa 05 não iniciada. Reversão de código preserva banco/auditoria e não revalida links já consumidos.
