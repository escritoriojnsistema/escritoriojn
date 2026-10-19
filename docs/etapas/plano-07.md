# Etapa 07 — Cadastro e busca segura de clientes

Objetivo autorizado: concluir o cartão 07 do manual v4 do Drive e os ajustes de CPF solicitados. Base: main dfc2601. React + Vite + TypeScript, Express /api e Supabase preservados. A etapa 07 não existia; quatro atalhos móveis e ausência de loaders já estão implementados.

## Contrato e limites

- Ficha é entidade separada de Auth. Pessoa física por padrão; jurídica opcional quando o serviço exigir, sem criar catálogo fictício. Nome obrigatório na ficha identificada; CPF/CNPJ opcionais e normalizados, sem identificadores falsos. Serviço anônimo futuro não exige criar ficha.
- `customers` e `customer_contacts` protegidos; identificador não vazio único por escritório/tipo. CPF/CNPJ/contatos nunca em URL ou auditoria. Busca POST paginada retorna máscara. Detalhe somente autorizado.
- Capacidades independentes `customers.read/create/update/read_all`. Owner recebe o conjunto; outros exigem concessão explícita, dentro da delegação vigente. Sem read_all, somente fichas criadas pelo ator nesta07. Relações/compartilhamento/representantes/mesclagem pertencem à08.
- Contratos em shared/customers.ts. API POST /api/customers/search {office_id,query,page,size}; POST /api/customers {office_id,customer}; POST /api/customers/:id/detail {office_id}; PATCH /api/customers/:id {office_id,customer,version}. RPCs customers_page(p_office_id,p_query,p_page,p_size), customer_detail(p_office_id,p_customer_id), customer_create(p_office_id,p_customer,p_request_id), customer_update(p_office_id,p_customer_id,p_customer,p_version,p_request_id).
- CPF único compartilhado: shared/identifiers.ts exporta digitsOnly, validCpf, formatCpf, validCnpj, formatCnpj. Máscara automática nos dois formulários de convite e ficha; validação independente no servidor/banco.
- Reutilizar OperationLayout, máscara na listagem, páginas3/5, filtros compactos e formulário separado. Quatro atalhos no máximo com Início/Conta e destinos principais autorizados; demais no menu. Sem loaders/overlays ou texto transitório de carregamento; controles podem bloquear repetição mantendo rótulo. Erros e negação continuam visíveis.

## Execução e verificação

1. [x] Identificadores/convites: teste de máscara e dígitos RED→GREEN; reutilizar em convite de owner/admin/employee.
2. [x] Banco: migration incremental, sessão atual/capacidade/escritório e escopo de criador; transação com contatos/auditoria, versão e unicidade. Testes SQL como anon/cliente/funcionários de A/B, chamada direta, inválidos/duplicidade e rollback de auditoria. Dois replays descartáveis sem superusuário migrador.
3. [x] API: validação estrita, Bearer/getUser único, no-store, DTOs, erros claros sem SQL. Testes de limites, query privada, acesso e falha.
4. [x] UI: rota/menu/painel, busca, criação/edição/detalhe, normalização e mensagens. Contratos360/1440 e teste com Auth/REST reais no laboratório quando disponível; isolamento por sessão/escritório e cancelamento de respostas.
5. [x] Revisar diff, testes Node/SQL/Auth/UI/E2E, typecheck/build, dependências. Conferir Supabase/GitHub/Vercel; registrar limitações e fecho/Livro. Preparar PR revisável e seguir rollout técnico já autorizado no histórico: fecho06 registra expressamente a autorização e sua permanência; pedido atual conclui07 em todas as camadas no mesmo projeto. Após testes/revisão: migration aditiva → GitHub/CI → integração Git Vercel → prova pública. Sem novo lançamento comercial39, contratação, alteração de contas reais ou e-mail externo de teste.

Riscos prioritários: acesso cruzado via API/RPC, leitura excessiva pelo funcionário, CPF no log/URL, resultado atrasado entre escritórios/sessões e alteração concorrente. Cada qual exige teste funcional. Rollback de código preserva dados/auditoria; nenhuma migration destrutiva.

Resultado: etapa07 concluída/publicada; CI39241644141 SUCCESS, PR12 merge9a48016 e Vercel9kcoZTvj SUCCESS. Banco20261019015927 aplicado.34 E2E públicos remotos,16 retornos protegidos e9 respostas API conferidos. Evidências definitivas no fecho07. Próxima08 somente com novo pedido.
