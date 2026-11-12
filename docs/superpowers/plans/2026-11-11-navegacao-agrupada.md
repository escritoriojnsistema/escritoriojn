# Navegação agrupada

Pedido: remover destinos duplicados da barra lateral desktop/mobile e agrupar Solicitações/Anexos, Clientes/Imóveis rurais, Serviços/Checklist, Caixa e Configurações, respeitando cada login.

Execução direta solicitada pelo usuário. Manter React/Vite/TypeScript e as telas/API existentes. Usar navegação interna por seção com rotas preservadas, sem duplicar formulários ou montar dois shells. Caixa já possui áreas incorporadas. Configurações passa a incluir Conta e funções independentes previamente concedidas, por escritório; cliente recebe somente sua Conta. Nenhuma alteração de Auth, dados, permissões ou migrations. Sem Actions ou publicação de produção.

- [x] Substituir testes de menus explícitos pelo contrato de agrupamento, composição por escritório, perfis e destaque das rotas internas.
- [x] Centralizar grupos/itens autorizados em navigation.ts; integrar navegação interna e ícones no OperationLayout. Atualizar retornos internos.
- [x] Ajustar Configurações, incluindo rota exclusiva do cliente e Conta; manter autorização das seções administrativas.
- [x] Verificar testes Node, tipos/build e navegador em 320/375/768/1440, equipe/cliente, acessos independentes e bloqueio durante comandos.
- [x] Atualizar Livro e AGENTS com resultado real; preparar conteúdo revisável para commit/PR sem merge/deploy.
