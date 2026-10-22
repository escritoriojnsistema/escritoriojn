# Conta e correções cadastrais — validação concluída

Status: APROVÁVEL para publicação autorizada pela integração GitHub→Vercel. Publicação e readback hospedado serão acrescentados após a integração. GitHub Actions permanece disabled_manually.

## Entrega

- Super administrador, administrador e funcionário editam nome, CPF e e-mail próprios em Conta. Nome e e-mail vêm das fontes oficiais; CPF completo conhecido é preenchido, legado apenas em hash continua mascarado até edição. Convites futuros retêm CPF completo após conferência válida, sem sobrescrever um CPF já conhecido. Perfil/escritório/permissões são informativos.
- Cliente vê “Para corrigir seus dados, abra uma solicitação”. O botão abre diretamente o formulário preparado em Solicitações; Enviar aparece após alteração. A proposta preserva cadastro atual e recebe protocolo pelo mesmo contador10, com idempotência.
- Consulta exige requests.read + accounts.corrections.read. Aplicação adiciona accounts.corrections.apply e respeita o responsável atual/triagem sem responsável. Owner recebe as capacidades pelo perfil; administrador e funcionário somente por concessão explícita. Nenhuma conta real recebe concessão individual automática.
- Dados anteriores, propostos e aplicados permanecem privados. Sincronização usa UID, identidade08 vigente ou FK de origem cadastral, sem inferência por contato ou redirecionamento implícito de mesclagem. Histórico/snapshots anteriores permanecem históricos.
- E-mail é preparado/aprovado e confirmado pelo titular no fluxo oficial do Supabase Auth. Conta conserva o e-mail atual até confirmação. Confirmação atualiza contatos ligados e encerra a solicitação; contato secundário já igual ao destino é consolidado. Auditoria não transporta valores pessoais.
- Seleção da própria membership aparece como Atribuir a mim, para os três perfis internos. Outros responsáveis continuam com nome, função e elegibilidade. Correções exigem consulta específica também no destino da transferência.
- Conta cabe em360×640 inclusive após salvar; dados de perfil/escritório ficam em seção expansível. Espaço igual a Equipe, quatro atalhos, alvos44px e navegação/ações sem spinner. Demais ajustes pós12 preservados no [fecho anterior](fecho-ajuste-pos12.md).

## Validação local

108 testes Node/API,1.432 verificações SQL716×2,50 contratos UI distintos e23 testes Auth reais locais aprovados.56 E2E públicos no preview compilado aprovado, com conexão pública real e somente fluxos anônimos. Build/typecheck aprovados; auditoria de dependências de produção com0 vulnerabilidades. Nenhuma conta hospedada usada para login/testes; fixtures somente em laboratório descartável.

Auth real provou cliente→proposta→permissão separada→responsável→aplicação→duas confirmações de e-mail→conta/ficha sincronizadas, além de funcionário editando os próprios três campos e confirmando e-mail. Regressões cobriram login dos quatro perfis, convites, delegação/revogação, portal, protocolos, Storage e acompanhamento.

Dois P2 encontrados pela revisão independente foram corrigidos e rechecados: versão ignorava a intenção pendente de e-mail e confirmação falhava quando o destino já era contato secundário. Há regressões SQL para ambos. Corrida de aplicação conserva um vencedor; revogar permissão durante lock da ficha reverte a operação. A regressão de altura móvel e o seletor do teste de autoatribuição também passaram RED→GREEN. [Parecer](../evidencias/ajuste-conta/revisao.md).

Benchmark local:10mil avisos,10conexões,300amostras; p95lista257,008ms, resumo73,030ms, checklist127,615ms. Capacidades são calculadas uma vez nas consultas de fila/caixa, índices e cache curto do sino preservados. Medição local, sem promessa de latência zero da rede. [Medições](../evidencias/ajuste-conta/benchmark.json).

## Banco e continuidade

Migração20261021200540_account_data_corrections preparada e testada. Antes da publicação,16migrations/5Auth/5vínculos/1ficha/0pedidos/36permissões;13corpos de funções existentes conferidos com o repositório, sem divergência. Colunas Auth necessárias confirmadas. Não aplicar DDL manual antes de consultar novamente o histórico após Git; evitar duplicar a integração automática.

Express/browser/Vercel usam somente conexão pública+Bearer; nenhum novo segredo ou worker privilegiado. Edge Functions existentes conservadas; o domínio de Conta usa API/RPC/guards oficiais e os módulos10–12. O retorno de código deve preservar tabelas/solicitações/intenção/histórico e respeitar o guard Auth. Não executar DROP/reset nem editar credenciais diretamente no banco.

Retomar com AGENTS, Livro e [regra de Conta](../regras/conta-correcoes.md). Próxima etapa somente por novo pedido. Evidências em [validacao.json](../evidencias/ajuste-conta/validacao.json).
