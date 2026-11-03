# Revisão de documentos, serviços e solicitações — 03/11/2026

## Problemas corrigidos

- Os 64 modelos importados falhavam ao abrir porque `template_version20` perdeu `source_import_id` na migration anterior. A API rejeitava a autoria técnica incompleta e respondia 503. Projeção restaurada sem reduzir a validação nem alterar conteúdo/autoria/aprovações.
- Edição na mesma versão agora aceita versões aprovadas anteriores, conserva sua aprovação e o registro privado do texto anterior. Seletores compartilham a versão consultada. Abertura e retorno de edição localizam a página pelo número e posição entre versões visíveis, incluindo lacunas de exclusão.
- Edição/exclusão usam `expected_edited_at` após o lock para impedir sobrescrita/exclusão de conteúdo alterado por outra pessoa. Replay usa a chave original. Cliente antigo sem carimbo só pode alterar conteúdo nunca editado.
- Criar versão depois de excluir uma versão não reutiliza número já reservado no histórico.
- Serviços ganhou **Editar serviço** e **Excluir serviço**, com motivo, confirmação, versão esperada, comando idempotente e auditoria. A exclusão retira o serviço dos seletores, catálogo e novas contratações, preservando versões, pedidos e financeiro. `services.read` + `services.manage` continuam obrigatórios.
- A entrada **Documentos** inclui ofertas documentais aprovadas mesmo quando o serviço está em outra categoria comercial, sem mudar a categoria ou o preço configurados.

## Escopo revisado e preservado

| Requisito | Evidência |
|---|---|
| Configurações: Auditoria, Arquivados, Equipe e convites, Categorias, Acessos | `settings-catalog-contract`, API/settings e SQL de permissões |
| Categorias centrais, criação/renomeação/exclusão autorizadas | `categories-settings`, `categories-api`, consulta do manual v4 |
| Inatividade 15/30/60/120/180 minutos e personalizada | `access-inactivity`, `session-activity`, `access-settings-api`, contrato UI |
| Categoria, pasta, oferta aprovada, preço e protocolo automático no cliente | `categorized-request-catalog`, contrato UI e laboratório Auth real |
| Checklists interno e cliente por serviço | SQL/contratos de checklists e laboratório real; conteúdo interno ausente na projeção do cliente |
| Rascunhos/aprovados separados, sem mostrar excluídos, atualização de pastas | `template-management-contract` e SQL |
| Renomear/excluir pasta vazia e mover modelos com concessão explícita | `library-services-regression`; funcionário sem leitura/gestão continua bloqueado |
| Arquivar solicitações concluídas e configurar prazo/relatórios | `request-archives-settings`, `request-archives`, contrato UI |
| Sem texto de modelo ou checklist interno no catálogo do cliente | SQL e Auth real; liberação financeira/documental existente preservada |

Não houve concessão individual automática, aprovação em lote, cadastro de tarifa fictícia nem operação comercial hospedada. Os checklists operacionais continuam configuráveis pelo gestor em Serviços/Checklist; a revisão não inventa exigências documentais para os modelos reais.

## Manual e categorias

Fonte consultada: [manual v4, 71 páginas](https://drive.google.com/file/d/1PjG_-IkoUxLFxejjoU1mYZhB5X_GxW96/view), seções de catálogo (p.17), modelos (p.21), rural/jurídico (p.24) e cartões até a etapa40. As categorias canônicas existentes cobrem as famílias; a leitura dos cartões futuros não ativa seus módulos.

| Categoria canônica | Família do manual |
|---|---|
| Documentos | Contratos, declarações, requerimentos, ofícios e seus modelos/PDFs |
| Cópias e impressões | Xerox/cópias e impressão, inclusive atendimento rápido |
| Digitação | Digitação/preenchimento como serviço |
| Plastificação | Plastificação e atendimento rápido |
| Certidões / Registros | Certidões, registros e respectivas segundas vias |
| Rural | Imóveis rurais, ITR/DITR, CCIR/CAR e exercícios/retificações |
| Previdenciário / Jurídico | Casos previdenciários, jurídicos e acompanhamento de prazos |
| Consultoria / Contabilidade / Fiscal / Trabalhista | Famílias administrativas já disponíveis na configuração central |
| Atendimento / Outros | Triagem, orientação e serviço que o gestor ainda irá classificar |

A fonte de categorias continua sendo o banco por escritório; a tabela acima documenta a organização e não é uma lista paralela no frontend. Serviços mantêm snapshots e associações por ID. Novas tarifas e obrigações reais exigem configuração pelo gestor, não inferência do manual.

## Verificação

- `npm test`: **277/277**.
- `JN_DB_DOCUMENTS21_ISOLATED=1 npm run test:db`: **829 PASS**, dois replays PostgreSQL17, migrador sem superusuário/BYPASSRLS; regressões de origem, versões, concorrência, catálogo, serviços e pastas incluídas.
- Reprodução sem a migration corretiva: falha esperada em `imported draft and approved projections preserve provenance required by API`.
- `node scripts/test-library-services.mjs`: **1 jornada real aprovada** com GoTrue, JWT, PostgREST, API Express, PostgreSQL e navegador 360/1440; contas e dados inteiramente locais. Storage usado apenas como contrato de schema, sem alegar teste de bytes/entrega nesta rodada.
- Navegador: **75 contratos distintos aprovados**, última rodada73 +2rechecagens; larguras320/360/768/1440. Registro no JSON de evidências.
- Build/typecheck/diff aprovados; `npm audit --omit=dev`:0vulnerabilidades.
- Revisão independente: seleção, conflito de edição e paginação apontados e corrigidos; reavaliação liberada condicionada aos testes finais.
- Falhas intermediárias: duas desconexões do Vite durante HMR passaram isoladas; fixture de rascunho sem placeholders foi corrigida; seletor de teste passou a usar o papel acessível do combobox; expectativa antiga de editor inteiro sem rolagem foi atualizada para testar acesso ao botão com rolagem natural, conforme AGENTS. Laboratório completo com Storage excedeu espaço em disco; substituído pelo laboratório Auth real sem Storage, suficiente para os fluxos desta correção.

## Publicação e limites

Publicação pelo GitHub → Vercel, sem Actions nem deploy CLI/API. Conferir a migration corretiva no histórico após merge antes de aplicação manual. Comparar contagens/hashes de modelos, serviços e localizações antes/depois. A verificação hospedada não usa credenciais pessoais: schema, projeções, preservação de dados, assets públicos, saúde e barreiras anônimas; o login real foi exercitado no laboratório descartável.


## Publicação confirmada

[PR77](https://github.com/escritoriojnsistema/escritoriojn/pull/77), merge `65574ca19e9b62def592417997234c3212fe7564`, árvore runtime `c1a227c695de235f92916e56505a34a9ba58b2cc`. Vercel [6Cbasji3](https://vercel.com/escritorio-jn/escritoriojn/6Cbasji3njqgCwd4MsSAsKc1bgS3) **success**, produção https://escritoriojn.vercel.app. Oito assets iguais ao build com a mesma URL/chave pública do projeto (sem chave privilegiada), home/health200 e cinco APIs401 anônimas.

Migration `20261103160413` aplicada pela integração Git: **26 comandos canonicamente iguais ao arquivo**. Uma tentativa manual concorrente foi recusada pela guarda de alvo já corrigido; o readback confirmou a aplicação automática completa e uma única entrada no histórico. Não reaplicar. Sem mudança nos hashes de texto/definições de serviço/localizações e sem mudança das contagens64modelos/64versões/1aprovação/1serviço/1versão de serviço/4pastas/17concessões individuais. Projeção dos64importados agora conserva origem; nova tabelaRLS/ACL e RPCs fechadas ao anônimo conferidas.

Próximo checkpoint: uso operacional dos modelos e serviços pelo gestor. As escolhas reais de aprovação, tarifa e itens de checklist permanecem sob sua gestão; esta revisão não avança automaticamente as etapas futuras do manual. Para continuidade, ler AGENTS, este fecho e os três JSONs de evidência desta revisão.
