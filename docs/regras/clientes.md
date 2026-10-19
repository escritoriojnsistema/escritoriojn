# Clientes, vínculos, identidade e representantes

Referência de negócio e integridade. Leia apenas este arquivo quando a etapa o indicar; decisões vigentes abaixo prevalecem sobre propostas antigas.

### Correções que devem nascer prontas
Permissões de consulta, relacionamento, mesclagem e conferência são independentes. Funcionário recebe escopo próprio; autorização de gestão de regras não exige acesso irrestrito ao conteúdo dos documentos. Mesclagem exige versão, evidência e confirmação clara; conserva origem, referências e snapshots e não soma permissões/contas de Auth de pessoas diferentes.
A ficha do cliente não é a conta de login. Não alterar senha de usuário existente para testar ou completar cadastro. Busca de identificador pessoal usa payload privado, não URL/log. Cliente com conta confirmada pode solicitar serviço antes da conferência de acervo; isso não vincula ficha antiga automaticamente.


RF-04: ficha central de pessoa física e possibilidade de pessoa jurídica quando o catálogo exigir; campos condicionais. Nome é obrigatório para serviços que exigem identificação; CPF/CNPJ, contatos e endereço somente quando necessários. Serviços rápidos podem ser anônimos. Valor vazio não deve virar CPF fictício.
Normalizar identificadores para busca e validar formato/dígitos quando aplicável; isso não comprova identidade nem consulta órgão oficial. Identificador existente dispara revisão de duplicidade; não mesclar automaticamente. Proposta: unicidade por escritório/tipo/identificador não vazio e fluxo administrativo para correção/mesclagem.
Busca de funcionário não concede acesso global a clientes: apresentar dados mínimos de candidatos autorizados, mascarar identificadores e limitar resultados. Compartilhar com atendente novo exige vínculo ou capacidade adequada, auditada quando sensível.
Mesclagem autorizada preserva referências e histórico, registra antes/depois mínimos e resolve colisões de portal. Não alterar silenciosamente as partes em documentos antigos: cada versão usa snapshot dos dados utilizados naquela data.
Participante liga pessoa, documento/processo, papel e autorização de visibilidade. Comprador e vendedor podem consultar o mesmo contrato liberado, sem acesso ao restante da ficha de cada um. Representante, procurador ou responsável legal precisa de vínculo e evidência adequados; parentesco não implica acesso automático.
Importação futura tem prévia, normalização, deduplicação, relatório de linhas rejeitadas e lote identificável. Contas de funcionários e cadastros de clientes são entidades distintas.
