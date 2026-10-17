# Etapa 04 — acesso real

Objetivo: login, logout, cadastro cliente, confirmação e recuperação reais sobre React + Vite/Express e Supabase, conforme cartão 04/regras de acesso. Base fe4290a; branch feat/etapa-04-autenticacao.

## Contratos e decisões

- Um SDK Supabase browser, PKCE, persistência oficial de sessão. Token somente no armazenamento do SDK e em Authorization para a API; sem cookies próprios de autenticação, cópia manual de tokens ou credencial privilegiada no app.
- Backend usa cliente por request, getUser(token) verificador e RPC atual de contexto. Bearer explícito evita autenticação ambiental por cookies; CORS não aberto. Respostas privadas/no-store, sem SQL/token/senha nos erros.
- Migration acrescenta sessão vigente ao helper (consulta mínima restrita de auth.sessions), RPC invoker de descoberta do contexto próprio e cadastro cliente por trigger privado. Metadata não determina papel. Configuração privada aponta escritório de cadastro, alterável somente por operador; ambiguidade/desativação impede vínculo e acesso ao produto; o provedor pode criar somente a identidade sem vínculo.
- Signup cria somente perfil mínimo/vínculo client e auditoria; e-mail confirmado e sessão vigente continuam obrigatórios para acesso. Não vincula acervo por e-mail/CPF nem reclassifica as quatro contas existentes.
- Rotas mantêm identidade/compactação; acrescentar somente cadastro, callback, redefinição e painel mínimo protegido. Painel não apresenta módulos futuros como prontos. Papel real separa equipe/cliente.
- Callback PKCE aceita somente código/flowId do SDK, remove parâmetros e navega para destinos internos fixos. Recuperação inválida/expirada é recusada. Sem MFA por padrão e sem mudança de templates SMTP.

## Entrega e provas

1. [x] Testes RED→GREEN de sessão/revogação/cadastro/RPC em PostgreSQL isolado; preservar replays sem superusuário e ACL da 03.
2. [x] Backend com contrato tipado, identidade verificada, capacidades vigentes, validação/timeout e erros seguros.
3. [x] Telas funcionais e compactas, feedback, mostrar senha, logout, callback, recuperação, sessão expirada e acesso negado.
4. [x] Supabase local oficial com Auth/PostgREST/Mailpit e contas fictícias: login correto/incorreto, A/B, sem vínculo/inativo, logout/token antigo, confirmação/reset válido e inválido/consumido. Não usar senhas do proprietário nem fixtures no hospedado.
5. [ ] Revisão independente, CI, migration hospedada e configuração pública de conexão/URLs. GitHub/Vercel, testes publicados e Livro/fecho com limites reais.

Configurações em conferência: Supabase público confirma e-mail habilitado, signup permitido e confirmação obrigatória. SMTP existente preservado. Conector não expõe Site URL/redirect allowlist; informação solicitada ao usuário enquanto o trabalho continua. Vercel recusou env por escopo 403, CLI ausente; liberação da conexão ou configuração pelo painel solicitada sem bloquear desenvolvimento local.

Não alegar entrega de e-mail externo a partir do Mailpit local. Não avançar à 05 se um critério crítico da 04 continuar pendente.

Migration aplicada no projeto novo em 17/10/2026, versão do conector 20261017225649. Arquivo CLI renomeado para refletir o histórico remoto, com SQL preservado. Quatro identidades, um perfil e um vínculo preservados. CI/preview e configuração Vercel ainda em fechamento.
