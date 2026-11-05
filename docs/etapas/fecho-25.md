# Fecho25 — liberação e exceções financeiras

Estado: implementada e homologada localmente; publicação do runtime/schema em andamento. Não declarar publicação completa antes do readback abaixo. Base b951a03/Etapa24 preservada. [Contrato](etapa-25.md).

## Entrega e provas locais

Regra central reutiliza gate24, dimensões separadas e exceção restrita ao financeiro. Eventos request/authorize/reject/revoke imutáveis, escopo exato, prazo e revogação; releases vinculados à revisão/arquivo/hash/sessão. Autoridade nova não ressuscita autorização anterior.

303 testes Node/API;1033PASS SQL em dois replays vazios, migrador NOSUPER/NOBYPASS, incluindo72PASS25 e disputas reais de evento/saldo/sessão;28contratosUI24/25 com320/360/768/1440, build/typecheck e auditprodução0 passaram. API25 observou404RED→200GREEN. Delegação nova ressuscitando exceção foi reproduzida por SQL RED e corrigida com epoch em team_delegations; dois replaysGREEN. Teste de densidade RED→GREEN: abrir revisão/liberação oculta a prévia preservando seu estado para retorno. Inspeção visual de screenshot360 realizada.

Cenário100reais/60pagos pela cobrança/ledger reais do laboratório: aprovado bloqueado, solicitação não libera, autorização retira sópayment e conserva saldo40. Exercitados recusa/revogação/expiração, alteração de arquivo, conteúdo vetado, assinatura alterada, nova revisão, identidade revogada, estorno real, perda/retorno de autoridade, outro escritório/cliente, idempotência e ACL/RLS. Concorrência: duas solicitações→uma409, mudança financeira durante espera→409, sessão encerrada durante espera→401. Registros de acesso imutáveis ligados à avaliação.

Revisão independente: achado de delegação corrigido com testeRED→GREEN. Outro apontamento sobre escapes do regex não se reproduziu ao importar o módulo real; testes explícitos confirmam motivos comuns aceitos e controles negados. Nenhuma mudança indevida nesse validador.

## Limites

SQL executou banco real descartável; contratosAPI/UI usam provedores/dados fictícios explicitamente. Não foi repetida uma jornada nova com Auth/Storage real nesta etapa. O worker24 não mudou; seu fluxo de reautorização é reutilizado. Não afirmar teste novo de assinatura criptográfica, scanner,SMTP, aparelho físico ou conta pessoal hospedada. Scanner ausente continua retendo arquivos em quarentena, sem promoção artificial. Não medir esses contratos como SLA remoto/latênciazero.

Nenhuma fixture/grant/Auth/preço real foi criado. Configuração de exceções reais depende do gestor autorizado. Produção ainda sem documentos/arquivos na conferência inicial. Próxima26 somente por novo pedido.

## Publicação

Compatibilidade: PR84, commit a4ae1396413c243e9599ad758086ae9c5186f797, merge563b6212d35eb154a112272964e255fceb19e534; VercelHWpxauQ2vRxKrzP5roBZtHcwWFJ9 SUCCESS pela integração Git. SemActions/deployCLI/API Vercel. Runtime/schema/readback pendentes neste checkpoint; detalhamento final em docs/evidencias/etapa-25/publicacao.json quando concluído.
