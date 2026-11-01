# Fecho do fluxo documental integrado — 01/11/2026

O usuário autorizou expressamente concluir a publicação pela integração GitHub→Vercel. O bloqueio de acesso ao preview deixou de impedir a entrega: o PR71 foi integrado e a versão canônica de produção foi conferida diretamente.

## Publicação comprovada

- PR71: merge `e4645119899ba390d435d429e0063db74267ab0e`; VercelSUCCESS `B77pPnJDiQzZWwXZeQyTLSRHoQ8M`.
- Canonical: `https://escritoriojn.vercel.app`. Bundle `index-DgvvE7Mg.js`/`documents-CmfQ3JY4.js` contém catálogo, documentos do portal, endpoints comerciais/workflow e envio ao caixa.
- Supabase aplicou automaticamente pelo Git as migrations `20261101143627` (148comandos) e `20261101144028` (40comandos), total33históricas. Não houve apply manual.
- Função `document-artifacts` ACTIVE/v1, JWT obrigatório; bucket privado, PDF somente e limite3MiB. Invoker/ACL/RLS dos novos registros conferidos, completion somente service_role.
- Health200; APIs comerciais/portal401sem sessão e401com token inválido; Edge401anônima. Seis visitas reais Chromium360/1440 aos novos caminhos redirecionaram ao login correto, sem erro JS ou overflow.
- Preservados5Auth/5vínculos/64modelos/1aprovação existente; zero documentos/cobranças/pagamentos criados para testar no hospedado.

## Organização inicial

A conferência revelou64modelos sem pasta:19contratos,23declarações,17requerimentos e5ofícios. A migration `organize_existing_templates_by_kind` organiza somente modelos sem localização já escolhida. Ela usa o tipo documental existente, não altera texto/aprovação/preço e não atribui a uma pessoa uma ação técnica do migrador. Pastas e localizações já escolhidas por humanos são preservadas. Reexecução não muda IDs/revisões. A aplicação e a contagem final devem ser confirmadas no histórico após a integração desta alteração.

## Configuração comercial real

Não havia serviços ou preços cadastrados no banco no momento da conferência. O gestor autorizado precisa cadastrar o código/valor real em Serviços e vinculá-lo ao modelo aprovado em Modelos. O sistema não atribui preços fictícios nem aprova as minutas em nome do usuário. Essa configuração utiliza as telas publicadas; não é falta de ligação entre os módulos.

## Provas e limites

246Node/API;549PASS SQL A+B em dois replays com migrador limitado e corridas reais;75contratos UI afetados; PDF real Node/Deno; build/typecheck e auditprodução0. A organização inicial acrescentou10verificações em dois replays, total559PASS, comprovando classificação, preservação e replay sem mudar IDs/revisões. Evidências anteriores em `docs/evidencias/fluxo-integrado/verificacao-20261101.md`.

A jornada autenticada com contas hospedadas não foi exercitada; não se usaram senhas/contas reais nem fixtures no banco hospedado. O laboratório Auth/Storage local excedeu o espaço Docker. As provas de pagamento parcial/integral/estorno, perda de vínculo e delegação são RPCs reais em bancos descartáveis; Storage/worker e renderer têm provas separadas. Assinatura eletrônica externa permanece bloqueada. Serviços com requisitos09/10 não capturados pelo novo formulário permanecem no fluxo existente, conforme o checkpoint.

Rollback operacional é de código, preservando banco, documentos, cobranças e histórico. Não usar DROP/reset nem repetir migrations já aplicadas. O fecho documental não exige novos recebimentos, e-mails, contas ou reaprovações de modelos.
