# Etapa 38 — plano de homologação

Base: `47e51700d7e123cc39663d020f598b200d056a53`, Etapa37 publicada. Manual: [Etapa38 no Drive](https://drive.google.com/file/d/1fQ4X5XyRjraIAYJIx3T78haiDMkFmdDT/view). AGENTS, Livro, fecho37, prevenção de erros e regras/operacao conferidos antes de alterar.

Objetivo: executar o sistema existente e registrar evidência atual de integração, isolamento, concorrência, acessibilidade, dispositivos, desempenho e recuperação. Nenhuma nova tela, capacidade, modelo financeiro ou migration é necessária apenas para homologar. Reutilizar testes e contratos existentes; corrigir produto somente diante de defeito reproduzido.

## Execução

- [x] Node/API/worker/DTO, build e auditoria de dependências de produção.
- [x] Dois replays SQL desde vazio, migrador sem superusuário/BYPASSRLS e corridas financeiras/documentais existentes; preservar evidências históricas geradas pelos benchmarks.
- [x] Contratos de navegador Desktop/Mobile, quatro perfis, no máximo quatro atalhos, menu, teclado, zoom, reflow e transições sem loader. Distinguir interceptação de API de integração real.
- [x] Jornadas reais em Auth/PostgREST/Express/Storage/worker descartáveis: documento com partes/portal, assinatura/aprovação e entrega; permissões e importação37/regressões pertinentes.
- [x] Carga de busca com dez sessões distintas e dez mil clientes fictícios, p95 proposto até2s, somente local. Restauração36 com banco/bytes/Auth/RLS/ACL/totais e duração; preservar pendência de recuperação externa real.
- [x] Supabase hospedado somente leitura: histórico/contagens/RLS/ACL/advisories; Vercel origemGit/commit/READY e domínioHTTPS/APIs públicas. Sem fixture, login com senha do proprietário, grants ou DDL hospedados.
- [x] Matriz passou/falhou/não executado com comando, ambiente, evidência e limites; aceite humano separado por fluxo. Atualizar Livro/AGENTS/fecho e GitHub via PR; Vercel somente integraçãoGit, semActions/deploydireto.

## Critérios e limites

Falha, skip, bloqueio externo ou cenário sem execução não se torna aprovado. Teste técnico não substitui aceite do proprietário em serviços/modelos/permissões/caixa de teste. Sem esse aceite, manter checkpoint38, sem iniciar39. Instalação físicaAndroid/iPhone e recuperação em outro projeto/conta precisam de observação própria.

Frontend e backend de produção só mudam se houver correção necessária. Onde não houver impacto funcional, registrar não se aplica, sem fabricar migration, deploy ou tela. Segredos, credenciais, dump e bytes privados não entram noGit ou nas evidências públicas.

## Registro

15/11/2026: checkout novo, exclusivo e limpo; branch `test/etapa-38`. Execução direta autorizada pelo pedido. BaselineNode/build/SQL/UI iniciados. ProduçãoGitREADY no mesmoSHA; Supabase81migrations/última20261115025828,7Auth/7vínculos/92role_permissions/2clientes/3solicitações/0files/0Storage/0lotes37. Nenhuma reaplicação.

Teste de carga isolado encontrou defeito real: dez sessões distintas pesquisando10.000clientes retornaram503 em≈8,4s. A função07/08 de listagem recalculava permissões por linha e materializavaJSON antes de paginar. Ruling: corrigir somente essa leitura pela migration `20261115152258_customers_search38.sql`, criada peloCLI3.1.0, mantendo o wrapper/ACL/contrato e todos os gates canônicos; não criar índice especulativo nem alterar cadastro/caixa. Revalidar ator/delegação após materialização, pois locks não congelam vencimentos. ImpactoSupabase agora aplicável por defeito observado; frontend/arquitetura permanecem iguais. RepetirSQL/escopo/carga e conferir aplicação automática apósGit antes de qualquer ação manual.

Validação final:426Node,2334/2340SQL,225cenáriosUI distintos(135anteriores+90/90após corrigir fixtures),7PWA build/4públicos e3skipsremotos cobertos localmente, tipos/build/audit0. Carga10usuários p95=483,76ms/fria656,32ms, escopo/delegação vencida RED→GREEN; restauração do schema82 em7903ms. Implementação/testes concluídos; publicaçãoGit e aceite humano continuam separados. O último item só fecha publicação após readback; aceite operacional segue não executado.

Publicação confirmada: PR134/mergec662913, Vercel7YSAt91L READY/origemGit, schema82/migration20261115152258 automática/2instruções/corpo igual.7fingerprints/contagens preservados,22HTTPS/barreiras401 e agregado de logs sem erros/fatais. Não reaplicar. Aceite operacional humano segue não executado; fecho documental não muda runtime/schema.
