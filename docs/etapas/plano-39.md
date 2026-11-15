# Etapa 39 — plano de publicação controlada

> Execução direta neste pedido, com `superpowers:executing-plans`; revisão independente antes de concluir.

**Objetivo:** preparar isolamento, mudança revisável, treinamento, suporte, rollback e piloto reconciliado conforme o [manual39](https://drive.google.com/file/d/1PpfJM1FPkVOrmDgfVLxirLWVlKNB0mbZ/view), conservando bloqueios operacionais reais.

**Base:** main `711beb958a8d9b74a1ed2fa1ab6c5ef8bd358a0b`; checkpoint38 publicado, schema82/última20261115152258. Livro/AGENTS/fecho38/matriz38/operacao lidos antes de modificar. Histórico datado não cancela este novo pedido39.

**Arquitetura:** reusar React/Vite, Express, Auth/RPC/RLS/Storage existentes. Sem tela, grant, conta, migration ou serviço paralelo para simular treinamento. Conexão Supabase de preview fica desabilitada no bundle e em todos os três criadores de cliente Express enquanto não existir homologação isolada aprovada. Produção e laboratório local preservam o contrato atual. Nenhuma alteração direta na Vercel; somente GitHub→Vercel, sem Actions.

## Restrições e revisão

- Até quatro atalhos/padrõesEquipeConvites, mobile/desktop/quatro papéis e transições sem loader preservados; nenhuma mudança visual necessária.
- Variáveis públicas compartilhadas preview/production foram observadas no provedor; não ler nem publicar valores secretos.
- Hobby foi confirmado pelo contextoGit da Vercel; domínio verificado não comprova elegibilidade comercial, orçamento ou aceite operacional.
- Nenhuma conta/fixture, e-mail, pagamento, assinatura ou piloto real hospedado sem condições e autorização aplicáveis. Pedido autoriza preparar a etapa e correções necessárias; não contratar plano nem inventar aceite.
- Falhas prováveis a verificar: conexão direta do navegador no preview, bypass da API pública de privacidade ou contextoAuth, build reutilizando envVite, regressão em produção/local, prévia inacessível por proteçãoSSO sem prova remota.

## Tarefas

- [x] Conferir repositório/Livro/manual e providers somente leitura; registrar plano, domínio, targets das variáveis e ausência de projeto separado visível. Custos indisponíveis não são zero.
- [x] Reproduzir preview com credenciais públicas válidas: API não deve chamar provedor. Testes de Authcontext, authenticatedClient e privacidade pública; depois aplicar guard comum em `shared/deployment39.ts` e `vite.config.ts`.
- [x] Verificar build real com envpreview apontando a produção: bundle sem host/chave, navegador sem preconnect/requisição externa e botões de acesso indisponíveis. Produção/local devem continuar conectando pelo contrato existente.
- [x] Registrar revisão de autenticação/e-mail/contas/permissões/jurídico/modelos/scanner e segredos; criar kit de treinamento por papel, piloto com conciliação e suporte/incidentes/rollback, sem marcar execução humana.
- [x] Rodar testesNode/tipos/build e verificações de navegador pertinentes; schema/contagens/RLS/ACL e HTTPS públicos hospedados somente leitura. Não repetir replaySQL/carga38 para mudança semSQL.
- [ ] Revisão independente, corrigir achados, atualizar Livro/AGENTS/fecho/evidências; preparar PRGitHub e observar previewGit. Publicação comercial/piloto seguem bloqueados até condições aplicáveis, sem avançar40.

## Entregas

`docs/etapas/etapa-39.md` (contrato/decisão), `publicacao-controlada-39.md` (matriz de prontidão/custos/autorização), `treinamento-piloto-39.md` (roteiros e registros vazios), `rollback-suporte-39.md`, `fecho-39.md`, evidências mínimas39. Não fabricar alteração em Supabase ou nova interface onde o manual exige operação humana.
