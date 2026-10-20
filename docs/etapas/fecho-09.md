# Etapa09 — catálogo de serviços, preços e políticas

20/10/2026. Checkpoint: implementação concluída, validação/entrega em andamento. Publicação09 ainda não comprovada. Referências: [cartão/contrato](etapa-09.md), [plano](plano-09.md), [atendimento](../regras/atendimento.md).

`/servicos` oferece busca paginada3/5, cadastro, publicação de versões, histórico e simulação. Código único por escritório; versão inteira conserva preço em centavos, categoria/unidade, campos/checklist, pessoa/participantes, aprovação/assinatura/quitação, quantidades e políticas de ajuste. Vigência imediata ou futura, sem retroagir/substituir versão. UPDATE/DELETE de versões negados; alteração não recalcula snapshots anteriores.

`services.read` consulta; `services.manage` publica com versão esperada e motivo; execução/aprovação/desconto/acréscimo/cortesia/preço manual têm capacidades independentes. Oito capacidades seed somente owner; funcionários/admin por concessão explícita na gestão existente. Cliente não entra no catálogo interno. Autoridade atual, escritório, sessão e locks no banco; uma identidade na API e uma RPC por operação. Wrappers invoker, implementação privada, search_path vazio, RLS e ACL sem acesso bruto. Evento de cadastro/publicação na mesma transação, sem motivo/campos livres na auditoria.

Simulação escolhe vigência pelo relógio do banco e devolve snapshot/cálculo em inteiros. Não cria pedido/cobrança nem concede aprovação/assinatura/quitação. A10 deverá chamar o helper privado e persistir snapshot na própria transação; cotação enviada pelo navegador nunca é autoridade. Xerox de Teste e Contrato de Teste foram exercitados somente em laboratório; catálogo hospedado não recebe fixtures.

UI reaproveita shell/cores/tipografia/sidebar e até4atalhos móveis incluindo Início/Conta. Formulário único com seções recolhíveis, campos16px e alvos44px; rolagem natural para configurações extensas, zoom e teclado. Sem spinner/loader/overlay, rótulos estáveis, repetição bloqueada e sucesso/erro explícitos. Revalidação preserva lista da mesma sessão; mudança de escritório/sessão/autoridade descarta estado e respostas antigas. Simulação anterior é invalidada quando seus dados mudam.

## Evidências e revisão

- 70Node/API, typecheck e build frontend/servidor passaram no checkpoint; última mudança de CSS ainda em verificação visual final.
- 958SQL (479×2), instalação vazia/migrador sem super/BYPASSRLS, grants/RLS, imutabilidade, vigência futura, arredondamento, quantidade/capacidades, versão obsoleta, rollback de auditoria e corridas de revogação/fronteira de vigência passaram.
- Auth09 real local3 passou: navegador→Express→GoTrue/PostgREST→SQL, contrato com campos/participantes e funcionário restrito. Regressão final com gestão/operação/renovação em execução.
- UI09 inicial9 passou; novas regressões de precisão, chaves, isolamento e densidade em validação. Sobreposição acidental de servidores/traces foi interrompida; não contar execuções interrompidas como sucesso. Um seletor de label com opções nativas foi corrigido para combobox acessível.
- Revisão independente identificou2P2 e uma chave de campo classificada inicialmente menor. Esta foi elevada aP2 por bloquear uma sequência válida de edição; os três pontos foram corrigidos com reproduções. [Registro](../evidencias/etapa-09/revisao.json).
- [Benchmark](../evidencias/etapa-09/benchmark.json):10mil serviços fictícios adicionais,10conexões/300amostras SQL locais; p95 lista772,405ms/detalhe80,669ms/cotação92,883ms. Navegadores/regressões também ativos; não mede rede/API/produção, não éSLA nem promessa de latência zero.
- Dependências de produção:0vulnerabilidades. Não há script lint; TypeScript, testes e diff-check são as verificações disponíveis.

## Entrega e limites

Autorização técnica permanente documentada nos fechos06/07 e PLUGINS aplica-se ao pedido09 no mesmo projeto; usuário reforçou GitHub→Vercel. Sem GitHub Actions, contratação, dados fictícios remotos ou mudança de contas/senhas/SMTP/Edge/env. Ordem compatível: código novo reconhece capacidades antigas→Git/PR/Vercel→migration aditiva ativa catálogo→conferência estrutural/HTTP. Conector Vercel administrativo403 preexistente; não usar para mutações nem contornar proteção.

Supabase de destino: `mcsuoxnubpqenyvbefee`, baseline10migrations/5Auth/5vínculos/1ficha/1contato/1origem, services ausente. Migration nova preparada/testada, ainda não aplicada neste checkpoint. GitHub/Vercel de destino preservados. Provas de commit/PR/deploy, migração/readback e HTTP serão registradas após as operações concluírem.

Rollback: desativar descoberta do catálogo por código mantendo tabelas/versões/auditoria; não DROP/reset e não recalcular itens. Etapa10 somente com novo pedido. Status atual: BLOQUEADA para conclusão pública enquanto validações/entrega finais não terminarem.
