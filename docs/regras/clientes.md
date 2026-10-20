# Clientes, vínculos, identidade e representantes

Referência de negócio e integridade. Leia apenas este arquivo quando a etapa o indicar; decisões vigentes abaixo prevalecem sobre propostas antigas.

### Correções que devem nascer prontas
Permissões de consulta, relacionamento, mesclagem e conferência são independentes. Funcionário recebe escopo próprio; autorização de gestão de regras não exige acesso irrestrito ao conteúdo dos documentos. Mesclagem exige versão, evidência e confirmação clara; conserva origem, referências e snapshots e não soma permissões/contas de Auth de pessoas diferentes.
A ficha do cliente não é a conta de login. Não alterar senha de usuário existente para testar ou completar cadastro. Busca de identificador pessoal usa payload privado, não URL/log. Cliente com conta confirmada pode solicitar serviço antes da conferência de acervo; isso não vincula ficha antiga automaticamente.

Correção pós07: a confirmação de cadastro público com origem verificável cria uma entrada privada por vínculo/escritório. Se não existe contato de e-mail coincidente no escritório, a entrada gera uma ficha reutilizável de atendimento com nome e contato declarados, sem CPF inventado. Se há coincidência, conserva somente a entrada pendente, sem criar segunda ficha nem escolher uma ficha antiga. A lista/detalhe identificam a origem; entradas sem ficha não permitem edição. `customers.read_all`, junto de `customers.read`, permite consultar essas fichas/entradas de outro criador no mesmo escritório. Apenas leitura mantém o escopo anterior.

O vínculo técnico de origem permanece com `association_status=pending`, sem aprovação documental. E-mail compartilhado/confirmado ou CPF válido não prova identidade: nenhuma associação de acervo é feita por esses valores. A Etapa08 permite conferência humana explícita, com evidência e capacidade `customers.verify`, entre ficha e membership cliente confirmada/ativa. Isso não cria/une contas Auth nem concede portal/documentos. Uma entrada sem ficha deixa a lista de pendências somente enquanto a conferência válida a resolve; revogar faz a pendência reaparecer, preservando origem. Ficha interna e login continuam entidades distintas.

### Aplicação da Etapa08

Contrato detalhado em [relacionamentos08](relacionamentos-08.md). `customers.read` continua obrigatório; criador e `read_all` conservam sua autoridade, e atribuição operacional vigente permite acesso à ficha para o funcionário com leitura. Revogar a atribuição retira somente esse fundamento de acesso. `customers.relate`, `customers.verify` e `customers.merge` são independentes, seed somente owner e concessão explícita pela gestão existente.

Representação entre fichas exige referência privada de evidência, tipo e vigência; não concede leitura operacional/documental por parentesco ou condição de representante. Conferência e revogação são decisões humanas registradas. Nenhuma dessas ações ativa o portal.

Mesclagem exige administrador autorizado, leitura das duas fichas, prévia, versões, evidência e confirmação. Nome/tipo do destino prevalecem; identificador faltante pode ser copiado, contatos normalizados são unidos até4. Colisões de identificador/tipo/identidade exigem revisão. A origem permanece com ponteiro canônico e referências intactas, sai do CRUD ativo e não transfere permissões. Snapshots privados antes/depois e trilha são preservados; documentos e atendimentos históricos não são reescritos.

Participante futuro permanece contrato tipado com snapshot e `portal_visibility=none`; documentos, uploads e portal aguardam suas etapas. Importação em lote não foi implementada na08: quando chegar sua etapa, exige prévia, normalização e relatório de rejeições.


RF-04: ficha central de pessoa física e possibilidade de pessoa jurídica quando o catálogo exigir; campos condicionais. Nome é obrigatório para serviços que exigem identificação; CPF/CNPJ, contatos e endereço somente quando necessários. Serviços rápidos podem ser anônimos. Valor vazio não deve virar CPF fictício.
Normalizar identificadores para busca e validar formato/dígitos quando aplicável; isso não comprova identidade nem consulta órgão oficial. Identificador existente dispara revisão de duplicidade; não mesclar automaticamente. Proposta: unicidade por escritório/tipo/identificador não vazio e fluxo administrativo para correção/mesclagem.
Busca de funcionário não concede acesso global a clientes: apresentar dados mínimos de candidatos autorizados, mascarar identificadores e limitar resultados. Compartilhar com atendente novo exige vínculo ou capacidade adequada, auditada quando sensível.
Mesclagem autorizada preserva referências e histórico, registra antes/depois mínimos e resolve colisões de portal. Não alterar silenciosamente as partes em documentos antigos: cada versão usa snapshot dos dados utilizados naquela data.
Participante liga pessoa, documento/processo, papel e autorização de visibilidade. Comprador e vendedor podem consultar o mesmo contrato liberado, sem acesso ao restante da ficha de cada um. Representante, procurador ou responsável legal precisa de vínculo e evidência adequados; parentesco não implica acesso automático.
Importação futura tem prévia, normalização, deduplicação, relatório de linhas rejeitadas e lote identificável. Contas de funcionários e cadastros de clientes são entidades distintas.
