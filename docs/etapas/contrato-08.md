# Contrato da Etapa08

Fonte vinculante: [cartão oficial](etapa-08.md), manual v4 do Drive (p38), regras clientes/acesso/operação. A Etapa09 não será iniciada.

## Escopo e fluxo
Clientes → ficha → Vínculos → Acesso operacional / Representantes / Identidade / Duplicidades. São subvisões compactas do mesmo módulo, usando o shell atual; nenhuma nova entrada de menu principal é necessária. Desktop mantém o padrão da ficha; mobile usa títulos curtos, controles adaptados e no máximo quatro atalhos existentes.

## Domínio e autorização
Adicionar capacidades independentes customers.relate (atribuições/representação), customers.verify (conferência) e customers.merge (mesclagem). customers.read continua pré-requisito para consultar a ficha; read_all amplia só dentro do escritório. Seed só owner; gestão/delegação existentes concedem explicitamente aos demais. Mesclagem administrativa exige owner/admin com customers.merge e leitura autorizada de ambos os registros.

Vínculos operacionais apontam cliente e membership interna do mesmo escritório, com validade/revogação e autoria. Usuário com customers.read, sem read_all, passa a ler ficha atribuída enquanto o vínculo estiver válido. Criador mantém acesso original; revogar vínculo não cancela autoridade independente de criador/read_all.

Representação liga duas fichas do mesmo escritório: proxy/representative/guardian, evidência textual de referência obrigatória, valid_from e valid_until opcional. Relação sem evidência válida, futura, expirada ou revogada não autoriza. Não libera documentos nem confere papéis Auth. Acesso à ficha e representação são autorizações distintas.

Conferência humana associa uma ficha a membership client confirmada e ativa, com evidência e decisão/revogação próprias; seleção retorna dados mínimos e contato mascarado. Nunca inferir posse por CPF/e-mail. Um vínculo verificado não ativa portal nem libera acervo. Restringir colisões de memberships/clientes; nenhuma conta Auth é criada, alterada ou unida.

## Mesclagem e história
Prévia explícita e confirmação com versões de origem/destino, evidência e confirm=true. Clientes distintos, mesmo escritório/tipo, ativos e autorizados; impedir ciclos, auto-mesclagem, identificadores conflitantes, versão obsoleta e colisões de identidades.
Manter a ficha de origem e suas referências com merged_into_id; não apagar históricos ou reescrever documentos. Identificador faltante do destino pode ser conservado da origem e contatos normalizados são unidos sem duplicar, até4; mais contatos é conflito para revisão. Nome/tipo do destino prevalecem de forma explícita na prévia. Unicidade do identificador vale para fichas ativas.
Não copiar grants/atribuições/representações/direitos de portal da origem ao destino. Revogar direitos ativos da origem sem apagar trilha; destino conserva sua própria autoridade. Links verificados incompatíveis bloqueiam mesclagem. Origem técnica de cadastro público permanece rastreável sem associação automática.
Snapshots imutáveis dos dados/versões usados na decisão e evento de mesclagem ficam privados. Audit.changes contém apenas IDs/metadados mínimos, sem CPF/e-mail/evidência. Ficha mesclada não aparece como cadastro ativo nem pode ser alterada pelo CRUD07.
Para documentos futuros, contrato tipado de participante (papel, referência à ficha e snapshot, autorização explícita, portal_visibility=none). Não criar documentos/atendimentos fictícios em produção; fixtures locais demonstram que referência e snapshot prévios permanecem inalterados.

## Interfaces
shared/customerRelations.ts será a fonte tipada dos DTOs. Cada comando retorna estado atualizado do cliente para evitar refetch redundante.
RPCs públicas invoker → implementação privada com search_path vazio e ACL mínima:
- customer_relations_state(p_office_id uuid,p_customer_id uuid) → estado.
- customer_relation_candidates(p_office_id uuid,p_kind text,p_query text) → candidatos limitados (team/client/customers), filtrados por capacidade/escopo; consultas de identificadores/contatos só payload privado.
- customer_relation_command(p_office_id uuid,p_customer_id uuid,p_action text,p_payload jsonb,p_request_id uuid) → estado; ações assignment.grant/revoke, representation.grant/revoke, identity.verify/revoke. Payload estrito; membership e autor nunca aceitos sem validação. Revogações exigem id/version.
- customer_merge_preview(p_office_id uuid,p_source_id uuid,p_target_id uuid) → prévia com versões, máscaras, resultado esperado e conflitos.
- customer_merge(p_office_id uuid,p_source_id uuid,p_target_id uuid,p_source_version integer,p_target_version integer,p_evidence text,p_confirm boolean,p_request_id uuid) → resultado com IDs, versão e estado do destino.

API POST /api/customer-relations/state, /candidates, /command, /merge/preview, /merge. Express valida JSON estrito, Bearer/getUser uma vez e RPC uma vez; request_id do servidor; no-store. Erros 401/403/404/409/422/503, sem diagnósticos SQL/PII. Frontend usa authenticatedFetch, isolamento/AbortController e a mesma sessão/autoridade; 401/403 bloqueiam.

## Validação
Replays SQL completos e corridas reais; matriz anônimo/outro escritório/cliente/funcionário atribuído/sem vínculo/revogado/gestor. Testar representação inválida/expirada/revogada, conferência com colisão, mesclagem concorrente/obsoleta/histórica e auditoria atômica. Sem transferência de direitos por merge. Testar que cadastro público confirmado continua idempotente e sem deadlock.
API: validação/autoridade/DTO mínimos, falha/transporte/cancelamento. Auth lab real: fluxo completo de atribuir/revogar, representar/revogar, conferir e mesclar sem liberar portal. UI contrato em360×640 e1440×900, mais320/768/zoom/teclado quando necessário; até4 atalhos por perfil; sem indicadores de carregamento. Medir buscas/estado em10mil clientes sintéticos, meta proposta p95≤2s no laboratório, nunca afirmar SLA hospedado.

## Restrições globais
React + Vite + TypeScript, Express /api e Supabase; não usar Next.js. Preservar dados/contas existentes e toda a proteção por UID/session_id/escritório/capacidades, inclusive após locks. Não usar user_metadata como autoridade. Nenhum segredo em browser/Git/log/audit.changes. Sem portal documental ativo. Reusar OperationLayout; até quatro atalhos principais de mobile (Início e Conta incluídos), extras na lateral para todos os perfis. Campos mobile16px, alvos44px, foco visível. Sem spinner/loader/overlay visível; rótulos estáveis, bloqueio de repetição e erros honestos. Evitar rolagem por composição compacta, nunca cortar conteúdo/zoom/teclado. Fixtures apenas no laboratório local; nenhum e-mail/conta hospedado de teste. Migração aditiva e replay com migrador NOSUPERUSER/NOBYPASSRLS.
