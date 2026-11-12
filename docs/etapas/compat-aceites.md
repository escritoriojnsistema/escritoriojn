# Compatibilidade de cadastro — antes das migrations de aceites

Complemento da Etapa34, sem iniciar35. Rodapé compartilhado ao fim das telas; cadastro cliente exige três declarações separadas antes da senha e envia metadata versionada `jn_client_acceptance`, mantendo cookies opcionais desativados. Não cria permissões nem altera contas existentes.

Este incremento não contém migrations. Após autorização, integrar este código pelo GitHub→Vercel e confirmar que o cadastro publicado envia a declaração antes de integrar a correção `fix/portal-categorias-aceites`, que adiciona a exigência no triggerAuth e os formulários/anexos por categoria. Isso evita bloquear o cadastro antigo durante a atualização. Nenhum GitHub Actions ou deploy direto.

A Etapa34 e a publicação de produção continuam pendentes de autorização. A correção posterior tem fecho próprio em `docs/etapas/correcoes-portal-categorias-aceites.md`; consultar somente quando esse arquivo existir na branch correspondente.
