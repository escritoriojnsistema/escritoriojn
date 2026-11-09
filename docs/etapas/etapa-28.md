# Etapa 28 — ITR/DITR por exercício e retificações

Fonte: cartão Drive `1Vd0_CGHyyOLP2Z_O_BhTNzNn5tbdKcU5` e regra `1yEVpE58Mb6FLk1yvMklsByazOkdu9dRs`, consultados em 09/11/2026. Base publicada: Etapa27 + permissões modulares, main `3a9c3e9`.

Criar casos por imóvel, exercício e contribuinte, original/retificadora. Original equivalente único; retificação aponta ao anterior da mesma cadeia e conserva recibos/evidências. Reutilizar atendimento27 e cobrança13/15, sem financeiro paralelo. Não transmitir DITR nem representar protocolo interno como recibo oficial. Guias, tributos e comprovantes externos são informações separadas; pagamento do serviço nunca quita ITR.

Calendário anual sem prazo presumido: fonte oficial HTTPS gov.br, data de conferência, período e responsável autenticado. Revisões append-only. Não declarar norma validada automaticamente; conferência humana explícita.

Reutilizar `/imoveis-rurais`, OperationLayout, campos e seletores compactos, até quatro ações principais, extras no menu; sem spinner/overlay. Sessão/escritório/autoridade isolam estado. 503 conserva tentativa exata; 401/403 bloqueiam; 404 limpa recurso; conflito exige reconferência. Cinco registros por página, sem limites silenciosos.

Decisão de implementação: contribuinte é o cliente do atendimento vinculado, com papel **contribuinte** explícito no imóvel e período sobreposto ao exercício. Cada caso usa atendimento próprio, permitindo honorários separados e o núcleo existente. Leitura exige rural.read + customers.read + requests.read, escopos27/10; escrita acrescenta rural.records.manage + customers.update e responsabilidade atual. Evidência acrescenta files.read; honorários só com charges.read. Calendário não altera cadastro nem concede acessos. Nenhuma nova concessão ou direito de portal.

Aceite: dois imóveis no mesmo ano; duplicidade original; cadeia sem apagar original; escopo cruzado e cliente negados; recibo externo separado; honorário/tributo independentes; prazo sem fonte recusado. Dados/API/UI/testes conectados, Livro/fecho com evidência real. Publicar somente GitHub→Vercel, sem Actions, sem fixtures hospedadas. Conferir histórico Supabase após Git antes de aplicação manual. Próxima29 somente por novo pedido.
