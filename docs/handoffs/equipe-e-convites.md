# Equipe, convites e desligamentos

O painel **Equipe e convites** mostra as permissões efetivas das cinco pessoas da página. O Express compartilha uma verificação do Supabase Auth somente quando o mesmo token chega em requisições simultâneas. Uma nova requisição sempre pode revalidar a identidade, e as RPCs continuam conferindo a autorização no banco.

Ao vencer, o convite sai da listagem de trabalho. O Supabase Auth bloqueia a confirmação da credencial de convite vinculada ao prazo. A manutenção `jn-team-expired-invitations` executa no Supabase a cada dez minutos e remove contas provisórias ainda sem confirmação, senha, perfil, vínculo ou sessão. É possível criar outro convite para o mesmo e-mail. Convites aceitos têm a ação **Arquivar convite**. Os dois históricos ficam em **Configurações → Arquivados**.

O Super administrador pode excluir a conta de outro integrante, inclusive de outro Super administrador do mesmo escritório. O desligamento encerra o acesso, retira permissões e manda os atendimentos encerrados para Arquivados. Os atendimentos em andamento voltam à fila sem perder o histórico. Um caixa aberto precisa ser fechado antes do desligamento. Vínculos ativos em outros escritórios são preservados. Quando o último vínculo se encerra, a manutenção `account-closure` remove as credenciais do Auth e preserva a referência anônima necessária ao histórico de trabalho e ao financeiro.

## Avisos de desligamento

Configure `TEAM_NOTICE_RESEND_API_KEY` e `TEAM_NOTICE_FROM` nos segredos da Edge Function **account-closure**. O remetente precisa pertencer a um domínio verificado no Resend. O agendamento existente da função processa a fila com uma chave de idempotência por desligamento. A aba **Contas da equipe excluídas** mostra a situação do aviso. O endereço da fila é retirado após o envio ou após 30 dias. O estado **Aviso enviado** indica que o provedor aceitou a mensagem.

## Sequência de instalação

1. Aplicar `20261126194859_team_lifecycle_and_dashboard.sql` ao Supabase existente.
2. Atualizar a Edge Function `account-closure` com verificação de JWT.
3. Publicar o Express e o frontend pela integração GitHub → Vercel.
4. Conferir o agendamento no Supabase e a API na Vercel.
