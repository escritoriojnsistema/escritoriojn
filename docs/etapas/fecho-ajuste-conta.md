# Conta e correções cadastrais — publicadas e verificadas

Publicado em https://escritoriojn.vercel.app em22/10/2026 pela integração GitHub→Vercel. [PR29](https://github.com/escritoriojnsistema/escritoriojn/pull/29), feature82aed83/mergef3e7fc0; árvoref678b855 igual à validada. Vercel produção7psGDkoytBbr2BvTUp8RwPBmnLSG SUCCESS. GitHub Actions permanece disabled_manually. Status: APROVADA E PUBLICADA.

## Entrega

- Super administrador, administrador e funcionário editam nome, CPF e e-mail próprios em Conta. Nome e e-mail vêm das fontes oficiais; CPF completo conhecido é preenchido, legado apenas em hash continua mascarado até edição. Convites futuros retêm CPF completo após conferência válida, sem sobrescrever um CPF já conhecido. Perfil/escritório/permissões são informativos.
- Cliente vê “Para corrigir seus dados, abra uma solicitação”. O botão abre diretamente o formulário preparado em Solicitações; Enviar aparece após alteração. A proposta preserva cadastro atual e recebe protocolo pelo mesmo contador10, com idempotência.
- Consulta exige requests.read + accounts.corrections.read. Aplicação adiciona accounts.corrections.apply e respeita o responsável atual/triagem sem responsável. Owner recebe as capacidades pelo perfil; administrador e funcionário somente por concessão explícita. Nenhuma conta real recebe concessão individual automática.
- Dados anteriores, propostos e aplicados permanecem privados. Sincronização usa UID, identidade08 vigente ou FK de origem cadastral, sem inferência por contato ou redirecionamento implícito de mesclagem. Histórico/snapshots anteriores permanecem históricos.
- E-mail é preparado/aprovado e confirmado pelo titular no fluxo oficial do Supabase Auth. Conta conserva o e-mail atual até confirmação. Confirmação atualiza contatos ligados e encerra a solicitação; contato secundário já igual ao destino é consolidado. Auditoria não transporta valores pessoais.
- Seleção da própria membership aparece como Atribuir a mim, para os três perfis internos. Outros responsáveis continuam com nome, função e elegibilidade. Correções exigem consulta específica também no destino da transferência.
- Conta cabe em360×640 inclusive após salvar; dados de perfil/escritório ficam em seção expansível. Espaço igual a Equipe, quatro atalhos, alvos44px e navegação/ações sem spinner. Demais ajustes pós12 preservados no [fecho anterior](fecho-ajuste-pos12.md).

## Validação local

108 testes Node/API,1.432 verificações SQL716×2,50 contratos UI distintos e23 testes Auth reais locais aprovados.56 E2E públicos no preview compilado e56 no domínio publicado aprovados, com conexão pública real e somente fluxos anônimos. Build/typecheck aprovados; auditoria de dependências de produção com0 vulnerabilidades. Nenhuma conta hospedada usada para login/testes; fixtures somente em laboratório descartável.

Auth real provou cliente→proposta→permissão separada→responsável→aplicação→duas confirmações de e-mail→conta/ficha sincronizadas, além de funcionário editando os próprios três campos e confirmando e-mail. Regressões cobriram login dos quatro perfis, convites, delegação/revogação, portal, protocolos, Storage e acompanhamento.

Dois P2 encontrados pela revisão independente foram corrigidos e rechecados: versão ignorava a intenção pendente de e-mail e confirmação falhava quando o destino já era contato secundário. Há regressões SQL para ambos. Corrida de aplicação conserva um vencedor; revogar permissão durante lock da ficha reverte a operação. A regressão de altura móvel e o seletor do teste de autoatribuição também passaram RED→GREEN. [Parecer](../evidencias/ajuste-conta/revisao.md).

Benchmark local:10mil avisos,10conexões,300amostras; p95lista257,008ms, resumo73,030ms, checklist127,615ms. Capacidades são calculadas uma vez nas consultas de fila/caixa, índices e cache curto do sino preservados. Medição local, sem promessa de latência zero da rede. [Medições](../evidencias/ajuste-conta/benchmark.json).

## Banco e continuidade

Migração20261021200540_account_data_corrections aplicada automaticamente pela integração Git, sem apply manual.79comandos armazenados em ordem e31corpos ativos correspondem ao SQL testado, SHA2563b3fd073d36d3678c1e0b8ea5d270cdbd453682884921a10d260f4b51dd1b603. Quatro novas RPCs públicas invoker, search_path vazio, autenticadas; zero EXECUTE anônimo nas31funções. Três tabelas privadas com RLS, sem acesso bruto authenticated/service_role; dois triggers Auth ativos.

Readback:17migrations,38permissões/41relações de papel; as duas capacidades novas têm seed somente owner e0concessões individuais.5Auth/5vínculos/1ficha preservados;0pedidos/arquivos/avisos e0linhas nas três tabelas novas, sem fixtures hospedadas. Os13corpos preexistentes substituídos haviam sido conferidos antes do merge. Edge Functions existentes permanecem ACTIVE/JWT obrigatório, sem alteração de código neste ajuste. [Prova do banco](../evidencias/ajuste-conta/banco-publicado.json).

Bundle /assets/index-zU7cyxJI.js publicado idêntico ao build local, SHA256c8cc11de9ed1a612616b74f4199c47ec6b66ba8bbe1d02aaf7f1c1db75348f33. HTML/health200 e endpoints privados anônimos401;56 E2E canônicos aprovados. [Publicação](../evidencias/ajuste-conta/publicacao.json).

Advisors semERROR:33INFO de RLS privada sem policy/sem GRANT,71índices sem uso INFO e as mesmas3FKs sem índice preexistentes. O únicoWARN preexistente é [proteção de senha vazada](https://supabase.com/docs/guides/auth/password-security#password-strength-and-leaked-password-protection); nenhuma configuração paga ou credencial foi alterada.

Express/browser/Vercel usam somente conexão pública+Bearer; nenhum novo segredo ou worker privilegiado. Edge Functions existentes conservadas; o domínio de Conta usa API/RPC/guards oficiais e os módulos10–12. O retorno de código deve preservar tabelas/solicitações/intenção/histórico e respeitar o guard Auth. Não executar DROP/reset nem editar credenciais diretamente no banco.

Retomar com AGENTS, Livro e [regra de Conta](../regras/conta-correcoes.md). Próxima etapa somente por novo pedido. Evidências em [validacao.json](../evidencias/ajuste-conta/validacao.json).
