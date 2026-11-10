# Retornos após28 — evidência local

Base `9772f32`. Escopo: telas existentes01–28; sem etapa29, permissões novas, banco hospedado ou dados reais. Navegação por destino interno explícito, sem `history(-1)` e sem aceitar destino de query/state/referrer.

## Causa e correção

`SettingsPage` e `ArchivesHubPage` forneciam `Voltar às configurações` em `contextActions`. `OperationLayout` mostrava essas ações apenas na sidebar e no drawer: nenhum retorno visível no conteúdo principal, sobretudo no mobile. Equipe/Auditoria abertas pelas configurações também não tinham retorno à origem funcional. Capturas anteriores ao código, com sessão/HTTP fictícios, em `/workspace/scratch/retornos-before-{320,360,1440}-{configuracoes,categorias,acessos,equipe,auditoria,arquivados}.png`. Baseline3 testes passou; em seguida o teste de retorno visível falhou pela ausência esperada em `main`.

O shell agora mostra ícone+rótulo, alvo mínimo44px e destino autorizado. Configurações→painel; filhos/equipe/auditoria/arquivados→Configurações quando `settings.access`, caso contrário painel. Rotas financeiras avulsas→Caixa quando o gate do pai é satisfeito; catálogo→Solicitações; demais páginas→painel do portal vigente. Painéis raiz não recebem retorno artificial. Não há atalhos inferiores adicionais.

Retornos contextuais existentes de documentos/relatórios são promovidos ao conteúdo, conservando handler/disabled; outras ações continuam no menu. Um marcador explícito nos retornos locais já existentes impede um segundo retorno de rota, sem inspecionar DOM/observar mutações. As abas de Arquivados passam a quebrar linha em320px. Em Conta/documentos mobile e Equipe desktop, o retorno compartilha a linha do título para conservar o conteúdo principal na altura já verificada, sem ocultar conteúdo ou reduzir alvos. Fechar/Cancelar/Voltar locais continuam donos de seu estado e confirmação de descarte.

## Inventário dos fluxos

| Fluxo | Tratamento |
|---|---|
| Configurações, Categorias, Acessos, Privacidade, Arquivados | Retorno principal seguro e visível; edição de categoria conserva Cancelar local e guarda503. Cartão Arquivados alinhado ao gate real: `archives.manage` independente ou owner/admin+`requests.archives.manage`+`requests.read`. |
| Equipe/Convites | Lista volta às Configurações ou painel; Invite/Member/Delegation conservam Fechar e confirmação de descarte. |
| Clientes, Solicitações equipe/cliente, Serviços, Modelos, Imóveis rurais | Lista recebe pai de rota; detalhe/editor conserva Voltar à lista com reset local. |
| Documentos emitidos/Editor/Revisões/PDF | Voltar contextual vem para main; autosave/workflow pendentes conservam bloqueios e retry; criar documento com resposta503 mantém o retorno bloqueado até confirmar a mesma chave/corpo. |
| Catálogo/formulário documental equipe/cliente | Lista recebe pai; formulário conserva Voltar às pastas com bloqueio de tentativa pendente. |
| Auditoria | Lista volta a Configurações quando autorizado; evento conserva Voltar à lista. |
| Caixa, extrato, conferências, recibo | Raiz recebe painel; extrato/conferência/recibo conservam retornos locais. |
| Cobranças/Checklist/Anexos | Raiz recebe pai; seleção/detalhe/cópia conservam controles de trocar seleção/todos/cancelar, sem retorno concorrente. |
| Arquivos de solicitações, retenção, encerramento de conta | Confirmações/editores conservam Cancelar/Voltar local, sem retorno de rota concorrente. Consultar acervo de conta excluída agora tem Voltar às contas excluídas, resetando somente a seleção local. |
| Conta, notificações, pagamentos, despesas/relatórios/atendimento rápido | Pai seguro do portal; operações mantêm controles locais. Conta propaga busy até confirmação do e-mail; Governança integrada propaga busy durante restauro. Edição de despesas/configuração financeira/fuso integrado prioriza Cancelar/Voltar local. Cancelar abertura do caixa apenas limpa campos da raiz: conserva retorno ao painel. |
| Telas públicas/acesso, feedback de negação/indisponibilidade | Controles de retorno já existentes preservados; shell só em operação autorizada. |

## Verificação

Verificação final em10/11/2026:

- `tests/operation-back.test.ts`:4casos Node aprovados; `npm run typecheck` e `git diff --check` aprovados. Suíte Node/build completos pertencem à evidência consolidada do coordenador, sem duplicar sua execução.
- 37contratosUI novos aprovados em lote limpo, incluindo21opções de Configurações×320/360/1440, quatro perfis, ausência de retorno duplicado, descarte de rascunho, pendências/503, confirmação de e-mail e retorno local de Arquivados/editores. Log `/tmp/pos28-back-complete-clean.log`; resultado `/tmp/pos28-back-complete-clean`.
- 48regressões selecionadas aprovadas em lote final limpo: Conta, Caixa, despesas, relatórios, editor documental21/22, arquivos/auditoria e Equipe. Log `/tmp/pos28-back-regressions-clean.log`; resultado `/tmp/pos28-back-regressions-clean`. Não somar rechecagens intermediárias como cenários novos.
- Revisão independente do snapshot: nenhum achado P1/P2 confirmado remanescente;8Node focados operação/retorno e diff conferidos pelo revisor.

A primeira execução das48regressões teve41aprovações e7falhas, todas corrigidas e rechecadas no lote limpo: Conta360 owner/admin/employee, conclusão documental320 e Equipe1440 excederam a altura após adicionar o retorno (corrigido compartilhando a linha do título); o contrato de restauro precisava escolher a aba atual Cadastros e referências; o fixture de relatórios não interceptava Disponibilidade e produzia um alerta extra, corrigido pelo mock fictício de presença offline. Asserções de altura, foco,44px,16px,503/idempotência não foram relaxadas; nenhum timeout foi ampliado. Uma rodada antiga teve ENOENT de artefato Playwright sob outputs compartilhados e não conta como aprovação; os lotes finais usam diretórios `/tmp` separados.

Capturas após o código, inspecionadas: `/workspace/scratch/retornos-after-{320,360,1440}-acessos.png`, `/workspace/scratch/retornos-after-360-conta.png`, `/workspace/scratch/retornos-after-320-arquivados.png` e `/workspace/scratch/etapa21-ui/editor-320.png`. Arquivados320 permanece dentro da largura; Conta/documento preservam recuperação/conclusão acima dos atalhos nas dimensões padrão testadas. Conteúdo longo, zoom e teclado conservam rolagem natural.

 ContratosUI com sessão/HTTP fictícios provam apresentação/transportes/guardas, **não** login real, banco ou SMTP. Esses últimos pertencem à evidência Auth local separada. Backend/dados hospedados: não se aplica a esta correção de navegação.
