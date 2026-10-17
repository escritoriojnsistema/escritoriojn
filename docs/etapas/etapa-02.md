# Etapa 02 - Fechar navegação, visual e transporte entre interface e API
## Objetivo
Ter o mesmo caminho funcionando em desenvolvimento, preview e hospedagem de teste.
## Entrada mínima
Etapa 01 ou seu contrato necessário aprovado; falha externa independente deve ser registrada, sem alegar publicação. Ler AGENTS.md, LIVRO_RAIZ.md e docs/regras/operacao.md somente nos tópicos afetados. Reusar código existente da base nova; não importar estado do projeto antigo.
## Fazer nesta rodada
- Criar shell responsivo navy/claro/dourado, rotas registradas, PageLoading, feedback e erro/repetição.
- Montar a mesma API Express no desenvolvimento e preview; um prefixo canônico /api.
- Configurar rewrites para que /api retorne JSON e rotas de página/recarga funcionem como SPA.
- Validar build Git e versão/alias em ambiente autorizado; bloqueio de logs é registrado sem repetição cega.
## Cuidados específicos
- Ler docs/ARQUITETURA.md e docs/RAPIDEZ_E_CUSTO.md; matriz de regressão de transporte em PREVENCAO_DE_ERROS.
## Aceite
- Health e POST de validação sem efeito respondem igualmente no dev/preview; API inexistente retorna JSON404, não index.html.
- Rotas profundas e voltar/avançar funcionam, sem refresh completo em cada clique.
- 320/360/768/1440 sem corte horizontal; teclado/zoom/conteúdo longo continuam acessíveis.
- Publicação só é alegada quando comprovada; falha de Git não é resolvida por fallback manual.
## Conferência pelo usuário
Abra um link direto e recarregue; navegue pelo menu no celular. Peça a prova do POST que chega à API.
## Encerramento
Dados, backend, frontend e teste relacionados devem estar conectados. Onde não houver impacto, escrever não se aplica e não fabricar mudança. Atualizar Livro e fecho curto com resultado/testes/bloqueios. Próximo passo: Etapa 03. Se incompleta, registrar checkpoint atual, sem avançar por aparência.
