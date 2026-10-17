# Etapa 03 — banco, perfis e barreiras de acesso

## Implementação

Migration `supabase/migrations/20261017192859_foundation_access.sql`, criada com Supabase CLI 2.121.0. Instala sete tabelas com chaves, checks, índices, horários timestamptz, autoria de sessão/operador e referências restritivas. Seed contém quatro papéis comerciais e duas capacidades, sem contas ou senhas. Proprietário possui foundation.access/audit.read; admin, funcionário e cliente possuem apenas foundation.access nesta etapa. Nenhum poder técnico implícito.

Todas as tabelas públicas têm RLS. Anônimo não tem SELECT/RPC. Autenticado lê apenas o próprio perfil/vínculo e o escritório autorizado; auditoria exige foundation.access e audit.read no mesmo escritório. Não há escrita de fundação disponível à aplicação, inclusive ao proprietário comercial. Catálogos não são expostos diretamente à API.

`private.current_permissions(uuid)` é o único helper de autorização privilegiado: consulta estado atual de Auth/perfil/escritório/vínculo/papel/capacidade. Não aceita user_id/papel e não consulta metadata. Usa SECURITY DEFINER somente para evitar recursão nas tabelas que protege, search_path vazio, nomes qualificados e EXECUTE restrito. A migração funciona sem superusuário/BYPASSRLS porque o migrador é dono das tabelas. `private` deve permanecer fora dos schemas expostos do PostgREST.

RPC `public.access_context(p_office_id uuid)` é SECURITY INVOKER e retorna linhas com office_id, user_id, role_code e permissions para contexto próprio autorizado. Ausência de vínculo/permissão retorna vazio. A etapa 04 usará identidade verificada e este contrato, sem cache global de poderes.

`private.provision_owner(uuid,text,uuid)` é INVOKER exclusiva do operador SQL, sem EXECUTE para PUBLIC/anon/authenticated/service_role. Verifica UUID Auth confirmado/ativo, impede segunda instalação com lock e grava evento de auditoria na mesma transação. Ator é o operador SQL identificado por current_user; o usuário provisionado é o sujeito, sem inventar sessão Auth. Auditoria é append-only para a aplicação; administrador do banco ainda pode alterar estruturas.

## Evidência isolada

`npm run test:db`: container PostgreSQL 17 por digest, sem rede/portas e removido ao final; dois bancos vazios independentes. Provider contract mínimo para auth.users/auth.uid; credenciais, JWT assinado e e-mail reais não são simulados como prova de login. Migrações executadas como migrator NOSUPERUSER/NOBYPASSRLS; RPC e consultas como anon/authenticated, com grants amplos de origem revogados pela migration.

**60 verificações passaram (30 por replay)**: seed sem contas, ACL/EXECUTE, ausência de definer público, bootstrap confirmado e único com auditoria, rollback completo se auditoria falha, A/B em ambas as direções, sem vínculo, metadata forjada, escopo nulo, negação de alteração de papel/ator/auditoria, perfil/vínculo/escritório/papel inativos, banimento Auth, revogação de capacidade e troca de papel com os mesmos claims. RLS também nega INSERT/UPDATE/DELETE depois de ampliar grants somente no banco descartável.

O teste inicial falhou por ausência das sete tabelas antes da implementação (RED); os dois replays passaram após a migration (GREEN). CI adiciona job database separado; o runner não aceita DATABASE_URL nem destino remoto. Fixtures nunca serão inseridas no projeto hospedado.

## Camadas e pendências de entrega

- Banco/backend: tabelas, RLS, RPC e provisionamento restrito implementados; conferência/aplicação remota pendentes.
- Frontend/Express: sem mudança funcional necessária nesta etapa; React + Vite, identidade e cinco telas compactas preservados. Não criar tela artificial de administração nem ativar login antes da 04.
- SMTP: usuário informou Enable custom SMTP com senha de aplicativo configurado. Preservado no provedor; segredo não lido nem copiado. Envio/entrega de e-mail e templates não testados nesta etapa.
- Contas existentes: preservar as quatro identidades Auth. Somente proprietário é provisionado pela rotina desta etapa; outros vínculos administrativos pertencem ao fluxo autorizado posterior. Sem alteração de senha, sessão ou metadata.
- GitHub/Vercel: branch feat/etapa-03-acesso; CI, revisão e publicação em preparação. Resultado remoto será registrado após evidência.
- Regressão local: typecheck, cinco testes Node e build frontend/backend passaram. A suíte de navegador será confirmada pelo CI da entrega; nenhuma tela foi alterada.

**Status: APROVÁVEL LOCALMENTE; entrega remota pendente.** Rollback não destrutivo: reverter código e bloquear vínculos quando necessário, preservando tabelas/auditoria. Não executar DROP ou importar estado antigo. Próximo passo oficial: 04, apenas quando solicitado e após fechar o checkpoint 03.
