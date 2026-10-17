# Acesso, equipe, auditoria e privacidade

Referência de negócio e integridade. Leia apenas este arquivo quando a etapa o indicar; decisões vigentes abaixo prevalecem sobre propostas antigas.

### Decisões vigentes incorporadas ao recomeço
A identidade visual é azul-marinho, claro e dourado, conforme decisão D05 registrada no projeto; marrom do PDF antigo deixa de ser padrão. Não copiar a marca verde, o catálogo de alimentos ou identidades do HortiVitalMix. Acesso interno continua separado do cliente e da administração técnica.
A página pública prioriza a entrada do cliente; acesso da equipe permanece por ícone no cabeçalho, com nome acessível e alvo de toque adequado, conforme a revisão visual registrada. A equipe usa sidebar no desktop e Caixa/Pedidos/Clientes no mobile apenas conforme capacidades; funções futuras não são apresentadas como prontas.
Excluir significa arquivar e permitir restauração, quando a regra do registro admitir. Eventos oficiais permanecem append-only; arquivar é metadado de visualização/referência, sem apagar o evento original. Restaurar registro não reativa conta, permissão, vínculo expirado ou versão substituída. Cadastros referenciados não somem por cascata. Criar archive.manage por escopo e não duplicar payload integral em outra tabela.
Consulta de capacidade comercial e verificação de sessão devem formar um contrato único reutilizado na operação, com estado vigente. Reutilização vale dentro da requisição/operação, nunca cache global de poderes entre usuários. Em operações críticas, verificar novamente após lock e antes de emitir/entregar. JWT assinado, getSession bruto e metadata têm papéis distintos: somente identidade verificada e autorização atual permitem ação.
Evitar hierarquia de papéis técnicos/helper para cada tela. Primeiro usar RLS e funções de domínio invoker. Quando helper privilegiado for indispensável, isolá-lo e testar ACL/EXECUTE com migrador semelhante ao hospedado, sem superusuário. Não conceder leitura genérica de auth.sessions aos papéis da API; se exigida revogação imediata, encapsular verificação mínima restrita sem escrita no schema Auth. Função não pode confiar em user_id/office_id enviado como autorização.
Cadastro público cria somente cliente, com confirmação e perfil mínimo. Não atribui funcionário/proprietário nem vincula acervo por CPF/e-mail. Conferência pela equipe libera a identidade/vínculo conforme política; permissões de consultar, conferir e configurar regras de documentos são independentes. Configuração de acesso só por proprietário/administrador expressamente autorizado. Sobrescrita documental fica ligada à versão e não remove partes principais sem decisão específica.


Proposta de implementação: proprietário, administrador delegado, funcionário e cliente são papéis comerciais. Superadministrador é capacidade técnica separada, concedida com escopo explícito. O proprietário recebe capacidades comerciais previstas, não poder implícito para alterar banco e segredos.

| Capacidade | Proprietário | Admin delegado | Funcionário | Cliente |
| --- | --- | --- | --- | --- |
| Gerir usuários comerciais | Sim | Se concedido | Não | Não |
| Consultar clientes | Conforme finalidade | Conforme escopo | Atribuídos/autorizados | Somente próprios dados expostos |
| Consultar pedidos | Todos autorizados | Escopo concedido | Criados ou atribuídos | Próprios pedidos autorizados |
| Criar documentos | Se habilitado | Se habilitado | Se habilitado | Não |
| Aprovar conteúdo | Sim | Se concedido | Não por padrão | Não |
| Confirmar recebimento | Se habilitado | Se concedido | Próprio caixa habilitado | Não |
| Autorizar exceção financeira | Sim | Se concedido expressamente | Não | Não |
| Consultar caixas | Todos | Se concedido | Próprio | Não |
| Executar CCIR/CAR reservado | Sim | Não por padrão | Não | Não |
| Baixar versão final | Conforme regra | Conforme regra | Conforme regra | Vínculo válido e versão liberada |
| Consultar auditoria | Escopo autorizado | Se concedido | Não por padrão | Não |

Permissões são códigos estáveis, por exemplo users.manage, customers.read_assigned, requests.read_all, cash.read_own, documents.approve, releases.override_payment. Códigos não implementados não concedem funções fictícias.
Decisão de acesso combina pessoa autenticada, conta ativa, vínculo ativo ao escritório, capacidade, relação com registro e estado da operação. Padrão: negar. Permissões de outro escritório nunca valem no escritório atual. Registrar unidade desde o começo mesmo se houver só uma; expansão para várias unidades é futura.
Proposta: exceções individuais são concessões explícitas; ausência de concessão nega acesso. Evitar mecanismo complexo de allow/deny sobrepostos na primeira entrega. Mudança de capacidade aplica-se na próxima operação protegida, sem esperar renovação de JWT.

RF-01: login individual, logout, recuperação de acesso, expiração e mensagens sem revelar se e-mail está cadastrado. Funcionário entra por convite/configuração administrativa; não existe cadastro público que escolha papel administrativo. Cadastro cliente simples começa na etapa 04; acervo e portal completo são concluídos nas etapas 31 e 32.
Supabase Auth guarda credenciais; banco de aplicação não armazena senhas. Validar identidade no servidor com método verificador suportado, conforme documentação da versão; getSession sozinho não comprova autenticidade [F3]. Metadados editáveis pelo usuário nunca definem papel ou autorização.
Desativação comercial bloqueia operações pelo banco mesmo com token válido. Revogação de sessões complementa o bloqueio; esconder menu ou excluir conta de Auth não basta. Histórico conserva identificação do autor desativado. Não apagar cascata de lançamentos e decisões ao desligar alguém.
Decisão preservada do projeto: não exigir autenticador, QR, TOTP ou AAL2. Usar senha, confirmação de e-mail e limitação de abuso, sem reintroduzir MFA por padrão. Uma exigência futura depende de nova decisão explícita. Configurar URLs de retorno em allowlist; impedir redirecionamento aberto. Testar callback, troca de senha e recuperação expirada/reutilizada.
Páginas privadas e respostas com renovação de cookie não podem ser compartilhadas por cache/CDN. Log não inclui token, senha, CPF integral ou documento. Operações sensíveis exigem autorização atual; CSRF, origem da requisição e validação de entrada devem ser tratados conforme o mecanismo adotado.
Primeiro proprietário nasce de rotina administrativa executada pelo operador autorizado, com UUID de Auth explícito, verificação de identidade e auditoria. Nunca conceder poder ao primeiro visitante ou ao e-mail fornecido pelo próprio navegador.

RF-02: RLS nas tabelas expostas e políticas explícitas para SELECT, INSERT, UPDATE e DELETE. Separar permissões SQL de políticas de linha; possuir GRANT não torna uma linha acessível sem regra. UPDATE valida linha antiga e valores novos, impedindo trocar office_id, responsável ou proprietário para contornar segurança [F4].
Tabela de vínculo ativo e autorização atual deve ser consultada sem criar recursão entre policies. Preferir helper de leitura restrito, documentado e testado. Quando SECURITY DEFINER for indispensável, usar schema privado, search_path fixo, nomes qualificados, execução revogada de PUBLIC e concessão mínima; validação de auth.uid(), conta ativa e escopo continua obrigatória. Não usar o recurso só para apagar erro de permissão.
Views expostas respeitam contexto do usuário, por exemplo security_invoker quando suportado. Rotinas e triggers não podem aceitar author_id, papel ou office_id arbitrário como prova de autorização. Segredo/service_role não vai para frontend; não utilizar cliente privilegiado como caminho normal que ignora RLS.
Buckets privados, caminhos opacos e metadados relacionam arquivo ao atendimento/versão. Conhecer UUID ou caminho não concede acesso. Download final passa pela decisão central de liberação; acesso ao material de trabalho é capacidade interna distinta.
Proposta: link assinado de até 60 segundos onde bastar, com risco residual documentado: durante sua validade o link pode continuar utilizável depois de uma revogação. Para revogação imediata, servir arquivo por endpoint autenticado que revalida a cada pedido; nenhum mecanismo recupera cópia já baixada.

Evento registra id, escritório, ator derivado da sessão, ação, tipo/id do registro, resultado, horário UTC, request_id e mudanças estritamente necessárias. Eventos de negócio críticos são produzidos no servidor ou trigger, junto da transação. Usuário comum não pode criar auditoria oficial com autor inventado, nem editar/apagar eventos.
Auditoria é resistente a alteração pela aplicação, não imutável contra administrador do banco. Proteção adicional pode incluir exportação assinada, segregação de acesso e monitoramento. Falha em gravar auditoria crítica deve impedir a operação crítica ou utilizar mecanismo durável comprovado; não descartar silenciosamente.
RF-03: login e eventos de segurança são registrados pelo provedor e/ou servidor; transações financeiras, permissões, aprovação, assinatura, entrega e acesso excepcional possuem rastreabilidade própria. Consulta de documento sensível ou exportação em massa deve gerar evidência proporcional ao risco.
LGPD: inventário de tratamento por finalidade, dados coletados, responsáveis, base legal adequada, destinatários, prazo, proteção e mecanismo de atendimento ao titular [F5]. Dados de saúde e biometria exigem tratamento específico; não usar um checkbox genérico de consentimento como solução universal.
Responsável jurídico define retenção por classe: cadastro, atendimento, processo, documento, financeiro, auditoria e backup. Exclusão lógica preserva histórico quando necessário; eliminação definitiva é controlada, incluindo arquivos e expiração das cópias de segurança, respeitando retenção legítima e bloqueio judicial.
Fluxo do titular: pedido, verificação de identidade, avaliação, resposta e registro. Plano de incidente define triagem, contenção, preservação de evidências, avaliação e comunicações legalmente cabíveis conforme regras vigentes. Não exportar dados reais para ambientes de teste.
