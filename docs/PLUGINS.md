# Plugins e responsabilidades

Inventário em 17/10/2026: catálogo de habilidades da sessão, ferramentas disponíveis e pesquisa de plugins instalados. Instalação não garante autenticação, destino correto ou autorização para qualquer ação.

| Recurso conectado/disponível | Uso pertinente |
| --- | --- |
| Desenvolvimento Profissional IA — 17 habilidades | Orquestração, diagnóstico, arquitetura, especificação, backend, frontend, testes, segurança e continuidade aplicados à etapa 01. Restantes acionadas no domínio/etapa apropriados. |
| Superpowers | Planejamento proporcional, isolamento, teste antes da implementação, verificação e revisão. |
| Google Drive | Manual, regras e cartões oficiais lidos. |
| GitHub | Perfil/repositório/origem verificados; preservar main e histórico; entrega revisável em branch quando destino confirmado. |
| Supabase | Projeto ativo identificado na 01; quatro contas existentes conferidas somente em leitura no refinamento 02. Sem obter chaves, conectar SDK ou alterar contas/schema. Banco/RLS: etapa 03. |
| Vercel | Projeto/equipe conferidos; publicação técnica por Git autorizada na 02, build READY e 28 E2E remotos no refinamento. Homologação comercial/elegibilidade: etapa 39. |
| Cloud Environment | Estado, rede e runtime verificados. Sem credenciais de serviços configuradas no ambiente. |
| Context7 | Documentação oficial Vite consultada para montar Express antes do fallback HTML. |
| Firecrawl | Disponível para documentação pública quando necessário; sem coleta externa nesta base. |
| Product Design, Figma e MagicPath | Disponíveis para decisões e artefatos visuais; nenhum arquivo/protótipo indicado. Seguir navy/claro/dourado do manual nesta etapa. |
| PostHog | Analytics fica para requisito posterior, sem enviar dados nesta etapa. |
| Stripe | Integração de pagamentos não ativada no produto inicial pelo manual. |
| Sites | Hospedagem gerenciada alternativa; etapa exige repositório React + Vite/Express e destino Vercel, portanto não criar site paralelo. |
| Plugin Creator | Manutenção/criação de plugins quando solicitada; nenhuma alteração do plugin do projeto necessária. |
| Work Pets, Plugin Management | Ferramentas auxiliares; gestão usada para inventário. Pets não faz parte do produto. |

Usar os recursos de cada plugin quando pertinentes preserva o escopo e evita criar serviços ou transmitir dados sem finalidade. O manual orienta expressamente usar a menor combinação necessária.

## As 17 habilidades do projeto

Aplicadas nesta rodada: orquestrar-modulos, diagnosticar-repositorio, especificar-modulo, arquitetar-fullstack, construir-backend-api, frontend-responsivo, automatizar-testes, auditar-seguranca-privacidade, auditoria-final, documentar-continuidade, github-revisao-ci e modo-economico-ia.

Reservadas para implementação nas etapas pertinentes: supabase-modelar-banco (03), supabase-auth-permissoes (04), integrar-servicos (integrações autorizadas), vercel-publicacao (02/39, conforme tipo de publicação) e pwa-offline-sync (35). No refinamento 02, supabase-auth-permissoes também foi consultada para a conferência segura das contas, sem ativar autenticação. Não carregar habilidades apenas para preencher inventário.

Atualização da etapa 02: vercel-publicacao foi aplicada ao diagnóstico/publicação técnica; Firecrawl e navegador leram a referência pública e documentação oficial; GitHub entregou PR/CI/merge e iniciou o deploy Git Vercel. Publicação e 23 E2E remotos comprovados no alias canônico. Logs e previews protegidos retornaram 403 pelo conector, sem alteração da política de proteção. Supabase não recebeu mutações.

Refinamento de compactação: inventário de conexões revisto; catálogo também identifica Linear instalado, reservado para gestão de tarefas quando solicitado. Usadas habilidades pertinentes do plugin de 17 habilidades, navegador para medições, Drive para cartão 02, GitHub/Vercel para entrega e Supabase para conferir as quatro contas Auth em leitura. Não ativar Stripe, analytics ou integrações apenas para cumprir contagem de plugins; o manual pede finalidade e menor combinação necessária.

Etapa 03: inventário revisto por pesquisa de provedores; conexões pertinentes continuam disponíveis. Aplicadas supabase-modelar-banco, auditar-seguranca-privacidade, automatizar-testes, orquestrar-modulos, diagnosticar-repositorio e documentar-continuidade; documentação/CLI oficiais Supabase e Docker local para replay/ACL/RLS. GitHub recebe CI de banco; Vercel mantém React + Vite. SMTP customizado informado pelo usuário é configuração do Supabase, sem novo serviço de e-mail ou cópia da senha. Figma/MagicPath/Product Design, PostHog, Stripe, Sites e Linear não recebem artefatos/dados sem finalidade nesta etapa de banco.

Etapa 04: catálogo completo da sessão revisto; acionadas habilidades pertinentes do plugin de 17 habilidades: orquestração, diagnóstico, especificação/arquitetura, Auth/permissões, modelagem SQL, backend, frontend responsivo, integração Auth/SMTP, testes, segurança, revisão Git/CI, publicação Vercel, auditoria e continuidade. PWA/offline permanece na 35. Supabase/Drive/GitHub/Vercel/ambiente usados nos respectivos destinos; Vercel env recusado por 403. Superpowers orientou testes/revisão e delegação independente do laboratório local; habilidade React Best Practices aplicada à revisão dos componentes. Não ativar plugins de pagamentos/analytics/design paralelo sem finalidade.

Etapa05: inventário por Plugin Management reconfirmou Drive, Supabase, GitHub e Vercel instalados; catálogo completo e17 habilidades disponíveis revistos. Aplicadas orquestração/diagnóstico/especificação/arquitetura, banco/RLS/Auth, backend, frontend responsivo, integrar-servicos para SMTP, testes, segurança, revisão/CI/publicação, auditoria e continuidade. Supabase orientou APIs atuais; Superpowers orientou isolamento, RED/GREEN, diagnóstico por evidência, trabalho independente de banco/UI e revisão; React Best Practices revisou componentes. Screenshots fictícios e laboratório Docker não enviam dados reais a serviços de design/analytics. PWA, Stripe, PostHog e funções futuras continuam reservados; menor combinação pertinente conforme manual. Segredo automático somente no runtime Edge Supabase, sem cópia para Vercel ou novo provedor de e-mail. Autorização anterior de publicação técnica Git/Vercel preservada pelo pedido de implementação; nenhuma ação destrutiva ou contratação.

Ajuste operação/mobile05: reutilizadas as habilidades de frontend-responsivo, orquestração, Auth/permissões, testes, revisão e continuidade já consultadas; Superpowers orientou reprodução RED/GREEN e revisão independente. Catálogo/conexões pertinentes preservados. GitHub/Vercel entregam o ajuste; Supabase somente leitura de saúde e totais, sem DDL, contas ou SMTP. Sem nova instalação ou envio de dados reais a design/analytics; React+Vite mantido.

Etapa07: Drive forneceu cartão07 e regras/clientes; diagnóstico confirmou ausência prévia do módulo e base móvel/sem loaders existente. Aplicadas habilidades pertinentes de orquestração/diagnóstico, frontend, backend, banco, segurança, revisão/CI, auditoria e continuidade; Supabase orientou RLS/ACL/RPC e changelogPG17.11. Superpowers orientou RED/GREEN, implementação independente e revisão sem achados P1/P2; React Best Practices revisou componentes. Docker prova SQL/Auth/REST/SMTP sintéticos; capturas não contêm dados reais. GitHub/Vercel seguem autorização técnica documentada em fecho06 e escopo integral do pedido07; conector Vercel do time continua403, sem contorno de proteção. Sem instalar serviços ou ativar PWA/pagamentos/analytics.

Etapa09: Drive forneceu cartão09 e tópico catálogo/atendimento. Aplicadas orquestração/diagnóstico/especificação, banco Supabase/RLS, backend, frontend responsivo, testes, segurança, GitHub/publicação e continuidade; Supabase forneceu documentação atual de funções/ACL e React Best Practices orientou a revisão. Revisão independente encontrou vigência após lock, precisão monetária e geração de chaves, corrigidas com regressões. Somente dados fictícios locais nas capturas e laboratórios; nenhuma informação real enviada a MagicPath/Figma/analytics. A carteira de17 habilidades permanece referência; nenhum plugin/serviço foi instalado por contagem. Actions desativado e publicação exclusivamente GitHub→Vercel, conforme usuário; autorização técnica anterior preservada pelo pedido09. Sem PWA, pagamentos ou recursos de etapas futuras.

Etapa10: cartão10/RF-05 do Drive, habilidades DEV pertinentes já disponíveis no MagicPath e Supabase/RLS, planejamento/testes/diagnóstico/revisão independente, React Best Practices e verificação integrada aplicados. Trabalho separado por arquivos de banco/interface/API, integrado na mesma branch. Sem instalações de serviços, dados reais em design/analytics ou ações de mensagens. GitHub Actions permanece desativado; entrega exclusivamente GitHub→Vercel no escopo autorizado. Conector administrativo Vercel403 preexistente, sem mutações por outro mecanismo. Testes e limites no fecho10.
