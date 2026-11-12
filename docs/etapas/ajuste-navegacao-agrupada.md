# Navegação agrupada — 11/11/2026

Pedido do usuário sobre a base main30fa60c: retirar os atalhos duplicados da barra lateral desktop/mobile e manter as funções dentro das suas áreas, para todos os perfis conforme a autorização vigente. Não inicia a Etapa34.

## Comportamento

- Solicitações contém navegação interna para Solicitações e Anexos, tanto na equipe como no cliente.
- Clientes contém Clientes e Imóveis rurais. Serviços contém Serviços e Checklist. As telas existentes são reutilizadas por rotas, em um único shell, sem duplicar formulários, provedores ou APIs.
- Caixa conserva as áreas já incorporadas de Cobranças, Despesas e movimentações e Relatórios financeiros; os atalhos separados saem da barra lateral.
- Configurações contém Equipe e convites, Auditoria, Arquivados, Categorias, Acessos, Privacidade e Conta conforme as permissões do escritório selecionado. Concessões independentes de Auditoria/Equipe/Arquivados continuam acessíveis sem settings.access. Categorias/Acessos/Privacidade mantêm as exigências anteriores.
- Configurações do cliente usa `/minhas-configuracoes`, classificada como portal de cliente, e contém somente sua Conta. A barreira entre portais continua vigente.
- No mobile, o atalho Ajustes com engrenagem substitui Conta e leva à seção que a contém. Mantidos no máximo quatro atalhos e acesso direto à Conta no cabeçalho. Ícones de Solicitações, Clientes e Serviços atualizados no registro compartilhado desktop/mobile.
- Rotas internas destacam o pai correto e oferecem retorno ao grupo. Links novos respeitam busy; as proteções de comandos incertos e sessão permanecem existentes. office_id é apenas indicação de seleção e é validado pelos contextos vigentes.
- A navegação interna aparece quando há mais de uma opção autorizada. Espaçamento compacto e descrição menor do Checklist preservam o conteúdo em 360×640, com controles de44px e rolagem natural.

## Autorização e limites

A navegação nunca soma permissões de escritórios diferentes. Checklist sem services.read continua acessível pelo grupo Serviços, direcionado ao checklist autorizado. Conta não depende de settings.access; isso não concede leitura/escrita administrativa.

Sem alterações de API, Auth, sessão, vínculos, grants, RLS, banco ou migrations. Validação frontend→API→dados não se aplica à alteração: os contratos existentes de autorização continuam intocados. Nenhuma credencial ou dado hospedado foi usado nos testes. Fixtures locais são explícitas e não comprovam login pessoal em produção.

Revisão independente somente leitura não identificou bug concreto no diff. Resultados reais de tipos/build/Node/navegador constam em `docs/evidencias/navegacao-agrupada/verificacao.json`. Os testes antigos que esperavam Anexos/Conta no menu foram adequados ao pedido; o contrato de anexos agora usa sessões independentes para equipe e cliente, preservando a escolha fixa de portal.

Validação: build/tipos,393testesNode e27cenários finais distintos de navegador aprovados, incluindo os quatro perfis em320/375/768/1440. As rodadas iniciais e reexecuções estão discriminadas nas evidências; nenhuma falha permanece sem reconferência.

Publicação de produção autorizada explicitamente pelo usuário em12/11/2026. PR121 integrado no merge38c1e73; implantação dpl_GsKi4iGyb9ptjvjRmH9UX9b11NRq READY, origemGit, domínio oficial https://escritoriojn.vercel.app.24cenários públicos aprovados em320/1440, incluindo a nova rota de Configurações do cliente.74assets públicos conferidos, com marcadores da navegação agrupada; HTML e saúde200. Consulta agregada dos logs dessa implantação sem erros/fatais. Não foram usados logins pessoais nem realizadas mutações de dados hospedados. Registro em docs/evidencias/navegacao-agrupada/publicacao.json.

A continuidade documental e os testes públicos adicionados depois dessa conferência não alteram o runtime. Autorização desta publicação já fornecida; sem deploy direto ou GitHub Actions.
