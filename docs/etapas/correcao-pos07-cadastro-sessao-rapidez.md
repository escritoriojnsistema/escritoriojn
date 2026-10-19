# Correção após a Etapa 07 — cadastro, saída e rapidez

Pedido: tornar o cadastro público reutilizável em Clientes, impedir o retorno de uma sessão encerrada e reduzir a espera no acesso e nos convites. React + Vite/Express/Supabase permanecem. Publicação técnica segue a autorização já registrada no fecho06/07.

## Diagnóstico verificado

- O bootstrap público cria perfil e vínculo de cliente, mas não uma ficha em Clientes. Em produção foram contadas cinco contas, quatro confirmadas, cinco vínculos ativos e nenhuma ficha/contato, sem ler dados pessoais.
- Uma resposta 401 ao contexto altera somente o estado da tela. O SDK conserva a sessão e uma nova verificação pode autorizar novamente.
- O login verifica o contexto antes da adoção da sessão e o Provider repete imediatamente a mesma consulta.
- A criação de convite espera a gravação e também a chamada Edge/Auth/SMTP, embora a gravação já tenha terminado. Cadastro público chama o Auth diretamente e sua confirmação por e-mail deve continuar real.

## Critérios e sequência

1. Reproduzir os defeitos e registrar os testes antes das correções. Não usar contas, senhas nem destinatários reais como laboratório.
2. Integrar a origem pública confirmada ao cadastro interno de forma idempotente e isolada por escritório. Conservar a exigência de leitura e o escopo `read_all` para fichas de outros criadores. Detectar contato coincidente sem usá-lo como prova de identidade ou liberar acervo; associação/aprovação documental continuam futuras.
3. Encerrar a sessão invalidada também no SDK/armazenamento. Logo, foco, refresh, recarga e outras abas não podem reabrir a mesma sessão; um novo login legítimo deve funcionar. Tentativa recusada em outro portal não encerra uma conta válida diferente.
4. Eliminar somente a verificação de contexto imediatamente duplicada, com transferência única em memória da resposta já verificada, correlacionada à sessão exata. Backend/RPC e revalidações posteriores continuam obrigatórios.
5. Retornar a criação do convite após a gravação e manter o envio real com `waitUntil`, estado pendente honesto e consulta posterior até o resultado. Reenvio explícito, leases e validação continuam íntegros. Sem loaders, falso sucesso ou promises abandonadas após a resposta.
6. Executar testes de unidade/API, replay SQL com ACL/RLS/corridas, Auth/SMTP descartáveis e UI em mobile/desktop; revisar integração, aplicar migration aditiva, entregar PR/CI e verificar Vercel canônico. Atualizar este cartão, regras e Livro com evidências reais.

O prazo individual por inatividade segue preparado no contrato anterior; esta correção não cria seletor nem ativa política fictícia. O acesso a documentos antigos requer autorização futura explícita, mesmo com contato ou CPF coincidente.

## Evidências

Implementado: origem pública confirmada com materialização ou entrada pendente; encerramento local/SDK correlacionado, marcador de negação e convergência entre abas; transferência única de contexto em memória; repetição única de 401 obsoleto com token renovado da mesma sessão; convite com entrega retida e acompanhamento limitado. Erro transitório do acompanhamento conserva lista e rascunho.

- PostgreSQL:560 verificações (280×2), migrador sem superusuário/BYPASSRLS, ACL/RLS e corridas reais. RED→GREEN também para lock desnecessário antes de confirmar e-mail; filtro barato antes do lock mantém revalidação após ele.
- Node/API:54 testes, typecheck/build e auditoria de produção com zero vulnerabilidades.
- Auth local:55/57 na primeira execução completa; duas expectativas foram alinhadas (botão desktop e retorno `pending`). Em seguida20/20 focados passaram, incluindo cadastro interno anterior, SMTP real do laboratório, duas abas, login novo após encerramento e tentativa concorrente. Os19 casos de sessão e3 de JWT renovado já tinham passado na execução completa. CI executará os59 casos em árvore final.
- Benchmarks sintéticos de convite: mediana1390→201ms, cinco amostras por versão, mesmas três chamadas eventuais, somente duas aguardadas pela resposta. Não é medida de SMTP hospedado. Login verifica contexto2→1; foco/recarga continuam verificando. Cadastro público permanece com um POST real ao Auth, pré-conexão pública e timeout; envio do provedor continua necessário.
- Banco hospedado: migration `20261019163453_customer_registration_registry`, SHA256 `b92751be1ae5bbdc1ccf2eaced56836f25131fd994a4830be8f7a6c6c0d2f9e8`, SQL idêntico ao replay. Cinco contas/quatro confirmadas/cinco vínculos preservados. Backfill verificável criou uma ficha/um contato/uma origem pendente; zero aprovações. RLS ativa e nenhum grant bruto a authenticated/service_role.
- Revisão independente identificou dois P2 corrigidos (perda de rascunho no polling e401 de token antigo). Regressão adicional de cancelamento por evento antigo corrigida com RED→GREEN. Nenhum P0/P1/P2 identificado permanece aberto.

UI completa, CI, publicação e provas do canônico em andamento; não confundir testes de apresentação fictícia com Auth/PostgREST/SMTP real do laboratório. Logs em `/workspace/shared/pos07`, evidências versionadas em `docs/evidencias/correcao-pos07`.

Rollback técnico somente de código para `750b110`, preservando dados, proveniência e auditoria. A migration é aditiva e compatível com a API anterior. Nenhum teste usa contas ou destinatários hospedados. Aprovação de documentos e prazo individual continuam futuros.
