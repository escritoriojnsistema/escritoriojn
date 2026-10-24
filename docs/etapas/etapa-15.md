# Etapa 15 — Receber pagamentos parciais ou integrais

Fonte oficial: [etapa-15.md no Drive](https://drive.google.com/file/d/12APpcXmBaFkozjsIfIsTH8DGzI5O2eWG/view), conferida em 24/10/2026. [Regras locais](../regras/financeiro.md). Entrada: Etapa14 e correções financeiras/auditoria publicadas; base `eee3bc6` limpa. Publicação completa autorizada, exclusivamente GitHub→Vercel, Actions desativado.

| Já implementado e preservado | Incremento15 |
| --- | --- |
| Caixa próprio, unidades, contas, formas, capacidades14 | Pagamento explícito e alocações de uma a dez cobranças autorizadas |
| Ledger append-only, devoluções/estornos, conciliação/fecho | Ponte única ledger↔alocação, backfill determinístico sem reescrever histórico |
| Comando+hash+resultado e locks | Comando15 atômico, pendência sem efeito financeiro, confirmação/rejeição e liquidação manual |
| Saldo13 e portal UID/identidade08, avisos | Saldo pelas alocações confirmadas líquidas, mesmos portal/avisos, sem receita dupla |
| Auditoria PT-BR/PDF verificável1 | Novos eventos na apresentação2; apresentação1 congelada |

Contrato: BRL em centavos. Dinheiro guarda aplicado/apresentado/troco; ledger recebe apenas aplicado. Digital usa destino próprio; cartão guarda bruto/taxa/líquido e liquidação manual sem gateway. Cada pagamento tem referência lógica única, sem emissão fiscal. Excedente bloqueado. Pendências não reservam saldo e não geram ledger/avisos de confirmação. Confirmar revalida todas as cobranças, responsabilidade e sessão depois dos locks; caixa fechado impede confirmação. Decisões e movimentos imutáveis; reembolso/estorno continuam no fluxo atual.

Compatibilidade: recebimentos legados históricos são convertidos em pagamentos/alocações por IDs determinísticos, preservando comandos/resultados e valores apresentados desconhecidos como desconhecidos. Reenvio legado histórico retorna o mesmo resultado sem novo efeito. Recebimento legado novo sem o contrato15 é recusado; caminho interno só aceita contexto15 guardado. Não restam lançamentos novos sem alocação.

Aceites: 100→60 parcial→40 quitado; retry/colisão de hash; concorrência/rollback/revogação; pendência não confirma; fundo100+aplicado30/apresentado50/troco20=130 e PIX40 mantém130. UI320/360/1440 e Auth real local, regressões de portal/avisos/caixa/auditoria. Sem fixtures hospedadas, concessões individuais, emails reais, gateway, despesas ou16.

Baseline hospedada relida em24/10: 5Auth/5vínculos/1cliente/1pedido/27eventos/17grants individuais; zero unidades/contas/ledger/cobranças. O total de eventos mudou legitimamente desde o fecho anterior (25); não reverter dados do usuário.

Estado: implementação/validação em andamento; publicação ainda não alegada. Fecho e provas serão registrados após validação real.
