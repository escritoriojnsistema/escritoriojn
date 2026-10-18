# Fecho técnico — Etapa 05

18/10/2026. **APROVÁVEL tecnicamente: implementada, testada e publicada em https://escritoriojn.vercel.app/. Conferência pessoal do convite externo permanece pendente.** Cartão oficial em etapa-05.md; contratos e decisões em plano-05.md. Etapa 06 não iniciada.

## Comportamento implementado

- Proprietário gerencia equipe em `/equipe`, com busca, filtro, cinco registros por página, convite e ativação/desativação sem apagar autoria/histórico. Menu exige capacidade vigente. Admin só recebe gestão por delegação explícita, com escopo, validade e revogação; criar owner exige autorização específica. Não há delegação em cadeia, autoconcessão de admin nem retirada do último owner ativo.
- Convite registra nome completo, e-mail, CPF válido, função, capacidades existentes e prazo. Somente destinatário com e-mail confirmado/sessão atual pode conferir nome/CPF/função. Cinco erros/15 min; conferência de 15 min na mesma sessão. Aceite atômico exige autoridade original ainda válida, senha real e convite não expirado/reutilizado. Contas legadas não recebem vínculo ou CPF inventado.
- Novo destinatário define senha depois da conferência. GoTrue gera senha temporária no consumo do link: regressão real detectou que hash não vazio não bastava. Correção usa UID de senha anterior confiável ou fingerprint privada SHA256 do hash capturado após a conferência, exigindo mudança posterior. Não duplica bcrypt do provedor nem armazena senha.
- Desativação revoga poderes/convites dependentes e bloqueia próxima operação com JWT antigo. Row lock por escritório protege concorrência; sessão/e-mail e relógio atual são revalidados após espera. Auditoria crítica é transacional e não inclui CPF integral, senha, token ou e-mail.
- Telas navy/claro/dourado, foco pela borda e autofill sem quadros/sombras. Desktop mantém gestão padrão em uma tela; mobile divide formulário em Dados/Acesso. Conteúdo longo pode rolar naturalmente, com alvos44px e inputs16px. Reativação sempre inclui acesso básico obrigatório.

## Integrações e dados

React19/Vite8/TypeScript7 e Express5 preservados. `/api/team` usa identidade verificada por request e RPC com autorização atual, sem pré-consulta duplicada. Quatro tabelas privadas com RLS, onze wrappers públicos invoker e definers privados com grants mínimos. Seed idempotente acrescenta gestão/criação de owner somente a owner. Nenhuma identidade/vínculo real foi reclassificado para testar.

SMTP customizado existente é usado pela Edge `team-invitations`. JWT da plataforma e getUser/RPC do caller protegem o envio; Auth admin e conclusão estreita usam segredo automático somente no runtime Supabase. Sem chave privilegiada nova na Vercel/browser/Git. Lease/reenvio60s, destino canônico fixo e envio incerto sem falso sucesso. Conta existente recebe recuperação implicit pelo mesmo SMTP; templates preservados. Callback valida sessão pelo SDK e limpa URL; recuperação normal continua PKCE.

## Evidências executadas

| Prova | Resultado local |
| --- | --- |
| `npm test` | 23 passaram, incluindo API, SMTP, validação e callback; regressões RED/GREEN registradas durante desenvolvimento |
| `npm run build` | Typecheck, frontend e servidor compilados; exit0 |
| `npm run test:db` | 256 verificações, 128 por replay vazio; migrador NOSUPER/NOBYPASS, papéis reais e três corridas com duas conexões |
| `npm run test:auth` | 16 passaram, GoTrue/PostgREST/PostgreSQL/Mailpit reais, handler SMTP idêntico à Edge; inclui12 provas anteriores e4 novas |
| `npm run test:e2e` | 34 públicos passaram, incluindo320/360/768/1440 e recuperação anterior |
| `npm run test:team-ui` | 12 passaram; contratos SDK/API fictícios explícitos, reativação, delegação, falhas e responsividade; incluído na CI |
| Dependências de produção | `npm audit --omit=dev --audit-level=high`: zero vulnerabilidades |

O novo E2E percorreu owner→convite→SMTP→callback em outro contexto→identidade incorreta/correta→senha→aceite→painel→desativação→JWT antigo negado. Também confirmou manutenção de senha de conta anterior e delegação revogada com token aberto. Revisão independente incluiu RPCs/ACL, fonte oficial GoTrue e correções de UI/transporte; resultado final deve ser registrado após publicação.

## Conferência hospedada e publicação comprovada

- [PR 7](https://github.com/escritoriojnsistema/escritoriojn/pull/7), implementação 16c11d3. [CI39131090606](https://github.com/escritoriojnsistema/escritoriojn/actions/runs/39131090606) SUCCESS: 23 Node,256 SQL,16 Auth,34públicos,12 UI e build comprovados nos logs. [Build preview Vercel success](https://vercel.com/escritorio-jn/escritoriojn/FddrTVAxWBSV6vikkhkJQzKUWmEo); preview protegido não foi contornado.
- Migrations 20261018132255 e 20261018132554 aplicadas no projeto novo. A primeira corresponde exatamente ao SQL revisado/testado (SHA256363015b4a0b89d2d4f6a66df1546cefebf6071cbdf767ce4563dcae50849d603), apenas nome Git alinhado ao históricoMCP. A segunda acrescenta quatro índices de FK apontados pelo advisor; replay completo256 passou novamente. Nenhum registro/ACL/RPC foi alterado pelo ajuste de índices.
- Conferência SQL: quatro identidades, um vínculo ativo owner preservados, zero convites de teste, quatro tabelas privadas com RLS, onze RPCs invoker, authenticated não finaliza delivery/service_role somente grant estreito de finalização. Sem fixture hospedada.
- Edge team-invitations ACTIVE/v1, JWT obrigatório mantido e segredo automático do runtime. HTTP anônimo e token inválido401, sem envio. Auth health 200 confirmou GoTrue v2.197.0, mesma versão do laboratório. Não foi realizado envio externo automatizado.
- Advisor de [FK sem índice](https://supabase.com/docs/guides/database/database-linter?lint=0001_unindexed_foreign_keys) zerado após ajuste. [RLS privada sem policy](https://supabase.com/docs/guides/database/database-linter?lint=0008_rls_enabled_no_policy) é intencional: sem GRANT de tabela e somente operações privadas autorizadas. [Índices ainda não usados](https://supabase.com/docs/guides/database/database-linter?lint=0005_unused_index) esperado nesta base nova. Aviso preexistente de [proteção contra senhas vazadas desativada](https://supabase.com/docs/guides/auth/password-security#password-strength-and-leaked-password-protection) preservado, sem mudança de plano/MFA.
- Revisão independente final: nenhum achado relevante remanescente; confirmou ACL/RBAC/aceite, senha temporária e quatro índices. Reviewer executou23 Node/typecheck; demais provas têm logs do coordenador/CI. Publicação canônica comprovada abaixo.

## Entrega final

- Implementação 16c11d3 e alinhamento/índices f807117; [PR 7 integrado](https://github.com/escritoriojnsistema/escritoriojn/pull/7), merge 319b8b9a8b55667acb84a637833d201d5fc6b6f9. [CI final39131611815 SUCCESS](https://github.com/escritoriojnsistema/escritoriojn/actions/runs/39131611815): todos os 3 jobs,23 Node,256 SQL,16 Auth,34públicos,12 UI e build. Árvore do merge idêntica à revisão final, sem mudança executável posterior.
- [Build principal Vercel success](https://vercel.com/escritorio-jn/escritoriojn/GaWYLdA7VwC59an4PAUkmqwWvVJu); domínio canônico servindo a etapa 05. Teste público remoto completo: **34/34 passaram**, com campos/autofill e telas320/360/768/1440. Provas específicas publicadas confirmaram health 200, /api/team e /api/team/invitations/:id/state 401 privados/no-store, /equipe→login, /convite exigindo sessão/UUID interno e callback expirado com URL limpa/retorno ao convite. Login habilitado com conexão pública do projeto correto.
- Supabase manteve4 identidades/1 vínculo owner/0 convites de teste; tabelas privadas sem GRANT de leitura/escrita para anon/authenticated/service_role. allowlist hospedada preservou callback+area+invite no domínio correto ao recusar token fictício inválido; nenhum e-mail real disparado.
- Checkout principal main atualizado por fast-forward; worktree da feature preservada. Commit posterior de Livro/fecho/plano é apenas documentação, sem migration/configuração/código. Não repetir baterias por texto de fechamento; conferir somente documentação/status final.

## Limites e continuidade

Conferência protege o aceite da equipe no banco. **Não** alegar barreira global de CPF para alteração direta de senha pelo provedor; cadastro completo/recuperação por identidade de cliente permanecem futuros. Nome/CPF não substituem controle do e-mail e sessão. Templates e MFA não foram alterados.

Recebimento externo de recuperação foi confirmado pelo usuário antes da correção da 04; consumo pessoal de um link novo ainda não confirmado. Mailpit e CI não comprovam SMTP externo. Não enviar mensagens/links de contas reais nem criar fixtures hospedadas automaticamente. O cartão05 pede conferência pessoal: convidar pessoa de teste autorizada com acesso básico, aceitar, desativar e tentar a sessão já aberta. Não compartilhar senha, CPF ou link no chat.

Rollout: CI/revisão → migration aditiva → Edge → merge Git/Vercel → verificação pública. Rollback de código preserva banco/auditoria; nenhuma remoção/reset. Conector Vercel permanece403 para env/logs/preview protegido, limitação anterior; Git e HTTP público permitem publicação técnica. Não reduzir proteção para contornar acesso. Etapa 06 depende do aceite05 e de novo pedido.
