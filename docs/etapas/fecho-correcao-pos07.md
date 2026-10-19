# Fecho da correção pós07 — cadastro, sessão e rapidez

Conclusão verificada em 19/10/2026, após autorização do usuário para integrar e publicar. [Evidências estruturadas](../evidencias/correcao-pos07/fechamento.json). A PR13 contém as correções principais; a PR14 foi integrada e publicada. A PR15 registra este fechamento no Livro Raiz.

## Requisitos entregues

| Pedido | Comportamento verificado |
| --- | --- |
| Cadastro público em Clientes | Após confirmação do e-mail, gera ficha reutilizável. Exige customers.read; ler fichas de outros criadores exige também customers.read_all no mesmo escritório. |
| Ficha interna anterior | Contato coincidente conserva entrada para conferência, sem duplicar ficha nem associar documentos por e-mail. Ficha interna não cria login. Aprovação documental continua futura. |
| Sessão encerrada | UID/session_id correlacionam encerramento no armazenamento/SDK e nas abas. Logo, foco, refresh e recarga não reativam a sessão anterior. Novo login legítimo continua funcionando. |
| Rapidez de login | Contexto já verificado é transferido uma única vez para a sessão/portal exatos: duas consultas imediatas passam a uma. API, banco e verificações posteriores continuam obrigatórios. |
| Rapidez de convites | Resposta após o commit com envio pendente; waitUntil retém a entrega real. Acompanhamento limitado e reenvio explícito mantêm o resultado honesto. |
| Cadastro e Auditoria | Cadastro usa um POST real ao Auth, pré-conexão e timeout. O evento agora aparece como “Cadastro público recebido” na lista, detalhe e filtro da Auditoria. |

## GitHub e publicação

[PR14](https://github.com/escritoriojnsistema/escritoriojn/pull/14) integrada em `58eb81a14904c2704b0eb2870dad9991a2aad6d9`. Feature `736653e4885da60d0067e44b53ad14e9ff50a6be` e merge têm a mesma árvore `a85e698b801d87de2e2c968be69260d82ac9239a`.

[CI39289046673](https://github.com/escritoriojnsistema/escritoriojn/actions/runs/39289046673) SUCCESS nos três jobs: 54 Node/API, 564 SQL (282×2), 59 Auth/SMTP no laboratório, 34 E2E públicos e 96 contratos UI, além de typecheck/build. O CI anterior da PR13 também foi conferido. Os cenários Auth do laboratório cobrem os quatro papéis, logo, foco, refresh, reload, duas abas e adoção concorrente; não usam contas hospedadas.

A integração GitHub→Vercel publicou o merge com [status SUCCESS](https://vercel.com/escritorio-jn/escritoriojn/2tdkUv5UzTszLUpQQz6ZorZSgQ8e). O [canônico](https://escritoriojn.vercel.app/) serve `/assets/index-D4pEJeIW.js`, com o rótulo novo e os marcadores de sessão/cadastro. Nesta conclusão foram executados novamente 54 testes locais e build, todos aprovados, e **34/34 E2E diretamente no canônico**.

Health200; contexto, equipe, clientes e auditoria sem Bearer retornaram401/JSON privado no-store. O E2E também verificou rotas profundas, callback inválido, API desconhecida404, asset inexistente404, navegação e responsividade. O conector administrativo Vercel tem403 conhecido; a publicação foi concluída pela integração Git autorizada, sem substituir credenciais.

## Supabase

Nove migrations aplicadas, incluindo `20261019163453_customer_registration_registry` e `20261019164337_customer_registration_lock_compatibility`. SQL não foi repetido; SHA256 no JSON. Trigger de cadastro ativo e mutex FOR NO KEY UPDATE compatível com as FKs.

Contagens preservadas: cinco contas/cinco vínculos, uma ficha/um contato/uma origem materializada, zero aprovações e zero vínculo quebrado. RLS ativa e nenhum SELECT bruto anon/authenticated nas três tabelas afetadas. As origens não aprovam identidade ou documentos.

Edge `team-invitations` ACTIVE/v14 com verify_jwt=true. Leitura do código publicado confirmou index.ts e handler.ts idênticos ao repositório. Credencial privilegiada fica somente no runtime Edge; frontend/Express usam conexão pública e Bearer.

Advisors: tabelas sem policy/grant continuam intencionalmente fechadas e acessadas por RPC autorizada. Proteção de senhas vazadas desativada é aviso anterior; [referência](https://supabase.com/docs/guides/auth/password-security#password-strength-and-leaked-password-protection). Não houve mudança de plano, senha SMTP ou configuração Auth.

## Desempenho e limites comprovados

Login elimina a consulta imediatamente duplicada e convite deixa de aguardar Auth/SMTP para confirmar sua gravação. Cinco respostas hospedadas de signup nas últimas24h tiveram mediana upstream975ms e p95 de1121,7ms. São amostras históricas, não uma medição exclusiva após o deploy. A consulta anterior de token/contexto está no histórico deste arquivo no Git.

Métricas upstream não incluem navegador nem chegada à caixa postal. O benchmark de convite1390→201ms é sintético; não representa ganho percentual medido em produção. Entrega SMTP externa não foi disparada como teste. Isso não mantém pendência de código identificada nesta correção; limita a afirmação de desempenho do provedor externo.

## Integrações e importações

- React/Vite/TypeScript importa contratos seguros de shared e módulos de src/features. Servidor não entra no bundle; CPF/CNPJ reutilizam shared/identifiers.ts.
- Express recebe /api, verifica identidade e usa RPC/Bearer. Banco confere sessão, papel, capacidade e escritório; escritas/auditoria são transacionais.
- Auth cria perfil/vínculo de cliente; confirmação dispara a origem para Clientes. Cadastro interno cria ficha/contatos/auditoria e nunca conta Auth. Não existe importação em massa de clientes nesta etapa.
- Convite persiste pela RPC antes da Edge team-invitations. Só a Edge usa Auth admin para entrega autorizada.
- GitHub preserva lockfile/Node da .nvmrc. Vercel executa npm ci/build, serve dist e encaminha /api à Function Express antes do fallback SPA.
- Migrações Supabase e publicação Edge são independentes do deploy Git. Não repetir bootstrap/backfill nem importar estado do sistema anterior.

## Livro e continuidade

A [PR15](https://github.com/escritoriojnsistema/escritoriojn/pull/15) atualiza Livro, cartão e provas finais. A PR14 não permanece pendente. Não foi identificada outra mudança de runtime necessária no escopo solicitado.

As17 habilidades já habilitadas no MagicPath foram preservadas e exportadas. Não se afirma instalação global do plugin no ChatGPT/Codex, cuja ferramenta de registro não está exposta nesta sessão.

Numeração oficial Etapa01–40 preservada. Aprovação de acervo, prazo individual por inatividade e Etapa08 continuam preparados e futuros, conforme pedido original; nenhum desses recursos foi ativado. Retomar com AGENTS, Livro, este fecho e a regra afetada.
