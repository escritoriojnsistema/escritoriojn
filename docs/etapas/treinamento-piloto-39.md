# Etapa 39 — treinamento, piloto e conciliação

**Roteiro pronto; execução humana/piloto não executados.** Guardar registros, participantes, evidências financeiras e incidentes em local operacional privado. O repositório público contém apenas este roteiro e um modelo vazio. Não usar senha do proprietário, dados reais em teste ou compartilhar contas.

## Preparação e critérios

Primeiro resolver a [matriz de prontidão](publicacao-controlada-39.md): hospedagem comercial elegível/orçamento, ambiente separado, recuperação externa aplicável e aceites38/serviços/modelos/checklists/permissões/jurídico/scanner. Definir instrutor, funcionário, supervisor financeiro, suporte/titular e substituto, canal e janela. Não inventar telefone/WhatsApp/e-mail do escritório. Criar contas sintéticas somente no ambiente separado autorizado e pelo fluxo oficial; não ampliar capacidades para o ensaio. Identificar cada caso com protocolo fictício e versão do ambiente.

Treino sugerido (agenda a confirmar):10min acesso/segurança/navegação,25min jornada da função,15min conferência financeira/documental,10min falha/retomada/suporte. É proposta, não treinamento realizado. Instrutor demonstra; funcionário repete uma jornada completa sem orientação e comunica uma falha simulada. Registrar bloqueios sem marcar sucesso por assistência do instrutor.

## Exercícios por perfil

| Perfil | Onde e o que praticar | Critério observado pelo instrutor |
| --- | --- | --- |
| Superadmin(owner) | Configurações→Privacidade/Acessos/Continuidade; Equipe e convites; Serviços/Modelos/Categorias | Identifica exemplos/configuração pendente, autoriza somente seu escritório, confere versão/checklist/permissões e descreve retorno/suporte. Não deve aprovar o próprio ato quando houver segregação. |
| Admin | Clientes→Solicitações→Pendências/Documentos; revisão e distribuição conforme capacidades atuais | Abre atendimento, atribui trabalho, confere pessoa/partes/revisão; aprovação/assinatura/entrega apenas se autorizadas. Ausência de botão não substitui recusa daAPI. |
| Funcionário(employee) | Caixa, Solicitações, Clientes e Ajustes nos atalhos existentes; demais fluxos pelo menu | Executa atendimento de ponta a ponta dentro do escopo; parcial mantém bloqueio, versão pendente não entrega; sabe tratar503/409/401/403 e reportar request_id sem dados privados. |
| Cliente | LoginCliente→Minhas solicitações/Documentos/Anexos/Pagamentos | Vê somente vínculo verificado e destinatário correto; envia somente ao pedido permitido, distingue recebimento de aprovação e documento liberado de rascunho; outra conta não acessa. |

Todos os perfis: repetir em desktop e mobile existentes, até4atalhos principais, menu para extras, teclado/foco, recuperação sem spinner. Registrar aparelho/navegador/tamanho e instalação físicaAndroid/iPhone separadamente; viewportChromium não comprova instalação física.

## Jornada mínima sem ajuda

1. Entrar com conta sintética autorizada, verificar papel/escritório e conferir serviço/preço/checklist aprovado. Cadastro e abertura pelo fluxo original; não importar estado do projeto antigo.
2. Abrir solicitação, conferir identidade/partes, anexar arquivo e reconhecer quarentena. Scanner ausente continua bloqueando validação/entrega; não simularclean no hospedado.
3. Criar documento e versão, preencher campos/partes, enviar para revisão e pedir decisão ao papel diferente quando exigido. Nova versão deve invalidar decisões/aplicações anteriores conforme o contrato.
4. Registrar pagamento parcial em teste e conferir saldo devido/bloqueio de liberação; completar ou exercitar correção autorizada. Exceção só afeta quitação; não elimina aprovação/assinatura/checklist/scanner.
5. Formalizar/entregar somente se todos os gates aplicáveis estiverem satisfeitos, com confirmação separada; conferir portal pelo destinatário correto e negar outra conta. Teste externo/físico requer observação real própria.
6. Consultar relatórios e caixa com supervisor, conferir com controle independente e registrar diferença explícita. Encerrar conta/sessão pelo fluxo correto. Funcionário relata uma falha simulada segundo o [suporte](rollback-suporte-39.md), sem expor dados.

Se uma integração necessária não estiver disponível, registrar **bloqueado** nesse passo, retomar o treino em ambiente adequado e não transformar roteiro parcial em jornada concluída.

## Piloto proposto, após autorização aplicável

Coorte sugerida: um funcionário, um supervisor, poucos casos previamente escolhidos e cliente participante autorizado; quantidade, período/janela, critérios, titular de cada ato e limites de valor devem ser aprovados antes de iniciar. Não há coorte, data ou teto aceitos nesta rodada. Não criar “pagamentos de teste” em produção.

Antes: capturar posição inicial por cobrança, conta e sessão de caixa, horário/fuso, IDs opacos, filtros de relatório e versões, com fonte independente. Verificar backup externo/restauração e acesso do suporte. Durante: acompanhar API/incidentes/request_id e quotas/custos36; registrar cada comando e resultado, inclusive perda de resposta. Nunca repetir uma confirmação com outra chave só porque a resposta falhou. Após cada janela e no encerramento: reconciliar com supervisor e aprovar ou interromper. Não iniciarEtapa40 enquanto o aceite39 permanecer aberto.

## Conciliação financeira

Utilizar **Relatórios financeiros** (`/relatorios-financeiros`), **Caixa** (`/caixa`), **Cobranças** (`/cobrancas`) e histórico da solicitação já existentes; não criar segundo livro financeiro. Fixar mesmo escritório, unidade, operador, conta, cliente/serviço quando aplicável e período; o fim do relatório é exclusivo. Reter valores em centavos inteiros, distinguir espécie/Pix/cartão/transferência e taxa desconhecida; desconhecido não vale zero.

| Controle | Conferência e diferença a registrar |
| --- | --- |
| Obrigações | Contratado/alocado/saldo por cobrança com a fonte e os ajustes; estorno de alocação altera saldo. Recebimento bruto não é automaticamente alocação. |
| Movimentos | Recebimento bruto, estorno lógico, devolução efetivamente paga, despesa, taxa e transferência em campos separados. Estorno lógico não prova dinheiro devolvido. Transferência não é receita/despesa de serviço. |
| Caixa em espécie | Abertura + entradas/saídas em espécie da própria sessão = espécie esperada; comparar contagem e justificar qualquer diferença. Pix/cartão não aumentam numerário físico. Fecho não altera o movimento original. |
| Aberturas37 | Débito e crédito de abertura separados, reconciliados com fonte; não são venda/receita/caixa novo nem se compensam automaticamente. Reversão preserva pagamentos posteriores. |
| Documentos/entregas | Conferir versão/arquivo/hash/partes/decisões/assinatura/quitação ou exceção válida e destinatário; saldo zero sozinho não autoriza entrega. |

Registro privado por linha: sessão/cobrança ou movimento/protocolo opaco; fonte; valor inicial; entradas e saídas por natureza; posição final do sistema; posição final da fonte; diferença em centavos; razão; evidência privada; responsável/data/decisão. Não somar totais de telas com critérios diferentes. Para qualquer diferença: parar a janela afetada, preservar cadeia, investigar e corrigir por lançamento/estorno/devolução oficial; nunca UPDATE/DELETE direto, apagamento de evento, restauração sobre a base ativa ou recibo novo para “fechar” número.

## Registros de aceite (modelo vazio)

| Registro privado | Campos obrigatórios | Resultado atual |
| --- | --- | --- |
| Treinamento | Participante/papel, instrutor, data, ambiente/SHA, dispositivo, casos, tarefa sem ajuda, falha reportada, resultado, repetição necessária | Não executado. |
| Serviços/modelos/checklists | Serviço/versão/preço/regra/categoria/nível, modelo/checklist/versão, responsável competente/data/prova | Não executado. |
| Permissões | Papel/capacidade/escopo, caso permitido e negado porUI/API, responsável/data | Não executado. |
| Conciliação | Janela/filtros, fonte/posição inicial, movimentos por natureza, posição final, diferença, responsável/data | Não executado. |
| Aceite piloto | Todos os registros, incidentes resolvidos, decisão aprovar/repetir/parar, responsável/data | Não executado. |

Critério de encerramento: funcionário completa jornada e reporta falha sem ajuda; todos os movimentos da janela reconciliados ou diferenças tratadas/aprovadas explicitamente; controles/integrações aplicáveis aceitos, suporte e recuperação comprovados. Assinatura/scanner/entrega/SMTP reais e aparelho físico só passam com observação própria.
