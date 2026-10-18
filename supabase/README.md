# Fundação de acesso e equipe — etapas 03–05

`migrations/` é a fonte versionada. O seed mínimo faz parte da migration; não depende de cadastrar um usuário depois nem contém contas/senhas. Não repetir migration aplicada, editar seu histórico ou usar este projeto para fixtures.

Execute `npm run test:db` com Docker Linux disponível. O runner cria e remove somente seu container por nome aleatório, sem rede, portas ou conexão remota. Dois replays validam PostgreSQL 17, migrador sem superusuário/BYPASSRLS e papéis reais anon/authenticated. `tests/database/bootstrap.sql` representa apenas o contrato mínimo Auth do provedor; não é migration de produção.

## Aplicação e proprietário

1. Conferir projeto novo e histórico remoto; aplicar o mesmo SQL versionado atomicamente via ferramenta de migrations autorizada.
2. Conferir RLS, ACL/EXECUTE, seed e advisors; `private` não deve estar nos schemas expostos do PostgREST.
3. Operador autorizado verifica o UUID da identidade Auth confirmada do proprietário indicado. Não procurar identidade pelo primeiro visitante nem aceitar e-mail/ator do navegador.
4. Executar `private.provision_owner(verified_auth_user_id, office_name, request_id)` na sessão administrativa. Os três parâmetros são obrigatórios. Rotina não acessível por anon/authenticated/service_role; ela cria primeiro escritório/vínculo e auditoria juntos. Uma nova tentativa após a instalação é recusada.
5. Registrar apenas contagens e resultado no Git público, nunca UUID/e-mail pessoal. O bootstrap já foi executado: não repetir. A sessão usa `public.my_access_context()`; os demais vínculos passam pelo convite explícito da etapa05.

Browser e Express recebem somente conexão pública e Bearer do usuário. Custom SMTP e sua senha permanecem no Supabase; templates serão alterados depois. Se houver falha, preservar histórico e negar acesso; não remover RLS/grants como correção.

## Convites da etapa05

A migration `team_management_invitations` acrescenta quatro tabelas privadas, onze RPCs invoker, seed `users.manage`/`users.owners.create` exclusivo owner e delegação temporária explícita para admin. Desativação é por vínculo, preserva Auth/histórico e vale na operação seguinte. RPCs verificam sessão/estado e repetem verificações críticas após lock; não usam metadata como autorização.

Publique `functions/team-invitations` no **projeto novo**, após migration revisada/testada, com `verify_jwt=true` e `deno.json` incluído. O runtime fornece automaticamente `SUPABASE_URL`, `SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`; não buscar/copiar o segredo para Vercel/Git/browser. `APP_SITE_URL` é opcional, padrão canônico `https://escritoriojn.vercel.app`. O handler verifica `getUser` e reivindica lease por RPC com poderes atuais antes de chamar Auth admin. `email_exists` usa recuperação implicit pelo mesmo SMTP. Conclusão de envio tem RPC estreita exclusiva service_role, sem grants de tabela. Erros/timeout não declaram e-mail enviado.

O callback de convite é `/auth/callback?area=team&invite=<uuid>`, dentro da allowlist já configurada. Sessão implicit passa por `setSession` oficial e URL é limpa; recuperação normal permanece PKCE. Destinatário confirmado confere nome/CPF/função e depois define senha/aceita. CPF fica como bcrypt/sal e máscara, nunca completo em resposta/auditoria. A conferência dura15min na mesma sessão; cinco erros bloqueiam novas tentativas por15min.

GoTrue pode criar senha temporária ao confirmar convite. Para conta nova, o aceite exige mudança do hash do provedor **após** a conferência: guarda-se apenas fingerprint SHA256 privada, nunca senha ou uma cópia do bcrypt. Conta anterior confiável pode manter senha. Isso protege o aceite da equipe; não representa bloqueio global da API de alteração de senha por CPF para todos os clientes/fluxos.

Rollout compatível: migration aditiva → Edge → frontend/API pela integração Git Vercel. Rollback de código preserva schema, vínculos e auditoria; não executar DROP/reset nem restaurar permissões antigas automaticamente. Testes de envio usam somente SMTP local; conferência externa é do proprietário com convite autorizado.
