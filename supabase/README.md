# Banco, acesso e operação — etapas 03–10

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

## Etapa06

Migration20261018195511_audit_privacy_archives aplicada e versionada com SQL idêntico ao testado. RPCs audit_page/audit_export/archives_page/archive_membership/restore_archive exigem sessão/capacidades atuais e escritório; API pública não lê audit_events ou private.archived_records diretamente. Seed audit.export/archives.manage somente owner. Arquivar desativa e invalida convites; restaurar mantém conta inativa. Referência mínima na tabela, nome resolvido apenas no DTO autorizado. Falha de auditoria crítica reverte operação.

Validação final:342 SQL em dois replays,30 Auth reais no laboratório e30 Node; nenhum teste de escrita no hospedado. Retenção/titulares/incidentes e contrato de eventos em docs/privacidade. Rollback só código, sem apagar referências/auditoria; sem migrations destrutivas, purge, mudança SMTP ou conta real.

## Etapa07

Migration `customers_secure_registry`: customers/customer_contacts com RLS/ACL sem acesso bruto da API; quatro RPCs públicas invoker sobre implementações privadas autorizadas. customers.read é pré-requisito; create/update adicionais; read_all amplia o escopo apenas dentro do escritório. Owner recebe capacidades por papel, concessões aos demais seguem gestão/delegação atual. Sem read_all, apenas fichas criadas pelo ator; relações ficam na08.

Identificador não vazio normalizado tem índice único por escritório/tipo. Identificador vazio permanece NULL; ficha anônima não é exigida para serviço rápido. Contatos0..4, e-mail lower/trim e telefone com10/11 dígitos ou55+10/11. Validação CPF/CNPJ não consulta fonte oficial. Escritas serializadas por escritório, versão otimista e evento sem PII na mesma transação; sessão/capacidade revalidadas após locks. Rollback só código, preservando as tabelas e a auditoria.

504 checks SQL passaram em dois replays252×2, com migrador sem superusuário/BYPASSRLS e corridas reais. Estado hospedado e testes integrados finais em [fecho07](../docs/etapas/fecho-07.md).

## Etapa09

`services` identifica código por escritório; `service_versions` conserva definição/preço/vigência/autor/motivo, sem UPDATE/DELETE. Cinco RPCs públicas invoker chamam implementações privadas autorizadas, sem acesso bruto às tabelas. Seed de oito capacidades somente owner; concessão aos demais na gestão existente.

`service_quote` escolhe versão vigente no banco e calcula centavos/pontos-base sem confiar no preço do cliente. Ajustes exigem política, capacidade e motivo. O pedido10 usa `private.services_snapshot` dentro de sua transação e persiste o resultado; não aceita snapshot enviado pelo navegador. Sem fixtures hospedadas.

Replay/concorrência: `npm run test:db`. Benchmark descartável: `node scripts/benchmark-services.mjs` (10mil serviços/10conexões/300amostras, sem opção de banco remoto). Estado e limites da publicação em [fecho09](../docs/etapas/fecho-09.md).

## Etapa10

Migration `requests_service_workflow`: requests/request_items com RLS e ACL sem acesso bruto; contadores, atribuições e histórico privados. Itens e histórico imutáveis; protocolo único por escritório, abertura idempotente por criador/chave e payload, versão esperada nas mutações. Cinco RPCs públicas invoker chamam implementações privadas autorizadas. Uma RPC por operação, sem pré-consulta de contexto. Seed de seis capacidades somente owner; delegação/concessão explícita aos demais pela gestão atual.

Snapshots são calculados no banco09 na mesma transação. Conta cliente confirmada abre mensagem para triagem e recebe whitelist própria sem preços/notas/atores; classificação interna aplica requisitos do serviço. Escrita revalida sessão/autoridade após locks; transferência pode retornar somente access_lost. Conclusão não cria estado financeiro. Cancelamento exige revisão manual de efeitos externos e não apaga nada. Sem Edge/Storage/SMTP/env novos.

Após publicar Git, consultar schema_migrations antes de qualquer aplicação manual: a integração existente pode já ter aplicado a migration. Conferir comandos/arquivo, ACL/RLS, capacidades, contagens e advisors. Rollback somente de código preservando atendimentos/auditoria; nunca DROP/reset. Provas e limites em [fecho10](../docs/etapas/fecho-10.md).
