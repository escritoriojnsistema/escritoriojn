# Etapa 32 — acervo e histórico no portal

## Resultado e uso

Documentos → Meus documentos reúne busca, pendências de liberação, financeiro próprio e downloads autorizados da conta. Solicitações mostra também atendimentos vinculados à identidade08 conferida, com título público e histórico apenas de data/status. Submissões próprias preservam os retornos, correções e acompanhamentos anteriores. A projeção de leitura não amplia o escopo operacional de pedidos, anexos ou mutações.

Na equipe: Documentos → documento → Versões e PDF → Revisão e entrega → Ação documental → Acesso ao documento no portal. `documents.deliver` e escopo/responsabilidade atuais permitem autorizar participante confirmado da versão, com evidência e prazo obrigatório até365dias, ou revogar uma autorização. Prazo é decisão técnica conservadora32; não implica autorização jurídica. Não foram criados login, cadastro, financeiro, arquivo ou permissão paralelos.

O titular exige identidade08 vigente. Comprador/vendedor adicional exige grant explícito da publicação/revisão/arquivoSHA256 e relação de identidade exata. Ver o contrato comum não abre ficha, atendimento, anexos independentes ou financeiro da outra parte. Pendência do participante é genérica. Representação31 permanece apenas andamento público.

Mudança de versão/bytes/identidade/autoridade invalida o acesso. O epoch25 cobre mudanças de papel/permissões/delegações; o carimbo persistente32 cobre transferências10 e atribuições08 relevantes. A→B→A não ressuscita grant. Autorizações indisponíveis podem ser revogadas antes de nova decisão. A regra central25/26 continua obrigatória, inclusive após alteração de saldo/restrição. O worker existente reautoriza antes/depoisStorage e registra o destinatário efetivo no ledger25/26. Download autorizado não comprova leitura ou recebimento.

## Camadas e apresentação

- Frontend React/Vite/TypeScript: áreas existentes reutilizadas, páginas3mobile/5desktop, uma área por vez, atalhos mobileaté4 e extras na sidebar. Equipe/Convites e quatro perfis preservados. Sem spinner/overlay/rótulo de carregamento. Dados privados só em memória e separados por sessão/escritório/permissões; revalidação em foco/30s.401/403/404 remove conteúdo;503 preserva tentativa exata e bloqueia navegação de comando.
- Backend Express:4 POST Bearer/no-store, validação de campos exatos, DTO allowlist e erros genéricos. API existente de solicitações recebe projeção pública explícita de histórico; cliente não fornece autoridade nem caminhoStorage.
- Supabase: migration20261111131744,3tabelas privadasRLS/ACL fechadas, eventos/comandos imutáveis,4wrappersINVOKER autenticados, idempotência por sessão/chave/corpo, mutex do escritório e escopo explícito do emissor. Índices reaproveitam identidade/pedidos/publicações e cobrem grants/FKs. Sem nova concessão individual ou mudança deAuth.
- Storage/worker: interfaces e configuração preservadas; sem URL pública ou assinada. A modificação da autorizaçãoRPC mantém revalidação real dos bytes e destinatário correto.
- GitHub/Vercel: publicação exclusivamente pela integraçãoGit, semActions nem deployCLI/API direto. Conferir histórico remoto antes de aplicação manual: migrações anteriores foram automáticas.

## Verificações e achados

381 testes Node aprovados, tipos frontend/backend e build aprovados, audit de dependências de produção:0. Replay completo final Postgres17 aprovado:2.170 verificações,32 específicas32; migradorNOSUPERUSER/NOBYPASSRLS, ACL/RLS/RPC reais e regressões anteriores. 68 cenários finais de interface aprovados, incluindo19 específicos32, Desktop/Mobile320–1440 e quatro perfis. Sem overflow horizontal, loaders ou ampliação dos4atalhos. Revisão independente corrigiu P1 de autoridade atual do emissor e P2 de ressurreição após reconcessão; última revisão sem novo bloqueio. A regressãoUI revelou consulta indevida ao painel de entregas ao abrir acesso; ativação corrigida e teste impede repetição. Testes de login expirado/seletor receberam expectativas e nomes acessíveis corretos; conjunto final68/68.

Laboratório real descartável GoTrue/PostgREST/Express/Storage/worker aprovado: documentos feitos pelas APIs existentes, pagamento local real do fluxo, PDF comum idêntico eSHA256 conferido, bloqueio da outra conta/UUID/Storage direto, ausência de financeiro alheio, histórico público, retry idempotente e revogação. Corrida real: revogar pela API após leituraStorage e antes da segunda autorização do worker retorna403 semPDF. Revogar identidade08 bloqueia lista/detalhe/pedido/bytes mantendo o mesmoBearer autenticado. Nenhuma fixture/conta/grant foi hospedada.

40 amostras do estado completo pela API local, sob execução concorrente dos testes: p50≈131ms/p95≈328ms. Isso incluiAuth/Express/PostgREST e não mede rede/SLA da produção. Interface permanece sem loader; não se promete latência física zero.

Limites: cenários autenticados são locais com provedores reais; hospedado será conferido por schema/integridade e rotas públicas, sem credenciais de usuário real. Advisor de senha vazada desativada é preexistente ([referência](https://supabase.com/docs/guides/auth/password-security#password-strength-and-leaked-password-protection)); RLS sem policies nas tabelas privadas corresponde ao fechamento deliberado porACL/RPC.

## Publicação e continuidade

APROVÁVEL localmente. Publicação e conferências hospedadas pendentes. Não reaplicar migration sem consultar o histórico. Próxima33 somente por novo pedido.
