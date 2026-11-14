# Etapa36 — continuidade, monitoramento e restauração

Base aec9e86/Etapa35 publicada conferida antes de alterar; manualDrive134-bqj8u8fJKggkxpJpi33homRPomwQf e regras/operacao lidos. Usuário14/11 autorizou deixar chave pública, pasta externa, responsável e teto de custos pendentes, desde que configuráveis depois. Não representar esses campos como backup executado. Publicar só GitHub→Vercel/semActions. Produção79migrations, última20261113140739;7contas,0objetosStorage. Sem credenciais de dump disponíveis neste ambiente.

## Desenho e decisões

Reutilizar Configurações, padrão Equipe/Convites, owner+settings.access e sessão oficial; administração, funcionário e cliente não ganham operação técnica. Painel compacto em uma rota com visão/edição, até4ações e semloaders. Configuração privada por escritório, revisionada/idempotente, campos opcionais honestos e modificáveis; orçamento nunca contrata upgrade. Quotas sem medida não viram zero/verde. Medidas do aplicativo são rotuladas como tais, sem fingir faturamento/provider.

Logs mínimos por API: request_id gerado pelo servidor em sucesso/erro, método, grupo da rota, status, duração; sem URLs/query, tokens, corpos, nomes/PII. Identificador único preservado no erro. Alertas70/85%, falhas5xx e lentidão; sem envio externo contratado nem rota pública de diagnóstico sensível. Contexto do escritório revalidado pelo banco.

Kit operacional fora do frontend: empacotamento autenticado/encriptadoRSA-OAEP+AES256GCM, manifestoSHA256 e configuração sem segredos; rejeitar paths/symlinks/tampering/bytes faltantes. Export de banco suportado e inventárioStorage separados. Restauração só em laboratório próprio, nunca comando apontável para produção. SQL e bytes são verificados, não só cópia de arquivo. Chave privada foraGit; valores reais só por bindingseguro. Sem criar cópia de produção incompleta a partir de consultasJSON nem restaurar ambiente principal.

## Execução

- [x] 1. Testes RED→GREEN de política/quotas/alertas e request_id/log sem dados privados. Implementar shared/operations36.ts, middlewareAPI e preservação do ID em errors.ts.
- [x] 2. Migration privada de política, comandos idempotentes e RPCs de state/save com gateowner+settings.access após lock; ACL/RLS fechadas. API e tela Configurações→Continuidade, seletor de escritório elegível, dados reais do aplicativo e pendências. Testar quatro perfis, revogação, sessão, conflito/retry503 e campos opcionais.
- [x] 3. Kit scripts/continuity36: manifest/encriptação/verificação e laboratório com banco+objetos. Exercício cronometrado; Auth/ACL/RLS/FKs/hash/totais e alteração de arquivo devem ser conferidos. Registrar RPO/RTO medidos separadamente das metas24h/8h; produção sem dump/externo/chave permanece pendente.
- [x] 4. Verificação Node, SQL/lab, browserDesktop/Mobile, regressões35/34/anexos, tipos/build/audit. Plano de contingência e execução diária7diárias/4semanais, manutenção/monitoramento/crescimento e limites. Revisão independente antes de merge.
- [ ] 5. GitHub→Vercel compatível com migração; conferir histórico remoto antes de eventual aplicação (não duplicar), APIs401/HTTPS/UIpública/PWA e integridade existente. Atualizar AGENTS/LIVRO/fecho/evidências. Se backup real/rotina externa indisponível, registrar checkpoint36 sem avançar37.

## Pontos de revisão

Não habilitar operação financeira offline nem liberar documento por503. Backups não vão ao Git nem ao cachePWA. UI não recebe dump/chave privada/credencial. Alterações só política36, sem inventar responsáveis/valores/grants. Falha de provider não vira cota0. Caminhos e autenticidade da cópia verificados antes de extrair; limitar restauração à origem isolada criada pelo próprio runner.
