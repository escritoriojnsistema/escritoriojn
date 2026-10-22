# Correções pós13 — publicadas

Publicado em22/10/2026 em https://escritoriojn.vercel.app pelo [PR33](https://github.com/escritoriojnsistema/escritoriojn/pull/33), featuree471a4c7/mergeb70de98b. Árvorec2f64f9f igual à validada. VercelAezWrV58RaR4WujnmN8no15nqEou SUCCESS, pela integração GitHub→Vercel; nenhuma execução/alteração de Actions ou deployCLI/API.

- Conta de super administrador, administrador e funcionário: Salvar e Cancelar ficam fora do quadro; Cancelar restaura o snapshot oficial e limpa mensagens, sem gravar. Conta cliente: Solicitar/Acompanhar correção fora do quadro, e-mail em linha completa; Cancelar na proposta descarta edição e retorna à Conta. Aplicação também permite descartar a edição local, preservando pedido já enviado e confirmação oficial de e-mail.
- Abrir aviso navega imediatamente e registra leitura automaticamente pelo endpoint existente. Serviço acima das rotas conserva envio, deduplica por escritório/aviso e aborta na troca de sessão/autoridade. Confirmação atualiza o sino por resumo oficial. Cada falha mantém sua própria retentativa, inclusive quando outro aviso é aberto. Filtro de não lidas reflete estado oficial; outras notificações permanecem intactas.
- Cobranças usa largura/padding de Equipe e convites, incluindo busca/filtros/lista. O limite760px aplica-se somente ao editor financeiro. Geometria320/360/768/1440/1920, quatro atalhos mobile, sidebar, alvos44px e inputs16px preservados. Quatro capturas fictícias inspecionadas, sem PII das fotos.
- Login consulta identidade e contexto de permissões em paralelo, exigindo ambas verificações e UID consistente antes de responder. Nenhuma mutação paralelizada nem cache de autoridade. Resumo inicial do sino não repete a leitura inicial da página. Rotação da mesma sessão preserva contexto;401/403/saída continuam bloqueando.

## Validação

115Node/API;77contratos UI afetados;59E2E públicos locais;34fluxosAuth reais locais e reexecução do aviso com assert read_at no banco(1pass adicional, mesmo caso). Build browser/Vite/server e auditprodução0. Revisão independente aprovou interface e backend após corrigir P2 de mensagem de erro substituída por outra leitura. [Sumário](../evidencias/ajuste-pos13/verificacao.json), [revisão](../evidencias/ajuste-pos13/revisao.md), [contrato](ajuste-pos13-interface-rapidez.md).

Benchmark7amostras/provedor local com125ms por leitura: mediana de referência sequencial256,792ms, endpoint paralelo132,207ms. Demonstra remoção de espera em série, sem estabelecer SLA de rede ou latência física zero.

Bundle público `/assets/index-Yy3JrdO7.js`, SHA256 `d303bdf415b56a06e68bc48081e70907a284d09a753cf8a6d7a689668f2b1389`, idêntico ao build do código revisado com a conexão pública existente. [Comparação](../evidencias/ajuste-pos13/bundle-publicado.json).

59 testes públicos no endereço canônico passaram após a publicação, sem falhas. [Prova da publicação e integridade](../evidencias/ajuste-pos13/publicacao.json).

## Supabase e continuidade

Nenhuma migration, alteração de schema/RLS/índice/capacidade, segredo ou fixture hospedada. Consultas de integridade mantêm18migrations(última20261022012025),5Auth/5vínculos/1ficha/1pedido/0cobranças. RPCs públicas afetadas permanecem INVOKER, semEXEC anônimo e comEXEC autenticado. Laboratório Auth/REST/Storage/SMTP descartável validou a persistência da leitura e os limites de acesso.

Logs completos permanecem locais ignorados porGit; sumário/hashes, testes, benchmark, revisão e capturas são versionados. Autenticação e mutações com usuários reais foram testadas somente no laboratório local; produção recebeu testes públicos e consultas de integridade sem alterar dados. O fecho documental não modifica runtime. Próxima14 somente mediante novo pedido.
