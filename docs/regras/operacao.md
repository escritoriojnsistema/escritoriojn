# Entidades, requisitos de qualidade e recuperação

Referência de negócio e integridade. Leia apenas este arquivo quando a etapa o indicar; decisões vigentes abaixo prevalecem sobre propostas antigas.

### Aplicação incremental e operação real
O mapa de entidades abaixo é referência do produto; criar tabelas apenas quando sua etapa as usar. Não criar wrappers, filas, microserviços, SDKs ou papéis técnicos só para reservar futuro. Relacionamentos com office_id são garantidos por FK composta ou validação transacional comprovada.
Banco vazio + migrações + seed precisam produzir as mesmas capacidades mínimas que o ambiente atualizado. Provar com migrador sem superusuário e papéis reais de API. Testes que alteram grants/usuários/roles no mesmo banco são sequenciais ou isolados. Não editar migração aplicada para esconder divergência; antes de dados reais, o projeto novo pode consolidar migrações apenas em ambiente descartável e reprovado do zero.
Backups incluem objetos e metadados; restauração de banco não recupera bytes apagados do Storage. Usar cópia externa criptografada, manifesto/hash, instruções e teste cronometrado. Configuração de Auth/roles/segredos que não integra o dump tem procedimento separado. Saldos iniciais não são receita de serviço.
Fonte Git, build, deploy, alias e fluxo autenticado são verificações distintas. Não copiar IDs de projetos existentes, credenciais ou deploys antigos para a nova base. Não alegar correção de Git a partir de publicação manual por arquivos. Não testar com senha do proprietário. Preparar conta sintética autorizada em homologação ou declarar o limite exato da validação.
Monitorar banco, arquivos, transferência, e-mail e execuções; alertas propostos em70% e85% das quotas aplicáveis, sem upgrade automático. Estimar crescimento por documentos/mês × tamanho médio × retenção, com versões/backups. Não prometer gratuidade permanente nem recurso de plano pago no gratuito.


Proposta lógica; os nomes abaixo orientam o banco sem exigir que todos sejam criados na etapa 1. Chaves UUID, timestamptz UTC, office_id, autoria e controle de revisão onde necessário. Chaves estrangeiras e constraints garantem escopo; frontend não é mecanismo de integridade.

| Grupo | Entidades e invariantes |
| --- | --- |
| Acesso | offices, profiles, memberships, roles, permissions, role_permissions; vínculo único usuário/escritório; estado ativo consultado pelo banco |
| Relacionamento | customers, customer_contacts, portal_links; identificador normalizado não vazio único conforme política; vínculo de portal verificado |
| Atendimento | services, service_versions, requests, request_items, assignments, request_events; preço e checklist preservados por snapshot |
| Arquivos | files, upload_intents; objeto opaco, hash, escopo, estado e referência do domínio |
| Documentos | templates, template_versions, documents, document_versions, participants, approvals, signatures, releases, deliveries |
| Financeiro | charges, charge_items, payments, payment_allocations, reversals, refunds, financial_accounts, cash_sessions, cash_movements, expenses, receipts |
| Especializados | rural_properties, property_parties, specialized_cases, case_cycles, checklist_versions, checklist_items, deadlines |
| Operação | audit_events, idempotency_records, notifications, settings; logs não editáveis por usuários comuns |

Relacionamentos essenciais: atendimento 1:N itens; item pode originar cobrança e documento; documento 1:N versões; versão 1:N aprovações/arquivos; pagamento N:N cobranças por alocações; imóvel 1:N exercícios/casos. Entrega aponta para versão/arquivo, não só documento lógico.
RN-06: registro de escritório A nunca referencia pai de B. Usar FK composta com office_id ou validação transacional equivalente demonstrada. Deletar usuário, cliente ou serviço não deve apagar cadeia financeira/documental; bloquear ou arquivar conforme política.
Contratos de aplicação: abrirAtendimento, confirmarPagamento, estornarPagamento, enviarParaAprovacao, decidirAprovacao, avaliarLiberacao, entregarDocumento. Recebem entrada validada; autor e escopo vêm da sessão. Erros têm código, mensagem segura, request_id e possibilidade de tentar novamente; 401 sem autenticação, 403 sem capacidade, 409 conflito, 422 regra inválida. Listagens podem retornar vazio por RLS, sem isso significar erro de banco.
Paginação com limite máximo proposto de 100; índices por escritório, responsável, status, data e referências frequentemente consultadas. Escala deve ser medida com dados sintéticos antes de criar índices especulativos ou expor busca global.

Metas propostas para homologação; precisam de medição e aceite, não representam SLA fornecido pela plataforma.

| ID | Meta proposta | Evidência |
| --- | --- | --- |
| RNF-01 | Telas principais utilizáveis em 360, 768 e 1440 px | Teste visual e operações completas |
| RNF-02 | Negação de acesso cruzado em UI, API, RLS e Storage | Testes com contas A/B e usuário anônimo |
| RNF-03 | Sem duplicidade em reenvio ou concorrência financeira | Testes simultâneos com mesma e diferentes chaves |
| RNF-04 | Busca/listagem p95 até 2 s em carga acordada | Proposta inicial: 10 usuários e 10 mil clientes sintéticos |
| RNF-05 | Operação comum até 3 s; PDF até 15 s para modelo de 10 páginas | Medição no ambiente escolhido; falha clara ao exceder limite |
| RNF-06 | RPO até 24 h e RTO até 8 h | Exercício de restauração cronometrado; metas condicionadas à rotina |
| RNF-07 | Nenhuma perda silenciosa de versão ou decisão | Testes de edição concorrente e fluxo documental |
| RNF-08 | Controles acessíveis por teclado e contrastes verificados | Testes de acessibilidade e inspeção manual |
| RNF-09 | Segredos fora do bundle e do Git | Inspeção de artefatos e verificação de configuração |
| RNF-10 | Limites/custos e falhas acompanhados | Painel técnico e responsável definido |

Backup proposto diário com banco e arquivos, criptografado, fora da conta/projeto principal, acompanhado de manifesto/hash, migrações e instruções. Retenção inicial sugerida 7 diárias e 4 semanais, sujeita a política e capacidade. Não guardar segredos em dump público ou repositório.
Restauração em ambiente isolado verifica permissões, registros, relações, totais financeiros, arquivos/hash e vínculo com Auth. Documentar limites do dump usado, inclusive esquemas/roles/configurações não cobertos; migrar dados de Auth somente por mecanismo suportado e seguro. Testar antes de produção e após mudança relevante.
Contingência: interromper confirmações sem conexão; registrar atendimentos temporários em procedimento controlado e reconciliar por lote ao retornar. Não confirmar pagamento fictício nem autorizar entrega porque servidor falhou.
