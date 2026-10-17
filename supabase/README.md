# Fundação de acesso — etapa 03

`migrations/` é a fonte versionada. O seed mínimo faz parte da migration; não depende de cadastrar um usuário depois nem contém contas/senhas. Não repetir migration aplicada, editar seu histórico ou usar este projeto para fixtures.

Execute `npm run test:db` com Docker Linux disponível. O runner cria e remove somente seu container por nome aleatório, sem rede, portas ou conexão remota. Dois replays validam PostgreSQL 17, migrador sem superusuário/BYPASSRLS e papéis reais anon/authenticated. `tests/database/bootstrap.sql` representa apenas o contrato mínimo Auth do provedor; não é migration de produção.

## Aplicação e proprietário

1. Conferir projeto novo e histórico remoto; aplicar o mesmo SQL versionado atomicamente via ferramenta de migrations autorizada.
2. Conferir RLS, ACL/EXECUTE, seed e advisors; `private` não deve estar nos schemas expostos do PostgREST.
3. Operador autorizado verifica o UUID da identidade Auth confirmada do proprietário indicado. Não procurar identidade pelo primeiro visitante nem aceitar e-mail/ator do navegador.
4. Executar `private.provision_owner(verified_auth_user_id, office_name, request_id)` na sessão administrativa. Os três parâmetros são obrigatórios. Rotina não acessível por anon/authenticated/service_role; ela cria primeiro escritório/vínculo e auditoria juntos. Uma nova tentativa após a instalação é recusada.
5. Registrar apenas contagens e resultado no Git público, nunca UUID/e-mail pessoal. Os demais vínculos não são criados por este bootstrap. A etapa 04 conecta a sessão do aplicativo ao RPC `public.access_context(p_office_id)`.

Sem chave privilegiada, senha de usuário ou senha SMTP no app. Custom SMTP permanece no Supabase; templates e entrega de mensagens serão tratados nas etapas futuras. Se houver divergência ou falha, preservar histórico e negar acesso; não remover RLS/grants como correção.
