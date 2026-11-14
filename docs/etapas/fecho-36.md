# Etapa36 — checkpoint da implementação

Pedido14/11/2026; baseaec9e86, Etapa35/fecho/Livro/AGENTS e manualDrive conferidos antes de modificar. O usuário autorizou manter chave pública, pastaexterna, responsável e teto de custos pendentes e editáveis. Esses campos estão em Configurações→Continuidade; não se atribuiu responsável/orçamento fictício nem se alegou backup configurado como executado.

## Implementação

Política privada por escritório com revisão, idempotência por ator/sessão/chave e gateowner+settings.access já existente, reconferido após lock. Nenhuma capacidade, função humana ou concessão individual criada. Duas tabelas comRLS/ACLfechadas, dois wrappersINVOKER e validação de chave pública também paraRPCdireta. API/Frontend usam o mesmo contrato;401/403limpa,409exige conferir,503preserva corpo/chave e bloqueia rota/logout/edição até retry. PadrãoEquipe/Convites, uma área de diagnóstico por vez, até4ações, atalhos35 preservados e semloaders.

request_id do servidor em respostas de sucesso/erro, sem confiar no ID do cliente. Logs mínimos de grupo/método/status/duração/request_id, sem query, nomes, corpos, tokens ou política. Falhas e lentidão registradas; sucessos amostrados1/20 para reduzir volume. Parser do teste de startup foi adaptado para selecionar o resultado entre os novos logsJSON, conservando a verificação de PDFKit/fontkitlazy. Faturamento de provedor ausente permanece desconhecido; cotas70/85 e teto nunca fazem upgrade. Kit externo suporta monitor, pack, upload criptografado com readback e verify; upload/agenda real ainda não executados.

Revisão independente apontou portabilidade do modoStorage e validaçãoRPCda pública; corrigidos antes de publicar e cobertos pelo exercício: modo padrão/fallback preservado, formatoDER/SPKIRSA≥3072 no banco, chavefraca2048/malformada/8050caracteres rejeitada. Ajuste no helper de laboratório garante limpeza de container mesmo se o start falhar. Nenhuma alteração de Auth/cadastro fora do exercício descartável.

## Exercício medido

[Relatório real do laboratório](../evidencias/etapa-36/restauracao-laboratorio.json): export494ms, restauração5.825ms, idade do snapshot ao concluir6.319ms. Banco e bytes recuperados:10.001clientes sintéticos,5Auth/5vínculos,1solicitação,1arquivo/objeto, obrigação12.345centavos;499FKsvalidadas e185tabelasRLS. ACLs de tabelas comparadas por privilégios canônicos(aclexplode), pois a ordem textual doarrayACL pode mudar no pg_restore sem alterar poderes. Novo loginAuthreal confirmou UID e senha; JWTanterior rejeitado403 após trocar chave do laboratório; cliente não acessouRPCowner. Storagevazio após sódump não forneceu bytes; upload dos bytes restaurados e download pela API comprovaram SHA256. Nenhuma fixture fora do laboratório.

20amostrasAPIreais locais,10requisições simultâneas, uma sessãoowner e10.001clientes:p50≈181ms/p95≈239ms, meta proposta2s atendida nesse recorte. Não representa10usuários distintos nem SLA do ambiente hospedado. MetasRPO24h/RTO8h são propostas editáveis; o exercício local não mede RPO/RTO operacional de produção.

Limites explícitos: destino externo durável e custódia privada pendentes; cópia usada no exercício ficou em outro diretório local, não em outra conta/provedor. Backup completo de produção não executado: acesso seguro ao dump/objetos não está vinculado ao executor. Agenda/canal de alertas/métricas oficiais também pendentes.128MiB de staging por pacote. Alvo restaurado foi outro banco do mesmo cluster local, com novas instâncias de provedores e rolesglobais reutilizadas. Não se testou restauração de produção entre projetos independentes nem login privado hospedado. Sem afirmar segurança de tokensrefresh antigos além doJWT efetivamente testado; revogação pelo procedimento oficial é necessária antes de reabrir recuperação real.

## Verificações e publicação

Node421aprovados, build/tipos e auditprodução0. UI28(navegação/loading/36)+52(portais/anexos/leitura34/privacidade)+7PWA35 aprovados; nova tela compactada conferida novamente8/8. Revisões/correções e limites acima são parte do fecho. Supabase antes de publicar:79migrations/última20261113140739;7Auth/7vínculos/92role_permissions/2clientes/3solicitações/0arquivos/0Storage. Migration36 aguardando conferência pósGit, nunca duplicar.

Publicação deve ser exclusivamenteGitHub→Vercel, semActions/deploydireto. Registrar retorno real antes de afirmarREADY. Checkpoint36: implementação preparada e laboratório aprovado, recuperação de produção permanece pendente por decisão informada do usuário. Não avançar37 por aparência.
