# Etapa 02 — refinamento de compactação

Pedido de 17/10/2026: preservar as telas já implementadas e React + Vite, reduzir a rolagem e caber em uma tela quando possível. Este é um refinamento da etapa 02, sem iniciar banco/RBAC ou autenticação real.

## Comportamento e medições

Espaços e textos redundantes reduzidos, retorno/marca agrupados, rodapé em uma linha no celular e elementos decorativos ajustados à altura disponível. Sem altura fixa no conteúdo ou overflow hidden; conteúdo maior continua acessível por rolagem.

Altura total do documento em uma janela de **320×568**:

| Tela | Antes | Depois |
| --- | ---: | ---: |
| Início | 757 px | 568 px |
| Equipe | 801 px | 568 px |
| Cliente | 752 px | 568 px |
| Recuperação | 702 px | 568 px |
| Status | 740 px | 568 px |

As cinco telas padrão também cabem em 360×640, 768×1024 e 1440×900, sem rolagem horizontal. Dados completos em `../evidencias/etapa-02-compacta/medicoes.json`; capturas móveis na mesma pasta. Esse resultado se aplica ao conteúdo padrão, não a qualquer ampliação ou mensagem possível.

## Verificação por camada

- Frontend: cinco novos testes de layout, incluindo mensagem longa, foco e repetição após erro. Suíte local completa: **28 E2E passaram**, mais os **5 testes de compactação no preview compilado**. Mantidos inputs móveis de 16px e alvos interativos de 44px.
- Backend: nenhuma regra ou rota alterada. Health, POST sem persistência e erros JSON cobertos pela regressão; **5 testes Node passaram**.
- Build: npm ci, typecheck e build frontend/backend passaram; nenhum pacote adicionado.
- Supabase: consultas somente leitura confirmaram quatro contas existentes com e-mail confirmado. Public não contém tabelas e os campos business_role/role de app_metadata não estão definidos. Não equivale a testar login ou autorização. Contas, senhas, sessões e permissões preservadas; endereços/IDs pessoais não foram incluídos no Git público.
- Papéis informados pelo usuário: proprietário/superadministrador, administrador/superfuncionário, funcionário e cliente. Sua implementação confiável pertence à 03/04; não inferir permissão pelo e-mail no navegador.
- Revisão independente: sem achados P0/P1/P2/P3. Inspeções adicionais em alturas curtas mantiveram rolagem natural, foco visível e ausência de sobreposição. CSS zoom 200% conferido separadamente; não é auditoria WCAG integral nem teste em teclado físico de celular.
- GitHub/Vercel: entrega pela branch de refinamento, CI e deploy Git; resultado remoto será registrado após publicação, sem desligar proteção dos previews.

## Continuidade

**Status local: APROVÁVEL; entrega remota em preparação.** Não criar novas telas por excesso de espaçamento e não cortar conteúdo para aparentar caber. A preferência de compactação foi incorporada ao AGENTS/Livro para os próximos incrementos.

Rollback: base anterior conhecida 4bd1488, preservada no histórico. Nenhum rollback de banco necessário. Próxima etapa oficial continua sendo 03, somente quando solicitada.
