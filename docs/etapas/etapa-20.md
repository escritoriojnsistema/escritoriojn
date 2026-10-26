# Etapa 20 — Biblioteca de modelos documentais

Fonte: manual v4 no Drive, cartão etapa-20.md (1Sg8Q8axdbVgICbyqqblCJpMEokEtxlx-), consultado em 26/10/2026. Base: Etapa19 publicada, main cbac760. Regras em docs/regras/documentos.md.

Cadastrar contratos, declarações, requerimentos e ofícios. Versões guardam texto, tipo, vigência, variáveis tipadas, políticas, autor e motivo. Aprovação explícita guarda aprovador/data/motivo e não modifica o texto. Qualquer edição cria nova versão, inclusive de rascunho; aprovar uma versão não aprova as seguintes. Não há documentos reais fornecidos: exemplos permanecem demonstração sem validade operacional. Etapa21 (editor/autopreenchimento/PDF documental) fora do escopo.

## Contrato entre banco, API e UI

Capacidades `templates.read`, `templates.manage`, `templates.approve`, seed somente owner; não conceder individualmente. Leitura obrigatória para qualquer ação; cliente excluído. Aprovar exige owner/admin + approve, distinto de manage. Gestão de capacidades reaproveita Equipe/delegações.

`TemplateInput={code,name,kind,content,demonstration,effective_from,effective_until,variables,signature_policy,review_required}`.
code: regex `^[A-Z0-9][A-Z0-9_-]{1,31}$`, estável na biblioteca; name1–120, content1–30000 pontos Unicode (texto literal, sem execução/HTML); kind contract/declaration/application/official_letter; demonstration e review_required boolean; signature_policy none/physical/external. Vigências null ou ISO UTC com milissegundos, final posterior ao início; aprovação nunca retroage, vigência começa no maior entre aprovação e início informado. Sem modelos reais pré-carregados.

Variável `{key,label,type,required}`; label1–80, required boolean, máximo20, sem duplicatas. Lista deve corresponder exatamente aos placeholders `{{chave}}` do texto; chaves desconhecidas e delimitadores incompletos são recusados. Registro permitido (tipos fixos): `cliente.nome`, `cliente.cpf`, `cliente.endereco`, `participante.vendedor.nome`, `participante.vendedor.cpf`, `participante.comprador.nome`, `participante.comprador.cpf`, `servico.descricao` text; `datas.emissao`, `datas.inicio`, `datas.fim` date; `valores.total`, `valores.parcela` money; `servico.quantidade` number. Fonte cliente=pessoa autorizada futura, participante=papel explícito, serviço=snapshot09/10, datas/valores=dados permitidos futuros. Nesta etapa não resolver dados pessoais nem simular conexão a documentos21.

`TemplateVersion=TemplateInput & {id,number,created_by,created_by_name,created_at,reason,approved_by:string|null,approved_by_name:string|null,approved_at:string|null,approval_reason:string|null}`.
`TemplateSummary={id,code,name,kind,demonstration,latest_version,current_version:number|null}`; current é a maior versão aprovada vigente no instante da consulta.
`TemplatePage={items:TemplateSummary[],total,page,page_size}` com size3/5.
`TemplateDetail={id,code,latest_version,can_manage,can_approve,versions:TemplateVersion[],history_total,history_page}` com histórico5/página, ordem decrescente. Nomes de autores/aprovadores são snapshots seguros da equipe com fallback, sem CPF/e-mail.

RPCs públicas INVOKER autenticadas → implementação privada com auth/session_id/office/capacidade revalidados após locks:
- `templates_page(p_office_id,p_query,p_page,p_size)` → TemplatePage.
- `template_detail(p_office_id,p_template_id,p_page)` → TemplateDetail.
- `template_save(p_office_id,p_template_id uuid|null,p_definition jsonb,p_expected_version int,p_reason text,p_idempotency_key uuid)` → TemplateDetail; expected0 para criar, versão atual para acrescentar.
- `template_approve(p_office_id,p_template_id,p_version_id,p_expected_version,p_reason,p_idempotency_key)` → TemplateDetail. Aprova versão exata e esperada, sem autoaprovar nova edição.

Mutações idempotentes por escritório+ator+chave e hash/payload; chave repetida com payload diferente dá409, retry devolve detalhe atual autorizado. Office lock serializa edições/aprovação/delegação; versões e decisões append-only, FKs RESTRICT, RLS+ACL fechadas em templates/template_versions e tabelas privadas auxiliares. Auditoria transacional somente referência/metadados permitidos, nunca texto/cláusulas/PII. Preservar PDFs históricos1–6.

Erros: AUTH_REQUIRED401, TEMPLATES_FORBIDDEN403, TEMPLATE_NOT_FOUND404, TEMPLATE_CONFLICT409, TEMPLATE_DUPLICATE409, TEMPLATES_VALIDATION422. API /api/templates: POST /search {office_id,query,page,size}, /detail {office_id,template_id,page}, /save {office_id,template_id,definition,expected_version,reason,idempotency_key}, /approve {office_id,template_id,version_id,expected_version,reason,idempotency_key}. Corpo fechado até160KB, Bearer/no-store, DTO validado.

UI /modelos na sidebar por templates.read. Padrão Equipe/OperationLayout, lista3/5 e detalhe/editor no mesmo fluxo, políticas/variáveis organizadas, até4ações principais; sem loaders. Resposta de mutação é fonte oficial;503 preserva tentativa/rascunho/chave,409 exige reconferência,401/403 bloqueia/aborta/limpa, mudança de sessão/autoridade remonta página.

## Aceite e evidências

Declaração de Teste com cliente.nome e datas.emissao; aprovar versão de homologação demonstração, editar/aprovar v2 e provar v1 preservada. Negar funcionário sem capacidade, cliente/outro escritório/anônimo, tipos/chaves/datas inválidos, replay/conflito e corrida/revogação. Comprovar frontend→API→RPC no laboratório local; nunca inserir fixtures ou alterar contas/grants hospedados. Build/typecheck/Node/SQL/Auth/UI, regressões19 e responsividade320/360/768/1440. Publicar por GitHub→Vercel (runtime compatível antes da migration), conferir histórico automático antes de apply manual; registrar limitações externas. Atualizar Livro/AGENTS/fecho sem iniciar21.
