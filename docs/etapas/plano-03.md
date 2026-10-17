# Etapa 03 — plano de implementação

Objetivo: instalar a fundação de autorização vigente, isolada por escritório, conforme o cartão 03 e `../regras/acesso.md`. Base: e1c5e9d; React + Vite e telas compactas preservados.

## Decisões e interfaces

- Sete tabelas: offices, profiles, roles, permissions, role_permissions, memberships e audit_events. Catálogo global; vínculos e auditoria por office_id. UUID, timestamptz, active, autoria de sessão e FKs restritivas, sem cascata de histórico.
- Papéis comerciais owner/admin/employee/client. foundation.access para os quatro; audit.read somente owner nesta etapa. Nenhuma capacidade técnica implícita.
- Um helper privado `private.current_permissions(uuid) → text[]` consulta usuário, perfil, escritório, vínculo, papel e capacidades ativos. SECURITY DEFINER é necessário para evitar recursão de RLS; search_path vazio, nomes qualificados e EXECUTE mínimo.
- RPC `public.access_context(p_office_id uuid)` SECURITY INVOKER retorna somente contexto próprio autorizado: office_id, user_id, role_code e permissions. Não aceita ator/papel no payload; nunca usa metadata ou e-mail como permissão.
- `private.provision_owner(uuid, text, uuid) → uuid`: rotina INVOKER exclusiva do operador, primeira instalação, UUID Auth confirmado explícito, lock e evento transacional. Sem conta/senha no seed. Não provisionar funcionários nem recriar Auth nesta etapa.
- API comum tem SELECT limitado e nenhuma escrita na fundação; RLS explicita negação de mutação. Auditoria append-only para a aplicação. Nenhuma leitura genérica de auth.sessions.
- SMTP informado como configurado pelo usuário: preservado no provedor. Sem ler senha, alterar templates, enviar mensagens ou ativar login antes da 04.

## Execução e aceite

1. [x] Testes antes da migration: banco PostgreSQL 17 descartável, duas instalações vazias, migrador NOSUPERUSER/NOBYPASSRLS, grants semelhantes ao hospedado e papéis anon/authenticated/service_role.
2. [x] Migration gerada pelo CLI oficial e versionada com seed mínimo; constraints, índices pertinentes, RLS, ACL e RPC. Testes A/B, sem vínculo, payload forjado, inatividade e mudança de capacidade sem renovar claims.
3. [ ] CI com `npm run test:db`, revisão independente e replay. Confirmar hosted schema/migrations antes da aplicação incremental; nenhum dado sintético no remoto.
4. [ ] Conferir tabelas/ACL/RLS, advisors e proprietário pelo procedimento restrito. Verificar Git/CI/Vercel e manter frontend/API pública estáveis. Atualizar Livro/fecho com evidências e limites.

Foco da revisão: bypass do helper, EXECUTE herdado de PUBLIC, autor forjado, claim antigo e inatividade, seed/replay sem superusuário. A suíte deve exercitar cada caso, inclusive privilégios mais amplos no teste isolado para provar a camada RLS.

Frontend e Express: sem nova funcionalidade visual ou endpoint privado antes da 04; a interface backend desta etapa é o RPC de contexto. Não fabricar mudança de tela por uma etapa de banco. Rollback: reversão de código; bloquear vínculos se necessário e preservar tabelas/histórico. Não executar DROP no hospedado.
