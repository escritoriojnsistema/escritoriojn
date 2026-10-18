# Ajuste da etapa 05 — operação e navegação responsiva

Pedido: eliminar o cartão intermediário de confirmação após login, abrir a operação para os quatro perfis, incluir Conta e adaptar o menu/ações ao celular.

Decisão: manter React + Vite, API Express e autorização Supabase existentes. Área de operação usa contexto verificado pelo servidor, nunca a escolha do formulário. /acesso decide entre /painel e /area-cliente. /conta e /minha-conta são rotas protegidas, somente leitura dos dados já disponíveis e recuperação de senha existente. Não criar funções futuras fictícias. Registro central de navegação permite acrescentar módulos no contrato correto.

Sidebar no desktop; botão Menu 44px, diálogo nativo com foco modal/Escape/fundo e barra de atalhos no mobile/tablet. Conta e saída acessíveis em todos os perfis; Equipe apenas users.manage atual e área não cliente. Gestão reaproveita layout. Ícones decorativos mantêm nomes acessíveis; botão Novo convite compacto no celular. Campos conservam estilos globais sem sombra/quadro e fontes móveis 16px. Rolagem natural para listas/zoom/teclado; início cabe em 320x568/360x640.

Backend/banco: não se aplica alteração de contrato/migration/Edge/SMTP. Sessão real, RLS/RPC, revogação, último owner e delegação continuam obrigatórios. Nenhuma conta hospedada, senha, papel ou dado alterado; fixture cliente acrescentada só no laboratório Docker descartável. Templates de e-mail mantidos.

Revisão independente encontrou e corrigiu dois P2, reproduzidos antes: erro de logout atrás do modal e rotas cliente com barra final/caixa. Sem outro bug concreto identificado na segunda leitura.

Validação local concluída em 18/10/2026:

- 23 testes Node/API/SMTP/callback passaram; 20 fluxos Auth reais no laboratório Docker com GoTrue2.197.0/PostgREST16.4/Mailpit/Postgres17 passaram, incluindo login e Conta nos quatro perfis e entrada pelo formulário oposto.
- 23 contratos de interface passaram: celulares320/360, tablet768 e toque980, desktop1440, viewport efetivo720x450 para zoom200%, foco/autofill/alvos44, abertura/fundo/Escape/retorno do foco, navegação e permissões, recarga, erros e normalização de caminhos. Conta/recuperação acima dos atalhos em360x640; dados longos têm rolagem natural.
- 34 E2E públicos locais passaram; typecheck/build e auditoria de dependências de produção passaram, zero vulnerabilidades. Screenshots fictícios em360/1440 foram inspecionados, inclusive início, Conta e menu. SQL não mudou: replay local não repetido; CI mantém sua verificação integral de banco.
- Supabase hospedado conferido somente em leitura: ACTIVE_HEALTHY/PG17.11, quatro identidades Auth e um vínculo ativo preservados. Esses totais não concedem acesso às demais contas; ingresso/delegação seguem o contrato05.
- Na versão atual do SDK, HTTP500 ao sair ainda remove a sessão local. O teste do alerta usa falha controlada antes da remoção, explícita como contrato visual; não altera o comportamento do SDK/provedor.

Entrega: branch fix/operacao-mobile a partir de main6005d0c. PR, CI e deploy serão registrados após conclusão. A autorização técnica Git/Vercel anterior persiste neste pedido de corrigir o sistema publicado; não há contratação, mudança de proteção ou ação destrutiva. Testes de contratos não comprovam SMTP; autenticação real foi provada no laboratório. Não usar contas reais/links pessoais para homologar automaticamente. Etapa 06 não iniciada. Rollback somente código ao main6005d0c, preservando banco e histórico.
