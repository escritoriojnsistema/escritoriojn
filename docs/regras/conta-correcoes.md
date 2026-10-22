# Conta e correções cadastrais

Extensão solicitada após12, sem nova etapa numerada nem outro cadastro/login.

| Operação | Equipe | Cliente |
|---|---|---|
| Consultar própria Conta | Vínculo/sessão ativos | Vínculo/sessão ativos |
| Salvar próprios nome/CPF | Owner, admin, funcionário | Via proposta em solicitação |
| Alterar e-mail | Preparar em Conta e confirmar pelo Auth | Aprovação da equipe e confirmação do titular |
| Consultar propostas | requests.read + accounts.corrections.read | Somente sua proposta |
| Aplicar dados do cliente | Consulta + accounts.corrections.apply e responsabilidade atual | Não |

Owner recebe as duas capacidades pelo perfil. Administradores e funcionários dependem de concessão explícita em Equipe; requests.read é pré-requisito. A consulta não concede aplicação. Retomada continua restrita a owner/admin com requests.reclaim; antigos responsáveis acompanham sem editar. Ao revogar consulta, a proposta e seus avisos pessoais deixam de ser apresentados.

Conta usa public.profiles, Auth e armazenamento privado de CPF. Campos de autoridade são informativos. Nome/CPF atualizam vínculos da própria identidade; fichas usam identidade08 explícita vigente, com prioridade sobre a FK de origem cadastral. Não associar por nome, CPF ou e-mail. Ficha mesclada/bloqueada sem vínculo substituto explícito exige revisão; nunca seguir sua mesclagem para alterar outra pessoa. Proveniência técnica continua sem aprovação de identidade/documentos.

CPF legado de equipe existe apenas como hash/máscara; não há como recuperar o número original. A edição aceita número completo válido. Novas conferências de convite retêm o número completo validado em tabela privada, sem trocar um CPF já conhecido. Isso não comprova identidade nem autoriza cruzar contas.

Cliente abre formulário preparado por Conta → Solicitar correção. Enviar aparece após alteração; versão, tentativa idempotente e protocolo10 protegem o envio. Há uma correção aberta por conta. A equipe confere valores, pode ajustá-los e aplica com histórico. Dados anteriores, propostos e aplicados ficam preservados sob consulta autorizada. Nenhum valor pessoal vai em título, aviso, URL ou audit.changes.

E-mail aprovado permanece pendente até confirmação oficial pelo titular, conforme as regras do Supabase Auth. O e-mail de acesso atual continua válido até essa confirmação. A intenção pendente participa da versão para impedir sobrescrita por outra aba. Auth atualiza contatos explicitamente ligados e consolida eventual contato secundário igual ao destino, preservando os demais. Cancelar após aplicação não desfaz nome/CPF já aplicados; cancela a troca de e-mail ainda pendente e preserva o histórico.

Seletores distinguem a própria membership pelo servidor, mostrando Atribuir a mim. Outras pessoas aparecem com nome, função e elegibilidade; transferência de correção exige também consulta cadastral. Protocolos de atendimentos comuns e correções usam o mesmo contador transacional.
