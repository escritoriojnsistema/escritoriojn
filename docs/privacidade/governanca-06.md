# Governança inicial de privacidade — Etapa06

Escopo: nova base Escritório JN, React+Vite/Express/Supabase/Vercel. Inventário inicial técnico; o controlador é o escritório. O proprietário designa responsáveis por privacidade, jurídico e incidentes antes da operação com dados reais. Não atribuir função a uma pessoa pelo e-mail cadastrado. Não inserir dados pessoais reais, evidências ou solicitações neste repositório.

## Inventário de tratamento

| Classe | Dados e localização | Finalidade e acesso | Ciclo atual |
| --- | --- | --- | --- |
| Identidade/autenticação | Supabase Auth: e-mail, credencial gerida pelo provedor, confirmação e sessões; SDK guarda sessão oficial no navegador | Autenticar e recuperar acesso; senha/tokens nunca entram na auditoria de negócio | Logout local/revogação e bloqueio comercial; sem exclusão automática de conta |
| Cadastro e acesso | profiles/memberships/roles/permissions; nome e vínculo por escritório, função e capacidades | Autorizar operação com RLS/RPC e sessão vigente; gestão por owner/admin delegado | Desativação preserva referências; cliente não concede função de equipe |
| Convites/identidade de equipe | Tabelas privadas: nome, e-mail, CPF apenas bcrypt/sal/máscara, papel, escopo, prazo e conferência | Convite autorizado, conferência e aceite; CPF integral só transita no envio TLS e não persiste no frontend | Convite até7dias; conferência15min; tentativas5/15min; expiração de autorização não equivale a apagar registro |
| Auditoria | audit_events: ator/IDs, escritório, ação, horário UTC, resultado, request_id e alterações mínimas permitidas | Rastrear ações/segurança; consulta audit.read por escritório; JSON exige também audit.export e registra quantidade/ator | Append-only para aplicação; sem edição, exclusão ou purge automático; operador de banco continua tecnicamente capaz de alterar, sujeito à governança |
| Arquivados | private.archived_records: escritório, vínculo/UUID, atores e datas de arquivar/restaurar | Exclusão lógica operacional com referência mínima; archives.manage, criação também users.manage e escopo de gestão | Arquivar desativa; restaurar referência não reativa acesso nem apaga auditoria; FK RESTRICT preserva negócio |
| SMTP | Supabase custom SMTP existente; destinatário e mensagem enviados ao provedor configurado | Entregar confirmação, recuperação e convite autorizado | Templates mantidos nesta etapa; nenhuma cópia de senha SMTP ou e-mail real em testes |
| Exportação | JSON autorizado baixado pelo próprio usuário | Conferência administrativa por escritório, até1000 eventos/filtros | Não cria arquivo no Storage/CDN; controlador governa compartilhamento e descarte da cópia baixada |
| Infraestrutura/backup | Supabase e Vercel/GitHub, logs técnicos sem corpos sensíveis | Hospedagem, build, recuperação e rastreabilidade de versões | Nenhuma política de backup ou retenção do provedor foi alterada; responsável deve conferir contrato/plano e restaurabilidade |
| Atendimento/processo/documento/financeiro | Módulos futuros, ainda sem tratamento nesta base | Inventariar antes da respectiva etapa | Sem tabelas, dados ou prazos fictícios nesta06 |

Operadores/suboperadores conhecidos: Supabase, Vercel, GitHub e o provedor SMTP já configurado. A definição jurídica de bases legais, transferências, comunicação de privacidade e obrigações contratuais é do controlador com orientação jurídica; não foi presumida a partir desta implementação.

## Classes e decisão de retenção

Cadastro, atendimento, processo, documento, financeiro, auditoria, exportações e backups são classes distintas. Para cada classe o responsável registra: finalidade/base aplicável, evento inicial da contagem, prazo justificado, responsável aprovador/data, bloqueio por obrigação ou litígio, método de eliminação/anônimização e destino dos backups. Estado inicial: **prazo jurídico pendente de definição pelo controlador**; não há agendador de purge nem prazo genérico de eliminação.

Arquivar é reversível e preserva histórico. Restaurar apenas a referência não autoriza login. Uma reativação posterior deve passar por Equipe, com função/permissões atuais e auditoria. Exclusão física de Auth não é rotina de desligamento: referências RESTRICT impedem perda em cascata. Solicitação legítima de eliminação exige análise por classe; não usar DELETE CASCADE, reset ou expiração de convite para cumprir a solicitação.

Modelo de registro de classe (preencher em ambiente administrativo restrito): código da classe; responsável; fundamento avaliado; início/prazo; justificativa; aprovação; hold e motivo; revisão; destinação; prova do procedimento; impacto em backups. Bloqueio judicial/legal prevalece até liberação autorizada. Sem alteração automática enquanto não existir política aprovada e mecanismo testado.

## Solicitação de titular

Registro inicial: nenhuma solicitação real foi recebida/registrada nesta implementação. Modelo operacional, sem tela/CRUD público de titulares nesta etapa:

1. Receber por canal oficial do escritório e abrir protocolo aleatório, data, tipo de solicitação, canal de retorno e responsável. Guardar conteúdo em ambiente restrito; nunca em Git, chat ou audit.changes.
2. Verificar identidade por canal já confirmado e procedimento proporcional ao risco. Nome/CPF não são segredo nem prova única; não solicitar senha, token ou link de recuperação. Registrar apenas método, responsável e resultado, não cópia desnecessária de documento/CPF.
3. Mapear os dados do próprio titular por escritório/classe, conferir obrigações, retenção e eventual hold; documentar decisão fundamentada e aprovação. Impedir consulta a dados de outras pessoas/escritórios.
4. Preparar resposta ou correção/portabilidade/eliminação permitida por classe. Dois responsáveis conferem destino e identidade antes da entrega; dados de terceiros devem ser removidos.
5. Responder no canal verificado dentro do prazo aplicável definido pelo responsável jurídico; registrar data, decisão, responsável, comprovante restrito e encerramento. Falha ou recurso mantém protocolo aberto, sem prometer eliminação que não ocorreu.

Campos do registro: protocolo; recebido_em; canal; categoria; responsável; estado (recebida/conferência/análise/resposta/concluída); método_conferência e resultado; classes/escritórios envolvidos; decisão/aprovador; prazo aplicável; respondido_em; evidência restrita; próxima revisão. Nenhum dado real de titular incluído aqui. Registro de negócio automatizado desse fluxo fica para módulo explicitamente autorizado.

## Plano de incidente

- Preparar: owner nomeia coordenador, técnico, jurídico/privacidade e substitutos; mantém contatos fora do repositório e acesso mínimo aos painéis. Conferir backup/restauração e canais de plantão conforme plano contratado.
- Detectar/triagem: abrir protocolo, início/detecção, sistemas/classes/escritórios afetados, fonte, impacto e responsável. Preservar IDs de evento/request/commit/deploy, sem copiar tokens, senhas, CPF ou corpos de requisição para logs.
- Conter: bloquear o vínculo/sessão comprometido conforme autoridade atual, restringir integração atingida e preservar evidências. Não apagar auditoria, conta ou tabelas; não compartilhar credenciais durante investigação.
- Investigar: registrar linha do tempo UTC, causa, alcance, hipóteses confirmadas e ações. Acesso a evidências restrito e rastreável. Restaurar backup só após validação em ambiente isolado; rollback de código preserva dados.
- Comunicar: responsável jurídico/controlador avalia obrigação, conteúdo, destinatários e prazos aplicáveis para titulares/autoridades. Nenhum envio automático ou afirmação de prazo legal foi implementado.
- Recuperar/encerrar: corrigir causa, testar autorização e negócio ponta a ponta, publicar versão rastreada, monitorar recorrência, documentar decisão de encerramento e revisar política. Retenção/hold das evidências depende da orientação responsável.

Registro de incidente: protocolo, severidade/justificativa, responsável, detectado_em, sistemas/classes, decisões de contenção, linha do tempo, evidências restritas, avaliações/comunicações autorizadas, versão corrigida, verificação, encerramento e prevenção. Estado inicial sem incidente real cadastrado por esta entrega.

A leitura de Arquivados resolve o nome vigente pelo vínculo no mesmo escritório, sem duplicar nome/CPF/e-mail na tabela de referências. O arquivamento também invalida convites pendentes destinados à identidade para impedir reativação por link anterior após restaurar. A auditoria de exportação registra a preparação autorizada do lote; um download cancelado no navegador não elimina esse evento. Respostas atrasadas são descartadas ao sair do módulo/trocar identidade ou perder capacidade.
