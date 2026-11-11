# Correção dos acessos e portais após a Etapa 33

> Execução nativa nesta sessão, conforme pedido de investigação e correção completa do usuário.

**Objetivo:** preservar a separação equipe/cliente em toda a sessão e recuperar os caminhos de acesso autorizados das etapas01–33.
**Arquitetura:** contexto oficial continua verificado no servidor/banco. Uma preferência de portal por sessão contém somente correlação e área; nunca permissões. Um limite central impede montar módulos do outro portal. Menus e agrupadores usam capacidades no mesmo escritório.
**Stack:** React/Vite/TypeScript, Express, Supabase, GitHub→Vercel.
**Especificação:** pedido do usuário11/11, LIVRO_RAIZ.md, AGENTS.md e docs/regras/acesso.md (conferido no Drive).

## Restrições
- Preservar etapas01–33, escopo por registro, concessões e dados; não iniciar34.
- Sidebar completa, até4atalhos mobile, sem loaders; padrão Equipe/Convites.
- Sem Actions, fixtures hospedadas, permissões automáticas ou reaplicação de migrations.

## Revisão prioritária
- Conta com equipe em um escritório e cliente em outro não mistura áreas após foco/reload/refresh.
- Sessão antiga sem preferência continua acessível conforme vínculos atuais; mudança de sessão não herda área/dados.
- URL digitada não monta módulo oposto, nem dispara sua API.
- Escritórios diferentes não somam capacidades; subárea abre escritório autorizado em vez de negar por seleção inicial incompatível.
- Callback/recuperação/convite,503 e navegação bloqueada preservam contratos existentes.

## Tarefas
- [x] Reproduzir separação e caminhos faltantes com testes de navegador antes de alterar produto; baseline Node.
- [x] Fixar portal na sessão verificada, filtrar contexto em toda revalidação e bloquear montagem do módulo oposto.
- [x] Corrigir caminhos autorizados dos agrupadores/menu; inventariar etapas01–33 e testar seleção por escritório e papéis.
- [x] Regressões Node/build/browser, revisão independente e verificações read-only de backend/Supabase.
- [ ] Atualizar Livro/continuidade/evidências, publicar GitHub→Vercel e conferir produção.
