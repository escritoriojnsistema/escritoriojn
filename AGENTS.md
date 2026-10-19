# Escritório JN — continuidade

- Stack fixa: React + Vite + TypeScript; API Express sob `/api`; Supabase nas etapas pertinentes. Não migrar para Next.js.
- Leia `LIVRO_RAIZ.md`, o cartão atual em `docs/etapas/` e somente as regras afetadas. A numeração oficial é Etapa 01–40, sem módulos paralelos.
- Execute apenas a etapa solicitada. Reaproveite a base nova; preserve sistema anterior, banco, dados, credenciais e deploys.
- Priorize o conteúdo principal em uma tela: reduza espaços e redundâncias antes de dividir fluxos. Preserve alvos de 44px, inputs móveis de 16px, foco e mensagens. Conteúdo longo, zoom ou teclado podem exigir rolagem natural; nunca corte com overflow hidden para aparentar caber.
- Campos de preenchimento sem quadros internos ou sombras, inclusive no autofill. Indique foco pela borda do campo/wrapper; preserve o foco visível de botões/links. Reutilize as regras globais em novas telas.
- Mobile: no máximo quatro atalhos principais com ícone e rótulo, incluindo Início e Conta. Os demais destinos autorizados ficam no menu lateral. Reutilize `OperationLayout` e `mobileOperationNavigation` para todos os perfis/telas, sem atalhos fictícios.
- Navegação sem loaders/overlays: mantenha menu e contexto verificado da mesma sessão durante revalidação em segundo plano. Nunca exiba dados de outra sessão; 401/403/falha de verificação continuam bloqueando. Logo/Início retornam ao painel autenticado; navegação não chama signOut. Renovação de token não é troca de sessão.
- Ações em desktop/mobile mantêm o rótulo do botão durante execução, sem spinner, overlay ou texto de carregamento. Bloqueie repetição enquanto pendente; preserve mensagens de sucesso/erro e verificações de acesso.
- CPF em qualquer novo formulário (convite de qualquer papel, cliente e conferência) reutiliza `shared/identifiers.ts`: máscara incremental `000.000.000-00`, somente dígitos no transporte e validação dos dígitos verificadores no cliente/servidor/banco. CNPJ numérico segue a mesma regra com sua máscara. Isso não prova identidade nem consulta órgão oficial.
- Clientes exigem customers.read; create/update são adicionais, read_all amplia somente dentro do escritório. Na07, sem read_all o escopo é o criador. Relações/representantes/mesclagem ficam na08. Identificador/contato nunca em URL/log/audit.changes; lista mascarada, detalhe autorizado e pesquisa POST. Ficha não cria login.
- Estado de páginas privadas é descartado ao trocar UID/session_id ou autoridade. Use as chaves de operação do router; não remonte Provider/Login/Callback durante adoção/PKCE. Refresh da mesma sessão/permissões preserva formulários; mudança de conta/função não reapresenta listas/rascunhos anteriores.
- Prazo individual futuro: contrato em `docs/etapas/ajuste-06-navegacao-sessao.md` (10/15/30padrão/60/nunca; Conta/gestão autorizada). Ainda não ativo; não criar seletor sem persistência nem usar localStorage/metadata como autoridade. Aplicação exige servidor/RLS/auditoria e isolamento por identidade/sessão.
- Não simule login, permissões, dados reais ou integrações. Não exponha segredos em `VITE_*`, Git, bundle ou logs.
- Valide frontend → API → dados quando aplicável; ausência de impacto deve constar como não se aplica.
- Use as habilidades pertinentes do plugin Desenvolvimento Profissional IA. Registre testes realmente executados, lacunas e próximo checkpoint no Livro.
- Não publique em produção, contrate serviços ou aplique alterações destrutivas sem autorização específica.
- Este arquivo foi criado nesta etapa a partir do manual v4: o AGENTS original do pacote não estava disponível no Drive/repositório consultados.
