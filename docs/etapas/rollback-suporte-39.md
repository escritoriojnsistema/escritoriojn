# Etapa 39 — retorno, suporte e incidentes

Plano preparado; nenhum rollback, incidente real, alerta externo ou recuperação de produção foi executado nesta etapa. Responsáveis/canal/escala ainda precisam ser definidos em registro privado. Plano de retorno não substitui backup externo36.

## Retorno da mudança técnica

Referência anterior: main `711beb958a8d9b74a1ed2fa1ab6c5ef8bd358a0b`, produção `dpl_CtzG8ygPDk7q85kqvmppYAuSU5qK`, schema82/última20261115152258. A mudança39 é de build/guardsExpress, semSQL/conta/objeto novo. Antes de qualquer ação, obter o SHA atual e conferir se há commits posteriores; não sobrescrevê-los.

Se houver regressão depois de publicação autorizada: interromper o fluxo afetado, registrar request_id/horário/versão e comparar com a referência. Preparar umPR corretivo baseado no main atual, revisar/testar, integrar pela conexãoGitHub→Vercel e conferir READY/origemGit/SHA/alias/HTTPS/API e fluxo autenticado no ambiente autorizado. SemActions, deploymanual, promoção/rollback diretoVercel, reset/forcepush ou troca de variáveis pelo painel. Não criar migração inversa nem reaplicar82.

**Não reverter cegamente todo o commit39:** isso reabriria a conexão de produção no preview. Preferir correção compatível mantendo `VERCEL_ENV=preview` desconectado no build e nos três clientesExpress. Se o guard precisar ser substituído, provar primeiro isolamento equivalente e negaçãoUI/API/RPCpública. O erro503depreview é intencional, não regressão de produção. Sem condição segura, suspender o piloto e manter bloqueado; não remover proteçãoSSO para acelerar teste.

Rollback de código não desfaz pagamentos, aprovações, arquivos ou notificações já registrados. Conferir a cadeia de dados antes de reabrir. Correções financeiras usam os comandos originais append-only e a conciliação, com estorno lógico separado da devolução efetiva. Nunca apagar registros para voltar à versão antiga nem restaurar snapshot sobre o banco ativo sem plano de recuperação separado.

## Recuperação de dados

Reusar [Continuidade36](continuidade-36.md) e ferramentas existentes `scripts/continuity36.mjs` (`pack`, `upload` com readback, `verify`, `monitor`), sem introduzir restore remoto automático. A chave privada/credenciais/dump/objetos ficam foraGit, bundle, logs e cachePWA. Verificação descriptografa/valida; não executaSQL nem garante restaurabilidade do ambiente inteiro.

Antes do piloto: aprovar destino externo/custódia/agenda/retenção, exportação de banco ebytes/manifesto, configuraçõesAuth/SMTP/roles/segredos separadas e teste no alvo isolado. MedirRPO/RTO reais; conferir hashes/inventário/contagens/FKs/totais/ACL/RLS/login com novoJWT e negação de sessão antiga/conta alheia. Só reabrir após aceite do responsável. O exercício38 de7903ms foi outro banco do mesmo cluster descartável, não recuperação externa de produção. Zero políticas36salvas observado nesta rodada; não há agenda/alerta comprovados.

## Triagem e condições de parada

| Nível proposto | Exemplo | Ação |
| --- | --- | --- |
| Crítico | Acesso entre pessoas/escritórios, suspeita de segredo, entrega indevida, saldo sem origem ou duplicidade | Parar imediatamente o fluxo/piloto afetado; preservar trilha, conter pelo operador autorizado, avisar responsável e avaliar obrigações de privacidade com responsável competente. |
| Alto | Login/confirmar/receber/entregar indisponível, divergência de conciliação, cópia externa não confirmada | Suspender novas confirmações na janela, manter comandos incertos e investigar antes de retomar. |
| Normal | Dúvida de navegação, relato visual sem perda/autoridade | Registrar contexto e reprodução sintética; priorizar com suporte sem liberar permissões extras. |

Escala, prazos de resposta e canais devem ser aceitos pelo escritório; esta tabela não éSLA nem atendimento ativo. Medição oficial/quota vencida/ausente permanece “desconhecida”; alertas70%/85% propostos não contratam upgrade. O responsável deve conferir banco/Storage/egress/e-mail/execuções/custos e escalonar ao teto aprovado; nenhuma medição foi inventada.

## Orientação ao funcionário

- 503/tempo esgotado após confirmar: não assumir falha nem repetir com nova chave. Manter a tela/tentativa e usar a repetição/reconciliação do próprio fluxo, que preserva corpo/chave em memória. Não atualizar página, sair ou trocar navegação enquanto houver confirmação incerta. Falha depois deCOMMIT pode já ter gravado.
- 409: dados/revisão mudaram; atualizar e conferir nova prévia antes de decidir.401: reautenticar;403: pedir revisão de escopo/capacidade pelo responsável, sem outro login emprestado.422: corrigir o dado/regra indicado, sem contornar o gate.
- Sem conexão: não confirmar recebimento ou entrega fictícios. Registro temporário, se autorizado, usa referência controlada e é reconciliado ao retorno; não vale recibo, pagamento ou autorização documental.
- Reportar horário/fuso, ambiente/SHA quando disponível, tela/ação, papel sem identidade pessoal, códigoHTTP/erro/request_id, resultado esperado e se há comando incerto. Não enviar senha, token, cookie, linkassinado, chave, arquivo,CPF/contato ou detalhe financeiro em canal público. Captura real deve ser minimizada e enviada pelo canal privado definido.

## Registro de incidente e retomada (privado)

ID; detecção/horário; ambiente/SHA; fluxo afetado; severidade; request_id; versão/protocolo opaco; impacto; existência de confirmação incerta; operador titular/substituto; contenção; evidências privadas; causa confirmada;PR/SHA corretivo; verificações de integridade/conciliação; decisão/data de retomada; prevenção. Sem responsável e sem decisão de retomada, não voltar ao piloto por conta própria.
