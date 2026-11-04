# Etapa 24 — formalização manual, GOV.BR e cartório

Status: aprovada expressamente pelo usuário; execução autorizada em 04/11/2026. Data: 04/11/2026.

## Fontes e base conferida

- Pedido atual: executar somente Etapa 24, mantendo todas as camadas, padrões de Equipe/Convites, sem loaders e sem GitHub Actions; publicação exclusivamente GitHub → Vercel.
- Cartão oficial: [etapa-24.md no Drive](https://drive.google.com/file/d/16jY65-HyAq91f-sL9HsEyOQo-IYGeK3y/view). Objetivo: registrar assinatura externa mantendo o arquivo original realmente assinado. Critérios: bytes imutáveis, hash validado igual ao entregue, nenhuma imagem tratada como assinatura criptográfica, saída de assinatura separada de entrega e sem ciclo financeiro.
- `AGENTS.md`, início do `LIVRO_RAIZ.md`, `docs/regras/documentos.md` (RF-08, RF-15 e gate) e `docs/etapas/fecho-23.md` lidos antes de qualquer edição.
- Base Git clonada do repositório `escritoriojnsistema/escritoriojn`, main `1e45dd3`: PR80 é fecho documental da Etapa 23; runtime do PR79/merge `8db53ab` preservado. Não existe implementação 24 na base examinada.
- Supabase `mcsuoxnubpqenyvbefee` ACTIVE_HEALTHY, PostgreSQL 17.11. Histórico consultado: 52 migrations, última `20261103183425_document_editorial_review23`. Não reaplicar migrations anteriores.
- Saúde pública `https://escritoriojn.vercel.app/api/health`: HTTP 200 nesta leitura. Conector administrativo Vercel retorna 403 no escopo escritorio-jn, limitação preexistente. Isso não exige mudar proteção nem impede acompanhar publicação por GitHub e domínio público.

## Objetivo e limites

Formalizar a versão documental aprovada, controlando a saída para assinatura, importação do PDF externo, conferência humana e posterior uso dos bytes exatos validados. Reutilizar pedido, publicação, revisão 23, artefatos 22, anexos 11, financeiro e portal existentes. Não criar segundo workflow editorial nem um cadastro paralelo de documentos.

Não guardar credenciais GOV.BR, assinar pelo cliente, alegar integração com cartório/ITI ou conferir validade jurídica automaticamente. Não alterar conteúdo de PDFs importados. Não iniciar Etapa 25, implantar scanner fictício, configurar tarifas ou conceder permissões individuais reais. Não transmitir documentos a serviços externos automaticamente.

## Situação atual e pontos de extensão comprovados

| Área | Evidência | Mudança necessária |
| --- | --- | --- |
| Modalidade | `shared/templates.ts`, `TemplateForm.tsx`: none/physical/external; publicação captura `signature_policy` | Reutilizar estes valores; capturar configuração por versão documental sem editar publicação imutável |
| Assinatura física | `WorkflowPanel.tsx` e comando `signature` em migration 23 | Substituir decisão simplificada por registro com modalidade, signatários e evidência, preservando histórico anterior |
| Assinatura externa | `private.wf_signed` aceita somente none ou evento físico; UI anuncia bloqueio | Vincular validação ao PDF exato e manter bloqueio até todos os requisitos |
| Arquivo oficial | `document-artifacts/handler.ts`, `document_artifact_authorize` | Selecionar original assinado validado para entrega; geração canônica continua independente e histórica |
| Integridade | Worker já calcula SHA256, limita bytes e autoriza antes/depois do Storage | Aplicar também ao original importado, sem conversão, recompressão ou renderização |
| Anexos | Pipeline 11 e `AttachmentsPage.tsx` | Reutilizar upload e estado oficial; quarentena/scanner ausente não libera formalização/arquivo |
| Financeiro | `wf_gate` exige handoff e quitação; handoff exige assinatura | Criar autorização própria para saída; permitir tarefa de cobrança pré-assinatura sem conceder entrega, evitando dependência circular |
| Interface | `DocumentEditor.tsx` já tem quatro abas; `WorkflowPanel` usa seletor | Acrescentar formalização dentro de Versões e PDF; não criar quinta aba ou rota paralela |

## Abordagens consideradas

1. **Recomendada: estender o workflow existente com registros imutáveis de formalização e referência ao arquivo 11.** Conserva autoridade editorial/financeira e trilha; exige adaptação coordenada do gate, worker, DTOs e interface.
2. Novo módulo independente com estados/arquivos próprios: duplicaria escopo, revisão e regras de entrega; rejeitado por contrariar a continuidade pedida.
3. Apenas habilitar o botão eletrônico ou reaproveitar o evento físico com texto livre: não prova qual arquivo foi validado e permite entregar outro PDF; rejeitado pelos critérios do manual.

Abordagem 1 aprovada expressamente pelo usuário em 04/11/2026, com autorização para executar.

## Contrato de dados e autoridade

- Toda configuração e evento referencia escritório, documento, revisão/publicação exatos. Publicações, revisões, snapshots, aprovações e arquivos antigos permanecem imutáveis.
- Configuração documental anterior à formalização: modalidade `none`, `physical` ou `external`, signatários esperados e política de saída. Não dispensar requisito obrigatório do snapshot de serviço/modelo por edição comum. Configuração que altere conteúdo/participantes ou requisito aprovado exige nova revisão e aprovação própria.
- Políticas explícitas de saída: `after_settlement` (conservadora por padrão) e `before_settlement` (autorização deliberada, motivo e autoria atuais). Alterar esta política não modifica o saldo nem concede exceção de entrega final. Não fabricar exceção financeira da Etapa 25.
- Tarefa de cobrança pode ser aberta antes da assinatura, depois de aprovação e PDF preservado, com propósito financeiro explícito. O handoff deixa de ser prova de assinatura; o gate final continua exigindo assinatura. Nenhum evento implica dinheiro recebido.
- Capacidades separadas propostas: `documents.signatures.manage` para configuração/saída/registro físico e `documents.signatures.validate` para a decisão humana. Ambas exigem leitura documental e escopo vigente; escrita exige responsabilidade atual conforme contrato do pedido. Seed somente owner; gestão por Equipe/convites/delegação, sem grants individuais automáticos. Revisão 23 não concede validação de assinatura.
- Leitura do cliente limitada a documento próprio e informação segura da formalização. Cliente não configura modalidade, não valida assinatura e não consulta observações/evidências internas. A importação inicial será operada por equipe autorizada; não acrescentar upload público autônomo nesta etapa.
- Registros imutáveis: saída autorizada, importação, validação/rejeição, invalidação e registro físico. Incluir ator/horário oficial, modalidade, publicação/revisão, signatários esperados/verificados, arquivo/hash/tamanho, método de conferência e evidência textual obrigatória. Fonte de identidade não é coincidência de CPF/e-mail.
- Detalhes dos signatários e evidências somente em armazenamento privado autorizado; não em URL, auditoria genérica, logs ou resumo do portal. Usar nomes/referências mínimos e CPF somente se houver necessidade de negócio expressa.
- Novas tabelas privadas com RLS/ACL fechadas, FKs compostas e índices por escritório/publicação/arquivo/ator; RPCs públicas INVOKER autenticadas sobre implementação privada que verifica identidade, sessão e capacidades.

## Fluxo eletrônico externo

1. Documento salvo/concluído e publicação atual com revisão aprovada ou validamente dispensada, sem veto. Gerar/preservar PDF base pelo worker atual.
2. Autorizar saída para assinatura, auditada separadamente de download final, com signatários e política financeira. Não exigir assinatura nem handoff final nessa autorização. Exigir quitação quando a política for `after_settlement`; ausência de cobrança não prova quitação.
3. Exportar PDF base com propósito de assinatura, bytes e hash registrados. O operador entrega externamente pelo procedimento real; abrir WhatsApp, download ou impressão não comprova recebimento.
4. Cliente assina fora do sistema, na própria conta GOV.BR ou serviço adequado. Interface oferece orientação/links oficiais fixos `https://assinador.iti.br/` e `https://validar.iti.gov.br/`; não incorpora login, tokens ou códigos.
5. Equipe importa PDF pelo pipeline privado 11, associado ao mesmo pedido/documento/publicação. Worker obtém e calcula hash dos bytes do Storage; não aceita hash do navegador como autoridade. Nenhum overwrite/upsert; nova importação tem nova referência.
6. Enquanto o arquivo estiver em quarentena, scanner pendente/ausente, rejeitado ou indisponível, mostrar o impedimento; manter original protegido e bloquear validação/entrega. Não marcar clean pela assinatura, extensão PDF ou conferência humana.
7. Operador realiza conferência em serviço oficial, confirma todos os signatários esperados, resultado e evidência correspondente ao hash importado. O sistema registra declaração humana; não anuncia validação criptográfica própria. Resultado rejeitado/incompleto mantém bloqueio.
8. Validação aceita somente arquivo disponível/clean, da versão exata, com evidência e signatários completos. Uma referência protegida impede limpeza do arquivo validado. Divergência de hash ou versão bloqueia.
9. Download final reusa o gate central e devolve exatamente o original aceito. Autorizar antes e depois da leitura, comparar identidade da referência/hash/tamanho e calcular SHA256 dos bytes. Gerar novamente PDF base nunca substitui original assinado; prévias/derivados não herdam validação.

### Limitação externa concreta

A base informa antivírus não configurado em Anexos. Consultar a configuração efetiva durante implementação, sem obter/expor segredo. Não contornar o pipeline nem contratar serviço automaticamente. É possível implementar e homologar o contrato em laboratório com scanner de teste explicitamente fictício; se o scanner real continuar ausente, registrar checkpoint de homologação hospedada bloqueada para importação/validação final. Não declarar o fluxo eletrônico operacional em produção nessas condições.

## Fluxo físico/cartório e modalidade não exigida

- `none`: assinatura satisfeita por política aplicável; isso não aprova conteúdo nem dispensa financeiro/identidade/restrições.
- `physical`: registrar os signatários, data informada do ato, quem conferiu, local/custódia da via física e evidência da conferência. Campos de cartório e referência do ato quando houver; nenhuma consulta/integracão automática.
- PDF gerado é representação digital da versão, não original eletrônico criptograficamente assinado. Se houver digitalização, importá-la pelo pipeline 11 com vínculo e hash; quarentena não vira arquivo entregável. Evidência física sem arquivo digital não libera como PDF eletronicamente assinado.
- O contrato integrado anterior já admite disponibilizar o PDF gerado como representação de uma via física conferida: `docs/superpowers/specs/2026-10-28-fluxo-documental-integrado.md`, seção Versões, aprovação e PDF. Preservar essa possibilidade sob o gate final; não exigir digitalização para toda assinatura física nem apresentar essa representação como original eletrônico assinado.
- Eventos físicos anteriores permanecem consultáveis como registros legados; não inventar signatários/evidências/hash para migração. Para novos atos exigir o contrato completo. Qualquer restrição adicional a novas entregas de histórico deve ser explícita e testada, preservando bytes/histórico.
- Alteração posterior do conteúdo gera revisão nova e demanda formalização própria. Não levar `validada` de uma revisão para outra; uma validação manual negativa/revogação também deve bloquear imediatamente novas entregas.

## Concorrência, recuperação e segurança

- Comandos com chave idempotente e digest do payload persistidos. Mesmo comando retorna resultado oficial; mesma chave com payload diferente conflita. Versão/revisão e último evento esperados para impedir decisões atrasadas.
- Definir e testar ordem de locks compatível com pedido/documento/financeiro e pipeline 11. Revalidar sessão, autoridade, responsabilidade, editorial, financeiro, disponibilidade do arquivo e fontes após esperas e antes da decisão.
- Storage e transação SQL não são atômicos: preservar intenção e permitir recuperação da mesma tentativa; objeto não confirmado permanece privado, sem limpeza automática de original/quarentena ou duplicação de decisão.
- Erro 503 preserva a tentativa e impede troca de payload até resolução; 409 exige estado oficial novo; 401/403 limpa dados privados e bloqueia. UID/session_id/autoridade diferentes descartam respostas e blobs anteriores.
- Express/Vercel somente conexão pública + Bearer. Operação privilegiada de bytes, quando necessária, permanece no worker Edge; service_role nunca em cliente/Express/Vercel/env público/logs.
- Limites de PDF devem respeitar simultaneamente o pipeline 11, bucket de artefatos e proxy; nenhuma expansão tácita. Não usar apenas `%PDF-` como prova estrutural nem hash como prova criptográfica.

## Frontend e experiência

- Inserir seção compacta Formalização em Versões e PDF do editor atual, reutilizando classes `team-field`, formulários e ações de Equipe/Convites. Resumo separado de modalidade, assinatura, financeiro e entrega.
- Seletor de operação e formulário correspondente; até quatro ações principais na tela inteira. Ferramentas e atalhos secundários no menu lateral existente. Não adicionar botão para cada ação ao topo.
- Reutilizar navegação `OperationLayout`/mobile existente para owner/admin/employee/client conforme capacidade e escopo reais. Não criar controles decorativos ou conceder permissão por função visual.
- Campos sem quadros/sombras, alvos 44px, inputs móveis 16px, foco, mensagens acessíveis, confirmação clara de decisão e rolagem natural quando conteúdo longo. Não cortar conteúdo para aparentar uma tela.
- Sem spinner, overlay ou mudança do rótulo ao executar. Bloquear duplicação e manter contexto da mesma sessão nas revalidações. Navegação apresenta estrutura imediatamente; isso não elimina latência de rede e não autoriza mostrar estado não verificado.

## Arquivos e camadas previstos

| Camada | Pontos previstos |
| --- | --- |
| Contrato compartilhado | `shared/documentWorkflow.ts`, validações existentes e novo contrato tipado de formalização |
| Supabase | Migration aditiva gerada por CLI; helpers/gate/authorize/comandos atuais, registros privados e referências de anexos; nenhuma migration anterior editada |
| Worker | `supabase/functions/document-artifacts/handler.ts` e handler específico de formalização se necessário; renderers históricos intactos |
| Express | `server/modules/document-workflow/router.ts`, projeções whitelist e transporte limitado de bytes |
| Frontend | `src/features/documentWorkflow/`, `DocumentEditor.tsx`, API e estilos existentes; lista de capacidades de Equipe/convites/delegação |
| Testes | Node/API, `tests/database/`, worker real com fixtures locais, contratos UI e jornada Auth local |
| Raiz/continuidade | Cartão/fecho 24, evidências reais, `AGENTS.md` somente contratos novos e `LIVRO_RAIZ.md` com status verdadeiro |
| GitHub/Vercel | Branch/PR, validações locais; deploy por integração GitHub → Vercel e conferência de commit/assets/saúde; nenhum workflow Actions |

## Critérios e provas exigidos antes de concluir

1. PDF externo importado em laboratório e entregue byte a byte igual ao validado, incluindo hash/tamanho; nenhuma renderização, impressão, mesclagem ou recompressão do original.
2. Hash falsificado, arquivo diferente, quarentena, scanner ausente, validação incompleta/negativa e imagem de rubrica não liberam assinatura eletrônica.
3. Signatários faltantes, revisão substituída, veto editorial, vínculo revogado, escopo de outro escritório, permissão revogada e sessão encerrada bloqueiam no servidor/SQL/worker.
4. Políticas antes/depois da quitação exercitadas: cobrança anterior à assinatura possível; saída não implica entrega; ausência de cobrança/estorno não permite a entrega final.
5. Edição posterior exige revisão/aprovação/formalização novas; PDFs e evidências históricos imutáveis.
6. Registro físico/cartório comprova somente ato declarado e conferência manual, não validade automática ou assinatura eletrônica.
7. Retries, mesma chave/payload divergente, disputa de validação, estorno/revogação entre autorização e bytes e falha Storage/SQL têm resultados consistentes.
8. Suítes existentes selecionadas e regressões 22/23/11/financeiro, typecheck/build; SQL em dois replays sob migrador limitado, permissões/RLS e jornada Auth/API/Storage local real quando o laboratório estiver disponível. Informar bloqueios reais; não substituir teste integrado por mocks sem declarar.
9. Contratos UI e capturas inspecionadas em 320/360/768/1440, perfis autorizados/negados, sem overflow indevido, loaders, atalhos além do limite ou campos fora do padrão.
10. Medir endpoints autenticados locais com amostras/p50/p95, tamanho de payload e round-trips; consultas paginadas/indexadas e sem N+1. Não prometer atraso zero ou SLA hospedado sem evidência.
11. Publicação somente após validações e autorização aplicável; ordem worker compatível → runtime/schema aditivo conforme compatibilidade verificada. Após Git reler `schema_migrations` e comparar SQL antes de qualquer aplicação manual, pois integração pode aplicar automaticamente. Conferir worker, ACLs, migration, commit, assets e domínio; não alegar publicação só por PR criado.
12. Nenhum dado/conta/grant/tarifa/assinatura/arquivo de teste real criado no ambiente hospedado. Se faltarem scanner real ou dados operacionais configurados pelo gestor, documentar a limitação de homologação e manter o gate seguro.

## Aprovação e checkpoint

Especificação revisada independentemente e aprovada expressamente pelo usuário, que autorizou executar a Etapa24 e depois sua retomada incremental. Capacidades separadas, política conservadora de saída, reuso de anexos e compatibilidade do legado físico fazem parte desse escopo aprovado; não há aprovação rotineira pendente.

O checkpoint histórico de preparação não representava implementação. Os resultados posteriores efetivamente executados e a publicação devem ser consultados no Livro, contrato/fecho24 e evidências; não avançar25 nesta tarefa.

Revisão independente da especificação realizada em 04/11/2026: nenhuma questão material pendente para planejamento. Incorporada a referência ao contrato anterior da representação de via física. Verificação documental local: `git diff --check` e existência das referências locais explícitas passaram. Isso não constitui teste funcional nem homologação da Etapa 24.
