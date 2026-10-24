# Financeiro — referência pertinente à Etapa15

Fonte oficial: [financeiro.md no Drive](https://drive.google.com/file/d/1ewtX2WQlYPax9Dp1s2FsrsoMlLMVuHq1/view), lida em24/10/2026. Este arquivo materializa somente os tópicos afetados; não ativa propostas futuras.

- RF10/RN03: cobrança é obrigação, pagamento é recebimento e alocação liga cada centavo uma única vez. BRL/centavos inteiros; saldo=obrigação vigente−alocações confirmadas líquidas de reversões. Snapshots preservados. Crédito excedente bloqueado.
- Dinheiro: guardar aplicado, apresentado e troco. Ledger líquido aplicado; nunca descontar troco duas vezes. Fundo100+serviço30/apresentado50/troco20=espécie130; PIX40 mantém130. PIX/cartão/transferência separados por destino. Taxa cartão separa bruto/taxa/líquido e liquidação, sem desconto comercial.
- Manual: pendente, confirmado, rejeitado ou revertido parcial/total. Comprovante isolado não confirma; confirmação autorizada exige evidência e operador. Referência externa somente real/informada; sem banco/provedor/PIX automático.
- RN04: transação valida sessão, todas cobranças/contas, saldo, capacidade e limites; pagamento/alocação/ledger/auditoria atômicos. Chave+hash+resultado persistidos. Mesma chave/payload retorna mesmo resultado, diferente conflita; locks protegem chaves diferentes. Revalidar autoridade depois das esperas. Após fechar, proibir confirmação.
- RN05: confirmado não editado/apagado. Reversão referencia original/quantia/motivo/operador e limita saldo líquido; reembolso próprio, nunca presumido pelo cancelamento. Fecho/extrato usam a mesma base; preservar fechamento original.
- Recibo lógico: referência única para futura evidência de recebimento, sem nota fiscal ou promessa de conformidade fiscal.
- RF11/12: caixa individual por operador/unidade; leitura ampliada não permite operar colega. Sem valores a quem não tem capacidade financeira. DatasUTC, intervalos explícitos. Despesas, relatórios novos, gateway e demais propostas ficam fora15.
