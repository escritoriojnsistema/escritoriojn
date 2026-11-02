# Etapa 22 — gerar PDF, controlar versões e pré-visualizar

Fonte: [cartão oficial do Drive](https://drive.google.com/file/d/1Hm3GSCznFnBp89zKFcdj2ZZXbSsdM4Bb/view), consultado em02/11/2026. Base conferida: b3a9330, Etapa21, ajustes pós21, fluxo integrado01/11 e correções02/11.

## Contrato implementado

- `private.document_versions`: uma versão por revisão21, snapshot de input/fontes/participantes/modelo/resolução, conteúdo, SHA256 de conteúdo/snapshot, autor real e data. Trigger diferido captura os participantes após todos os inserts; histórico imutável e backfill das revisões existentes. Não duplica documentos/modelos nem decisões.
- Estado editorial derivado de `document_publications`/`document_publication_events`: rascunho, em revisão, aprovado, rejeitado e substituído. Alterar aprovado cria revisão/versão nova sem decisão herdada; decisão anterior permanece consultável. Preparar21 e aprovar conteúdo continuam distintos.
- `private.document_version_files`: arquivo interno confiável no bucket privado existente, caminho estável/sem sobrescrita, lease por sessão, SHA256 dos bytes e tamanho, com conclusão restrita ao worker. Prévia interna usa `jn-preview-v1`, fontes locais e marca RASCUNHO em todas as páginas; acesso fica em `document_version_accesses` imutável. Não é arquivo final nem concede assinatura/entrega.
- Renderer final `jn-document-v2` corrige paginação de rodapés de novos arquivos. Renderer/fontes v1 e arquivos/jobs anteriores permanecem intactos; `renderer_version` registra a seleção e conclusão recusa versão divergente. Worker tem fallback v1 para rollout compatível antes da migration.
- RPCs autenticadas `document_versions_page(office,document,page)`, `document_version_begin(office,version)` e `document_version_authorize(office,version,receipt=false)`. `document_version_complete(job,lease,sha,size)` somente service_role. Tabelas privadas/RLS sem GRANT de dados; wrappers públicos INVOKER; helpers restritos.
- Autoridade atual de documentos21/atendimento10/clientes08 vale inclusive no histórico. Cliente não acessa prévia. Conclusão do worker avalia ator/permissões registrados no job, incluindo read_all e relações atuais; não usa a identidade service_role como usuário. Revogação, restrições de fontes e sessão são rechecadas. Download autentica antes/depois da leitura e confere hash/tamanho; sem URL pública/assinada.
- Express `/api/document-workflow/versions` e `/preview`, POST/Bearer/no-store, corpos fechados, DTO de metadados sem snapshot/paths, limite3MB e conferência independente de hash. React usa os mesmos bytes e compara hash/tamanho com metadados oficiais antes de exibir Blob; revoga Blob/aborta na saída.
- Editor mantém a tela única com aba Versões e PDF; histórico paginado5, versão atual, autor/modelo/estado/identificação e decisão. Desktop/mobile seguem Equipe, 44px/16px, sem loaders ou alteração de rótulo. Ações extras voltam à sidebar do Hub; decisões avançadas usam seletor+ação única. Tentativa documental503 mantém chave e impede trocar aba/conta/reabrir enquanto incerta; sucesso permite continuar.

## Compatibilidade com o manual

O cartão22 bloqueia nova entrega até25. A base já publicou, por autorização anterior expressa, o fluxo integrado que cobre os contratos22–26 pertinentes. Esta etapa não retira esse fluxo nem altera seus gates financeiros/identidade/revisão/assinatura. A nova prévia é sempre material de trabalho RASCUNHO e não oferece entrega final. Assinatura externa continua bloqueada.

## Conferência

Em Documentos → Documentos emitidos, abrir declaração autorizada, concluir preenchimento, usar Versões e PDF e conferir o arquivo marcado. Revisão e entrega registra decisões existentes. Alterar o texto e aguardar gravação cria nova revisão rascunho; o seletor conserva anterior/substituída e decisão anterior. Serviços/preços/permissões reais continuam configuração do gestor, sem seed fictício.

Fecho e evidências: [fecho22](fecho-22.md). Próxima etapa:23, somente mediante novo pedido.
