# Financeiro — referência pertinente às Etapas15/16

Fonte oficial: [financeiro.md no Drive](https://drive.google.com/file/d/1ewtX2WQlYPax9Dp1s2FsrsoMlLMVuHq1/view), lida em24/10/2026. Este arquivo materializa somente os tópicos afetados; não ativa propostas futuras.

- RF10/RN03: cobrança é obrigação, pagamento é recebimento e alocação liga cada centavo uma única vez. BRL/centavos inteiros; saldo=obrigação vigente−alocações confirmadas líquidas de reversões. Snapshots preservados. Crédito excedente bloqueado.
- Dinheiro: guardar aplicado, apresentado e troco. Ledger líquido aplicado; nunca descontar troco duas vezes. Fundo100+serviço30/apresentado50/troco20=espécie130; PIX40 mantém130. PIX/cartão/transferência separados por destino. Taxa cartão separa bruto/taxa/líquido e liquidação, sem desconto comercial.
- Manual: pendente, confirmado, rejeitado ou revertido parcial/total. Comprovante isolado não confirma; confirmação autorizada exige evidência e operador. Referência externa somente real/informada; sem banco/provedor/PIX automático.
- RN04: transação valida sessão, todas cobranças/contas, saldo, capacidade e limites; pagamento/alocação/ledger/auditoria atômicos. Chave+hash+resultado persistidos. Mesma chave/payload retorna mesmo resultado, diferente conflita; locks protegem chaves diferentes. Revalidar autoridade depois das esperas. Após fechar, proibir confirmação.
- RN05: confirmado não editado/apagado. Reversão referencia original/quantia/motivo/operador e limita saldo líquido; reembolso próprio, nunca presumido pelo cancelamento. Fecho/extrato usam a mesma base; preservar fechamento original.
- Recibo lógico: referência única para futura evidência de recebimento, sem nota fiscal ou promessa de conformidade fiscal.
- RF11/12: caixa individual por operador/unidade; leitura ampliada não permite operar colega. Sem valores a quem não tem capacidade financeira. DatasUTC, intervalos explícitos. Despesas, relatórios novos, gateway e demais propostas ficam fora15.

## RN05/RF10 — correções16 (fonte oficial relida em24/10/2026)

- Estorno lógico referencia pagamento/alocação/valor/motivo/operador/autorização, conserva original/recibo/decisões e reduz a alocação uma vez. Devolução efetiva é evento ligado à reversão; só ela reduz espécie/destino. Cancelamento de serviço e ajuste de obrigação são decisões distintas, com os contratos10/13 e trilha preservados.
- Limite de reversão: alocação original menos reversões anteriores. Limite de devolução: reversão menos suas devoluções. Taxa de cartão é custo do escritório, nunca desconto do limite original do cliente. Reversão não devolvida gera passivo pendente explícito, sem crédito gastável.
- Caixa encerrado permanece encerrado: correção em nova sessão própria na mesma unidade, com capacidade/escopo/responsabilidade atuais; leitura ampliada não permite operar colega. Locks e revalidação de sessão/autoridade também em retry; tudo atômico e idempotente.
- Exigência de quitação é a do snapshot do serviço capturado no item/cobrança. Saldo positivo sinaliza impedimento financeiro de novas entregas somente quando essa exigência existe. Ausência de impedimento financeiro não aprova assinatura, documento, scanner ou entrega;17 ainda não existe. Não retirar acervo/anexos anteriores nem alegar recuperar documentos já baixados.
- Registros legados refunded/reversed já alteravam alocação e fundos; conversão determinística conserva ambos os efeitos sem novos movimentos/eventos ou metadata fictícia.

## Fechamento18 — política vigente de conferência e divergências

- A conferência amplia o Caixa existente: espécie usa fundo inicial mais os efeitos físicos do ledger. Troco já está líquido; estorno lógico não reduz dinheiro. PIX, cartão e transferências/despesas digitais são conferidos por meio e conta, sem transformar transferência interna em receita.
- Cartão confere o bruto confirmado menos devoluções efetivas. Taxa, líquido após devoluções e créditos liquidados/pendentes são apresentados separadamente. Crédito pendente não é saldo disponível no banco; taxa/liquidação legada desconhecida continua não informada.
- Cada grupo exige valor conferido explícito. Snapshot imutável guarda esperado, contado, diferença, operador, justificativa e UTC. Qualquer diferença não zero permanece pendente de revisão; sobras e faltas em meios distintos não se anulam. Não foi criado limiar monetário arbitrário.
- Revisão exige owner/admin e `cash.closure.approve` atual; caixa de colega acrescenta `cash.read_all`. Uma decisão aprova ou rejeita a justificativa, conservando contagens e divergências. Essas capacidades têm seed somente owner, sem concessões individuais automáticas.
- Caixa fechado permanece fechado. `cash.closure.adjust` mais `cash.open`, papel owner/admin e nova sessão própria aberta na mesma unidade permitem registrar ajuste documental da conferência de um fechamento próprio anterior. O original não muda e nenhum lançamento fictício é criado. Correções monetárias reais continuam nos fluxos15–17 com seus limites e evidências.
- Fechar, receber e transferir usam os mesmos locks; a transação revalida sessão e autoridade depois da espera. Novo recebimento em sessão fechada é recusado. Tentativa18 repetida preserva o resultado armazenado e entrega estado/autoridade atuais. Retries legados autorizados permanecem; novo fechamento legado não contorna a conferência por destino.
