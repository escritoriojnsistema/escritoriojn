# Etapa25 — regra única de liberação e exceções

Fonte: [cartão oficial do Drive](https://drive.google.com/file/d/1BduPnf6NG-MxODfNfyqoonB_XMsqFmD5/view). Base b951a03, última24 e correções23/24 conferidas antes de alterar. [Especificação](../superpowers/specs/2026-11-05-etapa-25-liberacao.md), [plano](../superpowers/plans/2026-11-05-etapa-25-liberacao.md), [fecho e limites](fecho-25.md).

`private.avaliar_liberacao25` estende o gate existente; editorial, financeiro, assinatura e entrega permanecem independentes. O gate original fica como helper privado para a política de saída para assinatura24, que não recebe dispensa financeira25. A autorização final existente continua revalidando sessão/capacidade/escopo/fontes após locks e antes/depois de ler os bytes no worker. Não cria link público nem altera PDFs/assinaturas.

Solicitação, autorização, recusa e revogação financeiras são eventos imutáveis com autor/data/motivo/validade. Escopo: publicação/revisão, arquivo/hash, cliente vinculado, versão do atendimento e fingerprint da cobrança/alocações/estornos. Alterações exigem nova avaliação. Validade até30dias; exceção não quita a dívida e não ignora identidade, sigilo, aprovação ou assinatura. Epoch de autoridade observa vínculo, capacidades e delegações: revogar/conceder novamente não reativa exceção antiga. Comandos idempotentes por ator/chave/hash, evento/revisão esperados e guarda transacional do escritório.

`documents.exceptions.request` e `documents.exceptions.decide` são independentes; seed somenteowner. Admin/funcionário dependem de concessão explícita e responsabilidade/escopo atuais. `read_all` não concede decisão. Clientes só consomem o gate seguro do portal; nunca motivos/histórico internos. Releases privados append-only ligam acesso autorizado à revisão/arquivo/hash, ator/sessão, cliente e avaliação/exceção. Download autorizado não comprova recebimento; o acompanhamento de entrega26 não foi iniciado.

UI: seletor Liberação e exceção financeira na área existente Versões e PDF; uma área visível por vez, sem quinta aba/novo atalho. Badges/textos das dimensões, saldo real, prazo, escopo preservado e histórico5. Motivo obrigatório;503 conserva tentativa,409 exige reconferência,401/403 limpam estado. Padrões Equipe/Convites, mobile44px/16px,4atalhos/sidebar e rótulos sem spinner. Conteúdo longo/zoom/teclado usa rolagem natural.

Performance: RPC única por operação, autorização no banco, índices escritório/publicação/charge e histórico paginado; nenhuma pré-consulta de gestão, polling ou cache de permissão novo. Não há promessa de latência zero.

Rollout: capacidades compatíveis primeiro, depois runtime/migration por GitHub→Vercel semActions; reler histórico Supabase antes de eventual aplicação manual. Não criar dados/grants/tarifas/contas de teste hospedados. Worker e ambiente/cadastro: sem alteração de código/configuração; scanner real ausente continua bloqueando quarentena. Estado efetivo de publicação no fecho.
