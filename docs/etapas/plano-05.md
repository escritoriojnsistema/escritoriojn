# Etapa 05 — plano de implementação

**Objetivo:** gestão real de equipe, convites, capacidades, delegações e desativação, preservando histórico. Especificação aprovada pelo pedido: cartão oficial `etapa-05.md`, regras/acesso e complemento do usuário sobre nome completo/CPF/função e criação de proprietário. Execução na branch `feat/etapa-05-equipe`, em worktree isolado. Sem renumerar módulos ou migrar React + Vite.

## Decisões e limites

- Reusar Auth/API/contexto/RLS atuais. Seed idempotente acrescenta `users.manage` e `users.owners.create` somente a owner; admin não recebe poder global. Nenhuma alteração automática das quatro identidades existentes ou seus vínculos. Etapa 04 técnica comprovada; nova conferência pessoal de recuperação continua pendente, sem bloquear este contrato independente autorizado pelo novo pedido.
- Tabelas de equipe/convites/delegações/dados de identidade ficam privadas, com RLS e sem GRANT de leitura/escrita aos papéis da API. RPC pública invoker chama operação privada definer indispensável, com search_path vazio, validação de sessão atual e autorização por operação. Não confiar em metadata/JWT de função, IDs de ator enviados ou cache de privilégios.
- Office row lock serializa mutações, incluindo alterações concorrentes de proprietários. Último proprietário efetivamente ativo não pode ser desativado/rebaixado. Admin nunca muda o próprio poder, gerencia proprietário existente ou administrador com delegação vigente; não pode delegar em cadeia.
- Admin recebe de owner uma delegação com funções permitidas, capacidades concedíveis e prazo de até 90 dias; validade padrão 30 dias. Criar proprietário exige delegação específica `can_create_owner`; users.manage sozinho não inclui isso. Delegação dá users.manage e as capacidades de módulos existentes explicitamente selecionadas; gestão da própria delegação permanece exclusiva de owner. Renovação cria nova identidade de delegação, não revive convites ligados à antiga.
- Capacidades comuns concedíveis: foundation.access (básica, sempre necessária) e audit.read (já existente). Não criar funções futuras/menu de auditoria da06. Deativar/rebaixar um gestor revoga suas delegações e convites pendentes; revogar delegação invalida convites dependentes. Operações já aceitas conservam histórico, sem cascata de exclusão.
- Convite: dados esperados nome completo, e-mail, CPF válido e função; validade padrão72h, máximo7 dias. Guardar CPF somente como bcrypt/sal, exibir máscara/últimos2 dígitos. Não escrever CPF integral, senhas, tokens ou e-mails em auditoria/logs. Auditoria mínima e transacional para alterações de negócio.
- E-mail real pelo Supabase Auth/custom SMTP atual: Edge Function autenticada usa segredo automático do runtime apenas para inviteUserByEmail; se email já existir, usa recuperação implicit no SDK servidor. Templates preservados. Vercel/Express não recebe chave privilegiada. Edge faz getUser e reivindica lease de envio por RPC sob poderes atuais; resultado final usa RPC estreita exclusiva service_role, com ator derivado do lease. Sem GRANT de tabelas a service_role.
- Redirect fixo canônico `/auth/callback?area=team&invite=<uuid>`; token nunca em link de negócio próprio. Callback suporta sessão implicit somente nesse fluxo de convite UUID válido, pelo setSession oficial/getUser; não muda recuperação PKCE normal. URL limpa antes de navegar. `invite`/`area` não concedem função.
- Destinatário autenticado, confirmado e com sessão vigente deve corresponder ao e-mail do convite. Conferir nome/CPF/função no banco; 5 erros/15 min por convite, mensagem genérica, contador deve persistir mesmo na falha. Sucesso cria conferência de15min ligada a invite+user+session_id, sem liberar equipe ainda. Senha só aparece depois; conta existente pode manter senha se o provedor já tem credencial. Aceite RPC exige conferência atual, credencial existente, convite pendente/não expirado e autoridade original ainda válida (inclui a mesma delegação); cria/atualiza somente vínculo explicitamente convidado e registra auditoria.
- Evidência de integração: GoTrue cria senha temporária ao confirmar convite. Guardar UID preexistente com senha confiável; para novo convite, capturar fingerprint SHA256 do hash somente após conferência correta e exigir alteração posterior. Não confiar apenas em encrypted_password não vazio; fingerprint é privada, ligada à verificação/sessão e limpa no aceite. Prazos usam relógio atual, inclusive depois de lock; conferir novamente identidade/e-mail após espera.
- A conferência protege o aceite da equipe no servidor; não alegar bloqueio global da API de senha do Supabase. O contrato anterior de recuperação por identidade para todas as contas/clientes continua futuro, exige mecanismo do provedor e cadastro confiável. Etapa 05 não coleta CPF de cliente público nem reescreve seu cadastro/recuperação.
- Interface navy/claro/dourado; rota `/equipe` e entrada no painel só com users.manage. Lista paginada5 por página, busca/estado e abas Equipe/Convites. Dados e acesso do convite em passos curtos no mobile se não couberem; desktop pode usar colunas. Gestão de delegação exclusiva owner, confirmação de desativação/rebaixamento/revogação. Controles44px, mobile16px, foco pela borda, sem quadros/sombras/autofill azul, sem overflow escondido. Erros, vazio, repetição, sessão expirada e negação reais.

## Contratos SQL públicos (JSONB, argumentos prefixados p_)

Todos recebem sessão do caller; privados validam auth.uid/session_id. Request UUID serve só de correlação e não define ator. Sem argumentos secretos de credencial. SQLSTATE PT401/PT403/PT409/PT410/PT422/PT429 para códigos públicos seguros; outros erros viram503 sem texto SQL. A verificação incorreta de identidade retorna JSON em vez de RAISE para persistir o contador.

| RPC | Argumentos | Resultado |
| --- | --- | --- |
| team_dashboard | office_id uuid, kind text, page integer, query text, status text | TeamDashboard em shared/team.ts; página5, kind members/invitations; ordenação estável, contagem e dados mínimos escopados |
| team_create_invitation | office_id uuid, email text, full_name text, cpf text, role_code text, permissions text[], expires_at timestamptz, request_id uuid | {id,expires_at} |
| team_claim_delivery | office_id uuid, invitation_id uuid, request_id uuid | {email,invitation_id,lease_id}; lease60s e reenvio mínimo60s, apenas gestor autorizado atual e autoridade original válida |
| team_finish_delivery | invitation_id uuid, lease_id uuid, sent boolean | {recorded:boolean}; EXCLUSIVA service_role, nada de grant amplo; auditoria usa ator do lease |
| team_revoke_invitation | office_id uuid, invitation_id uuid, request_id uuid | {ok:true} |
| team_set_member | office_id uuid, membership_id uuid, role_code text, active boolean, permissions text[], request_id uuid | {ok:true} |
| team_set_delegation | office_id uuid, membership_id uuid, allowed_roles text[], allowed_permissions text[], can_create_owner boolean, expires_at timestamptz, request_id uuid | {id}; apenas owner, target admin, revoga anterior |
| team_revoke_delegation | office_id uuid, delegation_id uuid, request_id uuid | {ok:true}; apenas owner |
| team_invitation_state | invitation_id uuid | {id,office_name,verified,has_password,verified_until}; somente destinatário confirmado, sessão válida e convite pendente |
| team_verify_invitation | invitation_id uuid, full_name text, cpf text, role_code text, request_id uuid | {verified:true,has_password:boolean} ou {verified:false,code:'IDENTITY_MISMATCH' ou 'TEAM_RATE_LIMIT'} |
| team_accept_invitation | invitation_id uuid, request_id uuid | {office_id,role_code}; somente depois de conferência e senha real; reutilização410 |

DTOs de roster/destinatário em shared/team.ts. O dashboard retorna apenas gestores com escopo próprio e oculta PII de funções fora da delegação. Em todas as mutações as mesmas regras são verificadas novamente, independentemente de can_edit da UI. Permissões e delegação devem ser visíveis somente em módulos já existentes; nome do papel owner pode ser abreviado visualmente para Proprietário.

## API Express

`/api/team` exige Bearer/getUser, no-store/private/Vary Authorization. Não faz pré-consulta de contexto antes da RPC que já valida gestão. JSON até4KB, campos e queries estritos, timeout de fetch e sem raw errors. Rotas:

- GET `/api/team?office_id=&kind=members|invitations&page=1&query=&status=all` → {data:TeamDashboard}.
- POST `/api/team/invitations` → payload de create sem prefixo p_; resposta201 {data:{id,expires_at,delivery:'sent'|'failed'|'pending'}}. Criação persiste se envio falhar; orientar reenvio/lista, sem declarar entrega confirmada em timeout.
- POST `/api/team/invitations/:id/send` e `/revoke`, body {office_id}.
- PATCH `/api/team/members/:id`, body {office_id,role_code,active,permissions}.
- PUT `/api/team/delegations/:membershipId`, body {office_id,allowed_roles,allowed_permissions,can_create_owner,expires_at}.
- POST `/api/team/delegations/:id/revoke`, body {office_id}.
- GET `/api/team/invitations/:id/state`; POST `/:id/verify` body {full_name,cpf,role_code}; POST `/:id/accept` body {}. Destinatário não precisa users.manage/foundation antes do aceite; identidade vigente ainda obrigatória.

## Tarefas e provas

- [x] Banco: escrever regressões negativas e provar RED, implementar migration criada pela CLI, helper de capacidades efetivas, seed, RPCs/ACL/RLS/auditoria. Estender replay em dois bancos vazios com migrador NOSUPER/NOBYPASS. Testar A/B, admin/funcionário/self, owner delegado específico, prazos/revogação/token velho, corrida de último owner, convite expirado/reutilizado/errado, 5 erros persistentes, falha de auditoria atômica. Não aplicar no hospedado antes de testes/revisão.
- [x] API/Edge: contratos Node para sessão/query/body/status/erros, implementar handlers e transporte SMTP; laboratório real reutiliza o mesmo handler portátil da Edge e chaves fictícias. Testar email novo e conta existente com Mailpit, resultado de envio sem falso sucesso, privilégio do serviço mínimo e destino fixo.
- [x] Frontend: gestão acessível/paginada e convite em passos, navegação por capacidade e dados reais. Provar estado vazio/negação/falhas, viewport320/360/768/1440, foco/autofill, passos sem cortar conteúdo. Reusar form components/estilo; sem UI que finja cadastro pronto.
- [x] Integração: login owner→convidar→SMTP local→callback→identidade→senha→aceite→acesso→desativar→JWT antigo negado. Delegação temporária/revogada e owner específico. Testes sequenciais sem alterar fontes/documentos durante Vite/Tailwind.
- [x] Revisão independente, advisors e checks pertinentes. Aplicação aditiva no Supabase novo preservando dados; Edge nova sem retirar proteção, secrets apenas runtime. Commit/PR/CI e publicação técnica Git autorizada no histórico; validar domínio principal, Livro/fecho/FONTES/plugins e lacunas humanas sem avançar06.

## Revisão de riscos

E-mail de convite é implicit (PKCE de recovery normal permanece); validação não pode depender de type/area. Convite com autoridade expirada nunca revive por nova delegação. Desativação é por vínculo/escritório, sem apagar Auth/perfil/globalmente ou quebrar outra unidade. CPF não aparece em listas, logs, URL ou auditoria; conferência não concede papel até o aceite transacional. Falha SMTP não reverte convite silenciosamente nem causa segundo cadastro. Último owner precisa proteção após lock. Preservar fonte de verdade de autorização e sessão, sem novas credenciais/parsers JWT de confiança próprios.

Execução concluída tecnicamente: CI39131611815 SUCCESS, PR 7/merge 319b8b9, migrations20261018132255/20261018132554 aplicadas, Edge ACTIVE/v1 e 34 E2E remotos passaram. Conferência pessoal do convite externo/recuperação pessoal permanece registrada; não substituída por laboratório. Não iniciar a 06 automaticamente.
