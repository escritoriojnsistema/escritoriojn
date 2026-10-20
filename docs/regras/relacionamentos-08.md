# Relacionamentos, identidade e mesclagem — Etapa08

Contrato do banco e transporte para API/UI. Fonte tipada: `shared/customerRelations.ts`; migração `20261019234754_customer_relationships_identity_merge.sql`. Nenhuma operação deste contrato cria conta Auth, concede portal ou autoriza documento. A evidência é uma referência privada de conferência humana, nunca prova inferida de CPF/e-mail.

## Autorização e persistência

As permissões `customers.relate`, `customers.verify`, `customers.merge` são independentes; seed apenas owner. Os catálogos de atribuição, convite, delegação e auditoria aceitam explicitamente as três. `customers.read` e `foundation.access` continuam obrigatórios. `customers.read_all` amplia somente dentro do escritório; criador mantém acesso, e atribuição vigente também permite leitura. Revogar atribuição não cancela as duas autoridades independentes. Ter atribuição sem `customers.read` continua proibido.

`relate` permite atribuição/representação em ficha que o ator já pode ler. Representante também precisa ser uma ficha legível ao ator. `verify` permite associar membership client ativa e confirmada à ficha autorizada, nunca membership interna. `merge` exige owner/admin e leitura de ambas as fichas. Uma capacidade não implica as demais.

Sessão exige UID e session_id reais, confirmação de e-mail, usuário não anônimo/não excluído/não banido, perfil, escritório e membership ativos. Metadata editável não decide autoridade. Escritas usam mutex do escritório `FOR NO KEY UPDATE`, compatível com `KEY SHARE` das FKs de signup; leituras usam `FOR SHARE`. Sessão, capacidades e escopo são reavaliados depois dos locks de ficha/relação. A implementação completa de sincronização de cadastro da última migração permanece intacta, inclusive seu desvio para cadastro ainda não confirmado.

`public.customers` ganha `merged_into_id` e `blocked_at`. Registros mesclados/bloqueados são indisponíveis em lista/detalhe/update e nas RPCs08. A unicidade de identificador vale somente para fichas ativas; origem retém identificador e contatos. As três novas tabelas privadas são `customer_relations`, `customer_snapshots` e `customer_merges`, com RLS, sem grants brutos para anon/authenticated/service_role e FKs RESTRICT de mesmo escritório. Nenhuma tabela de documento/atendimento futuro é criada.

As cinco RPCs públicas são invoker; implementações definer ficam privadas, com `search_path=''`, autenticação e ACL mínima. Helpers não são RPCs executáveis pelos papéis da aplicação. Snapshot e evento privado de merge rejeitam UPDATE/DELETE por trigger, inclusive quando o operador tenta DML direto; não é uma alegação de armazenamento WORM externo.

## RPCs e envelopes de API

Todos os UUIDs são strings no JSON. `request_id` é UUID novo do servidor, nunca aceito do browser; não é chave de idempotência. Revogações e merge têm proteção de versão; grant repetido conflita. Nenhuma URL contém consulta, identificador, contato ou evidência. API deve fazer POST, JSON estrito, Bearer/getUser uma vez, uma chamada RPC, no-store e erro genérico sem SQL/PII.

| POST de API | Corpo estrito | RPC e argumentos |
|---|---|---|
| `/api/customer-relations/state` | `{office_id,customer_id}` | `customer_relations_state(p_office_id uuid,p_customer_id uuid)` |
| `/api/customer-relations/candidates` | `{office_id,kind,query}` | `customer_relation_candidates(p_office_id uuid,p_kind text,p_query text)` |
| `/api/customer-relations/command` | `{office_id,customer_id,action,payload}` | `customer_relation_command(p_office_id uuid,p_customer_id uuid,p_action text,p_payload jsonb,p_request_id uuid)` |
| `/api/customer-relations/merge/preview` | `{office_id,source_id,target_id}` | `customer_merge_preview(p_office_id uuid,p_source_id uuid,p_target_id uuid)` |
| `/api/customer-relations/merge` | `{office_id,source_id,target_id,source_version,target_version,evidence,confirm:true}` | `customer_merge(p_office_id uuid,p_source_id uuid,p_target_id uuid,p_source_version integer,p_target_version integer,p_evidence text,p_confirm boolean,p_request_id uuid)` |

Erros do domínio: PT401 sessão; PT403 capacidade/perfil; PT404 ficha/relação inacessível, inexistente, mesclada ou bloqueada; PT409 conflito/versão/duplicidade; PT422 entrada inválida. ACL de banco pode produzir42501 e a API deve tratá-la como proibição, sem diagnóstico. Falhas de transporte/serviço viram503. A decisão de versão conflitante não deve ser automaticamente reenviada com nova versão.

## Payloads exatos dos seis comandos

Todos os campos das linhas abaixo são obrigatórios; campos adicionais são rejeitados. `valid_until:null` representa prazo aberto. Datas são ISO8601 com segundos e zona explícita (`Z` ou `±HH:MM`), fração opcional até6 dígitos. Datas finitas; fim estritamente posterior ao início. Referência de evidência é string aparada de1–500 caracteres sem controle; nome/autor/role/status não entram no payload.

| action | payload |
|---|---|
| `assignment.grant` | `{membership_id: UUID, valid_from: ISO, valid_until: ISO \| null}` |
| `assignment.revoke` | `{id: UUID, version: integer}` |
| `representation.grant` | `{representative_customer_id: UUID, kind: "proxy" \| "representative" \| "guardian", evidence: string, valid_from: ISO, valid_until: ISO \| null}` |
| `representation.revoke` | `{id: UUID, version: integer}` |
| `identity.verify` | `{membership_id: UUID, evidence: string}` |
| `identity.revoke` | `{id: UUID, version: integer}` |

`id/version` na revogação são da relação, não da ficha. Versão inteira1–2147483646. Cada comando incrementa a versão da ficha e retorna seu estado atualizado. Membership é validada no escritório, papel e atividade; autor/revogador derivam da sessão. Relação representação aponta da ficha principal para a ficha representante. Autorrelação é inválida. Atribuição aberta duplicada, mesma representação/tipo aberta e identidades colidentes retornam409; deve-se revogar a relação anterior antes de recriá-la.

Exemplo de grant operacional:

```json
{"office_id":"00000000-0000-4000-e000-000000000081","customer_id":"00000000-0000-4000-f000-000000000081","action":"assignment.grant","payload":{"membership_id":"00000000-0000-4000-b000-000000000084","valid_from":"2026-10-19T12:00:00Z","valid_until":null}}
```

O banco limita a20 relações não revogadas por ficha/tipo, incluindo futuras/expiradas: revogue históricos encerrados para abrir nova relação. Estado retorna até50 por coleção, não revogadas primeiro e mais recentes primeiro, com flags `truncated`. Candidatos retornam até20, consulta0–120 caracteres sem controle. Contatos de uma ficha/resultado de merge: máximo4 distintos normalizados.

## DTOs exatos

`CustomerRelationsState` tem:

- `customer`: CustomerSummary07 (`id,kind,name,identifier_masked,created_at`, origem técnica opcional) + `version`.
- `capabilities`: `can_relate,can_verify,can_merge` booleanos calculados no banco.
- `assignments`, `representations`, `identities`, `merges`: arrays limitados; jamais inventar autoridade a partir de arrays presentes.
- `truncated`: quatro booleanos homônimos das coleções.
- `portal_enabled:false` e `access_lost:boolean`.

Toda relação traz `id,version,created_at,created_by,revoked_at,revoked_by,name,status`. `created_by/revoked_by` são UID do autor, não membership. Assignment acrescenta `membership_id,valid_from,valid_until`; status `active|future|expired|revoked|unavailable`. Representation acrescenta `representative_customer_id,kind,evidence,valid_from,valid_until,authorization_status,grants_customer_access:false,portal_enabled:false`; `authorization_status=valid` somente quando status active, senão invalid. Isso expressa vigência da representação, sem conceder leitura operacional ou documental. Identity acrescenta `membership_id,evidence,portal_enabled:false`, status `verified|revoked|unavailable`.

Uma representação futura/expirada/revogada, com representante indisponível ou sem evidência não autoriza. Evidência é obrigatória e privada; dados legados sem evidência não podem ser inseridos via RPC/constraint. Identidade pode ficar unavailable por desligamento da membership; preserva a colisão até revogação explícita.

`access_lost=false` é o estado normal. Se o ator revoga a própria única atribuição, a transação deve concluir: retorna `access_lost=true`, resumo da ficha já autorizado antes da ação com a nova versão, todas as capacidades false e coleções vazias. API repassa este estado; UI descarta detalhe/rascunhos e volta à lista. A próxima leitura retorna404. Não refazer fetch nem interpretar o resumo terminal como autoridade persistente.

`CustomerRelationCandidates`: `{kind,items,limit:20}`. `kind=team` exige relate; client exige verify; customers exige relate ou merge. Item exato `{id,name,kind,contact_masked,identifier_masked}`. Para team/client, id é membership, kind é owner/admin/employee/client, contato é primeira letra seguida de `***@***`, identificador null. Para customers, id é ficha, kind person/company, identificador mascarado e contato null. Nenhum e-mail/CPF bruto volta da busca. Candidatos customers respeitam o escopo de leitura; candidatos team/client são do mesmo escritório e válidos. Busca por e-mail/identificador acontece somente no payload privado.

`CustomerMergePreview`: `{source,target,expected,conflicts,can_merge,portal_enabled:false}`. Source/target são resumos+versão. `expected` tem `name,kind,identifier_masked,contact_count,copies_identifier,transfers_authority:false`; nome/tipo do destino prevalecem. `conflicts` contém zero ou mais `same_customer|kind|identifier|contacts|identity`. `can_merge` indica conflito ausente após autoridade validada. Ficha inacessível não vira candidato nem conflito informativo; responde404.

`CustomerMergeResult`: `{merge_id,source_id,target_id,target_version,state}`. `state` é o estado completo atualizado do destino. `merges` no estado contém `{id,source_id,target_id,source_snapshot_id,target_snapshot_id,result_snapshot_id,created_at,actor_id}`. Evidência e conteúdo dos snapshots de merge não são enviados; as evidências de relação são privadas, autorizadas pela ficha e nunca auditadas em changes. DTOs de snapshot/participante em shared são contratos futuros, não endpoints.

## Cadastro público, identidade e origem

Conferência só aceita client confirmada/ativa e impõe unicidade de vínculo não revogado por ficha e membership. Não cria/une/altera Auth. E-mail/CPF coincidente nunca seleciona vínculo automaticamente.

Uma entrada de `customer_registrations` sem ficha materializada continua na lista07 enquanto não houver identidade explicitamente verificada e válida daquela membership para uma ficha ativa. A conferência humana faz a entrada desaparecer da lista/detalhe de pendências; a ficha vinculada permanece no escopo normal, sem conceder ao client acesso à operação ou acervo. A revogação da identidade, bloqueio/mesclagem da ficha ou perda de validade da membership elimina essa resolução; quando a própria entrada permanece ativa, ela volta a aparecer para read_all. A linha original, `materialized_customer_id`, e `association_status=pending` técnico permanecem intactos. Esse pending descreve a proveniência técnica, não substitui o status verified do painel de identidade. Uma ficha materializada de cadastro público continua uma ficha normal até revisão/mesclagem explícita; não é apagada ao verificar outra ficha.

## Mesclagem e história

Preview explícita precede confirmação com ambas as versões, evidência e `confirm=true`. Mesmo escritório/tipo, duas fichas ativas distintas, leitura autorizada e administrador com merge são obrigatórios. Identificadores diferentes ou duas identidades verificadas incompatíveis bloqueiam. Até4 contatos normalizados únicos, mantendo primeiro os do destino e acrescentando os ausentes da origem. Identificador faltante é copiado após desativar a origem para unicidade. Nome/tipo do destino prevalecem.

Três snapshots reais e imutáveis são gravados na mesma transação: origem antes, destino antes, destino depois. Guardam identificação, contatos e versão efetivamente utilizados; evento privado de merge aponta para os três. Auditoria pública guarda somente IDs permitidos. Qualquer falha de auditoria reverte fichas, contatos, revogações, snapshots e histórico.

Origem retém linha/contatos/identificador e FKs de atendimentos/documentos anteriores; ganha ponteiro merged_into_id. Merge não reescreve documento ou snapshot anterior. Ponteiros podem formar cadeia se o destino for mesclado mais tarde; nunca ciclo, pois novos destinos precisam estar ativos. Não copiar grants/identidades/representações; revogar todas as relações abertas da origem e representações onde ela era representante. Destino mantém somente sua própria autoridade, exceto uma representação para a origem, que também perde validade. Uma identidade apenas da origem é revogada, não movida. Memberships/Auth/proveniência permanecem inalteradas.

Contrato de participante futuro: `{role,customer_id,snapshot_id,authorization:{status,evidence_reference,decided_by,decided_at},portal_visibility:"none"}`. Roles e statuses enumerados em shared. Exige autorização explícita futura; nenhuma estrutura de documento/serviço ou liberação é ativada nesta etapa.

## Verificação e integração

`npm run test:db` recria dois bancos descartáveis com migrador NOSUPERUSER/NOBYPASSRLS, aplica todas as migrações e roda suites existentes+08 e corridas reais. RED inicial registrado no relatório. `node scripts/benchmark-customer-relations.mjs` reutiliza o mesmo runner e, após correção, adiciona10mil clientes fictícios no segundo banco,10 conexões e300 amostras de busca/estado/candidatos; emite JSON `RELATIONS_BENCHMARK`, exige p95≤2000ms em cada operação. Tem somente Docker local, sem URL de conexão ou opção hospedada. Medida do psql inclui execução/roundtrip local; não representa SLA hospedado.

Catálogo compartilhado de permissões/equipe, cinco handlers Express com validação/DTO estritos e UI em Clientes→Vínculos estão integrados. O laboratório Auth comprova frontend→API→banco com sessões reais, sem usar contas hospedadas. Request_id só servidor; nenhuma evidência em log/URL/audit.changes. Revalidar sessão/autoridade sem reapresentar dados anteriores ao trocar identidade. Portal permanece desabilitado.
