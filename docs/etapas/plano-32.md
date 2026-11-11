# Etapa 32 — plano e decisões

Objetivo: acervo e histórico autorizados, contrato comum por versão e isolamento entre clientes. Base main7d1b6a0/Etapa31 publicada, sem mudanças pendentes; manual32/RF16/Livro/AGENTS conferidos.

Arquitetura: estender publicações21–26 e identidade08/31. Não criar login/arquivo/financeiro paralelos. Titular mantém vínculo canônico; participante ganha autorização explícita de documento final por publicação/revisão/bytes e identidade08 exata, com validade obrigatória até365dias (decisão técnica conservadora) e revogação auditada. `documents.deliver` existente controla compartilhar/revogar no escopo/responsabilidade21/26, sem nova permissão ou concessão individual. Alteração/revogação de identidade, bytes, versão ou autoridade invalidam o grant. A regra única25/26 continua decidindo a liberação; não há segunda regra financeira ou assinatura.

Representação31 continua somente andamento público. Ser comprador/vendedor/representante não abre todo o atendimento, anexos, fichas ou financeiro. Compartilhamento32 exige que a pessoa conste na versão publicada; metadados/pendências de participante são genéricos e nunca trazem valores de terceiro. Downloads usam o worker existente, reautorizado antes/depoisStorage, registrando destinatário efetivo no ledger25/26.

Pedidos próprios por vínculo08 passam a aparecer na tela existente de Solicitações via projeção de leitura32, sem ampliar request_in_scope operacional/anexos/mutações. Título/mensagem internos são omitidos; história só data/status público, sem nota/motivo/ator. Submissões próprias04/10 mantêm correção/devolução existentes. Financeiro só via identidade do titular ou pedido ainda não ligado a pessoa, nunca participante32.

Interface: Documentos→Meus documentos reutilizado, busca POST/páginas3mobile/5desktop, detalhe com documento/pendências/financeiro próprio e histórico de downloads do usuário. Compartilhar no seletor de Ação documental, uma área por vez. Reutilizar Equipe/Convites/shell/4atalhos/sidebar, sem loaders;busy propagado ao hub e respostas de sessão anterior descartadas.

- [x] Banco: grants/eventos/comandos privadosRLS/ACL, RPCs32, extensão do gate25/26 e recibo com destinatário real, wrapper de leitura de pedidos/financeiro restrito; testes de isolamento/expiração/revogação/concorrência.
- [x] Contrato/API: DTOs allowlist e4POST Bearer/no-store; erros semPII; novas projeções de histórico na API existente de pedidos.
- [x] UI: gestão por publicação e portal/documentos/Solicitações com estados compactos, sem dados internos/cache persistente, navegação pendente protegida.
- [x] Verificação: comprador/vendedor/terceiro, outra sessão/escritório, UUID/API/Storage, revogação durante leitura, nova versão/arquivo/permissão, financeiro de terceiro, tipos/build/Node/SQL/AuthStorage reais locais/UI.
- [ ] Publicação GitHub→Vercel/semActions, conferir histórico remoto antes de eventual aplicação manual; atualizar Livro/fecho/evidências sem fixtures hospedadas.

Alternativas descartadas: ampliar wf_recipient por atendimento abriria todos os documentos da outra parte; ampliar request_in_scope abriria módulos operacionais. A autorização32 fica restrita à publicação e as projeções de pedidos só consultam dados públicos.

Revisão independente: autoridade atual do emissor exige scope22/sources22/caps explícitos, nível de execução e responsável atual. Mudança de responsabilidade10/atribuição08 marca invalidated_at persistente, impedindo A→B→A; replays e gestão observam o mesmo carimbo. Não interfere nos epochs/exceções25 existentes. Índices compostos office/customer e office/issuer cobrem FKs e invalidação de grants.
