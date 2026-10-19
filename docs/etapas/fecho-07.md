# Etapa07 — Cadastro e busca segura de clientes

19/10/2026. Implementação concluída; rodada integrada final e publicação técnica em andamento. Escopo oficial: [cartão07](etapa-07.md), [regras/clientes](../regras/clientes.md) e [plano07](plano-07.md), lidos do Drive. Base React+Vite/TS, Express e Supabase mantida. Etapa08 não iniciada.

## Comportamento e critérios

- `/clientes` permite busca paginada, criação, detalhe e edição de ficha separada de Auth. Nome obrigatório; CPF/CNPJ/contatos opcionais. Pessoa jurídica selecionada quando o serviço exigir; catálogo/política formal pertencem à09. Atendimento anônimo dispensa ficha, sem nome/CPF falso.
- `customers`/`customer_contacts`: RLS e ACL sem leitura bruta por usuário autenticado. Quatro RPCs invoker autorizadas por sessão atual, escritório e capacidades. Sem customers.read_all, o usuário vê somente fichas que criou nesta07; compartilhamento/representantes/mesclagem pertencem à08. Metadados, CPF e e-mail não provam identidade nem vinculam login.
- customers.read é pré-requisito; create/update são adicionais; read_all só amplia dentro do escritório. Owner recebe o conjunto; gestão e delegação concedem capacidades explicitamente dentro do escopo atual. O restante da equipe não recebe acesso global por papel.
- CPF/CNPJ numéricos normalizados, formato/dígitos verificadores validados; identificador não vazio único por escritório/tipo. Vazio é NULL. Contatos0..4: e-mail lower/trim e telefone10/11 ou55+10/11. Sem consulta oficial. Busca usa payload POST, lista expõe máscara e detalhe exige autorização.
- Escritas e contatos atômicos com customers.created/updated sem PII. Versão impede sobrescrever edição concorrente; índice impede duplicidade inclusive em corrida real. Sessão/capacidade revalidadas após locks de escritório/vínculo. Falha crítica da auditoria reverte toda a mudança.
- Convites owner/admin/employee e conferência reutilizam `shared/identifiers.ts`, CPF incremental `000.000.000-00` e envio somente de dígitos. Formatação não substitui autorização no banco.
- OperationLayout mantém até quatro atalhos autorizados com ícones/rótulos; Clientes é prioritário, extras no menu. Portal do cliente continua isolado. Sem loaders/overlays/textos transitórios, inclusive ações existentes: rótulos estáveis e bloqueio de repetição; erros/sucesso permanecem visíveis.
- Lista padrão3/5 e ficha cabem nas capturas360×640/1440×900. Formulário usa grade compacta; mensagens, vários contatos, zoom e teclado mantêm rolagem natural. Alvos44px, inputs móveis16px e foco preservados. Ícone Novo cliente foi corrigido de4px para18px em alvo44px.

## Verificação e revisão

- Baseline anterior30 Node passou. RED→GREEN de CPF/validação permissiva, módulo inexistente, API ausente, tipoJSON inválido e ícone espremido; testes funcionais, sem teste de conteúdo de implementação.
- SQL final:504 checks252×2, com81 novos por replay. Migrador NOSUPERUSER/NOBYPASSRLS, papéis reais, isolamentoA/B, cliente/funcionário/anon, chamadas diretas, normalização/vazio/duplicidade/versão e rollback. Corridas reais de edição, CPF duplicado, logout durante leitura/escrita e capacidade revogada durante lock passaram. Resultado confirmado na execução local; o ambiente foi reiniciado depois e o log temporário não foi preservado. O CI reproduz o mesmo runner versionado.
- Node42/API07 seis casos, Auth real33 e E2E públicos34 passaram. Contratos87 passaram antes dos dois últimos refinamentos; regressões de formulário360/1440 e painel320/360/768/1440 foram validadas depois. Rodada definitiva de88 contratos será registrada pelo CI. Typecheck/build e dependências de produção0 vulnerabilidades conferidos.
- Regressão do painel identificada pelo Auth real: o terceiro cartão elevava a altura para655px em320×568. Conta já tem entrada no cabeçalho/menu/atalhos; o cartão repetido foi omitido quando Clientes e Equipe estão disponíveis. RED655→GREEN≤568. Formulário com um contato/erro foi compactado de671 para640px sem reduzir controles.
- Primeiras execuções de browser ocorreram durante edição e HMR descartou estado/DOM; foram interrompidas e repetidas sequencialmente com fonte congelada. Seletores de select usam combobox quando rótulo inclui opções. Nenhuma falha desse ciclo é ocultada como prova de publicação.
- Revisão independente somente leitura não identificou achados P1/P2 em ACL/RLS, locks/revogação, DTO, auditoria, concorrência ou isolamento frontend. Revisão de estrutura React/TypeScript e acessibilidade essencial aplicada; sem alegar auditoria WCAG integral.

## Banco e publicação técnica

Migration aplicada e verificada `20261019015927_customers_secure_registry.sql`, SHA256 `52b8b668cc8476c2d5f181a981e64e6945cc218fdb120237699c0b95e9b0ad66`. O nome Git foi alinhado ao histórico hospedado; o SQL é idêntico ao testado sob timestamp014457. No diagnóstico hospedado: projeto mcsuoxnubpqenyvbefee saudável, seis migrations, zero tabelas de clientes, um escritório/quatro vínculos ativos/quatro identidades Auth. O Livro anterior dizia um vínculo; leitura atual prevalece, sem alterar ou inferir identidades.

Autorização técnica permanente consta expressamente no fecho06 e docs/PLUGINS; o pedido atual conclui07 em todas as camadas no mesmo projeto. Fluxo: testes/revisão → migration aditiva → PR/CI/GitHub → integração Git Vercel → prova pública. Sem contratação, lançamento comercial39, troca de SMTP/env/Edge, edição de conta/senha ou envio externo de teste.

Conector Vercel recusou consulta ao time escritorio-jn com403; CLI não está disponível/credenciada neste ambiente. A prova usará status da integração Git e alias público, sem contornar proteção de preview/env/logs. Banco hospedado confirmado: sete migrations, duas tabelas com RLS e leitura bruta negada a anon/authenticated, quatro RPCs públicas invoker/search_path vazio (anon sem EXECUTE), quatro capacidades seed somente owner; CPF/CNPJ/vazio conferidos por consultas sem persistência. Zero fichas/contatos, quatro identidades e quatro vínculos ativos preservados. PR/CI/deploy e provas públicas ainda pendentes neste checkpoint.

Advisors: oito INFO de [RLS sem política](https://supabase.com/docs/guides/database/database-linter?lint=0008_rls_enabled_no_policy), intencionais nas tabelas sem GRANT e alcançadas só pelas RPCs autorizadas;18 [índices ainda sem uso](https://supabase.com/docs/guides/database/database-linter?lint=0005_unused_index), esperados na base nova. [Proteção de senhas vazadas desativada](https://supabase.com/docs/guides/auth/password-security#password-strength-and-leaked-password-protection) é aviso anterior preservado; nenhuma configuração Auth/plano foi alterada.

Rollback: reverter somente código para dfc2601/f65bdf5, preservando schema, fichas e auditoria; não executar DROP/reset nem remover concessões já auditadas. Contrato/retentiva jurídica permanecem decisões do controlador, sem purge automático.

Próximo checkpoint: terminar testes integrados e publicação07; registrar commits/CI/deploy e testes remotos. Próxima etapa oficial08 somente após novo pedido, lendo AGENTS, Livro, este fecho e regras/clientes. Nenhuma função futura de identidade do portal/prazo individual/catalogação foi ativada.
