# Etapa 38 — matriz de homologação e aceite

Esta matriz separa teste técnico e aceite humano. **Homologação operacional pendente** até o proprietário validar os fluxos em ambiente de teste. Não usar contas ou senhas reais para os ensaios. A base testada é47e51700; o relatório final identifica cada execução, seu resultado e limite.

| Fluxo/critério | Resultado técnico | Evidência técnica observada | Ambiente | Aceite do responsável |
| --- | --- | --- | --- | --- |
| Balcão, cadastro e abertura | Passou nos casos/ambiente indicados | replaySQL requests/services/charges e navegador integrado | descartável; UI com API interceptada identificada | Não executado |
| Serviço rápido | Passou nos casos/ambiente indicados | replaySQL finance19 + contratos/API19 | descartável | Não executado |
| Documento com partes e nova revisão | Passou nos casos/ambiente indicados | documents21/22, portal32 e revisão editorial | descartável | Não executado |
| Aprovação e segregação de função | Passou nos casos/ambiente indicados | editorial23/assinaturas24/SQL | descartável | Não executado |
| Parcial, quitação, estorno e devolução | Passou nos casos/ambiente indicados | payments/corrections e corridasSQL; gate25 | descartável | Não executado |
| Exceção só de quitação | Passou nos casos/ambiente indicados | documents25 e corrida entre saldo/decisão | descartável | Não executado |
| Assinatura externa/física | Passou nos casos/ambiente indicados | script24: bytes exatos, saída e validação separadas | laboratório com documentos/decisões fictícios; sem assinatura oficial real | Não executado |
| Entrega e portal | Passou nos casos/ambiente indicados | script26/32: autorização, hash, revogação e isolamento | Auth/REST/Express/Storage/worker reais locais | Não executado |
| Importação37 e abertura | Passou nos casos/ambiente indicados | script37, UI37 e preservação de pagamento posterior | descartável | Não executado |
| UI/API/RLS/Storage indevidos | Passou nos casos/ambiente indicados | replaySQL, permissões reais e portal32 | descartável; barreiras401 adicionais no domínio | Não executado |
| Desktop/Mobile, até4atalhos, sem loader | Passou nos casos/ambiente indicados | suíteUI38: Equipe/Convites, navegação, financeiro/documentos, quatro perfis, teclado/reflow | Chromium em viewport emulado; API interceptada | Não executado |
| Carga de busca/listagem | Passou nos casos/ambiente indicados | scriptload38,10usuários/10sessões/10.000cadastros, p95proposto≤2s | local; não é SLAhospedado | Não executado |
| Restauração | Passou nos casos/ambiente indicados | scriptcontinuity36, banco+bytes+Auth+RLS+ACL+totais | outro banco no mesmo cluster descartável | Não executado |
| Publicação e integridade | Passou — PR134/GitREADY/schema82/HTTPS22 | providersGitHub/Supabase/Vercel, HTTPS e contagens | hospedado somente leitura | Não executado |

Resultados e defeitos desta rodada estão registrados em `../evidencias/etapa-38/verificacao.json` e no fecho. Uma linha com teste técnico aprovado continua sem aceite humano até manifestação do responsável.

## Conferência pelo proprietário

Para cada fluxo acima, registrar responsável, data, ambiente, serviço/modelo usado, resultado e protocolo fictício. Repetir a operação diária pela interface: abrir atendimento, conferir partes e versão, submeter/decidir com papéis corretos, registrar parcial e verificar bloqueio, completar/estornar e conferir saldo, avaliar exceção autorizada, formalizar, disponibilizar e conferir o portal de cada destinatário. Conferir caixa e relatórios com a fonte; saldo inicial37 não é receita nova. Validar também recusa por conta sem capacidade e manutenção de restrições depois de nova versão/revogação.

Assinatura/antimalware/órgão público, entrega física/WhatsApp e instalação em aparelho real só recebem aceite com observação própria. As decisões fictícias/clean controlado do laboratório não configuram scanner, assinatura válida ou recebimento real.

## Pendências externas preservadas

- Recuperação36 fora da conta/projeto principal, destino/custódia/agenda/alerta e RPO/RTO de produção continuam pendentes e editáveis, conforme decisão anterior.
- Login privado hospedado com conta sintética autorizada, instalação físicaAndroid/iPhone e validação do proprietário ainda não observados nesta rodada.
- Teste de teclado/reflow não substitui auditoria completaWCAG ou inspeção de todos os contrastes em todos os estados.

Sem aceite humano, conservar checkpoint38. Implementar ferramentas/evidências de homologação não autoriza afirmar operação integral aprovada ou iniciar39.

| Pendência | Resultado |
| --- | --- |
| Aceite humano por fluxo/serviços/modelos/permissões/caixa | Não executado |
| Login privado hospedado | Não executado |
| Instalação físicaAndroid/iPhone | Não executado |
| Scanner/assinatura oficial/entrega física ou WhatsApp reais | Não executado |
| Contrastes/WCAG completos em todos os estados | Não executado |
| Recuperação36 externa e RPO/RTO de produção | Não executado |
