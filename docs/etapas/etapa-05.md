# Etapa 05 - Gerenciar funcionários, convites e permissões
## Objetivo
O proprietário poderá dar acesso a cada funcionário e desligar uma conta sem perder histórico.
## Entrada mínima
Etapa 04 ou seu contrato necessário aprovado; falha externa independente deve ser registrada, sem alegar publicação. Ler AGENTS.md, LIVRO_RAIZ.md e docs/regras/acesso.md somente nos tópicos afetados. Reusar código existente da base nova; não importar estado do projeto antigo.
## Fazer nesta rodada
- Criar gestão de contas por capacidade users.manage, com convites e estado ativo/inativo.
- Conceder papéis e capacidades explícitas de módulos já existentes; capacidade futura não cria função pronta.
- Impedir escalada por administrador delegado e retirada acidental do último proprietário ativo.
- Criar delegação com escopo/validade, procedimento de revogação, acesso sem autenticador obrigatório e auditoria.
## Cuidados específicos
- Prova especial: replay vazio/seed e RPC com privilégios semelhantes ao hospedado; não apenas postgres superusuário.
## Aceite
- Funcionário não convida administrador nem muda o próprio poder.
- Revogação vale na próxima operação; token antigo não contorna bloqueio.
- Último proprietário não pode ser removido inadvertidamente; convite expirado/reutilizado é recusado.
- Histórico permanece ligado ao autor desativado.
- Instalação nova com seed entrega users.manage ao proprietário autorizado e funciona sem superusuário.
## Conferência pelo usuário
Convide um funcionário de teste, dê só acesso básico e confira o menu. Desative-o e tente usar sua sessão aberta.
## Encerramento
Dados, backend, frontend e teste relacionados devem estar conectados. Onde não houver impacto, escrever não se aplica e não fabricar mudança. Atualizar Livro e fecho curto com resultado/testes/bloqueios. Próximo passo: Etapa 06. Se incompleta, registrar checkpoint atual, sem avançar por aparência.
