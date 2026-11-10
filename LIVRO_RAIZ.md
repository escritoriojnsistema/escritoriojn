# Livro Raiz — Escritório JN

## Checkpoint atual: Etapa 30 publicada e verificada

Data:10/11/2026. [PR110](https://github.com/escritoriojnsistema/escritoriojn/pull/110), featuree0cd77b5, merge135a6f0c, árvore379982cb igual à homologada. VercelHSf67D59 READY, produção pela integração GitHub→Vercel: https://escritoriojn.vercel.app.

Casos previdenciários/jurídicos ficam em Solicitações → detalhe → Previdenciário e jurídico. Reutilizam catálogo, cliente, pedido, participantes, checklist12, anexos11, honorários13, despesas17 e documentos/entregas21–26. Funcionário autorizado prepara e encaminha ao proprietário; complementação retorna ao preparador. Condução e prazos exigem responsável owner/admin e capacidades vigentes, inclusive retry/chamada direta.

Notas e arquivos médicos/estratégicos exigem capacidade específica desde upload/JSON até Storage. Portal só recebe andamento factual e pendência compartilhável, sem nota, prazo, referência interna, médico ou financeiro. Prazo/marco manual tem tipo, fonte, responsável, alerta, conferência e conclusão, sem contagem jurídica genérica. Conclusão interna não promete deferimento nem quita/aprova/entrega.

Passaram371 testes Node,2.113 verificações no primeiro replay completo do schema final e29 SQL30 posteriores;99 cenários UI relacionados/regressões e8 públicos hospedados; jornada Auth/REST/Express/Storage real local incluindo honorários/despesas, TypeScript/build, auditoria de produção0vulnerabilidades e revisão independente com correções verificadas. Segunda passagem SQL foi interrompida pela reinicialização do ambiente, sem ser contada como concluída. Setenta assets publicados iguais ao build; home/health200 e APIs privadas401/no-store.

Migration20261110193000 aplicada automaticamente pelo Git:54 comandos correspondentes,17 definições iguais,6 tabelas privadas com RLS/ACL fechadas,2 wrappers INVOKER. **NÃO reaplicar.** Nenhuma fixture, conta, preço, aprovação ou concessão individual hospedada. Seed de capacidades novas somenteowner. Integridade existente preservada e conferida privadamente, sem publicar hashes/contagens de identidade/permissão.

[Fecho30](docs/etapas/fecho-30.md) · [Plano30](docs/etapas/plano-30.md) · [Cartão e fonte](docs/etapas/etapa-30.md) · [Publicação](docs/evidencias/etapa-30/publicacao.json) · [Schema](docs/evidencias/etapa-30/schema-publicado.json) · [Bundle](docs/evidencias/etapa-30/bundle-publicado.json).

Base preservada: Etapa29/PR108 e correções de acesso/retorno/performance pós28; [fecho29](docs/etapas/fecho-29.md), [fecho pós28](docs/etapas/fecho-correcoes-pos28.md). Histórico integral no Git.

## Continuidade obrigatória

- Ler `AGENTS.md`, este Livro, o cartão da etapa solicitada e somente as regras afetadas antes de modificar código. Reutilizar os contratos e módulos já publicados; não duplicar funções.
- Etapa anterior:29, preservando as correções pós28 de acesso, retorno e abertura. Ver [fecho28](docs/etapas/fecho-28.md), [correções pós28](docs/etapas/fecho-correcoes-pos28.md) e [mapa de acessos01–28](docs/etapas/mapa-acessos-01-28.md).
- Stack preservada: React + Vite + TypeScript, Express em `/api`, Supabase, GitHub e Vercel. Não migrar framework nem criar CRM/financeiro paralelo.
- Não usar GitHub Actions, deploy direto ou alterações destrutivas. Publicar pelo GitHub→Vercel. Antes de qualquer aplicação manual de migration, conferir o histórico remoto; integrações anteriores já aplicaram suas versões.
- Reutilizar o padrão de Equipe/Convites, Desktop/Mobile, até quatro atalhos principais e demais destinos no menu. Sem spinner, overlay ou rótulo de carregamento. Responsividade e rolagem natural preservadas.
- Não fabricar serviços, preços, níveis, aprovações, contas ou permissões reais. A configuração operacional é feita pelo gestor. Scanner ausente mantém arquivos em quarentena; conclusão interna não equivale a aceitação por órgão público.
- Preservar identidade, escopo e autoridade atuais. Cache ou vínculo cadastral não concede acesso. Troca de sessão/autoridade limpa dados;503 conserva a tentativa,409 exige reconferência e401/403 bloqueia.
- O histórico integral das etapas anteriores permanece no Git e nos cartões/fechos existentes. Esta consolidação evita republicar os detalhes antigos de auditoria no checkpoint público.

Próxima etapa:31, somente por novo pedido. Nenhuma implementação de31 foi iniciada.
