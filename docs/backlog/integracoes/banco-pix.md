# FUT-PIX — banco, PIX e conciliação

**Futura / desativada.** Flag documental `bank_pix=false`; sem conexão bancária, OpenFinance, cobrançaPIX, chavePIX cadastrada por esta etapa ou movimentação automática. PIX/transferência atuais continuam manuais. [Contratos comuns](contratos.md) · [Backlog](../README.md).

## Fronteira e proposta

Adaptador futuro `BankProvider.request/status/statement` normaliza transação e evidência em conta de destino inscrita. Reusar recebimento/alocação15, correção16, conferência18 e relatórios19. Criar cobrança no PSP não é criar uma segunda obrigação interna; intenção remota deve referenciar obrigação/valor/moeda oficiais. Geração de cobrança, leitura de extrato e iniciação de transferência são escopos diferentes, cada um desativado e sujeito a autorização própria.

Comprovante/QRcode, screenshot, redirecionamento do navegador ou retorno de “sucesso” não confirma dinheiro recebido. Validar conta favorecida, transação/identidade externa (inclusiveEndToEndId quando aplicável), estado autenticado, valor/moeda e vínculo. Divergência, pagador não vinculado, valor parcial/excedente ou transação sem cobrança vão para conciliação, sem alocação automática especulativa. Não lançarPIX em espécie nem gerar crédito gastável excedente.

## Avaliação futura

| Campo | Registro necessário |
| --- | --- |
| Fornecedor | Banco/PSP não selecionado; identificar a conta comercial real do escritório. [Asaas](https://www.asaas.com/) é apenas candidato de pesquisa; conferir elegibilidade, contrato, API e habilitaçãoPIX/OpenFinance aplicáveis. Nenhuma conta será aberta nesta etapa. |
| Custo | Não cotado/aprovado. Mensalidade/franquia +cobrança/recebimentoPIX +transferência/consulta/devolução +acesso aAPI e excedentes, conforme contrato. Levantar custos de homologação, limites operacionais e teto autorizado. |
| Privacidade | Dados de pagador/favorecido/extrato somente quando necessários; finalidade/base, sigilo, consentimento/escopoOpenFinance quando aplicável, retenção e revogação. Não importar extrato completo para qualquer usuário. |
| Autenticação | Credencial/certificado/mTLS/OAuth conforme contrato do banco, conta/ambiente verificados, escopo mínimo/rotação. Webhook autenticado não herda permissões de caixa de um funcionário. |
| Evento/webhook | Validar assinatura/certificado/chave e replay conforme protocolo; event_id e identidade da transação vinculados à conta registrada. ConsultaAPI autenticada para confirmação quando necessária; IP ou segredo em query não bastam. |
| Conciliação | Extrato/autorização ×intenção ×transação ×pagamento/alocação existentes. Mesmo fato confirmado manualmente antes do callback não recebe segunda alocação; referência ausente/ambígua exige revisão. Conferir saldo devido e destino em centavos. |

## Aceite e desligamento futuros

- Testar origem inválida, conta alheia, repetição comIDs diferentes, confirmação manual concorrente, parcial/excedente, pagamento tardio/cobrança cancelada, valor/moeda alterados, timeout após recebimento e devolução parcial/repetida.
- Financeiro atual exige sessão própria aberta, versão e autoridade atuais. Não atribuir webhook a caixa encerrado/colega nem abrir caixa fictício: sem contrato futuro aprovado para automação financeira, registrar evidência para decisão humana autorizada, sem efeito automático.
- Devolução remota tem intenção/referência/estado próprios; solicitação não prova execução. Estorno lógico não envia dinheiro; devolução efetiva só é registrada com prova e limites do original. Reconciliar ausência de resposta antes de repetir.
- Desligar bloqueia novas intenções, preservando recepção/reconciliação controlada de fatos em voo e trilha imutável. Aberturas37 não viram receita nova. Não confundir extrato com saldo disponível do caixa.
