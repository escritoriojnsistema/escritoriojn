# Etapa 39 — checkpoint preparado; piloto comercial bloqueado

[Manual39](https://drive.google.com/file/d/1PpfJM1FPkVOrmDgfVLxirLWVlKNB0mbZ/view) aplicado sobre main `711beb958a8d9b74a1ed2fa1ab6c5ef8bd358a0b`, após Livro/AGENTS/regras/fecho38. Etapa38 está publicada como checkpoint técnico; aceites humanos e recuperação externa36 permanecem pendentes. O pedido39 autoriza preparar esta etapa, sem importar estado antigo ou iniciar40.

## O que foi implementado

Previews herdavam as duas variáveis públicas de conexão da produção. Guard comum desconecta Supabase em `VERCEL_ENV=preview` no buildVite e em contextoAuth/clienteautenticado/privacidadepúblicaExpress. Nenhum contato com o provedor antes da recusa; produção/local mantêm contrato. O navegador recebe conexão vazia, sem preconnect/cadastro/reset/Storage no provedor de produção; UI existente de acesso indisponível. Habilitação futura de homologação exige projeto separado, revisão ePR; configuração isolada não libera automaticamente esta versão. Artefatos antigos não são apagados; proteçãoSSO mantida.

Preparados: [mudança/prontidão/custos](publicacao-controlada-39.md), [treinamento/piloto/conciliação](treinamento-piloto-39.md), [retorno/suporte](rollback-suporte-39.md). Registros reais/aceites devem ficar em local privado, semPII/finanças/segredos noGit público.

## Verificado nesta rodada

427Node/0falhas/0skips,75UI/0falhas (Equipe/Convites/navegação agrupada/isolamentoportal/loading, quatro papéis/320–1440px), build/tipos e auditprodução0. RegressãoAPI local RED→GREEN: preview retornava200 e chamava o provedor; agora três entradas negam503 sem tráfego, enquanto produção/local retornam200 nos mesmos contratos fictícios. Buildrealpreview RED→GREEN: antes continha hostprodução; depois não contém host/chaveherdados. Oito navegações reais locais de acesso/signup/reset em320/1440px: sem preconnect/tráfego externo/loader/overflow e acesso desabilitado. Capturas locais em `test-results/release39/telas`, foraGit. Não comprova login remoto privado ou aparelho físico.

Hospedado somente leitura: Supabase82migrations/última20261115152258,189tabelasRLS/0privadascomacessodiretoanon/authenticated,7Auth/7vínculos/92role_permissions/2clientes/3solicitações/0files/0Storage. Função otimizada38 eACL/wrapperINVOKER preservados. NÃO reaplicar. SemDDL/fixture/grant/conta/e-mail/movimento/Edge/objeto hospedados; replaysSQL/carga/restore38 não foram repetidos por não haverSQL nesta mudança, conservando o limite de laboratório descrito no fecho38.22recursosHTTPS/barreiras401 passaram no domínio atual, cuja produçãoGitREADY ainda é711beb9. Sem alegar a correção39 já publicada.

ConexãoAuthpública:settings200/e-mailhabilitado/signuphabilitado/confirmaçãoobrigatória; entregaSMTP/callbacks/loginhospedado continuam não observados. Privacidadepública200/configuredfalse/revisão0;0controladores e0políticas36salvos. Modelos64contados, sem aceite inventado. AdvisorAuthpreexistente: [proteção de senhas vazadas desativada](https://supabase.com/docs/guides/auth/password-security#password-strength-and-leaked-password-protection); INFOdeRLSsem política permanece em tabelas privadas fechadas. Sem mudança deAuth/plano.

Revisão independente somente leitura: nenhum achado crítico/importante/menor; teste focado repetido com1aprovado. Pronto paraPR de preparação, sem aprovação operacional. [Revisão](../evidencias/etapa-39/revisao-independente.json).

## Publicação e bloqueios

SomenteGitHub→Vercel, semActions/deploydireto ou contratação. PR/preview desta preparação devem ser conferidos separadamente de merge/alias/fluxo privado. Ver [evidências](../evidencias/etapa-39/verificacao.json) e `publicacao.json` quando disponível. Produção comercial e piloto não executados/autorizados por aparência.

O usuário confirmou plano gratuito; contextoGitVercel confirmouHobby. [TermosVercel§4](https://vercel.com/legal/terms#4-hobby-plan) restringemHobby a pessoal/nãocomercial. Orçamento/teto, hospedagem elegível e homologação separada pendentes; consulta de custos404 não significa zero. Pro foi apenas cotado na documentação oficial:US$20/mêsplataforma/1assento, extras/consumo/câmbio/impostosàparte, sem contratação. Backup externo/custódia/agenda/alertas/RPO/RTO, jurídico/controlador, aceites38/serviços/modelos/checklists/permissões/caixa, integrações aplicáveis, responsáveis/canais e funcionário treinado ainda pendentes.

Manter checkpoint39. Antes de iniciar piloto: resolver a matriz, revisar resumo/custos/retorno e obter autorização aplicável sobre escopo/SHA/ambiente/janela/coorte/limites preparados; depois observar funcionário sem ajuda, falha reportada e conciliação real. Etapa40 não iniciada.

## Preparação Git verificada

[PR136](https://github.com/escritoriojnsistema/escritoriojn/pull/136) em rascunho, feature `2bd38986637e51c92edeee1bbb631b766f70e306`, árvore local/remota idêntica. Prévia `dpl_JBbHeZoRcnm6nMFgmCbKCBKuQfgW` READY/origemGit/SHA correto; statusVercel success. [Prévia protegida](https://escritoriojn-iys7kio1n-escritorio-jn.vercel.app). HTTP302doSSO preservado em página eAPI, sembypass; não comprova execução do guard na Function nem login privado remoto. O buildreal/API locais são a evidência funcional identificada. [Publicação técnica](../evidencias/etapa-39/publicacao.json) · [HTTPS](../evidencias/etapa-39/https-preview.json).

**Não integrado em main:** produção continua711beb9/deployCtzG8ygPDk7q85kqvmppYAuSU5qK; health200/authanônimo401 reconferidos. A correção39 ainda não está instalada na produção. Fecho documental na mesma branch preserva o código dessa prévia; não representa publicação comercial ou aceites. Nenhuma alteração diretaVercel/Supabase ou GitHubActions invocada. Workflow histórico não foi usado como validação.
