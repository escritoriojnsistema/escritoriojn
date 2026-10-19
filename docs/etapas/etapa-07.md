# Etapa 07 - Cadastrar clientes e pesquisar com segurança
## Objetivo
Criar ficha única do cliente e localizá-lo sem expor o cadastro inteiro a qualquer funcionário.
## Entrada mínima
Etapa 06 ou seu contrato necessário aprovado; falha externa independente deve ser registrada, sem alegar publicação. Ler AGENTS.md, LIVRO_RAIZ.md e docs/regras/clientes.md somente nos tópicos afetados. Reusar código existente da base nova; não importar estado do projeto antigo.
## Fazer nesta rodada
- Criar customers e customer_contacts, com pessoa física/jurídica condicionada ao serviço.
- Normalizar CPF/CNPJ/contatos; validar formato sem fingir consulta oficial.
- Criar busca paginada, máscaras e escopo por capacidade/relação.
- Prevenir duplicidade de identificador não vazio por escritório e não exigir CPF para xerox anônimo.
## Cuidados específicos
- Aplicar prevenção de erro pertinente; não tocar ambiente/cadastro fora deste domínio.
## Aceite
- Cliente válido é salvo; campo inválido mostra erro claro; CPF ausente não vira número falso.
- Duplicidade é sinalizada/bloqueada conforme política e busca não expõe dados de outro escritório.
- Funcionário recebe apenas dados necessários; request direto não contorna restrição.
## Conferência pelo usuário
Cadastre Maria de Teste, pesquise e tente repetir seu identificador. Veja que a conta sem permissão não encontra todos os dados.
## Encerramento
Dados, backend, frontend e teste relacionados devem estar conectados. Onde não houver impacto, escrever não se aplica e não fabricar mudança. Atualizar Livro e fecho curto com resultado/testes/bloqueios. Próximo passo: Etapa 08. Se incompleta, registrar checkpoint atual, sem avançar por aparência.
