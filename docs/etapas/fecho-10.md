# Etapa10 — atendimentos e acompanhamento

Implementação aditiva conectada à Etapa09, integrada em main e publicada tecnicamente em https://escritoriojn.vercel.app/solicitacoes.42E2E públicos remotos passaram. Revisão de índices remotos em fechamento. [Contrato](etapa-10.md), [plano](plano-10.md), [evidências](../evidencias/etapa-10/validacao.json).

`/solicitacoes` registra balcão/WhatsApp com protocolo único, pessoa quando exigida, responsável, quantidade/serviço e snapshot de preço/política calculado pelo helper09 na mesma transação. Catálogo e migração09 permanecem intactos: hash74bfc42e5b90d5aeb9bb723ff597cb5314264244d826d288acbfeb5f58665385. Sua publicação foi reconfirmada no Git, nas cincoRPCs/tabelas do Supabase e no asset canônico index-DGIM-GF3.js antes de integrar10.

Funcionário vê criados/atribuídos atuais conforme requests.read; demais capacidades independentes, read_all amplia só no escritório. Transferência conserva criador e atribuições/trilha; perda de escopo fecha detalhe. Cancelamento exige motivo e quatro conferências manuais, sem falsa checagem financeira/documental automática; conserva itens/histórico. Conclusão não quita, aprova, assina ou entrega. Fechados imutáveis nesta10.

`/minhas-solicitacoes` recebe mensagem própria do cliente confirmado antes da conferência de acervo. Classificação interna usa o mesmo banco de pedidos e valida pessoa/participantes/campos tipados/checklist. Se ainda sem responsável, atribui o operador da triagem. Projeção pública exclui notas, equipe, preços e fichas; UID confirmado/criador determina propriedade, sem correspondência por nome/CPF/contato.

CincoRPCs públicas invoker→implementações privadas autorizadas, search_path vazio/ACL mínima e RLS sem acesso bruto. Abertura idempotente por escritório/criador/chave/payload; mutações com versão esperada; protocolo e auditoria transacionais. Sessão/capacidades reavaliadas após locks. Permissões da fila calculadas uma vez por consulta; índices e paginação3/5/histórico3, sem pré-consulta duplicada de contexto.

UI reutiliza padrões desktop/mobile, quatro atalhos incluindo Início/Conta e extras na sidebar. Lista/formulário/detalhe no mesmo workspace; seções recolhíveis e rolagem natural para dados longos/zoom/teclado. Sem loaders/spinners, ações mantêm rótulo e impedem repetição. Formulário/respostas são descartados em troca de sessão/escritório/autoridade, preservados na revalidação equivalente. Capturas sintéticas360/1440 inspecionadas, com320/zoom/altura reduzida testados.

## Provas

- 79Node/API, typecheck/buildfrontend+servidor e dependências de produção0vulnerabilidades.
- 1.070SQL535×2: instalação vazia, migrador limitado, ACL/RLS, isolamento, snapshots imutáveis, conferências/triagem/cancelamento, idempotência/protocolos/versões concorrentes e revogações durante locks.
- 7Auth reais locais com GoTrue/PostgREST/PostgreSQL: integração catálogo09→pedido10, publicação de preço novo preserva pedido antigo, funcionário/transferência, portalA×B, UI de abertura/nota e regressão catálogo09.6na primeira bateria e1repetição após corrigir seletor que omitia o código do serviço; nenhuma alteração de produto para mascarar o teste.
- Regressão adicional15Auth reais passou: operação/menu dos quatro perfis, separação de portais, sessão e renovação de token. Total22cenários autenticados locais verificados.
- 30contratosUI passaram (13solicitações10,13catálogo09,4navegação/equipe) e42E2E públicos locais passaram. Seletores por rótulo preenchido/opções foram corrigidos para nomes acessíveis. Uma rodada de trace foi descartada por limpeza concorrente do diretório de saída; a bateria integrada final rodou isoladamente.
- [Benchmark](../evidencias/etapa-10/benchmark.json):10mil pedidos fictícios,10conexões/200amostras; p95SQLlocal lista79,517ms/detalhe48,739ms, sem promessa de latência zero hospedada.
- Revisão independente identificou efeito de revalidação que apagava rascunho e vigência calculada antes de espera em participante. Corrigidos; testes SQL RED→GREEN também cobrem revogação services.read/perform durante espera. Nomes legados normalizados reutilizando helper08.
- Preview real: health200, rotas de API09/10 anônimas401 em JSON e fallbackSPA200. Nenhuma alteração em env/SMTP/Edge/Storage/contas. Raiz/lockfile/versões/Vercelconfig conferidos.

## Publicação e continuidade

Sem GitHub Actions. Publicação somente GitHub→Vercel, no mesmo projeto/time/canônico já autorizado. Depois do merge, conferir histórico Supabase antes de aplicar manualmente a migration10; a integraçãoGit pode aplicá-la automaticamente. Preservar5Auth/5vínculos/1ficha/1contato e catálogo remoto vazio, sem fixtures. Conector administrativo Vercel403 preexistente; statusGit e canônico são a prova disponível.

Rollback somente código mantendo capacidades, tabelas, snapshots e auditoria; sem DROP/reset. Etapa11 (anexos privados) não iniciada. Financeiro/entrega deverão integrar bloqueios transacionais ao cancelamento antes de habilitar efeitos. Jornada autenticada comprovada em laboratório, sem credenciais hospedadas; Chromium emulado, sem aparelho físico. [PR20](https://github.com/escritoriojnsistema/escritoriojn/pull/20), feature073f69b, merge4f3a286 e árvoreec7e72d idêntica à validada. [VercelHkb](https://vercel.com/escritorio-jn/escritoriojn/HkbQFDQsHQcyR9KvhZ9jNdZVLfUL) SUCCESS porGit, canônico serve index-CHE9iorx.js com rotas/API10 e catálogo09. Migration20261020211531 aplicada automaticamente porGit;67comandos correspondem ao arquivo testado, SHA25624c4930aece0adc421b204b51da256008f43dbca7926b5a1c32cb3a9460c75b9. Nenhuma tentativa manual duplicada. Contagens/RLS/ACL/capacidades preservadas em [provas](../evidencias/etapa-10/supabase.json).

Advisors semERROR. TrêsFKs novas receberam migration aditiva de índices compostos, sem alterar09. RLS-sem-policy INFO é intencional sem grants de tabela; índices novos sem uso em banco vazio são esperados. Aviso de proteção contra senhas vazadas é preexistente, sem mudança de Auth/plano. [RLS](https://supabase.com/docs/guides/database/database-linter?lint=0008_rls_enabled_no_policy), [FK](https://supabase.com/docs/guides/database/database-linter?lint=0001_unindexed_foreign_keys), [senhas](https://supabase.com/docs/guides/auth/password-security#password-strength-and-leaked-password-protection).
