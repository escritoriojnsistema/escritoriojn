# Continuidade do fluxo documental — revisão de 31/10/2026

## Identificação do ambiente

- Código: `escritoriojnsistema/escritoriojn`, React + Vite + TypeScript, Express `/api`.
- Main analisada: `bfc78af07073c62168872c6b105b5c989ee90f4f` (PR68 login rápido).
- Trabalho anterior ainda aberto: PR69 `office-system-requirements-93fe8`, base `feat/pos21-importacao-minutas` mais antiga que main. Não mesclar direto sem atualizar a base/reconciliar alterações.
- Supabase ativo: `mcsuoxnubpqenyvbefee`; últimas migrations hospedadas são as 31 até `20261027172917_templates21_manual_import`.
- Base hospedada, consulta agregada: 64 modelos/versões; 0 serviços; 0 documentos; 0 itens de pedido; nenhum preço configurado. Não criar fixtures no ambiente real.
- Vercel: projeto `escritoriojn`, última produção `bfc78af`, READY. Prévia PR69 não confirma que a migration exista no banco.

## O que está implementado e o que não está

| Camada | Base publicada | Proposta PR69 / revisão local | Falta para a jornada solicitada |
| --- | --- | --- | --- |
| Login | PR68: RPC direta na entrada, SDK/identidade verificados; coldstart sem PDFKit | Nada publicado nesta revisão | Medição autenticada no Android/rede reais, rastrear timeouts/revalidações |
| Modelos | Biblioteca20, editor21, histórico e aprovação por versão | Pastas, nível por modelo, vínculo opcional de serviço e validações corrigidas | Renomear título corrente, duplicar, arquivar e restaurar sem apagar históricos |
| Pastas | Inexistentes na main | Criar/renomear/excluir somente vazia, revisão concorrente, lista e filtro de equipe | Teste SQL/Auth real e UX mobile; seleção em biblioteca completa |
| Serviços/preço | Catálogo09 versionado | Proposta de FK modelo↔serviço e leitura de versão vigente | Oferta ao cliente e snapshot financeiro atômico na criação do pedido |
| Solicitação | Pedido10, campos de serviço, anexos/checklist | Sem novo fluxo integrado | Formulário cliente com dados por modelo; canal presencial, WhatsApp e portal sem inferir identidade |
| Níveis/distribuição | Atribuição/transferência do pedido10 | Classificação do modelo (não automatiza despacho) | Estado de presença, capacidade, fila justa, espera e distribuição transacional por nível |
| Documento | Rascunhos e preenchimento21 | Sem nova finalização | Versão editorial, aprovação/assinatura, PDF canônico/arquivo privado imutável |
| Caixa/portal | Cobranças13, pagamentos15, estornos16, Caixa14–18, extrato cliente | Nenhuma alteração financeira | Handoff único, notificação, quitação líquida confirmada, gate da versão exata e download autenticado |

## Regras de segurança que não podem ser abreviadas

1. A pessoa informa CPF, e-mail ou WhatsApp para solicitar, mas isso **não** autoriza consulta de acervo ou entrega; validar o UID e vínculo de cliente já registrados pela camada08.
2. Edição de modelo aprovado gera versão nova, nunca altera a versão histórica; arquivar é retirada do catálogo futuro, não exclusão física de documentos/pagamentos/auditoria.
3. `services` + `service_versions` são o preço oficial; o pedido captura versão e valor em transação segura. Vincular FK na biblioteca, isoladamente, não cobra nem libera nada.
4. Caixa só confirma dinheiro pelo ledger/alocações reais; anexo ou comprovante pendente, parcial ou estornado não habilita acesso. Download revalida no instante de abrir a versão/bytes autorizados.
5. Nível é atributo do modelo; pasta é organização. Níveis superiores não se transformam em permissões de todos os funcionários; presença/atribuição automática deve respeitar perfil/capacidades atuais.
6. Modelos/clientes/serviços e relatórios históricos, 64 rascunhos importados, anexos, eventos financeiros e apresentações PDF1–8 devem ser preservados.
7. Chaves privilegiadas apenas em Edge protegida; navegador e API usam chave pública e Bearer; nenhum segredo em `VITE_*` além da publishable.

## Achados corrigidos na proposta, ainda sem publicação

- A rota detalhada publicada pela migração proposta não repetia `templates_actor20`, o que expunha rascunhos a chamadas indevidas de `/rpc/template_detail`; a revisão adicionou autorização e verificação de escritório antes de buscar qualquer versão.
- O `UNIQUE(office_id, lower(name))` dentro de `CREATE TABLE` não é sintaxe de constraint válida para expressão PostgreSQL; foi convertido para índice único por escritório.
- O FK de comandos para pasta viva bloqueava exclusão de toda pasta criada. O comando append-only conserva UUID/auditoria sem FK que impeça exclusão, e nunca permite exclusão de pasta com modelo.
- A revisão de conteúdo (versão da minuta) não evita sobrescrita de associação de preço/pasta. `config_version` agora detecta edição concorrente e a RPC exige ambas as versões.
- O nível estava herdado da pasta. `execution_level` por modelo separa autoridade operacional de organização visual.
- Endpoints novos devolviam JSON bruto; a API agora valida/projeta campos conhecidos. Rotas antigas de salvar/aprovar/detalhar tiveram DTO restaurado para não vazar extras.
- Consulta de preço passa a usar colunas canônicas de `service_versions`, e alteração de serviço exige `services.manage` além de capacidades de templates/pastas.
- Testes novos verificam 401, 409, 422, 503, payload fechado, DTO sem dados extras, nível e versões, mas **não** substituem testes do PostgreSQL.

## Portas de saída antes de produção

- [x] Localizar main, PR, Vercel e histórico Supabase.
- [x] Revisar rotas/DTO e corrigir as regressões de API observadas.
- [x] `npm run typecheck`, `npm run build`, testes focados Modelos20/22 (15/15).
- [x] Traduzir novos eventos de auditoria (teste isolado de Auditoria passou).
- [ ] Executar migração proposta em banco descartável com Auth real, roles, ACL/RLS, exclusão vazia/ocupada, idempotência, corrida de `config_version`, sem dados hospedados.
- [ ] Verificar o PR contra `main` atualizado, sem conflito, testes de UI 320/360/768/1440 e PDF histórico.
- [ ] Resolver/regredir teste isolado de exportação Auditoria com 1001 eventos (503 local) e executar suíte completa verde.
- [ ] Confirmar e publicar apenas a etapa comercial compatível via GitHub→Vercel e migração versionada; conferir `schema_migrations` depois do Git para não aplicar duas vezes.
- [ ] Implementar em etapas restantes os contratos de oferta, intake, distribuição, documento/PDF, Caixa, liberação e portal, com testes transacionais e ponta a ponta.
- [ ] Só marcar como concluída a jornada quando um cliente autorizado conseguir solicitar, receber cobrança, quitar integralmente e obter o arquivo exato, e quando estorno/revogação impedirem download.

O PR69 anterior não contém o fluxo completo; não declarar essas integrações como prontas só porque existem tabelas/módulos isolados. Não contratar branches Supabase pagas nem publicar produção sem autorização específica e gates reais concluídos.
