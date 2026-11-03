# Edição da mesma versão, pastas e permissões — 03/11/2026

Continuação do ajuste de Configurações/Categorias/Acessos. O `main` já tinha o
catálogo por categoria/pasta/documento, protocolo automático e a biblioteca com
abas Rascunhos/Aprovados. Esta etapa acrescenta o que ainda faltava no pedido:
editar e excluir **a mesma versão**, mudar o título sem criar versão, liberar
pastas por permissão e permitir excluir pasta que só contém modelos excluídos.

## Entregue

### Editar a mesma versão
- `public.model_version_command` (`edit`/`delete`) com versão esperada,
  idempotência e transação.
- **Editar** altera o conteúdo da versão mais recente sem criar uma nova versão.
  O conteúdo anterior, autor, motivo e data ficam em
  `private.template_version_events`; a versão recebe `edited_at`.
- A edição de uma versão aprovada **mantém a aprovação existente**, conforme o
  pedido de editar aprovados sem nova versão. O texto anterior fica auditado.
  Para uma nova decisão formal, o fluxo de nova versão continua disponível.
- **Excluir** faz exclusão lógica: a versão sai da biblioteca, do histórico
  visível, do catálogo e das novas solicitações. Atendimentos/documentos já
  existentes conservam seus snapshots.
- Se a última versão for excluída, o modelo sai da biblioteca ativa
  (`model_metadata.archived_at`). Se houver versões anteriores, `latest_version`
  passa para a maior versão restante.

### Título sem nova versão
- O campo **Título do modelo** continua separado. Quando o título (`name`) é
  alterado no formulário da versão, um trigger sincroniza
  `private.model_metadata.display_name` sem criar versão.
- A tela de detalhe avisa quando a versão foi editada no lugar e que o texto
  anterior está na auditoria.

### Pastas
- Renomear, excluir pasta vazia, mover modelo, editar título/conteúdo, excluir
  versão e duplicar agora dependem de **`templates.manage`**, não de cargo fixo.
  O super administrador sempre possui; administrador/funcionário só quando a
  permissão for concedida em **Equipe e convites → Editar acesso**.
- Excluir pasta ignora modelos já excluídos, remove esses vínculos e só bloqueia
  quando ainda existe modelo ativo na pasta.
- O botão “Excluir pasta” não é mais desabilitado preventivamente por qualquer
  vínculo; o servidor decide e devolve conflito quando há modelo ativo.
- Rótulo da permissão: **Criar, editar, mover e excluir modelos**.

### Migração
- `20261103120000_model_version_edit_delete_permissions.sql` no repositório.
  A versão já constava em `supabase_migrations.schema_migrations`; as funções de
  visibilidade de rascunhos foram corrigidas no banco para não regredir o
  `main` atual e o teste SQL confirmou o comportamento.
- Colunas de edição/exclusão em `template_versions`, tabela append-only
  `template_version_events`, trigger de título, RPC de versão e filtros de
  versões excluídas em modelos, catálogo, opções de documento e categoria da
  pasta.
- O `DELETE` direto de versões continua bloqueado; a exclusão só ocorre pela
  RPC autenticada.

## Verificação executada

- `npm run typecheck` — passou.
- `npm run build` — passou.
- 5 testes focados passaram (`model-version-api`, modelos, auditoria).
- Suíte completa: 275 testes, 262 passaram e 13 falharam; todas as 13 falhas
  são PDFs por ausência de `pdftotext`/fontes na VM. Os dois hashes de `package.json` congelados nas
  evidências das apresentações 6/7 estavam desatualizados no `main`; foram
  corrigidos para o hash atual e os testes de auditoria voltaram a passar.
- Banco como owner real, em transação revertida:
  - edição manteve `latest_version=1`, gravou `edited_at` e 2 eventos;
  - exclusão removeu a versão da página (`history_total=0`) e arquivou o modelo;
  - nenhuma alteração de teste permaneceu no banco.

## Lacunas

- O banco continua sem serviços/preços/ofertas reais. As categorias aparecem,
  mas o catálogo não tem documentos até o gestor cadastrar serviço, aprovar o
  modelo e vinculá-los em **Serviços → Documento e pasta**.
- A conferência autenticada no navegador (login, clique e sessão real) depende
  do gestor nesta VM; aqui foram validados API, DTO, banco, build e testes.
