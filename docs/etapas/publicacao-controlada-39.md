# Etapa 39 — prontidão e mudança revisável

**Decisão atual: checkpoint; não iniciar piloto comercial.** O usuário confirmou plano gratuito; `get_git_deployment_context` confirmou Hobby/time/projetoGit. Os [TermosVercel, seção4](https://vercel.com/legal/terms#4-hobby-plan), consultados nesta rodada, restringem Hobby a uso pessoal ou não comercial. O manual39 exige hospedagem comercial elegível; HTTPS e domínio verificado não satisfazem esse requisito. Nenhum upgrade, contrato, domínio ou serviço foi comprado.

## Resumo antes da publicação

A mudança contém somente o bloqueio da conexão herdada em previews, seus testes e o kit operacional39. Produção/local mantêm os contratos atuais; não há migração de dados, tela, novo botão, concessão ou integração externa. Toda prévia passa a exibir o estado existente de acesso indisponível; sua API nega acesso ao provedor. Em homologação futura isso precisará de revisão explícita. Não contém lançamento comercial, envio de e-mail, criação de conta hospedada ou movimentos de piloto. [Retorno detalhado](rollback-suporte-39.md).

Artefatos anteriores são imutáveis: esta correção protege os novos builds desta versão e não apaga previews antigos. A proteçãoSSO existente foi preservada; revisar a retirada de artefatos anteriores com o operador autorizado, sem alterar a plataforma diretamente nesta tarefa.

A preparação dePR/preview está autorizada neste pedido. Merge/publicação operacional exige a autorização aplicável após leitura deste resumo, orçamento e plano de retorno, conforme o manual. Não usar a confirmação “meu plano é gratuito” como autorização para contratar ou lançar operação.

## Custos e limites

| Item | Situação observada | Condição antes de iniciar piloto |
| --- | --- | --- |
| Vercel atual | Hobby confirmado; elegibilidade comercial não atendida | Escolher plano/contrato comercial elegível. |
| VercelPro, alternativa a cotar | [Página oficial](https://vercel.com/docs/plans/pro-plan): US$20/mês de plataforma com1assento de deploy; assentos adicionaisUS$20/mês; consumo sob demanda pode acrescer | Reconfirmar cotação/impostos/câmbio/assentos/excedentes e teto antes de contratar. Não foi selecionado nem autorizado. |
| Supabase e homologação separada | Um projeto visível, ACTIVE_HEALTHY; plano/fatura/quotas não comprovados pelo conector | Cotar banco/compute/Storage/egress/Auth/backups e ambiente separado. Não supor segundo projeto gratuito ou branch disponível. |
| Domínio | `escritoriojn.vercel.app` verificado; nenhum domínio próprio contratado | Aceitar domínio atual ou cotar registro/renovação e aprovar antes de comprar. |
| SMTP, scanner, assinatura e backup externo | Entrega/provedores/custos efetivos não homologados | Identificar fornecedores/limites/contratos aplicáveis; não selecionar fornecedor ou gastar automaticamente. |
| Faturamento real | ConsultaVercel retornou404 `costs_not_found` | Valor desconhecido, não zero. Confirmar no faturamento oficial. |
| Teto mensal/responsável financeiro | Não informado | Registrar moeda/teto/fonte/data; monitorar70%/85% pela36. Alertas propostos não são alertas externos ativos. |

Estimativa deve somar plataforma + assentos adicionais + consumo além da franquia + Supabase/ambiente isolado + e-mail + scanner/assinatura + backup + eventual domínio + impostos/câmbio. Não há total fechado enquanto esses itens forem desconhecidos. Notificação padrãoVercel não equivale a teto contratado; não ativar upgrade ou autosserviço pago para compensar falta de medição.

## Matriz de prontidão

| Verificação | Evidência atual | Estado para piloto |
| --- | --- | --- |
| Etapa38 | 426Node,225UI distintos,SQL/carga/restore locais no fecho38 | Contrato técnico disponível; aceite humano por fluxo pendente. |
| Hospedagem comercial/orçamento | Hobby confirmado pelo usuário e provedor; custo/teto não definidos | Bloqueado. |
| Domínio e HTTPS | Domínio verificado;22recursos/barreiras públicas desta rodada | Verificado no domínio existente; não comprova elegibilidade comercial. |
| Separação | Duas variáveis públicas têm targets preview/production; um Supabase visível | Defeito corrigido por guard. Preview desconectado; homologação funcional separada pendente. |
| Segredos | Inventário por nome/tipo/target; variáveis privilegiadas marcadassecret/sensitive somenteproduction; nenhuma delas consumida pelo app | Não foram revelados valores, rotacionadas chaves ou copiados segredos. Correção não adiciona segredo. Auditoria integral da conta/cofre permanece operacional. |
| Auth e e-mail | Endpointpúblicosettings200: e-mail habilitado, confirmação obrigatória, signuphabilitado; sem envio de mensagem | SMTP/entrega/callbackallowlist/SiteURL atuais e login hospedado não comprovados. Ensaiar confirmação/convite/reset com conta sintética autorizada no ambiente separado. |
| Contas e permissões |7Auth/7vínculos/92role_permissions;5e-mails confirmados; owner1/admin1/employee1/client4;189tabelasRLS e acesso direto a privadas0 | Contagens não são recertificação. Proprietário deve conferir titulares, papéis/capacidades/escopo, MFA aplicável e revogação. Não conceder capacidades para “fazer funcionar”. |
| SegurançaAuth | Advisorpreexistente de proteção contra senha vazada desativada | Registrar decisão e remediação conforme plano; [referênciaSupabase](https://supabase.com/docs/guides/auth/password-security#password-strength-and-leaked-password-protection). Não mudar plano/Auth sem escopo/autorização. |
| Jurídico/privacidade | `/api/privacy/public`:configuredfalse/revisão0;0configurações de controlador | Dados fictícios ainda publicados como exemplo. Owner deve usar Configurações→Privacidade; validar identidade/canal, bases/retenção/modelos/termos com responsável. Não inventar CNPJ/contato/prazo. |
| Serviços/modelos/checklists |64registros de modelos contados; contratos/versionamento existentes | Quantidade não é aceite. Validar serviços/preços/categorias/níveis e cada versão/checklist usado no piloto, inclusive formulários com partes. |
| Varredura/assinatura/entrega | Sem implantação de scanner real nesta etapa; arquivosprivados0 | Quarentena permanece; “clean” fictício dos ensaios não conta. Não liberar validação/assinatura/entrega real antes das integrações e aceites aplicáveis. |
| Backup e recuperação | Exercício38: schema82/bytes/Auth/RLS/ACL/totais em7903ms, outro banco no mesmo cluster descartável;0políticas36salvas no hospedado | Externo36/custódia/agenda/alertas e RPO/RTO de produção pendentes/editáveis. Não alegar recuperação de produção comprovada. |
| Treinamento e suporte | Roteiros, registros e triagem preparados | Funcionário ainda não observado; responsáveis/canais/escala e exercício sem ajuda pendentes. |
| Piloto/conciliação | Plano e controles privados preparados | Não executado; sem saldo/movimento fictício lançado no hospedado. |
| Preview e fluxo remoto | Buildlocal real e endpointsHTTP locais testados; préviaVercel pode exigirSSO | Não remover proteção. Não chamar401daVercel de prova da API nem READY de login privado. |

## Registro de liberação (preencher em local privado)

Responsável aprovador; dataUTC; ambiente/projetos/domínio; SHA/PR exato; orçamento/moeda/teto/cotação aprovada; versão do serviço/modelo/checklist; matriz de permissões; backup/recibo/restauração; responsáveis de treinamento e suporte; janela/coorte/limites do piloto; condição de parada; aceite explícito para o escopo. Todos permanecem **pendentes** nesta rodada.

Autorizações distintas: (a) instalar a correção técnica; (b) contratar custos; (c) habilitar homologação isolada; (d) abrir piloto comercial com dados reais. Uma não presume as demais. Reavaliar esta matriz com provas atuais antes de cada decisão.
