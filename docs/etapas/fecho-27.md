# Etapa27 — publicada e verificada

Base41a7a92 e correções26 conferidas antes de editar; [cartão27](etapa-27.md).

Cadastro em `/imoveis-rurais`, separado de Clientes e integrado ao layout/menu existente. Clientes existentes são selecionados com nome/máscara; cliente de referência define escopo de gestão, sem presumir título de propriedade. Pessoas exigem papel explícito e período; encerrar período conserva o registro e permite acrescentar outro. Atendimentos exigem responsável/triagem atual e pessoa vinculada; arquivos precisam pertencer ao mesmo atendimento. Referência11 protege arquivo contra limpeza operacional; associação não valida arquivo nem autoriza download. Um atendimento não pode ser atribuído a dois imóveis. Histórico por exercício é referência interna; ITR/DITR/órgãos não são simulados.

Permissões existentes customers.read/create/update e escopo08, sem novas concessões individuais. Cliente do portal excluído, sem direito implícito por CPF ou associação. WrappersINVOKER, tabelasprivadasRLS/ACLfechadas, FKs compostas por escritório, eventos semPII e comandos idempotentes/versão esperada. Semsegredos/StorageURL/cacheprivado; seleção/cancelamento de respostas por sessão/escritório,401/403bloqueiam e503preserva tentativa. Listas/seletores/histórico paginados5; demais atalhos na sidebar, quatro atalhosmóveis preservados. Layoutreutilizado comCSSlocal evitando inversão de ordem herdada deEquipe. Sem loaders ou promessa de latênciazero.

Build/typecheck passaram;347Node/API históricos mais2testesDTO/API27 passaram.3UI27 em320/360/1440 e13regressões26 passaram, com3UI27repetidos após acabamento. DoisreplaysSQL1.539PASS passaram; replayfinal769PASS e8assertivas27focadas após endurecimento final também passaram. JornadaAuth/REST/Express/Storage/PDF real local aprovada com doisimóveis, período, arquivoquarentena do pipeline11 vinculado ao atendimento e clienteportal negado. Auditprodução0. Status final de publicação será registrado após readback; não reaplicar migration histórica26. SemActions/deployCLI/VercelAPI oufixtureshospedadas. Etapa28 não iniciada.

## Limites da homologação

Sem envio externo, fixture ou concessão hospedada, consulta oficialCAFIR/SNCR/CAR, transmissãoDITR ou documento oficial. Sem aparelho físico, benchmark de carga ou política jurídica de retenção nova. A imagemStorage oficial fixada precisou de rootfsverificadoSHA emshm e preparação de pontos de montagem efêmeros devido a falta de espaçoVFS; nenhum produto/worker foi alterado para simular sucesso. Identificadores são referências informadas e não certificam regularidade. O cliente de referência controla escopo08; atribuições/papéis rurais não criam login nem concedem acesso ao acervo.

## Conferência da integraçãoGit

PR100 integrado em942bdf2. Preview da branchd780066 READY/VercelFoDDf8LVyFuWp91Uq1cASXiRaREh. Em09/11/2026 às02:20UTC, produção ainda servia41a7a92/Etapa26 e migration mais recente era20261107194252. Este checkpoint registra a diferença entre homologação e publicação; o deploy de produção e o schema27 continuam pendentes até readback. Build com as configurações públicas extraídas do bundle canônico passou. Nenhum redeployVercelAPI/CLI ou migration manual executado.

## Publicação confirmada

PR100/runtime942bdf2,PR101/checkpointdbd3859 e continuidade567c4d5. PreviewFoDDf8LVSUCCESS; produçãoDgJJgS1h eDAyvFMo3SUCCESS. O checkpoint anterior registra a espera pela integração, resolvida pela atualizaçãoGit subsequente; nenhum deployAPI/CLI foi acionado.

Supabase aplicou automaticamente20261109020126:24comandos,3corposprivadosMD5iguais ao SQL testado e4tabelascomRLS/ACLfechadas.7Auth/7vínculos/17grantsindividuais e0imóveis/partes/vínculosrurais hospedados. Não reaplicar. Domínio canônico com8assetsSHA256iguais ao build público,entryindex-CPueSQpb.js,health200 e/rural/state,/rural/command,/document-workflow/delivery-state anônimos401. [Bundle](../evidencias/etapa-27/bundle-publicado.json).

Advisors semERROR;INFO deRLSprivadassem policy é intencional e protegido porACLfechada. WARNpreexistente de proteção de senhas vazadas desativada permanece: [orientaçãoSupabase](https://supabase.com/docs/guides/auth/password-security#password-strength-and-leaked-password-protection). Não houve alteraçãoAuth ou plano.

Checklist: cartãoDrive atendido; Desktop/Mobile e quatro atalhos preservados; seções no mesmo fluxo com histórico/seletores paginados; sem loaders; índices e reutilização do núcleo revisados; backend,frontend,Supabase,GitHub,Vercel,Livro eAGENTS conferidos. Rolagem natural permanece para formulários longos/zoom; sem promessa de latênciazero. Jornada positiva hospedada com conta pessoal não foi executada; laboratório real eUI comfixtures são evidências distintas.
