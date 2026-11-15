# Etapa 39 — publicar com controle, treinar e iniciar piloto

Fonte: [manual no Drive](https://drive.google.com/file/d/1PpfJM1FPkVOrmDgfVLxirLWVlKNB0mbZ/view), conferido nesta rodada sobre main `711beb958a8d9b74a1ed2fa1ab6c5ef8bd358a0b`. Entrada: contrato técnico38 comprovado; aceite humano38 e recuperação externa36 continuam pendentes. Este novo pedido autoriza preparar39, sem converter pendências anteriores em aprovação.

## Implementação desta rodada

Uma prévia recebia `VITE_SUPABASE_URL` e `VITE_SUPABASE_PUBLISHABLE_KEY` com targets preview/production. Mesmo sendo públicas, essas variáveis permitiam autenticação/cadastro/recuperação diretos no provedor de produção. A correção comum `shared/deployment39.ts` desconecta Supabase quando `VERCEL_ENV=preview`, no buildVite e nos três pontos Express que criam cliente: contextoAuth, cliente autenticado compartilhado e privacidade pública. Não depende da origem fornecida pelo navegador. Os três retornam503 seguro antes de tráfego ao provedor; ausência de Bearer continua401. O bundlepreview recebe valores vazios; Auth e Storage do navegador não recebem a conexão herdada, sem preconnect. A UI reaproveita “Acesso indisponível”, sem tela, banner técnico ou loader novo.

Todo preview fica desconectado nesta versão, inclusive se alguém configurar outra URL. Um projeto separado não existe entre os projetos visíveis nesta conexão. Habilitação futura exige revisão específica: projeto isolado, credenciais/URLsAuth/SMTP/buckets próprios, dados sintéticos, teste remoto e novoPR. Não basta adicionar uma variável de liberação. Prévia desconectada não é ambiente funcional de homologação nem comprova fluxo privado remoto. O deploy existente de produção e os laboratórios locais conservam o contrato.

Preparados: [prontidão/custos e mudança](publicacao-controlada-39.md), [treinamento/piloto/conciliação](treinamento-piloto-39.md), [rollback/suporte](rollback-suporte-39.md), [plano](plano-39.md), [fecho](fecho-39.md). Registros reais de participantes, finanças, incidentes e aceites devem ficar em repositório operacional privado; os modelos aqui são vazios.

## Camadas

| Camada | Resultado/impacto |
| --- | --- |
| Frontend | Apenas definição da conexão no build. Sem alteraçãoTSX/CSS/rotas/papéis/atalhos. PadrõesEquipeConvites, até4atalhos, rolagem natural e ausência de spinners preservados. |
| Backend | Guard síncrono antes de Auth/RPC; nenhum roundtrip adicional ou cache de autoridade. Erros/request_id/no-store permanecem. |
| Supabase | Somente conferência de histórico, schema, ACL/RLS e contagens. Nenhuma migration/grant/conta/objeto/fixture/Edge ou configuraçãoAuth nova. As82migrações já aplicadas não devem ser reaplicadas. |
| GitHub/Vercel | Mudança revisável porPR e preview da integraçãoGit; semActions/deploydireto/alteração de proteção/plano/env no painel. FonteGit, READY, alias e fluxo remoto são provas separadas. |
| Livro Raiz | Checkpoint39 registrado com limites e próximos atos concretos. Não iniciar40 por aparência. |

## Aceite

A correção técnica de isolamento pode ser verificada em laboratório. Publicação comercial e piloto real continuam bloqueados pelo planoHobby, ausência de orçamento/ambiente separado/recuperação externa e aceites humanos aplicáveis. Treinamento preparado não significa funcionário treinado. Build/previewREADY não significa implantação comercial autorizada, login remoto validado ou saldos reconciliados.
