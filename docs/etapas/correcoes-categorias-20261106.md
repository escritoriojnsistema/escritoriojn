# Correções incrementais — categorias, solicitações e documentos (06/11/2026)

Base publicada conferida: `bc2e5ba2`, Livro Raiz e fecho das correções pós-25. Pedido novo com cinco ajustes, sem iniciar Etapa26. Publicação autorizada pelo pedido de continuidade/publicação; usar somente GitHub→Vercel, sem Actions.

## Escopo e diagnóstico

1. Nova solicitação da equipe: categoria central sempre selecionável; modalidade calculada pela categoria e autoridade vigente. Superadministrador sempre atendimento. Administrador/funcionário habilitado abre atendimento; demais coletam pré-atendimento. O servidor revalida, sem confiar em modo informado pelo navegador.
2. Meus documentos: `20261105150002` revogou inadvertidamente EXECUTE do helper privado chamado pelo wrapper público invoker. Restaurar somente o grant exato; preservar identidade, sessão, destinatário e bloqueios de liberação.
3. Categorias do catálogo: os seletores já usam UUIDs centrais; pastas e tipos de modelos são outra classificação. Corrigir categorias arquivadas ainda projetadas no catálogo; manter metadados históricos editáveis apenas para gestores autorizados. Não inventar níveis nem criar categorias duplicadas a partir de pastas.
4. Exclusão de serviço: desvincular associação atual do modelo, inclusive serviços anteriormente arquivados, preservando configurações/revisões e snapshots históricos. Permitir novo vínculo explícito com serviço ativo e modelo aprovado; manter bloqueios de aprovação e liberação.

## Validação e publicação

Validação local concluída. Publicação e readback em andamento.

- 339 testes Node/API aprovados, zero falhas ou skips; build TypeScript frontend/servidor e Vite aprovado.
- Dois replays completos vazios com migrador sem superusuário/BYPASSRLS aprovados:1.961+1.967 verificações,3.929linhas PASS incluindo runner. Também205verificações SQL em12suítes no schema final local, incluindo permissões, roteamento, retorno do cliente, retenção, categorias, documentos e abertura por categoria.
- 22 contratos browser de Solicitações:14regressões e8cenários novos,360/1440px;2contratos de vínculo paginado com busca, sexto modelo,503/retry e troca de seleção.
- Jornada real local Auth→API→banco→browser aprovada: exclusão de serviço, modelo desvinculado, seis modelos aprovados na pasta, paginação/busca, vínculo no novo serviço pela UI, revisão monotônica e preço correto no catálogo do cliente; categoria arquivada oculta e editável pela gestão.11,5s na execução final.
- Revisão independente sem P0/P1/P2 pendentes. Corrigidos durante revisão a preservação de urgência na coleta e o retry de pré-atendimentos anteriores à migration.

Tentativas iniciais foram interrompidas por falta de espaço nos laboratórios Docker descartáveis. Um teste novo pressupunha coleta sem campos obrigatórios; outro pressupunha download negado financeiramente antes da validação de assinatura24. As fixtures foram corrigidas para usar dados fictícios tipados e os bloqueios atuais, sem relaxar guardas. O teste real de paginação também passou a ordenar os modelos de teste pelo código efetivamente usado no catálogo. Nenhuma dessas tentativas alterou produção.

## Estruturas e arquivos principais

- `20261106185942_catalog_categories_and_model_detach.sql`: tabela privada imutável `document_offering_detachments`, backfill de vínculos com serviços arquivados, trigger de desvinculação, projeções, vínculo explícito e consulta gerencial de categorias arquivadas.
- `20261106190057_restore_portal_documents_rpc_acl.sql`: EXECUTE exato do helper verificado de Meus documentos, sem ampliar acesso a tabelas ou helpers legados.
- `20261106190335_staff_category_request_opening.sql`: tabela privada imutável `staff_category_request_commands`, índices de FKs, RPC de abertura por categoria, modalidade decidida no banco, compatibilidade de retry e pré-atendimento legado. Sem novos grants individuais.
- `shared/{requests,categories,modelCommercial,modelCommercialValidation}.ts`, `server/modules/requests/{router,validation}.ts`, `server/modules/categories/dto.ts`: contratos e validação de entrada/saída.
- `RequestForm.tsx`/`RequestsPage.tsx`, `CategoriesSettings.tsx`/`categoriesApi.ts`, `ModelManagement.tsx` e `ServiceDocumentLink.tsx`: categoria primeiro, modalidade única, arquivo de categorias, serviço selecionado limpo após exclusão, busca/paginação de modelos aprovados.
- Testes SQL/Node/API/browser/Auth e `scripts/test-database.mjs`: regressões e diagnóstico do nome da suíte em falhas no schema final.

Nenhuma fixture hospedada nem alteração arbitrária de níveis, preços ou aprovações. As15categorias existentes continuam centrais e com níveis pendentes para escolha do administrador; pastas/tipos de modelos não viram categorias duplicadas. Categorias excluídas deixam os novos fluxos; versões, documentos, preços e históricos vinculados permanecem preservados.

## Publicação

PR90/schema e PR92/compatibilidade aplicadas automaticamente no Supabase; PR91/runtime merge `99447aa8`, Vercel `doaGBGdx` SUCCESS. As três migrations constam no histórico:13+2+14 comandos correspondem aos arquivos. Após o primeiro executor rejeitar LOCK fora de transação, a tentativa foi revertida sem objetos parciais; lock, backfill e trigger foram agrupados em DO atômico e testados com as66migrations em autocommit e migrador restrito. Readback:7 contas Auth,7 vínculos,17 concessões,64 modelos,2 serviços,15 categorias e0 documentos preservados;1 vínculo com serviço arquivado desvinculado sem exclusão histórica; portal grant autenticado restaurado e anônimo negado; tabelas novas privadas.8 assets publicados idênticos, home/health200 e5 APIs privadas401. Após o ajuste, repetidos dois replays completos:1.961+1.967 verificações e3.929linhas PASS incluindo runner. Sem Actions. Workers/cron existentes não foram modificados. Auth hospedado com contas reais e aparelho físico não foram exercitados nesta correção; a jornada autenticada foi validada no laboratório local real.
