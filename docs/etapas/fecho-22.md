# Fecho da Etapa 22 — 02/11/2026

Implementação concluída na branch `feat/etapa-22`, base b3a9330. Publicação e readback ainda em acompanhamento; não declarar produção antes das evidências abaixo.

## Resultado verificado

- 252 testes Node/API/worker/PDF passaram; bytes determinísticos, acentos, numeração de todas as páginas, última cláusula, marca de rascunho, limites, corrupção e revogação concorrente.
- 603 linhas PASS SQL em dois bancos PostgreSQL17 descartáveis, migrador sem SUPER/BYPASSRLS. Inclui21/modelos/importação/fluxo integrado, snapshots com participantes exatos, cinco estados editoriais, aprovação→nova revisão, histórico privado, sessão revogada, leitura read_all com JWT serviço vazio, renderer1 preservado e renderer2 em novos jobs.
- 28 testes Playwright passaram: regressões21/pós21/modelos e cinco novos de22. Larguras320/360/768/1440, sidebar, até4atalhos, sem loaders/overflow, prévia exata por hash e503 com chave preservada. Contratos usam fixtures locais interceptadas; não são autenticação hospedada.
- TypeScript, build Vite/servidor, Deno2.5.6 check, diff-check e npm audit produção (zero vulnerabilidades) passaram. Node24.19.0/npm11.9.0; dependências de runtime preservadas.
- Revisão independente apontou dois achados corrigidos: conclusão service_role perdia read_all do ator (SQL reproduzido com JWT vazio); desmontagem do workflow perdia tentativa incerta (bloqueio de abas/menu até retry mesma chave). Sem achado material restante conhecido após os testes.

## Publicação

Pendente: registrar PR/commit, VercelREADY, migration `20261102134139_document_versions22_preview`, worker e comparação de schema/arquivos/barreiras. Fluxo exclusivamente GitHub→Vercel; sem Actions/deploy CLI/API da Vercel. Worker Supabase deve preceder o schema; após merge, conferir aplicação automática antes de qualquer aplicação manual.

## Integridade e limites

Antes do rollout hospedado:5Auth/5vínculos/64modelos/64versões/1aprovação/17grants individuais/99eventos, zero documentos/revisões/publicações/artefatos e zero serviços. Nenhuma fixture/Auth/permissão individual criada no projeto real. Sem serviços reais, a jornada autenticada do gestor com documento real depende da configuração operacional pela UI; a jornada de negócio foi validada em bancos locais e contratosAPI/UI, não por alteração de contas reais.

RLS privada sem policy é intencional com ACL fechada. Aviso anterior de proteção contra senhas vazadas permanece; nenhuma configuração Auth foi alterada. Não promete impedir cópia física nem fornecer assinatura criptográfica. Arquivos novos de prévia são material de trabalho; entrega conserva gates anteriores.

Próxima leitura: AGENTS, Livro, cartão22/fecho e regra documental afetada. Próxima23 somente por novo pedido.
