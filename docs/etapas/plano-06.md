# Etapa 06 — plano e especificação

Fonte: etapa-06.md, manual v4, regras/acesso.md. Pedido inclui correção urgente dos portais. Execução inline; React + Vite/TS, Express e Supabase existentes. Não iniciar 07.

## Aceite e interfaces

- Entrada: senha em sessão efêmera; API confere área antes de persistir. Cliente só cliente; equipe só vínculo owner/admin/employee ativo. Exceção estreita: convite UUID no portal equipe, autorizado pela API do convite. Cadastro público exclusivamente cliente.
- Auditoria /auditoria: filtros ação/ator/período, escritório, paginação 3/5, audit.read atual. Exportação JSON até1000 exige também audit.export e evento transacional. Limite excedido pede filtros mais estreitos.
- Arquivados /arquivados: referência mínima de vínculo, consulta paginada/filtro. Arquivar em Equipe exige users.manage + archives.manage e escopo vigente; desativa vínculo/revoga delegação/convites dependentes. Restaurar referência mantém conta inativa e histórico; reativação posterior somente gestão explícita. Último owner protegido.
- SQL aditivo, RLS/ACL mínima, ator auth.uid/sessão real, helpers sem acesso público, falha de auditoria crítica reverte operação. Nenhum delete/purge automático.
- Documentar inventário, classes de retenção, procedimento/modelo de solicitação de titular, incidente e contrato de eventos. Controlador define prazos/bases legais; não inventar conformidade.
- UI operacional: sidebar/menu/atalhos com ícones44px, mobile16px sem sombras, filtros recolhíveis e páginas compactas. Rolagem natural para conteúdo longo/zoom/teclado; cliente sem módulos restritos.

## Sequência

1. Portais: reproduzir recusas/corridas RED, corrigir e provar Auth real; Node/build/UI/público; publicação urgente GitHub/CI/Vercel.
2. SQL: testes de escopo/ator/ACL/exportação/rollback/arquivo/restauração RED; CLI gera migration; implementar e provar dois replays com migrador restrito.
3. API: validação estrita/erros seguros/Bearer e uma RPC de negócio por operação. Testar anônimo, campos extras/ator, filtros e erros; sem contexto redundante.
4. UI conectada e capacidades delegáveis; contratos fictícios separados de Auth real. Desktop/mobile/zoom/foco/erros e navegação Equipe→Auditoria→Arquivados.
5. Revisão independente da branch e correção de achados relevantes; regressão Node/SQL/Auth/UI/público/build e advisors/integridade.
6. Migration testada → GitHub/CI → Vercel → prova pública; Livro/fecho com SHAs/URLs/resultados. Rollback só código, preservando banco/auditoria. Nenhuma mutação das quatro contas hospedadas/envio de e-mail real.

Pré-voo: capacidades SQL ↔ shared/team.ts ↔ convite/delegação; DTOs RPC ↔ Express ↔ telas; paginação3/5 e limite1000 iguais. Nav usa contexto vivo, RPC autoriza definitivamente.

Decisão: SupportedStorage público impede adoção abandonada antes de SIGNED_IN, preservando chaves/PKCE/fallback. Web Locks serializa commits entre abas compatíveis; fallback síncrono protege a aba sem prometer exclusão entre abas antigas. Tokens transitórios só em memória e storage Auth oficial, nunca logs/cache de negócio.
Scripts auxiliares da skill cloud indisponíveis no executor: plano/checkpoints versionados substituem bookkeeping, sem alegar execução.

Checkpoint: portais26 Auth reais +2 adicionais,23 Node,build passaram. UI/público/publicação e módulo06 pendentes.

Verificação complementar concluída:23 contratos UI e34 E2E públicos locais passaram. Primeiro ensaio Auth sem executablePath falhou por browser ausente; execução válida usou /usr/bin/chromium e passou. Revisão independente encontrou duas corridas P2; ambas reproduzidas RED e corrigidas com sessão efêmera/guard de commit.
