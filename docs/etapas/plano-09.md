# Plano de implementação — Etapa09

Objetivo: executar [contrato09](etapa-09.md), com React/Vite, Express e Supabase existentes. Execução nesta sessão; revisão independente ao final. Não iniciar10. Preservar dados/contas e Actions desativado.

## 1. Dados e API

- [x] Escrever testes API/SQL para catálogo ausente, anônimo, payload inválido, R$0,50/R$100,00, nova versão e snapshot anterior. Executar e registrar RED.
- [x] Criar migration incremental via CLI: `services`, `service_versions`, funções privadas de validação/autoridade/cálculo; wrappers invoker e grants mínimos. Ampliar catálogo de capacidades da gestão sem conceder a funcionários.
- [x] Criar `shared/services.ts`, `server/modules/services/{router,dto,validation}.ts`; montar `/api/services` em `server/app.ts`. Entradas: search/detail/create/version/quote; saída tipada com erros seguros. Publicação exige versão esperada e motivo.
- [x] Executar Node/API e dois replays SQL limitados. Acrescentar caso de concorrência entre publicação/revogação e rollback da auditoria.

## 2. Frontend

- [x] Testar entrada visível, vazio, formulário, histórico, simulação, permissões e ausência de loaders antes de implementar.
- [x] Criar `src/features/services/{api,ServicesPage,ServiceForm,ServiceDetail,services.css}` e integrar rota/menu/ícone. Reutilizar transporte autenticado/cancelamento, OperationLayout e estilos globais.
- [x] Em 320/360/768/1440, verificar menu≤4, inputs16/alvos44, rolagem natural, erros e respostas tardias. Cotação é simulação identificada; não cria pedido nem cobrança.

## 3. Integração e entrega

- [x] Testar jornada real local Auth→API→PostgREST→banco, revogação e histórico. Medir chamadas/duração e consulta indexada sem alegar latência zero.
- [x] Typecheck, build, regressões pertinentes e dependências de produção. Revisão independente da branch, corrigir achados relevantes com regressão.
- [ ] Atualizar Livro/fecho/provas, commit/push da branch e PR. Conferir integração Git→Vercel/preview disponível. Aplicar migration aditiva e publicar tecnicamente via Git conforme autorização permanente documentada e pedido09; registrar bloqueio externo sem alegar publicação.

Focos de revisão: versão futura e fronteira de vigência; números fracionários/overflow/arredondamento; capacidade retirada durante espera; resposta de sessão antiga; política/cotação não permitindo alterar histórico nem burlar aprovação/quitação.
