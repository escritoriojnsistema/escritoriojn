# Procedimento de continuidade36

## Configuração e responsabilidade

Superadministrador com settings.access no escritório: Configurações → Continuidade → Configuração. Grupos Responsável e limites, Backup e recuperação, Previsão de crescimento. Campos vazios ficam pendentes e podem ser alterados depois. Metas propostas24hRPO/8hRTO e retenção7diárias/4semanais são editáveis, não garantias do plano. Salvar não agenda cópias nem valida recuperação. Exportar configuração entrega JSON privado para o executor, sem credencial/chave privada.

Responsável operacional: a ser indicado pelo usuário. Até lá, não existe atribuição inventada a uma pessoa/conta. Revisar configurações, inventários, cotas e restauração após mudanças relevantes; decidir uma janela diária e confirmar custódia e acesso externo. Configuração não contém senha, token, service_role nem chave privada. Esses bindings são feitos em cofre/ambiente do executor, foraGit e foraVITE. Não restaurar sobre o projeto principal.

## Quotas, custos e alertas

Supabase observado no planoFree; limites contratuais e tetoVercel não foram assumidos. Preencher cotas atuais do contrato para banco/arquivos/transferência/e-mails/execuções e orçamento/moeda. O painel informa medidas do próprio escritório; bytes declarados de public.files não são medição física/fatura do Storage. Uso do provedor desconhecido não aparece como zero nem verde. Zero explícito de orçamento/cota alerta qualquer consumo positivo.

Executor externo pode ler exportações oficiais dos provedores em JSON com observed_atISO, periodYYYY-MM corrente, currencyUSD/BRL e database_bytes,storage_bytes,transfer_bytes,email_count,execution_count,cost_cents (inteiros≥0; valores ausentes são desconhecidos). Não converter moeda silenciosamente. Rodar:

```sh
node --import tsx scripts/continuity36.mjs monitor configuracao.json medicoes.json
```

SaídaJSON semPII:70%warning,85%critical,100%exceeded;exit2 quando há alerta,exit3 quando falta medição/cota ou período está obsoleto,exit0 só com todos conhecidos dentro dos limites. O integrador deve encaminhar a saída ao responsável/canal contratado; não há envio automático de e-mail/Slack nem upgrade. Cadastro de cotas não cria monitor de faturamento. Agendamento externo e canal estão pendentes.

Crescimento estimado=documentos/mês×bytes médios×meses×cópias por versão; somar capacidade externa para backups/7diárias/4semanais. A estimativa não é consumo medido nem contrato. Limite atual do empacotador:128MiB de arquivos em staging. Exceder interrompe, sem backup parcial. Antes desse limite, homologar streaming/nova versão ou mecanismo suportado pelo provedor; nunca excluir tabelas/objetos para caber.

## Captura e cópia externa

O navegador não executa dump e não recebe chaves privadas. Preparar staging privado0700 fora doGit, em janela consistente: suspender escritas/apagamentos de negócio, exportar banco, listar/copiar todos os objetos com paginação e reconferir inventário/metadados/hashes antes de encerrar a janela. Se objetos mudarem ou faltarem, falhar e repetir a captura; dump sozinho não recupera bytes. Não usar consultasJSON do conector como substituto de dump.

Formatos aceitos: database.dump (pg_dump custom completo compatível com o alvo) OU database/roles.sql + schema.sql + data.sql do mecanismo oficialSupabase. CLI3.1.0 inspecionada com `supabase db dump --help`: alvo remoto usa `--remote`, seleção por `--schema`, modos `--role-only`, `--data-only --use-copy` e saída `--file`. CLI2 usa outros flags: conferir a versão/help antes de executar. Não passar senha/URL credenciada em argumentos visíveis; usar o fluxo/binding seguro do executor. A captura de produção não foi executada nesta rodada por ausência desses bindings.

Incluir roles/ACL/RLS/funções/constraints e Auth pelo procedimento oficial compatível. Não confiar que o dump transfira configurações de Auth, SMTP, JWT, StorageS3 ou EdgeFunctions. Guardar separadamente no cofre o procedimento para novos segredos, provedoresOAuth/SMTP, redirects, roles de login, bucketsprivados, EdgeFunctions e domínios. Reautenticar/revogar sessões antigas pelo procedimento oficial antes de reabrir. Não transportar sessão/token como autoridade do novo ambiente.

Staging também contém:

- config.json com exatamente source(laboratory|production),git_commitSHA40,migrations(lista de nomesSQL),provider_configuration(separate_required). Configuração não secreta de deploy/rotas/Edge fica no commitGit referido. Nenhuma chave/senha é aceita nesse JSON.
- storage.json:lista de objetos com bucket,object,file,size_bytes,sha256. file=`objects/<hashSHA256>`; cada objeto deve possuir bytes correspondentes, sem sobras ou duplicidade de identidade. Inventário real é privado e só integra a cópia criptografada.
- objects/<hash>: bytes completos, inclusive quarentena/restrições; backup não altera scanner, assinatura, pagamento ou gates de entrega.

Gerar um parRSA≥3072bits em ambiente/cofre do responsável. A aplicação guarda apenas a chave públicaSPKI/PEM. Custodiar a privada fora do projeto principal e foraGit; testar acesso pelo responsável substituto. Sem pública a rotina para, sem fabricar chave/custódia durável.

```sh
node --import tsx scripts/continuity36.mjs pack staging copia.jnbackup configuracao.json
node --import tsx scripts/continuity36.mjs upload copia.jnbackup copia.jnbackup.receipt.json configuracao.json remoteDrive
```

pack gera arquivoAES256GCM, chave envelopadaRSA-OAEP-SHA256, manifesto por arquivo e reciboSHA256. upload exige rclone previamente configurado de forma privada, pastaDrive informada e hash do recibo correspondente; somente o ciphertext é enviado, seguido de leitura e comparação de hash. Falha nunca vira cópia confirmada. A conta/destino devem sobreviver à perda do projeto principal. Manter recibo/hash independente do local do ciphertext e manter a privada em custódia separada. rclone e destino durável não foram configurados/executados nesta rodada, por decisão do usuário.

Somente após upload+readback bem-sucedidos aplicar retenção7diárias/4semanais conforme política do responsável. Nunca apagar a última cópia válida, cópia sob retenção legal ou a anterior antes de a nova ser verificada. Não há limpeza destrutiva automática nesta implementação. Agendar externamente ao GitHub/Vercel (semActions); interromper agenda e alertar quando export/cifra/cópia/verificação falhar. Registrar início/fim/hash/conteúdo/resultado sem nomes/caminhos privados no log público.

## Restauração e contingência

Baixar ciphertext do destino externo; comparar SHA256 com recibo independente antes de decifrar. A ferramenta não aceita destino existente, path livre de arquivo, symlinks ou conteúdo sem manifesto/hash válido; AESGCM é autenticado antes de escrever qualquer arquivo extraído.

```sh
node --import tsx scripts/continuity36.mjs verify copia.jnbackup diretorio-novo chave-privada.pem SHA256_DO_RECIBO
AUTH_LAB_STORAGE_ROOTFS=/dev/shm/jn-storage24-root node --import tsx scripts/test-continuity36.mjs
```

O primeiro comando só decifra/verifica staging; não executa SQL. O segundo cria exclusivamente laboratório descartável e não aceita URL de destino. Sem a variável usa imagens oficiaisDocker; a variável é a alternativa existente para rootfsStorage oficial já verificado quando DockerVFS não comporta a imagem. Não usar rootfs desconhecido. O runner restaura para outro banco do cluster descartável e sobe novas instânciasAuth/REST/Storage; reutiliza as roles globais de base do laboratório. Não é homologação de restauração entre projetos/contas independentes.

No alvo isolado de recuperação real, seguir o mecanismo oficial para versões compatíveis, roles, schema e dados; nunca prosseguir ignorando erro. Restaurar bytes pela APIStorage/S3 apropriada, além dos metadados. Conferir contagens/FKs/totais financeiros, ACL/RLS, função atual, login real com novo JWT e negação de sessão antiga/contaalheia, inventário e SHA256 de todos os arquivos. Só abrir operação após o responsável conferir o relatório. Nenhuma versão comercial/assinatura/scanner é aprovada por restaurar.

Sem rede/falha: bloquear confirmações de pagamento e entrega; preservar as tentativas503/chaves/corpos em memória e reconsultar a autoridade vigente ao retornar. Registro temporário controlado não é pagamento confirmado. Reconciliar pelo fluxo original, por lote acompanhado, sem inventar receita/documento/liberação. RPO/RTO de produção devem ser medidos com agenda/destino reais; desvio demanda plano e novo exercício, sem promessa de latência zero.
