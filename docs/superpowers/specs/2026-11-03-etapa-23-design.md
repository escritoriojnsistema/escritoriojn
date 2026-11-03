# Etapa 23 — revisão editorial de documentos

Fonte: cartão oficial `etapa-23.md` do Drive, id `1bIQImuHVK35cpVQsZdMe-m3RxKwEoo12`, consultado em03/11/2026. Pedido atual autoriza implementação, Supabase e publicação GitHub→Vercel. Base39b00ee:22publicada e revisão corretiva03/11 preservadas.

## Arquitetura e escolhas

Reutilizar `document_publications`, seus eventos, comandos idempotentes, versões22, editor21 e caixa/entrega existentes. Acrescentar encaminhamento, devolução e retirada como eventos editoriais append-only. Uma estrutura paralela de approvals duplicaria a autoridade; substituir o workflow eliminaria decisões/integrações já publicadas. A extensão do fluxo existente é a escolha adotada.

- Permissão própria `documents.review`, seed somenteowner, concedível e delegável pelos mecanismos existentes de Equipe/convites. Leitura e escopo documental21 continuam obrigatórios. Nenhuma concessão individual automática.
- Encaminhar fixa a revisão preparada exata; responsável opcional é integrante elegível do mesmo escritório (sem seleção significa fila compartilhada de revisores autorizados). Prazo interno é opcional, não aprova nem libera automaticamente.
- Decisões `approve`, `reject`, `return`, `withdraw` exigem motivo, revisão exata e evento esperado. Apenas uma decisão encerra cada análise; disputa/replay conflitante retorna409. Uma devolução/rejeição exige correção/nova revisão; retirada pode ser reencaminhada explicitamente sem alterar conteúdo.
- Não permitir autoaprovação por autor, preparador ou encaminhador. Somenteowner pode acumular quando a política capturada do serviço admitir. Revisor designado precisa de capacidade/escopo atuais; proprietário supervisiona a fila. A delegação existente pode expirar/revogar e será revalidada apóslocks.
- Fila na aba **Revisões** do HubDocumentos, pesquisa/filtro/paginação3mobile/5desktop. Exibir responsável, revisão, prazo, pendências e observação interna. Abrir reutiliza editor único; ações secundárias permanecem na sidebar; seletor de ação+um botão no editor.
- Histórico editorial paginado no mesmo painel. Nova versão nunca herda aprovação. Devolução, rejeição e retirada bloqueiam arquivo final, mesmo em serviço com revisão dispensada.
- Notificações transacionais no inbox existente, únicas por destinatário/tipo/evento. Cliente recebe somente resultado público e protocolo, sem motivos internos, autores, conteúdo ou anexos. Minhas solicitações mostra resumo editorial seguro por documento; nenhuma decisão muda pagamento, assinatura ou entrega.
- Tabelas/eventos privados, RLS/ACL e wrappersINVOKER. Preservar renderers/PDFs e worker; guards existentes consultam a decisão editorial atual. Índice parcial para último evento editorial; projeções bounded/paginadas, semN+1decatálogo nem cache de autoridade.

## Aceite e limites

Jornada obrigatória: preparar→encaminhar→devolver com observação→corrigir/nova versão→encaminhar→aprovar; conferir Minhas solicitações, conflito/replay, autoaprovação proibida e permissão expirada/revogada. Testar rejeição e retirada separadamente. Frontend/API/SQL/Auth reais locais, mobile320/360/768/1440, build, preservação financeira/PDF e conferência hospedada. Não ativar assinatura24, exceções novas, IA ou integrações externas. Zero atraso de rede não é promessa verificável; medir consultas locais e manter transições semloader.
