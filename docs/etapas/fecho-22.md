# Fecho da Etapa 22 — 02/11/2026

Etapa22 concluída e publicada pelo [PR74](https://github.com/escritoriojnsistema/escritoriojn/pull/74), feature `e287147b`, merge `c904170f`. Base b3a9330 preservada. Vercel `dpl_8ThZyZKKFVYG7awAxZVuiczA6zPj` READY/produção/sourceGit, commit exato confirmado; https://escritoriojn.vercel.app.

## Resultado verificado

- 252 testes Node/API/worker/PDF passaram; bytes determinísticos, acentos, numeração de todas as páginas, última cláusula, marca de rascunho, limites, corrupção e revogação concorrente.
- 603 linhas PASS SQL em dois bancos PostgreSQL17 descartáveis, migrador sem SUPER/BYPASSRLS. Inclui21/modelos/importação/fluxo integrado, snapshots com participantes exatos, cinco estados editoriais, aprovação→nova revisão, histórico privado, sessão revogada, leitura read_all com JWT serviço vazio, renderer1 preservado e renderer2 em novos jobs.
- 28 testes Playwright passaram: regressões21/pós21/modelos e cinco novos de22. Larguras320/360/768/1440, sidebar, até4atalhos, sem loaders/overflow, prévia exata por hash e503 com chave preservada. Contratos usam fixtures locais interceptadas; não são autenticação hospedada.
- TypeScript, build Vite/servidor, Deno2.5.6 check, diff-check e npm audit produção (zero vulnerabilidades) passaram. Node24.19.0/npm11.9.0; dependências de runtime preservadas.
- Revisão independente apontou dois achados corrigidos: conclusão service_role perdia read_all do ator (SQL reproduzido com JWT vazio); desmontagem do workflow perdia tentativa incerta (bloqueio de abas/menu até retry mesma chave). Sem achado material restante conhecido após os testes.

## Publicação

Migration `20261102134139_document_versions22_preview` aplicada automaticamente peloGit;31comandos iguais ao arquivo e nenhum SQL restante fora do histórico, SHA256 `6a148a2ae626327f0eec6f299fb08779722d30262cb8b4d73b114861ffe6e942`. Nenhuma aplicação manual/duplicada. Três tabelas RLS/ACL fechadas, três wrappers de leitura/início/autorizar autenticados e conclusão somente service_role; wrappers INVOKER e captura diferida confirmados. Default de novos jobs `jn-document-v2`.

Worker compatível versão9 foi implantado antes do schema; Git publicou versão10 ACTIVE/JWT, sete arquivos-fonte idênticos ao código testado, incluindo fontes e renderers antigos. Health/home/documentos200, oito assets200 com hashes registrados e marcadores novos no bundle, APIs/worker anônimos401; três Playwright públicos canônicos passaram em360/1440. Os hashes do build local sem configuração pública diferem nos chunks que incorporam a configuração Vite; o commitGit, os assets realmente publicados e as funções-fonte foram conferidos. Fluxo exclusivamente GitHub→Vercel; sem Actions/deploy CLI/API da Vercel.

Evidências: [publicacao.json](../evidencias/etapa-22/publicacao.json),[arquivos e barreiras](../evidencias/etapa-22/arquivos-e-barreiras.json). Fecho posterior altera somente documentação; não reaplicar schema nem alterar os PDFs históricos.

## Integridade e limites

Contagens hospedadas antes/depois do rollout, idênticas:5Auth/5vínculos/64modelos/64versões/1aprovação/17grants individuais/99eventos, zero documentos/revisões/publicações/artefatos e zero serviços. Nenhuma fixture/Auth/permissão individual criada no projeto real. Sem serviços reais, a jornada autenticada do gestor com documento real depende da configuração operacional pela UI; a jornada de negócio foi validada em bancos locais e contratosAPI/UI, não por alteração de contas reais.

Advisors:93INFO RLSsemPolicy (90anteriores+3novas privadas com ACL fechada), WARNpreexistente de senha; zero FKsemíndice nas novas tabelas. RLS privada sem policy é intencional com ACL fechada. Aviso anterior de proteção contra senhas vazadas permanece; nenhuma configuração Auth foi alterada. Não promete impedir cópia física nem fornecer assinatura criptográfica. Arquivos novos de prévia são material de trabalho; entrega conserva gates anteriores.

Próxima leitura: AGENTS, Livro, cartão22/fecho e regra documental afetada. Próxima23 somente por novo pedido.
