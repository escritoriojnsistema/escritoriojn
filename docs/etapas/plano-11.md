# Plano de implementação11

1. Reconferir manual, AGENTS/Livro/fecho10 e esquema remoto; registrar baseline. Concluído:79testesNode,13migrations,5Auth/5vínculos,0pedidos e0objetos/buckets privados.
2. Fixar contrato compartilhado, criar migration com CLI e implementar schema/RLS/Storage/leases/políticas/retenção com testes SQL e corridas. Reutilizar helpers10/09 e permissões05; índices de todas as novas FKs.
3. Implementar API Express de metadados, Edge de validação/cópia/limpeza com credencial somente runtime, testes de bytes/DTO/autorização/falhas. Nenhum upload pelo limite de corpo da Vercel.
4. Integrar tela responsiva ao menu/painel/pedidos, API/sessionScope/StorageJWT, vazio e quarentena explícita; testar navegação/densidade/rascunhos e isolamento.
5. Laboratório Docker real Auth/PostgREST/Storage: upload/downloadnegado, scanner ausente, falha/retomada, cópia privada e plano de limpeza; replay SQL sob migrador limitado. Executar suítes de navegador sequencialmente para preservar artefatos. Revisão independente e correções com regressão.
6. Typecheck/build/audit, publicação Git/PR/merge, reconferir migration aplicada automaticamente antes de qualquer apply, Edge JWT/readback, bucket privado/RLS/ACL/índices e canônico Vercel/statusGit. Sem Actions ou contas/fixtures hospedadas. Registrar evidências, fecho11, Livro e checkpoint12.

Divisão por contratos: banco/testesSQL; frontend/testesUI; laboratórioStorage/testesAuth; integraçãoAPI/Edge/publicação com o agente principal. Não editar arquivos de outro domínio sem coordenação.
