# Fecho25 — liberação e exceções financeiras

Estado: concluída, publicada e verificada em https://escritoriojn.vercel.app pela integração GitHub→Vercel. Base b951a03/Etapa24 preservada. [Contrato](etapa-25.md).

## Entrega e provas locais

Regra central reutiliza gate24, dimensões separadas e exceção restrita ao financeiro. Eventos request/authorize/reject/revoke imutáveis, escopo exato, prazo e revogação; releases vinculados à revisão/arquivo/hash/sessão. Autoridade nova não ressuscita autorização anterior.

303 testes Node/API;1033PASS SQL em dois replays vazios, migrador NOSUPER/NOBYPASS, incluindo72PASS25 e disputas reais de evento/saldo/sessão;28contratosUI24/25 com320/360/768/1440, build/typecheck e auditprodução0 passaram. API25 observou404RED→200GREEN. Delegação nova ressuscitando exceção foi reproduzida por SQL RED e corrigida com epoch em team_delegations; dois replaysGREEN. Teste de densidade RED→GREEN: abrir revisão/liberação oculta a prévia preservando seu estado para retorno. Inspeção visual de screenshot360 realizada.

Cenário100reais/60pagos pela cobrança/ledger reais do laboratório: aprovado bloqueado, solicitação não libera, autorização retira sópayment e conserva saldo40. Exercitados recusa/revogação/expiração, alteração de arquivo, conteúdo vetado, assinatura alterada, nova revisão, identidade revogada, estorno real, perda/retorno de autoridade, outro escritório/cliente, idempotência e ACL/RLS. Concorrência: duas solicitações→uma409, mudança financeira durante espera→409, sessão encerrada durante espera→401. Registros de acesso imutáveis ligados à avaliação.

Revisão independente: achado de delegação corrigido com testeRED→GREEN. Outro apontamento sobre escapes do regex não se reproduziu ao importar o módulo real; testes explícitos confirmam motivos comuns aceitos e controles negados. Nenhuma mudança indevida nesse validador.

## Limites

SQL executou banco real descartável; contratosAPI/UI usam provedores/dados fictícios explicitamente. Não foi repetida uma jornada nova com Auth/Storage real nesta etapa. O worker24 não mudou; seu fluxo de reautorização é reutilizado. Não afirmar teste novo de assinatura criptográfica, scanner,SMTP, aparelho físico ou conta pessoal hospedada. Scanner ausente continua retendo arquivos em quarentena, sem promoção artificial. Não medir esses contratos como SLA remoto/latênciazero.

Nenhuma fixture/grant/Auth/preço real foi criado. Configuração de exceções reais depende do gestor autorizado. Produção ainda sem documentos/arquivos na conferência inicial. Próxima26 somente por novo pedido.

## Publicação

Compatibilidade: PR84, commit a4ae1396413c243e9599ad758086ae9c5186f797, merge563b6212d35eb154a112272964e255fceb19e534; VercelHWpxauQ2vRxKrzP5roBZtHcwWFJ9 SUCCESS pela integração Git. SemActions/deployCLI/API Vercel. Runtime/schema: [PR85](https://github.com/escritoriojnsistema/escritoriojn/pull/85), commitd627c439cdf437009eeaddef94c2645476f2a796, mergee11226196d3b87f8871d884216de96b1d1376bdc; árvored509c97de5d8db40141dfbce2fb92ccd44c48e5a igual à homologada. Vercel5TQGepAGoR9KeXGqm7vMdoeWSDZr SUCCESS/produção. [Publicação](../evidencias/etapa-25/publicacao.json), [schema](../evidencias/etapa-25/schema-publicado.json), [assets](../evidencias/etapa-25/assets-publicados.json), [barreiras](../evidencias/etapa-25/barreiras-publicadas.json).

Migration20261105124514 aplicada automaticamente:33comandos semanticamente iguais na mesma ordem,9corpos25+autorização24estendida comMD5iguais. NÃO reaplicar. Quatro tabelasprivadasRLS/ACLfechadas, doiswrappersINVOKER semEXEC anônimo; capacidadesseed sóowner. Contagens antes/depois7Auth/7vínculos/17grantsindividuais/114eventos e0documentos/publicações/arquivos/exceções/releases preservadas; migrations53→54. Nenhuma fixture/grant/preço/conta hospedada criada.

Worker25ACTIVE/JWT com7fontesTS iguais; sem alteração funcional ou publicação manual deEdge. Oitoassets canônicos iguais ao build com a configuração pública do próprio bundle; health/página200,quatroAPIsprivadas401 e3Playwrightpúblicos360/1440 aprovados. Advisors semERROR; novosINFOs apenas quatro tabelasRLSprivadasfechadas/índices ainda sem uso, nenhumaFK25semíndice. WARNsenha vazada desativada é preexistente: [Supabase](https://supabase.com/docs/guides/auth/password-security#password-strength-and-leaked-password-protection).

Regressão adicionalEquipe/editor/documentos:78dos80contratos passaram inicialmente;2fixtures ainda esperavam Equipe diretamente no menu anterior a Configurações. Conferência do registry atual provou teste desatualizado; ajustados apenas setup/percurso do teste, sem alterar produto. Os5cenários relacionados passaram em rechecagem (incluindoos2corrigidos e4perfis). Fecho seguinte só documental/testes; runtime publicado permanece idêntico.

O ambiente local ficou indisponível após a homologação/publicação e os testes acima. O fechamento foi continuado pelos conectores, usando a mesma árvore fonte e evidências já conferidas, sem reconstruir testes como se tivessem sido executados novamente.

## Decisões de implementação

Owner com capacidade vigente pode solicitar e decidir explicitamente a própria exceção; não se introduziu segregação obrigatória não solicitada. Se houver política de duas pessoas, requer regra explícita futura. Worker24 e bytes preservados; ausência de nova jornada positivaAuth/Storage está declarada acima.
