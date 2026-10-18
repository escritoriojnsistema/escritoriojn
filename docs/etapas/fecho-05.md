# Fecho técnico — Etapa05

18/10/2026. **Implementação e provas locais concluídas; publicação em conferência.** Cartão oficial em etapa-05.md; contratos e decisões em plano-05.md. Etapa06 não iniciada.

## Comportamento implementado

- Proprietário gerencia equipe em `/equipe`, com busca, filtro, cinco registros por página, convite e ativação/desativação sem apagar autoria/histórico. Menu exige capacidade vigente. Admin só recebe gestão por delegação explícita, com escopo, validade e revogação; criar owner exige autorização específica. Não há delegação em cadeia, autoconcessão de admin nem retirada do último owner ativo.
- Convite registra nome completo, e-mail, CPF válido, função, capacidades existentes e prazo. Somente destinatário com e-mail confirmado/sessão atual pode conferir nome/CPF/função. Cinco erros/15min; conferência15min na mesma sessão. Aceite atômico exige autoridade original ainda válida, senha real e convite não expirado/reutilizado. Contas legadas não recebem vínculo ou CPF inventado.
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

## Limites e continuidade

Conferência protege o aceite da equipe no banco. **Não** alegar barreira global de CPF para alteração direta de senha pelo provedor; cadastro completo/recuperação por identidade de cliente permanecem futuros. Nome/CPF não substituem controle do e-mail e sessão. Templates e MFA não foram alterados.

Recebimento externo de recuperação foi confirmado pelo usuário antes da correção04; consumo pessoal de um link novo ainda não confirmado. Mailpit e CI não comprovam SMTP externo. Não enviar mensagens/links de contas reais nem criar fixtures hospedadas automaticamente. O cartão05 pede conferência pessoal: convidar pessoa de teste autorizada com acesso básico, aceitar, desativar e tentar a sessão já aberta. Não compartilhar senha, CPF ou link no chat.

Rollout: CI/revisão → migration aditiva → Edge → merge Git/Vercel → verificação pública. Rollback de código preserva banco/auditoria; nenhuma remoção/reset. Conector Vercel permanece403 para env/logs/preview protegido, limitação anterior; Git e HTTP público permitem publicação técnica. Não reduzir proteção para contornar acesso. Etapa06 depende do aceite05 e de novo pedido.
