# Correções de anexos e rodapé após34

Pedido13/11/2026; base mainfe4362d. Conferidos AGENTS/Livro, PR121–125 e78migrations. A outra conversa já publicou navegação agrupada, rodapé, aceites, categorias e leitura34. Não refazer essas entregas nem iniciar35.

- [x] Investigar histórico/duplicações e pipeline11/12/24/27–34 antes de modificar.
- [x] Remover duplicação de políticas na Conta, faixa de benefícios e UI/rota de status; compactar nome/políticas no rodapé, preservando health técnico.
- [x] Corrigir upload do cliente em próprio pedidoportal aberto; picker deve refletir autoridade real, sem expor pedidos de terceiros ou identidade só de leitura.
- [x] Visualização privada de PDF/imagem com hash/tamanho conferidos, escopo/autor/sensitive atuais e sem promover quarentena/liberação documental.
- [x] Exclusão individual confirmada: reserva correlacionada à sessão/chave/versão → Storage API autenticada → confirmação/purge real dos metadados. Recusar proteção, retenção ou referência em uso; manter apenas auditoria/comando mínimo de idempotência, sem arquivo/nome/bytes.
- [x] Conferir consumidores de anexos (pedidos, categorias, serviços/modelos, checklist, rural, especializado, assinaturas e financeiro), mantendo gates de publicação e evidências.
- [x] Testes Node/SQL/AuthStorage/UI Desktop/Mobile, revisão independente e documentação/produção GitHub→Vercel semActions/deploydireto.

A exclusão real é acionada apenas pelo usuário autorizado para o arquivo escolhido. A verificação usa arquivos fictícios em laboratório descartável; nenhum expurgo ou fixture hospedado. Storage é removido pela API oficial, nunca por DELETE em storage.objects. Quarentena não equivale a scanner clean; visualização interna/autoral não libera cópia/distribuição/entrega. Arquivos já usados como evidência/documento conservam a referência e explicam o bloqueio.

## Resultado e limites

407 testes Node aprovados; tipos/build aprovados. Contratos de UI foram atualizados à implementação já publicada noPR124: seleção obrigatória de categoria, sem restaurar formulário legado. Regressão principal:129cenários aprovados; o cenário deVoltar durante503 identificou um problema de ordem dos listeners e foi corrigido no bootstrap e aprovado em5testes focados (anexos/categorias/serviços). Visualização PDF usa canvas de página, sem plugin nativo/iframe; PDF.js e worker locais carregam sob demanda. Nenhum spinner novo.

Laboratório real descartável:11grupos aprovados com GoTrue, PostgREST, Express, Storage e handler real. Validados envioPNG/PDF pelo cliente, isolamento UID/escritório/sessão, visualização, exclusão física e purge, idempotência, permissões atuais, sensíveis30 e revogação. A tentativa adicional de retomar reserva expirada não iniciou por falta de espaço noDocker local; não é reportada como aprovada emStorage real. A retomada tem coberturaSQL e corrida concorrente separada. Nenhuma conta, grant, arquivo de usuário ou configuração real foi criada/alterada para teste hospedado.

Conexões mantidas: anexos de categoria e complementações33; detalhe de atendimento e contextos rural/especializado usam o mesmo request_id. Checklist12, evidências rurais27–29, casos30, assinaturas24, publicações21–26/32 e registros financeiros preservam seus vínculos e regras. Não converter arquivo de quarentena em documento entregue. O cliente não ganha funções da equipe; representação31 não vira direito de anexos. Gates de portal e navegação agrupada previamente publicados foram preservados e cobertos por regressão.

Exclusão de arquivo livre remove bytes viaStorage e registros de anexo/intent/lease no banco. Arquivos protegidos, sob retenção ou já vinculados permanecem bloqueados com explicação; não apagar evidência histórica por cascata. A reserva de exclusão abandonada pode ser retomada após15min mediante autorização vigente. Retry guarda a mesma versão/chave, inclusive ao usarVoltar ou tentar sair da conta durante503.

Publicação autorizada:GitHub→Vercel, semActions e semdeploydireto. Histórico hospedado anterior78/20261112143334 conferido; a única migration nova é20261113140739. Registrofinal em docs/evidencias/anexos-rodape-pos34/publicacao.json. Última etapa continua34;35não iniciada.
