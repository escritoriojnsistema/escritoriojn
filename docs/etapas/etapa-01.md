# Etapa 01 - Criar o projeto do zero e iniciar a continuidade
## Objetivo
Abrir uma base nova e executável, separada do sistema antigo, com controle simples de continuidade.
## Entrada mínima
Diretório novo identificado; preservar o projeto anterior. Ler AGENTS.md, LIVRO_RAIZ.md e docs/regras/operacao.md somente nos tópicos afetados. Reusar código existente da base nova; não importar estado do projeto antigo.
## Fazer nesta rodada
- Confirmar diretório/contas de destino sem apagar ou resetar o projeto anterior.
- Criar React + Vite + TypeScript e API Express mínima, mesmo prefixo /api, com health e tela inicial.
- Criar lockfile, README, .env.example sem segredo; usar AGENTS/LIVRO_RAIZ curtos deste pacote.
- Provar npm ci, execução local, health e build; registrar só configuração e decisões necessárias.
## Cuidados específicos
- Ler COMECE_AQUI.md, AGENTS e Livro; arquitetura mínima em docs/ARQUITETURA.md. Não carregar o manual inteiro no contexto.
## Aceite
- Frontend e health respondem; build limpo funciona e aponta dependência ausente com clareza.
- Nenhum dado, banco, segredo ou deploy antigo é modificado ou copiado.
- LIVRO_RAIZ registra 01 atual e próximo passo; não simula login/dados reais.
## Conferência pelo usuário
Abra a página inicial e peça evidência de health/build. O login real virá na etapa 04.
## Encerramento
Dados, backend, frontend e teste relacionados devem estar conectados. Onde não houver impacto, escrever não se aplica e não fabricar mudança. Atualizar Livro e fecho curto com resultado/testes/bloqueios. Próximo passo: Etapa 02. Se incompleta, registrar checkpoint atual, sem avançar por aparência.
