# Correções posteriores à Etapa 25 — checkpoint histórico de05/11

Base publicada: `9fa691028c9400005a068212dd7d185408ab271a` (Etapa 25). Branch de trabalho: `fix/correcoes-integradas-20261105`. Este checkpoint histórico não declarava conclusão ou implantação em05/11. A continuação de06/11 está documentada no Livro e no fecho correspondente.

## Implementação preservada

| Requisitos | Alterações locais | Validação e limites |
| --- | --- | --- |
| 1–3: níveis, pré-atendimento e categorias | Capacidades independentes Nível 1/2; owner integral; transferência excepcional por solicitação; coleta separada da execução; encaminhamento por categoria; editor de nível | SQL positivo/negativo e roteamento 1/2/3. Corrigidos bypass de read_all, rollback ao perder escopo após encaminhar e variáveis da coleta. RPC pública antiga também exige categoria e delega ao fluxo canônico; testes RED/GREEN de abertura sem/com categoria. UI de coleta/transferência ainda precisa cobertura dedicada. |
| 4: sincronização | Backfill normalizado das categorias de serviços e vínculos sem duplicação; legado/importação sem nível definitivo | Categorias pendentes não recebem nível inventado. Arquivar preserva vínculos e históricos. Duas invariantes adicionadas ao replay. |
| 5: estados online | Devolução com motivo/notificação, revisão de dados/anexos, reenvio, ocultação própria e cancelamento preservando histórico | SQL de estados/propriedade e quatro contratos UI aprovados. Ocultar cancelado não modifica atendimento fechado. |
| 6: catálogo | Projeção pública aprovada com serviço, categoria, preço e checklist condicional; serviços complexos informativos sem permitir reserva incompleta | Cinco asserções SQL e dois testes de contrato. Serviço realmente arquivado permanece oculto; sincronização não o restaura. |
| 7: conta | Fluxo de motivo/exportação/ciência/encerramento, ZIP/PDF, tombstone, bloqueio de sessão, arquivo interno e outbox de bloqueio Auth | Parcial. Testes SQL, ZIP independente e concorrência promoção de funcionário × exclusão. Worker tem testes de identidade, filtro próprio, falha/retry e limites. Dois contratos UI 360/1440 aprovados após corrigir CSS que ocultava aviso e feedback mobile. Não implantado. Retenção/purge/scheduler não concluídos. |
| 8–10: navegação e privacidade | Voltar mantém sessão e destino Conta; Portal da Equipe textual; avisos e preferências essenciais versionadas | Cinco testes públicos e dois testes de sessão SDK simulada aprovados. Sem rastreadores opcionais e sem consentimento fictício. Identificação do controlador e políticas específicas pendentes. |
| 11: primeiro acesso | Rotas operacionais fora da entrada pública, fallback sem loader, aquecimento do módulo no acesso | Medição pareada local em 12 pares por viewport; resultados abaixo. Sem promessa de latência de produção. |
| 12–13: integração e testes | Três novos routers montados; permissões e auditoria conectadas; migrações testadas com migrador limitado | Replays históricos executam antes das novas migrations; cenários novos executam depois. Jornada integral Auth/API/Storage das correções ainda pendente. |
| 14: documentação | Histórico preservado no Livro e este checkpoint | Fecho final somente após resolver as lacunas. |

## Evidência disponível

- Suíte anterior: 317 testes Node/API aprovados; dois replays PostgreSQL com 1.157 linhas PASS. Rechecagem completa na retomada: dois bancos vazios com migrador limitado, 1.821 verificações no replay A e 1.827 no B, mais a linha de fecho = 3.649 linhas PASS. Inclui backfill, duas invariantes de categorias, bloqueio da abertura sem categoria e abertura categorizada pela RPC antiga em ambos os bancos. Não confundir linhas com cenários de negócio independentes.
- Rechecagem final Node/API: 322/322 aprovados. Build frontend/servidor aprovado; permanece aviso de chunk operacional maior que 500 kB. Cinco testes do worker aprovados com transporte simulado; não comprovam credenciais, gateway ou ban real do provedor.
- Novos contratos UI de exclusão: motivo obrigatório, ciência obrigatória, exportação vazia, continuidade, payload e preservação de sessão ao receber 503. Ambos aprovados em 360/1440 após falha mobile real: `.operation-security p` ocultava parágrafos; a compactação agora exclui `.account-closure`. Aviso inclui solicitação presencial, confirmação de identidade/titularidade e ausência de cobrança adicional por documentos pagos.
- A primeira reexecução completa de banco nesta retomada foi interrompida por esgotar o tmpfs de 512 MiB do container descartável; não contabilizada como sucesso. O laboratório foi ampliado para 1 GiB e a suíte reiniciada e aprovada. Nenhum banco hospedado foi envolvido.
- UI: quatro contratos de devolução aprovados após corrigir seletores de textbox; 14 contratos de solicitações aprovados na rodada integrada anterior. Público: cinco aprovados, dois de sessão inicialmente ignorados e depois ambos aprovados em servidor SDK dedicado. Nenhuma conta real alterada.
- Primeiro acesso: 12 pares AB/BA, navegador novo, cache desabilitado, mesmo servidor local sem compressão. Transferência pública de 1.351.244 para 646.444 bytes (−52,16%). Desktop: mediana FCP 376 → 358 ms; mobile 360×740: 376 → 334 ms. Amostras têm variação e não representam aparelho físico ou Vercel. A coleta anterior não pareada teve FCP pior e permanece preservada nos arquivos originais.
- Dados e sessões de fixtures somente em PostgreSQL descartável local. Nenhum cliente, documento, preço, aprovação ou nível real foi fabricado no ambiente hospedado.

## Histórico de pendências registradas em05/11 (superado progressivamente no fecho06/11)

1. Retenção: classificar documentos e finalidade/base legal por classe, marco inicial, prazo e suspensão por obrigação/litígio; definir descarte de dados sem fundamento. A LGPD (arts. 15 e 16) não determina cinco anos universais. O usuário retirou a premissa de cinco anos e pediu conformidade com a lei. As obrigações específicas do escritório ainda não estão identificadas; não executar expurgo indiscriminado nem retenção indefinida como política final.
2. Implementar gestão de políticas, prazos efetivos, legal hold, reserva/retry e expurgo transacional compatível com Storage/histórico; testar e agendar. As tabelas atuais são estrutura parcial, não automação concluída.
3. Configurar agendador e segredos do worker/outbox; validar gateway e revogação/bloqueio reais em laboratório Auth. O handler foi corrigido com RED/GREEN: acionamento interno exige JWT de servidor no Bearer e segredo independente em `X-Account-Closure-Secret`, mantendo `verify_jwt=true`. Segredo isolado, JWT sem segundo segredo e segredo errado são recusados. Nunca colocar a credencial de servidor no browser/Express ou no Git.
4. Confirmar filtros de clientes excluídos em todas as pesquisas e inclusão de documentos vinculados depois do encerramento no arquivo interno.
5. Conferir configuração hospedada de schemas expostos antes do rollout: somente interfaces públicas são publicáveis; helpers do schema privado não são API. A RPC pública antiga agora delega ao fluxo categorizado. Pedidos históricos sem categoria continuam cobertos por fixtures internas e pelas regras de escopo restrito.
6. Validar UI de coleta, exceção de transferência, quatro passos de exclusão, exportação e arquivo; executar jornada completa navegador/API/Auth/Storage e revisão final de segurança/regressão.
7. Identificação do controlador/canal de privacidade e políticas públicas definitivas dependem de dados reais do escritório; não inventar CNPJ ou contato.
8. Após validação, publicar via GitHub → Vercel sem Actions, conferir aplicação automática e comandos das migrations antes de qualquer reaplicação; conferir Edge, ACL/RLS, contagens, bundle e produção. Nenhuma conclusão de deploy nesta retomada.

Estado atual e publicação: consultar o fecho de06/11 e o primeiro registro do Livro; as lacunas acima descrevem o checkpoint original.
