# FUT-CARD — cartão e maquininha

**Futura / desativada.** Flag documental `card_terminal=false`; semSDK de terminal, captura, tokenização, antecipação ou cobrança automática. Cartão atual é registro/conferência manual. [Contratos comuns](contratos.md) · [Backlog](../README.md).

## Fronteira e proposta

Adaptador futuro `CardProvider.request/status/settlements` vincula intenção a cobrança oficial, estabelecimento, terminal/conta e referência externa. Reusar recebimentos15/correções16/fechamento18/relatórios19. Autorização, captura, cancelamento, liquidação, devolução e chargeback são estados/fatos distintos; autorização de cartão não equivale a recebimento capturado ou crédito liquidado no banco.

Bruto aplicado à obrigação, taxa do escritório, líquido, parcelas/agenda e liquidação devem ser reconciliados separadamente, com data/fuso e moeda explícitos. Taxa não é desconto no valor pago pelo cliente; liquidação desconhecida continua desconhecida. Recebimento digital não aumenta espécie e o callback não autoriza entrega de documento.

## Avaliação futura

| Campo | Registro necessário |
| --- | --- |
| Fornecedor | Não selecionado; primeiro identificar credenciadora/maquininha já contratada. [Stone](https://www.stone.com.br/) ou [PagBank](https://pagbank.com.br/) são candidatos de pesquisa; confirmar modelo compatível, acesso àAPI/TEF/terminal e contrato, sem presumirSDK disponível. |
| Custo | Não cotado/aprovado. Aluguel/compra/integração +MDR por modalidade/parcelamento +antecipação +estorno/chargeback/excedentes, conforme cotação. Não antecipar recebíveis nem habilitar modalidade paga automaticamente. |
| Privacidade | Não armazenarPAN completo, CVV, trilha ouPIN em banco, log, screenshot, IA ouPWA. Preferir referência/token do provedor e dados mínimos permitidos. Avaliar obrigaçõesPCI e responsabilidades com especialista/fornecedor; tokenização não prova conformidade integral. |
| Autenticação | Backend e terminal inscrito/estabelecimento verificado; identidade e escopos por ambiente. Protocolo de resposta/webhook assinado conforme fornecedor, rotação e proteção contra replay. |
| Evento/webhook | Correlacionar conta/terminal, intenção, transaction_id/NSU e demais referências conforme contrato; não deduplicar porNSU isolado sem conhecer sua unicidade. Browserretorno/recibo de tela não é fonte financeira autenticada. |
| Conciliação | Venda/captura ×pagamento/alocação ×taxa/parcelas ×agenda ×liquidação/extrato. Fecho por destino conserva divergências; callback e registro manual convergem para o mesmo fato, com chave de negócio do provedor. |

## Aceite e desligamento futuros

- Testar transação recusada/cancelada, autorização sem captura, captura parcial, parcelamento, terminal alheio, duplicidade/reenvio, timeout após efeito no terminal, evento fora de ordem, taxa não informada e liquidação parcial/tardia.
- Devolução e chargeback exigem referência ao original, tratamento contábil aprovado, limites e conciliação; não duplicar saída que o provedor já debitou nem marcar todo chargeback como devolução ao cliente. Estado de disputa não pode ser ignorado nem convertido arbitrariamente em confirmação.
- Respeitar sessão/permissão/locks oficiais; nenhum webhook toma emprestada a sessão do operador. Contrato de automação financeira requer desenho e aceite próprios antes de qualquer efeito.
- Desligar bloqueia novas transações e mantém acompanhamento controlado das operações/parcelas existentes. Não apagar ledger, antecipar crédito ou compensar diferenças para fechar o caixa.
