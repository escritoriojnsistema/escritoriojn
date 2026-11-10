# Correções após28 — publicadas e verificadas

Pedido: explicar o acesso às funções01–28, corrigir retornos ausentes/escondidos e investigar a abertura inicial/reabertura e o login dos quatro perfis. Base `9772f32`, Etapa28 publicada, Livro e regras conferidos antes das alterações. Nenhuma etapa29 iniciada.

## Acesso e dependências

O [mapa01–28](mapa-acessos-01-28.md) relaciona cada etapa ao caminho atual, permissões e dados necessários. Etapas técnicas não viram telas próprias; funções financeiras vivem em Caixa e versões/revisão/formalização/liberação/entrega ficam no fluxo de Documentos. Ausência de cadastro e falta de permissão são situações diferentes.

Atendimento rápido tinha rota válida sem entrada: agora aparece em Caixa → Meu caixa → Menu, com a composição completa de capacidades19. A entrada fica fora dos editores financeiros incorporados e extratos. Auditoria/Arquivados/Equipe têm fallback no menu quando a capacidade própria existe sem Configurações, por escritório. Caixa e o cartão Arquivados passaram a exigir a mesma composição da tela de destino; nenhuma concessão foi criada.

ITR/DITR continua em Imóveis rurais → Abrir imóvel → Área do imóvel. Não exige outro sistema: exige imóvel27, capacidades rurais/cadastrais e requests.read. Criar caso exige contribuinte explícito no período e atendimento próprio ligado ao imóvel. A consulta hospedada10/11 encontrou zero imóveis, vínculos rurais, casosDITR e documentos, e dois serviços; isso não identifica nem presume a sessão pessoal do usuário. Corrigida também uma falha efetiva: o endereço rural era trocado por /painel durante a restauração da sessão, antes de receber o contexto. Agora conserva a URL e espera autorização;403/503 continuam bloqueando.

## Retornos

Retorno com ícone/rótulo e alvo44px no conteúdo principal, sem depender de sidebar/drawer. Pais internos explícitos funcionam com URL direta e não aceitam referrer/query/state arbitrários. Editores/detalhes preservam os próprios Fechar/Cancelar/Voltar e suas confirmações, sem um segundo retorno que perca rascunho. Busy e tentativas incertas conservam os bloqueios, inclusive Conta, criação de documento e restauro de referência. Ajustes de densidade mantêm acessibilidade e rolagem natural, sem cortar conteúdo. Inventário e capturas em [retornos](../evidencias/correcoes-pos28/retornos.md).

## Abertura e autenticação

A página pública retornava null enquanto verificava sessão; o login também baixava o pacote operacional monolítico com todas as telas. A correção deixa conteúdo público disponível e mantém painel pequeno, com módulos por rota. Durante navegação assíncrona, o ReactRouter preserva a tela/menu já verificados; revogação de autoridade retira a área privada. Não há spinner/overlay ou cache de permissões para conceder acesso.

Benchmark real local com GoTrue/PostgREST/PostgreSQL, três amostras por papel, cachefrio/CPU4/10Mbit/s/60ms: JavaScript da entrada −54,45%; refresh até painel caiu de1642–1679ms para1022–1098ms; reabertura até painel de2316–2426ms para1938–2000ms; FCP da reabertura de1956–2152ms para1048–1116ms. São medições locais controladas, sem SLA de produção. Validação de senha/RPC/adoção ficou na mesma ordem, aproximadamente um segundo até o painel; não houve remoção de verificações nem alteração de credenciais. [Método e amostras](../evidencias/correcoes-pos28/performance.md).

## Verificação e publicação

362 testes Node/API completos passaram; testes focados de retorno/menu8, acessoQuick4, entrada5 e rural/ITR/restauração20 passaram; build e TypeScript passaram. Jornada real dos quatro papéis inclui12logins,12refreshes e12restaurações por lado da comparação, com validação atual. 37 cenários novos de retorno e48regressões finais passaram, após corrigir cinco problemas de altura e dois contratos legados de teste; as asserções foram preservadas. Revisão independente semP1/P2 confirmado. Publicação e conferência final confirmadas abaixo. Nenhuma alteração de schema/API/Auth hospedado foi necessária; Supabase foi conferido somente por leitura. Não repetir migrations históricas. SemActions, fixtures hospedadas ou deploydireto.

Capturas de Acessos com dados inteiramente fictícios: [antes320](../evidencias/correcoes-pos28/retorno-before-320-acessos.png), [depois320](../evidencias/correcoes-pos28/retorno-after-320-acessos.png), [antes1440](../evidencias/correcoes-pos28/retorno-before-1440-acessos.png), [depois1440](../evidencias/correcoes-pos28/retorno-after-1440-acessos.png).

## Publicação confirmada

[PR106](https://github.com/escritoriojnsistema/escritoriojn/pull/106), feature `c61421e`, merge `6026951ddbdb657567371aaffd5021b23d1ee787`, árvore `6ad711d7daadd2a23d434a2b86e099f4fd68071c` idêntica à homologada. Preview `Gq7A9WTK` e produção `9jgYzTiM` SUCCESS pela integração Git. Os69assets servidos têm SHA256 igual ao build local e o HTML referencia a entrada atual. Home/health200, quatro APIs privadas401; nove testes públicos de Auth/Rural em360/1440 passaram no domínio canônico. [ProvaGit/Vercel](../evidencias/correcoes-pos28/publicacao.json), [bundle](../evidencias/correcoes-pos28/bundle-publicado.json).

Supabase permanece com71migrations, última `20261109181450`: nenhum schema foi alterado/reaplicado. Sete identidades, sete vínculos e22concessões conservam contagens e hashes; nenhum imóvel/casoDITR/documento foi inserido. [Antes](../evidencias/correcoes-pos28/hospedado-antes-publicacao.json) e [depois](../evidencias/correcoes-pos28/hospedado-apos-publicacao.json). Backend/API/Auth e dados: conferidos, sem mudança necessária. Nenhuma conta pessoal hospedada foi usada nos testes autenticados; evidência positiva de login/restauração é o laboratório real local, separado das provas de UI com fixtures e dos testes públicos em produção.

As correções não dispensam os dados/permissões listados no mapa. Para visualizar28, abra um imóvel cadastrado; para criar caso, acrescente contribuinte e atendimento vinculado elegíveis. A senha continua dependendo do provedor e da rede: não houve ganho significativo nessa validação nem promessa de entrada instantânea. Sem pendências técnicas bloqueantes deste ajuste; Etapa29 aguarda novo pedido.
