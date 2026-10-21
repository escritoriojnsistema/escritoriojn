# Fecho12 — Checklists, pendências e avisos internos

Checkpoint de validação; publicação ainda pendente. [Contrato](etapa-12.md), [plano/evidências](plano-12.md) e [manual oficial](https://drive.google.com/file/d/1P9hsZYbGGHc1f6aSR6u1FzvzEfw513WR/view).

## Resultado implementado

Rotas /pendencias e /notificacoes com menu e vazio orientado. Modelos por serviço com versões imutáveis; itens obrigatórios/opcionais/condicionais (origem/prioridade), aplicação captura definição no item10. Checklist do snapshot09 é alternativa quando há itens e não há modelo12. Marcações preparatórias10 não significam recebimento documental. Nenhum novo pedido/ficha/identidade ou objeto de arquivo paralelo.

Estados pendente/recebido/validado/dispensado têm versão esperada, autor/data/motivo e histórico imutável. Dispensa exige capacidade adicional. Recebido exige arquivo11 do mesmo pedido/item; validado exige disponível+scanner clean. Sem scanner configurado permanece quarentena, sem distribuição e sem aprovação fictícia. Arquivo recebe referência protegida11 e não supre dois itens do mesmo checklist. Versões posteriores do modelo não reescrevem instâncias.

Equipe exige requests.read+escopo10+checklists.read; manage/update/waive adicionais, seed somenteowner e concessão pela gestão existente. Cliente não acessa módulo interno nem avisos internos, mesmo com metadados/capacidades forjados. RPCs/Express aplicam autorização e whitelist; tabelas privadas com RLS/sem GRANT bruto. Sessão/autoridade revalidadas após locks.

Transferência10 conserva criador/atribuições/histórico e produz aviso genérico ao destinatário na mesma transação. Não decide aprovação/status. Avisar pendências usa evento imutável atual; destinatário+evento+tipo únicos, leitura própria/idempotente. Prévia não contém título, motivo, nome de arquivo, CPF, saúde ou texto jurídico. Referência retorna somente com escopo atual.

Desktop/mobile reutilizam OperationLayout;até4atalhos e extras no menu.3/5itens, linhas compactas, histórico/encaminhamento/modelos recolhidos em uma seção.3itens acima dos atalhos360;320/zoom/teclado/conteúdo longo usam rolagem natural. Sem loader/spinner/overlay/rótulos de espera; repetição bloqueada, falhas recuperáveis.401/403 bloqueiam;404 de perda externa de escopo e access_lost descartam ficha/rascunho. UID/sessão/escritório/autoridade diferentes remontam o workspace; refresh preserva rascunho. React e SDK pré-carregados em chunks cacheáveis, sem import tardio por clique.

## Provas já executadas

- 97Node/API/DTO/validação, typecheck/build frontend+API e auditprodução0vulnerabilidades.
- 1316 verificações SQL658×2 sob migrador sem super/BYPASSRLS, incluindo snapshots, estados, referências11, condições/opcionais, dispensa/capacidade/motivo, dedup/leitura e A×B. Duas corridas12porreplay passaram: revogação durante lock e versão concorrente. Validação positiva usa somente fixture de metadados disponível+clean, sem alegar scanner. [Benchmark](../evidencias/etapa-12/benchmark.json):10milavisos/10conexões/200amostras;p95SQLlocal485,282msnotificações/179,507mschecklist, sem SLAhospedado.
- 12contratosUI12 finais passaram:320/360/1440, modelo3itens/condições/publicação/refresh, quarentena, aviso/leitura, cliente negado, atrasos/access_lost/404 e zoom.45regressões UI de solicitações/anexos/12 passaram antes da compactação final;12novos confirmam alteração de layout. Capturas fictícias inspecionadas; sem screenshots/traces Auth.
- 3Auth reais locais passaram: nova jornada12 com dois PDFs reais fictícios no Storage oficial e estados persistidos via navegador/API/Edge/banco;2regressões de pedidos10. Snapshot preservado e notificações deduplicadas/encaminhamento/leitura/escopo comprovados. Tentativa inicial não chegou aos testes por timeout do downloadDockerStorage; baixado o mesmo digest98ffec5d… e repetição completa passou. Não houve uso de contas hospedadas ou e-mail externo.
- Revisão independente encontrou1P2:404 após transferência externa mantinha dados antigos na tela. Corrigido com testes de consulta/mutação RED→GREEN. Sem P1 ou outroP2 identificado; leitura/notify já serializados pelos escritores normais no lock do escritório. Scanner futuro permanece explícito, sem falsa integração.

## Publicação e continuidade

50E2E públicos no preview compilado passaram. Pendente: publicar PR/Git→Vercel e conferir Supabase após Git. Migration20261021114510, SHA256344cdb94a4af9f3a5ac8d2d7850a93fb85aeeb25ad612e4a2c6a932a488af373. Antes de eventual apply consultar histórico para não duplicar a integração.

Baseline hospedado:14migrations,5Auth/5vínculos/1ficha/1contato e0serviços/pedidos/arquivos, domínio12ausente. Nenhuma fixture ou conta remota alterada. Actions disabled_manually, não reativar; publicação autorizada somente GitHub→Vercel. Sem nova Edge/SMTP/credencial/serviço contratado. Lockfile/envexemplo/vercelconfig preservados. Rollback somente código, conservando snapshots/referências/histórico/avisos. Próxima13 somente por novo pedido; ler AGENTS/Livro/fecho12 e regra afetada.
