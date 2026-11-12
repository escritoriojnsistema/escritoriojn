# Etapa 34 — Leitura e acessibilidade

Base conferida antes de modificar: main e6a14ff, Livro/AGENTS, Etapa33 publicada e correções posteriores de acesso/navegação. Manual34 do Drive e portal-pwa/RF18 consultados. React + Vite + TypeScript/Express preservados, Node24.22.1/npm11.9.0. Plano e cartão nesta pasta.

## Comportamento

- Editor lê a prévia resolvida visível, inclusive ajustes locais. Portal abre o mesmo PDF autorizado pelos gates25/26/32, reconfere o estado depois dos bytes e extrai texto localmente. Não recebe texto interno/modelo por uma nova API. O acesso usa o ledger existente de download autorizado, sem comprovar recebimento/leitura.
- Voz somente por ação do usuário, português local informado pelo navegador, prioridade pt-BR e alternativa portuguesa. Voz ausente, remota/indeterminada, navegador incompatível ou erro oferecem texto na tela/orientação ao escritório. Nenhuma síntese remota/IA contratada ou transmissão adicional do documento. O indicador localService é informação do navegador; a interface recomenda conferir configurações e ambiente reservado, sem prometer auditoria física do dispositivo.
- Iniciar/parar e pausar/retomar quando métodos existem; falha de pausa no aparelho orienta parar/reiniciar. Texto longo usa blocos limitados; callbacks antigos não retomam texto cancelado. Cancelamento normaliza pausa somente depois de cancelar a fila. Editar, trocar revisão/aba/documento, fechar leitura, ocultar aba do navegador, sair ou perder autoridade interrompe. Reflow para mobile e painel Revisão/entrega também interrompem leitura que ficaria oculta.
- PDF.js6.5.438 e worker do próprio domínio carregam sob demanda, sem CDN, persistência, OCR, novo pipeline ou recurso remoto. Limites3MiB/120páginas/150milcaracteres/20s; PDF sem texto, protegido ou incompatível recebe alternativa explícita, sem texto inventado/parcial. Texto extraído permanece visível e pode diferir na ordem de tabelas/colunas; original conserva diagramação/assinaturas. Na equipe, texto e iframe alternam na mesma área.
- Padrão Equipe/Convites e navegação agrupada preservados. Até4atalhos, leitura na área existente, controles44px, fonte móvel16px, foco por teclado, atalho para conteúdo e rolagem natural em zoom/teclado virtual. Títulos/abas/header quebram em larguras estreitas, sem overflow escondendo conteúdo. Sem spinner/overlay/rótulo de carregamento.

## Camadas e desempenho

Frontend: componentes documentReading e integrações em DocumentEditor, VersionsPanel e PortalLibrary; ajustes de foco/reflow nos estilos compartilhados. PDF/voz somente após ação, parser fora do pacote inicial e processamento em worker. Nenhuma consulta adicional de banco ao navegar; abrir leitura usa download existente e reconferência de estado para não apresentar versão obsoleta.

Backend/worker: contratos, Bearer, no-store, SHA256 e reautorização existentes reaproveitados. Novo endpoint/mudança de regra: **não se aplica**. Supabase: consulta somente leitura confirmou76migrations/última20261111190203; wrappers32 públicos INVOKER e gate25 existentes conferidos. Nova migration/RLS/grant/fixture/Auth/storage/tipo gerado: **não se aplica**. Nenhuma escrita hospedada foi feita por34.

Dependências: pdfjs-dist fixado e lock atualizado; todos os registros anteriores do lock permanecem iguais. Evidências históricas19/20 não foram reescritas. Os dois testes que congelavam todo package.json/lock agora conferem o grafo original de19dependências do renderizadorPDFKit, além dos hashes anteriores de motores/fontes/adaptadores/migrations. O teste de navegação bloqueada tenta clique forçado no link aria-disabled para exercitar a proteção existente; Playwright aguarda habilitação num clique comum.

## Verificações e estado

APROVÁVEL para revisão e publicação autorizada.401testesNode, tipos/build/auditprodução0 e120cenários distintos de navegador aprovados. A rodada integrada teve119/120; o único cenário320×568 foi corrigido por compactação sem remover informação e reexecutado com as oito rotas públicas aprovadas. Registros iniciais/limites em `docs/evidencias/etapa-34/verificacao.json`. Contratos de navegador usam identidades/respostas fictícias explícitas e PDF real; não comprovam logins pessoais hospedados. Voz física Android/iOS, pronúncia por leitor de tela e garantia do sistema operacional exigem conferência em aparelho; não se declara conformidade WCAG integral nem latência física zero.

Revisão independente somente leitura encontrou três problemas de pausa/visibilidade. Testes RED→GREEN cobrem as correções; a observação de zoom foi incorporada à jornada ativa de leitura por teclado. Sem achado crítico. Não foi solicitada segunda revisão: a correção é comprovada pelas regressões e suíte final.

GitHub/Vercel: preparação de PR e preview pela integração GitHub→Vercel; semActions/deploydireto/alteração de configuração. Produção permanece na versão publicada anterior até autorização explícita para integrar e publicar. Não alegar publicação34 antes de comprovar deployment/commit.

Próxima etapa35 somente após aceite34 e novo pedido. Para continuidade: Livro/AGENTS, este fecho, plano/cartão34, evidências e portal-pwa apenas no tópico afetado. Não refazer identidade, pedidos, Storage, gates ou infraestrutura das etapas anteriores.
