# Fecho11 — Anexos privados

Etapa11 concluída, integrada aos pedidos10 e ao catálogo09 e publicada em https://escritoriojn.vercel.app/anexos e `/meus-anexos`, conforme [cartão oficial](https://drive.google.com/file/d/1K-ZyDvCrvvHmtQgpGlFQdfHfsX3acay6/view) e RF06. [Contrato](etapa-11.md), [plano](plano-11.md), [prova hospedada](../evidencias/etapa-11/publicacao.json).

## Resultado

Equipe em `/anexos`, cliente em `/meus-anexos`, com menu/cartão e orientação para abrir uma solicitação10 quando não houver pedidos. Bucket privado `request-attachments`, nomes aleatórios sem PII, intenção por UID/sessão/pedido, uploadJWT direto sem sobrescrita e validação Edge de extensão/MIME real/estrutura/tamanho/SHA256. PDF/PNG/JPEG, limite inicial10MiB e política versionada por serviço separada dos snapshots09/10. Nenhuma conta, ficha ou solicitação paralela.

**Antivírus não configurado:** formato/hash válidos permanecem em quarentena, sem download. Validação estrutural não é aprovação antimalware. A interface informa isso; não existe RPC de liberação fictícia. Futuro scanner real exige integração e nova prova antes de distribuir arquivos. DownloadJWT exige estado disponível/análise clean e escopo/sessão vigentes; URLs públicas/assinadas e listagem Storage são bloqueadas por operação/RLS. Cópia privada exige leitura da origem, files.copy e files.upload no destino; cria objeto distinto e mantém quarentena.

Equipe exige files.read+requests.read e escopo criado/atribuído/read_all10; demais capacidades são adicionais, seed somente owner. Cliente só pedido e envios próprios, sem adquirir acervo por CPF/contato. Finalização usa apenas o segredo nativo da Edge, nunca Express/browser/Vercel, e revalida ator/sessão/capacidades após rede/locks. Metadados têm whitelist/no-store; eventos não expõem nomes, caminhos ou conteúdo.

Limpeza exige plano com candidatos concretos, confirmação, reserva sob lock e remoção Storage confirmada antes de marcar metadados. Quarentena/disponível/proteção/referência/retenção/legalhold impedem exclusão; novas referências respeitam a reserva. Falha Storage/banco admite retry com mesma intenção/lease; resultado concluído é reutilizado. Owner autorizado pode recuperar plano de outro gestor sem liberar reservas, invalidando o token anterior. Objetos desconhecidos ficam retidos para análise manual; não há expurgo hospedado de teste.

Desktop/mobile reutilizam OperationLayout, quatro atalhos incluindo Início/Conta e demais destinos na sidebar. Listas3/5, formulário recolhido após sucesso mobile, seleção preservada/Novo envio e foco na mensagem; arquivo principal visível em360×640.320px, zoom/altura reduzida e conteúdo longo usam rolagem natural. Sem loaders/spinners ou rótulos de espera; pendências mantêm arquivo/chave/seleção. Troca de sessão/escritório/autoridade aborta e descarta dados. Retorno do cliente conserva login-cliente.

## Provas locais

- 94 testes Node/API/bytes/worker, typecheck/build frontend+API e auditoria de produção0vulnerabilidades.
- 1.256 verificações SQL628×2 sob migrador sem super/BYPASSRLS, incluindo186 Anexos e3corridas11 por replay. FKs novas indexadas, ACL/RLS/Storage, escopoA×B/NULL, snapshots, versão/política, reservas/referências e recuperação comprovados.
- 47 cenários Auth reais locais:46 na bateria integrada (7Storage/39regressões de pedidos, catálogo, quatro perfis, sessão e token) e1jornada nova navegador→API→Storage→Edge→banco. PDF fictício enviado no portal sem ficha; quarentena persistida e download negado. Storage oficial v1.81.0/digest98ffec5d… com75migrations do provedor, GoTrue/PostgREST/PostgreSQL reais; não é stub. Falhas de finalização após cópia/remoção reais recuperadas,10MiB+1/tipo enganoso/hash/incompleto negados e desconhecido retido.
- 21 contratosUI e5checagens públicas dos anexos aprovados. Capturas fictícias320/360/1440/zoom e painel320 inspecionadas. Nenhuma captura/trace Auth com tokens ou credenciais.
- 47E2E públicos do preview compilado passaram. Duas tentativas anteriores tinham configuração/proxy ausentes no preview e responderam503 no teste do JWT inválido; corrigido apenas o ambiente local (conexão pública e proxyNode), sem afrouxar testes ou alterar o produto. Workflow Qualidade387780086 reconfirmado disabled_manually por consulta, sem execuções.
- [Benchmark](../evidencias/etapa-11/benchmark.json):10mil arquivos adicionais,10conexões/200amostras; p95SQLlocal lista191,698ms e seletor49,037ms. Índices/paginação e upload direto evitam tráfego binário pela API/Vercel. Medição local, sem promessa de latência zero hospedada.
- Revisão independente final sem P1/P2 pendentes. Corrigidos com regressões: decisão de escopo NULL, retorno ao portal errado, reserva sem retomada pelo proprietário, retry com política capturada, anúncio de cópia sem autoridade de envio e lista concreta do plano. Banco e Storage não são apresentados como uma transação única.

## Publicação e continuidade

Sem GitHub Actions; workflow387780086 reconfirmado disabled_manually antes e depois da publicação. [PR23](https://github.com/escritoriojnsistema/escritoriojn/pull/23), feature9590ddc/mergeab6ab63, mesma árvoref4e76db validada. [VercelE1WY](https://vercel.com/escritorio-jn/escritoriojn/E1WY9z7f8vNrxLeNBMvmrSeRAPmj) SUCCESS pela integraçãoGit; asset canônico index-DovCgnd9.js contém rotas/APIs11 e09/10.47E2E públicos remotos passaram sem falhas. Raiz, lockfile, envexemplo e Vercelconfig preservados; nenhuma publicação por CLI/API Vercel.

Migration20261021003953 aplicada automaticamente porGit,80comandos correspondentes ao arquivo testado, SHA25699dd5b5c6ef2fb1088ccaf0fca62832a41764c998152a707c648a0ef83af7b85. [Readback](../evidencias/etapa-11/migration-readback.json) preserva literais/corpos de funções; não houve apply manual duplicado.14migrations/5Auth/5vínculos/1ficha/1contato preservados;0serviços/pedidos/arquivos/intenções/objetos fictícios hospedados. Bucket privado10MiB/PDFPNGJPEG,8policiesStorage,7tabelas comRLS/semGRANT bruto,9RPCs invoker comACL mínima e todas FKs novas indexadas conferidos. Quatro capacidades seed apenasowner.

Edge private-attachments ACTIVE/v2/JWT/importmap, três fontes runtime lidas idênticas às locais; v1 inicial incluía deno.json idêntico e integraçãoGit republicou v2. Chamada com JWT da API anônima executou o handler e retornou401AUTH_REQUIRED; RESTtabela/RPC anônimos401/42501. Segredo permanece nativo da Edge. Nenhum segredo/SMTP/plano contratado/conta real alterado; sem expurgo ou fixture hospedada.

Advisors semERROR. RLS privada sempolicy é intencional/semGRANT. Permanecem3FKs antigos fora11 e índices sem uso em base vazia ([explicação](https://supabase.com/docs/guides/database/database-linter?lint=0001_unindexed_foreign_keys)); proteção contra senhas vazadas é WARN preexistente ([configuração](https://supabase.com/docs/guides/auth/password-security#password-strength-and-leaked-password-protection)). Nenhuma FK11 descoberta sem índice.

Autenticado comprovado em laboratório descartável, sem senha hospedada ou aparelho físico. Conector administrativo Vercel403 conhecido: usar statusGit+HTTP/assets públicos. Rollback somente código, preservando metadados/intenções/reservas/auditoria; não abrir bucket nem apagar registros para recuperar falhas. Próxima12 somente por novo pedido.

Checklist final: manual11 atendido; padrões Desktop/Mobile preservados; até4atalhos/restante na sidebar; um workspace por fluxo e rolagem natural mínima; transições/ações sem loader; performance/backend↔frontend revisados; Backend,Frontend,Supabase,GitHub,Vercel e raiz conferidos. Scanner real permanece requisito explícito para futura distribuição, sem falsa aprovação.
