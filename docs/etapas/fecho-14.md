# Etapa14 — caixa individual e contas de destino

Implementação conforme Etapa14/RF11 do Drive, sobre13 e correçõespós13. Publicação em andamento; estado real, commits e schema serão registrados após confirmação, sem presumir deploy.

- `/caixa` compartilha OperationLayout, largura de Equipe, quatro atalhos móveis e sidebar. Meu caixa abre fundo físico próprio por unidade; consolidação exige cash.read_all; configuração exige cash.manage. Os quatro recursos têm seed somenteowner. Outros perfis recebem acesso apenas pela gestão explícita já existente; cliente permanece excluído. Nenhum cadastro real automático de unidade/conta/forma.
- Unidades financeiras, contas em espécie/banco/digital e formas de pagamento com destino coerente. Escrita versionada/idempotente; restrições protegem referências e caixas abertos. Abertura registra operador/unidade/conta/data/fundo na mesma transação, uma sessão aberta por operador/unidade e movimento único. FundoR$100 resulta numerárioR$100 e recebidoR$0. B não consulta/opera A; leitura consolidada não permite autoria alheia. Recebimentos, alocações, fechamento, troco e recibos pertencem à15, não foram ativados.
- API Express usa Bearer verificado e umaRPC por operação, schemas fechados/DTO whitelist/no-store/erros seguros. Seis tabelas privadas comRLS eACL negando bruto; wrappers públicos INVOKER e helpers verificados/search_path vazio. Autoridade revalidada após locks; retries adotam resultado persistido. Nenhum service_role no browser/Express.
- UI densa320–1920, entradas16px mobile/alvos44, ações fora dos campos e Cancelar local. Sem spinner/loader/rótulo transitório; mutex bloqueia duplicação, respostas antigas são descartadas. Leituras independentes preservam seus erros;503 mantém rascunho,401/403 limpa/bloqueia,404 limpa recurso. Identidade/autoridade nova desmonta workspace. Configuração50 tem totais/paginação; sessões3/5. Preservados Conta/Cancelar, leitura automática do aviso, geometriaCobranças e leituras de login paralelas.

## Verificação local e limites

117Node/API,1626SQL(813×2 com9corridas14/replay),23Auth reais no laboratório oficial descartável,22UI14,52regressões afetadas e62públicos locais. BuildVite/browser/server e auditoria de dependências produção0. As duas falhas de artefatos ENOENT da primeira regressão foram reexecutadas sequencialmente e passaram; nenhuma correção funcional foi inferida delas. Capturas fictícias mobile/desktop inspecionadas, sem dados das fotos do usuário. [Sumário](../evidencias/etapa-14/verificacao.json), [domínio](../evidencias/etapa-14/domain-validation.json), [revisãoUI](../evidencias/etapa-14/revisao-interface.md), [revisãoSQL/API](../evidencias/etapa-14/revisao-dominio.md).

Benchmark local:10mil sessões+10mil unidades,10conexões/200amostras; dashboard p95 77,447ms, configuração81,358ms. Consultas paginadas/indexadas, sem N+1 de contexto ou recarga após mutação. Isso mede laboratório, sem prometer latência física zero em rede/produção. Nenhuma fixture hospedada nem transação real de teste.

P3 delimitado: seletor de abertura exclui sessões próprias da página atual3/5; unidade já aberta em outra página pode continuar oferecida, mas o banco responde409 e impede duplicação. Não concede acesso alheio. PreviewVercel protegido e painel/logs administrativos indisponíveis pelo conector403; a entrega usa statusGitHubVercel, bundlecanônico, testes públicos eSQLread-only. Autenticado real foi provado no laboratório local.

## Retomada

Ler AGENTS, Livro, este fecho e contrato14. Próxima15 somente por novo pedido: pagamentos/allocations/recebimentos/fechamento devem estender ledger e guardas transacionais preservando fundo/autoria/idempotência/histórico. Nenhum reset/DROP ou permissão individual automática. Continuar exclusivamenteGitHub→Vercel semActions.
