# Etapa 06 - Consolidar auditoria, privacidade e retenção
## Objetivo
Ter histórico confiável de ações e regras claras sobre quem pode ver, guardar ou excluir dados.
## Entrada mínima
Etapa 05 ou seu contrato necessário aprovado; falha externa independente deve ser registrada, sem alegar publicação. Ler AGENTS.md, LIVRO_RAIZ.md e docs/regras/acesso.md somente nos tópicos afetados. Reusar código existente da base nova; não importar estado do projeto antigo.
## Fazer nesta rodada
- Criar consulta administrativa paginada de eventos, com filtros e escopo por escritório.
- Garantir eventos de negócio no servidor/transação e negar alteração por usuário comum.
- Registrar inventário de tratamento, classes de retenção, solicitação de titular e plano de incidente.
- Criar contratos de emissão de evento para módulos seguintes, sem registrar conteúdo sensível em logs.
- Implementar Arquivados com referência mínima e restauração, sem apagar auditoria nem reativar conta.
## Cuidados específicos
- Arquivados é recurso do produto; manter auditoria append-only e não reativar acesso ao restaurar.
## Aceite
- Ator não pode ser inventado pelo cliente; usuário não edita/apaga evento.
- Auditor de A não vê B; exportação tem capacidade e histórico.
- Falha na auditoria crítica não deixa operação crítica sem evidência.
- Exclusão/desativação de conta não apaga registros de negócio.
## Conferência pelo usuário
Faça uma alteração autorizada e veja quem fez, quando e em qual registro. Entre como funcionário sem audit.read e confira a negação.
## Encerramento
Dados, backend, frontend e teste relacionados devem estar conectados. Onde não houver impacto, escrever não se aplica e não fabricar mudança. Atualizar Livro e fecho curto com resultado/testes/bloqueios. Próximo passo: Etapa 07. Se incompleta, registrar checkpoint atual, sem avançar por aparência.
