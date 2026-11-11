# Etapa 31 — plano e decisões

Objetivo: consolidar vínculo seguro do portal sem recriar Auth04, identidade08 ou entrega25/26. Base: main0d9779b, Etapa30 publicada. Fontes: cartão31 e RF16 do Drive, AGENTS/Livro e contrato08.

Arquitetura: convite privado associado à membership cliente já confirmada e ao contato confirmado no Auth, token aleatório de256bits armazenado somente como SHA256, validade24h e consumo único. A aceitação cria a relação identity08 na mesma transação, ou confirma a mesma relação administrativa existente; colisão exige revisão08, sem mesclar automaticamente. Recuperação/troca de contato não muda a pessoa vinculada. Nenhuma capability nova nem foundation.access para cliente.

Representação: reutiliza representação08 vigente e identidade08 do representante; autorização distinta, revogável, limitada a um atendimento e à consulta do andamento público, por até30dias. Não concede documentos/anexos/financeiro; futuras liberações de versões dependem das etapas32/33 e gates25/26. Sem autoridade inferida de CPF/nome/e-mail.

Alternativas descartadas: segundo cadastro duplicaria04/08; ampliar finance_client_request/wf_recipient para representante concederia escopo documental/financeiro indevido. Preferido estado próprio allowlist de andamento representado.

- [x] Banco: convite/hash/contato/versionamento, consumo atômico, duplicidade, revogação e auditoria; RLS/ACL privadas e wrappersINVOKER.
- [x] Backend: POST Bearer/no-store, corpo estrito e DTO allowlist; erros genéricos.
- [x] Frontend: Clientes→Vínculos→Identidade/Representantes e Conta do cliente, componentes comuns, sem loaders; token só em memória e nunca URL/storage/log.
- [x] Verificar expiração/reuso/conta errada/duplicidade/contato alterado/recuperação/representante revogado; Node/SQL/UI320–1440/build.
- [x] GitHub→Vercel semActions; conferir histórico/schema hospedado antes de reaplicar migrations; Livro/fecho com provas reais.

Riscos prioritários: replay concorrente, seleção equivocada da conta, resposta de sessão anterior, grants excessivos ao representante e vazamento do token. Convite é entregue manualmente após conferência administrativa ao contato confirmado, sem alegar envio automático.

Status: APROVÁVEL — publicada/verificada peloPR113 após compatPR112;32comandos/13definições/72assets conferidos. Detalhes nofecho31; próxima32por novo pedido.
