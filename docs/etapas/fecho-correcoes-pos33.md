# Correções de acessos e separação dos portais após33

Pedido de11/11/2026: investigar telas ausentes nas etapas implementadas e impedir funções de cliente no login da equipe ou o inverso. Base atualizada antes de modificar: main5558136, Etapa33 publicada (não iniciar34). Regras de acesso conferidas no Drive, AGENTS e Livro Raiz.

## Causas e correções

- A seleção do login durava apenas o handoff. O próximo `/api/auth/context` voltava a reunir todos os vínculos do UID. AuthProvider agora valida a resposta completa e publica somente o portal selecionado para aquele UID/session_id em toda revalidação. Revogação bloqueia, sem migrar para outro papel.
- `PortalBoundary` impede montar páginas privadas do outro portal, inclusive aliases/URL digitada, antes de sua API ou dados. Menus, Conta, notificações e disponibilidade recebem somente os contextos da área atual. A marca/Início segue a área da sessão em todas as rotas do cliente.
- A preferência versionada guarda somente scope/portal/revisão, sem token, permissões ou dados de negócio. Local e sessionStorage reconciliam a revisão mais recente, inclusive quando quota impede atualizar o marcador local. A memória mantém a escolha durante navegação/revalidação; autorização continua oficial por API/RLS. Outra sessão não herda preferência.
- Convite e callback verificado são transições explícitas: escolha de equipe depois do aceite é revalidada no servidor. Resposta antiga não altera área nem navega na sessão nova; a correlação esperada é obrigatória nesses chamadores. Callback sem área explícita preserva a seleção legada por vínculo real.
- Menu lateral agora expõe destinos administrativos e financeiros autorizados mesmo quando também agrupados em Configurações/Caixa: Equipe e convites, Auditoria, Arquivados, Categorias, Acessos, Privacidade, Cobranças, Despesas e Relatórios. Cada composição exige permissões no mesmo escritório e o papel adequado. Nenhuma concessão automática.
- Categorias/Acessos/Privacidade escolhem escritório elegível para a seção. Documentos respeita a aba solicitada quando precisa selecionar o escritório inicial. Modelos/documentos/revisões continuam em um único fluxo, com autorização vigente.
- Removido indicador textual pendente do sino. Feedback de acesso foi extraído em módulo leve para preservar lazy loading das telas de negócio. Mantidos quatro atalhos mobile, layout Equipe/Convites, controles de44px, cancelamento e navegação bloqueada de comandos incertos.

## Permissões e dados reais

Consulta hospedada somente agregada encontrou sete contas/vínculos ativos, sem usuário com ambos os papéis em escritórios diferentes. Owner tem90capacidades efetivas; administrador5; funcionário1; clientes0 internas. Logo, parte das funções ausentes corresponde às concessões reais, além das falhas de navegação corrigidas. O gestor decide os acessos em Equipe e convites; esta tarefa não modifica os grants para transformar todos os perfis em administradores.

Não houve migration, escrita em Auth, criação de fixtures hospedadas ou alteração de vínculo/permissão. Última migration continua20261111190203 (76). Não reaplicar31/32/33. Backend Express, projeção `/api/auth/context?area=...`, escopo por recurso e Supabase permanecem as fontes de autoridade. Nenhuma função futura ou catálogo/preço fictício foi criado.

## Verificação

Resultados finais e publicação são registrados em `docs/evidencias/correcoes-pos33/verificacao.json` e `publicacao.json`. O laboratório descartável usa GoTrue/Postgres/PostgREST/Express/Chromium reais, exclusivamente loopback; não aceita endpoint hospedado. Os testes visuais usam fixtures explícitas e não são prova de login pessoal em produção. Não foram solicitadas nem usadas senhas reais.

Revisão independente reproduziu e confirmou a correção de aceite de cliente para equipe, quota com marcador antigo e resposta tardia entre duas sessões. Fixtures31 foram corrigidas para começar no portal de equipe ao testar equipe, em vez de abrir primeiro o portal de cliente e trocar silenciosamente a resposta de papel. O teste de restauração rural agora exige que nem o módulo privado seja montado antes da autorização.

Mapa completo: [Etapas01–33](mapa-acessos-01-33.md). Publicação exclusivamente por GitHub→Vercel, sem Actions/deploy direto. A conferência hospedada testa saúde, barreiras anônimas, no-store e bytes dos assets; não afirma ausência de latência física nem acesso autenticado a dados reais do usuário.

## Publicação conferida

[PR119](https://github.com/escritoriojnsistema/escritoriojn/pull/119), featurea6470f2/merge78b6b15, árvore46e33f0. PreviewESZgqjBB e produçãoDRjydN7READY, sourceGit.391Node,337cenários distintos de navegador aprovados (244regressões intactas +93casos afetados finais, com os últimos26reexecutados após os ajustes finais),8cenáriosAuthreais locais,26públicos hospedados. Os74assets da produção têm SHA256 idêntico ao build local; entradaHTMLno-store e saúde200. Sem sessão pessoal autenticada hospedada. Fonte e evidências em [publicacao.json](../evidencias/correcoes-pos33/publicacao.json), [verificacao.json](../evidencias/correcoes-pos33/verificacao.json) e [bundle-publicado.json](../evidencias/correcoes-pos33/bundle-publicado.json).

O fecho documental registra a publicação já conferida e preserva os bytes do runtime; continua somente GitHub→Vercel, semActions. Nenhuma migration/Auth/grant/fixture hospedado escrito.
