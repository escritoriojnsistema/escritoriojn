# Revisão de documentos e serviços

Pedido: corrigir integralmente os fluxos descritos pelo usuário, preservando React/Vite/Express, dados reais, permissões e publicação GitHub → Vercel, sem Actions.

- [x] Reproduzir perda de `source_import_id` após migration 03/11 e validar o contrato SQL → DTO para rascunho/aprovado importado.
- [x] Corrigir edição de versões anteriores, seleção do documento consultado, exclusão e numeração posterior; testar pastas vazias e movimentação com permissão explícita.
- [x] Acrescentar exclusão lógica de serviços com motivo, versão esperada e idempotência; retirar das seleções e bloquear nova contratação sem alterar snapshots existentes. Tornar a edição explícita na interface.
- [x] Conferir categorias do manual, Configurações, inatividade, protocolo, checklist interno/cliente, arquivamento e barreiras de entrega.
- [x] Rodar testes Node/API, PostgreSQL descartável, navegador mobile/desktop e build; registrar limites reais.
- [ ] Revisar, publicar por GitHub → Vercel e conferir schema/artefatos/saúde publicados.

Decisões: exclusões preservam histórico privado; super administrador tem as capacidades existentes; administrador/funcionário precisam de concessão explícita. Nenhum preço, aprovação, conta ou operação comercial fictícia será criado em produção. O cliente continua sem receber texto do modelo no catálogo.
