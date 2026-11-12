# Compatibilidade de cadastro — publicada antes das migrations

Complemento da Etapa34, sem iniciar35. Rodapé compartilhado ao fim das telas; cadastro cliente exige três declarações separadas antes da senha e envia metadata versionada `jn_client_acceptance`, mantendo cookies opcionais desativados. Não cria permissões nem altera contas existentes.

O incremento de compatibilidade não contém migrations. Foi publicado primeiro pelo GitHub→Vercel e o cadastro publicado foi conferido antes de integrar a exigência no triggerAuth e os formulários/anexos por categoria. Isso preservou o cadastro durante a atualização. Nenhum GitHub Actions ou deploy direto.

Publicação concluída12/11/2026: PR123/merge7783522/produçãoCdJdicHRREADY; depoisPR124/mergeb449b54/produção43hrmZbeREADY e duas migrations automáticas. HistóricoSupabase78/última20261112143334. Ver o [fecho das correções](correcoes-portal-categorias-aceites.md) e [registro](../evidencias/correcoes-portal-categorias-aceites/publicacao.json). Não repetir rollout nem reaplicar migrations.
