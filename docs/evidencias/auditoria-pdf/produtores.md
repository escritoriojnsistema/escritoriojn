# Cobertura dos produtores reais de auditoria

Revisão do código vigente das migrations e do catálogo PT-BR, preservando os módulos publicados. O teste `audit-formatting` inspeciona os emissores literais e as famílias dinâmicas; não basta uma opção no filtro para declarar integração.

| Área existente | Mutações com produtor transacional real | Observação |
| --- | --- | --- |
| Clientes e origem pública | criação/edição de ficha, entrada pública confirmada, atribuição/revogação, representação, conferência/revogação de identidade e mesclagem | Referências técnicas; cadastro/contato/evidências não entram em changes. |
| Serviços | criação e publicação de versão | Versões e snapshots históricos preservados. |
| Atendimentos | abertura, etapa, transferência, retomada, triagem e nota | Nota interna não é copiada para auditoria. |
| Cobranças | criação, ajuste e cancelamento | Nesta entrega, acrescentados atendimento, obrigação/variação em centavos e versão oficiais ao evento existente. |
| Caixa e pagamentos | configuração, abertura, recebimento manual, reembolso, estorno, conciliação e fecho | Nesta entrega, acrescentados referência do lançamento/obrigação/atendimento, valor, conferência e versão; nenhum motivo livre ou dado de conta pessoal. |
| Equipe e permissões | convite, início/resultado de envio, conferência/aceite/revogação, acesso, delegação/revogação | Catálogo de permissões expandido para as duas capacidades específicas; nenhuma concessão individual automática. |
| Conta | alteração própria, pedido/aplicação de correção e confirmação oficial de e-mail | Dados anteriores/propostos permanecem privados; changes não recebe nome, CPF ou e-mail. |
| Anexos | intenção de upload, autorização de consulta, políticas, planejamento/retomada de limpeza e etapas de processamento | Sem conteúdo de documento nem URL privada no evento. |
| Checklists | modelo, aplicação e decisão de item | Autor/resultado/registro correlacionáveis com o histórico do módulo. |
| Notificações | criação associada às transações de atendimento/checklist/cobrança/pagamento; primeira leitura agora também emite evento próprio | Novo produtor `notifications.read`: só referência técnica. Repetir leitura não duplica evento. Abrir sino/consultar resumo não é mutação. |
| Arquivados genéricos | arquivamento/restauração de acesso | Continua somente memberships; auditoria não é inserida nessa tabela. |
| Auditoria | preparação do snapshot, registro do relatório e alteração de política | Snapshot/política/selo append-only. Selo autenticado é registro informativo; verificação regenera o PDF canônico. |
| Configuração/acesso inicial | provisionamento do proprietário e configuração/cadastro público | Sem novo produtor fictício de login ou módulos ainda não existentes. |

As operações comerciais existentes são os serviços/itens dos atendimentos, cobranças e pagamentos acima. Não foi criado um módulo fictício de vendas nem declaradas concluídas as futuras etapas15–40. Funções auxiliares de escrita (captura de snapshot, preparação de e-mail, composição de itens e avisos) integram a transação do produtor principal; não duplicam uma segunda trilha artificial.

O PDF traduz ações, resultados, funções, permissões, campos e datas. Códigos canônicos permanecem disponíveis no detalhe técnico recolhido do aplicativo; o relatório padrão conserva referências por IDs e descrições em português.
