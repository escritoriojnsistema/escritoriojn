# Etapa 31 — vínculo seguro do portal

## Resultado e uso

A conta04 e a identidade08 são reutilizadas. A gestão abre Clientes → ficha → Vínculos → Identidade → Convite do portal, seleciona a conta confirmada e registra referência da conferência administrativa. O código aleatório de256bits é entregue manualmente ao contato confirmado. Só o SHA256 é persistido; código fora de URL/log/auditoria/storage do navegador. Validade24h, consumo atômico e único. A repetição técnica com a mesma chave/sessão/corpo reconcilia um sucesso já confirmado; outra tentativa com código consumido falha.

Cliente abre Conta → Meu vínculo no portal. Antes de conferir, nenhum acervo antigo é selecionado por nome/CPF/e-mail. Aceitar cria/confirma a mesma relação08; colisão, versão alterada, conta errada ou contato diferente bloqueiam. Duplicidade usa conferência/revogação/mesclagem08 explícitas. Recuperação real de senha foi testada e não muda pessoa vinculada. Conferência administrativa08 continua alternativa válida.

Representantes: vínculo08 e identidade própria conferidos são pré-requisitos. Clientes → Vínculos → Representantes → Autorizar andamento cria autorização distinta por atendimento, com prazoaté30dias/revogação. Escopo público de andamento; sem notas, título interno, documentos, anexos ou financeiro. Revogar a representação/identidade-base interrompe acesso; reconferência não ressuscita a autorização antiga. A gestão pode revogar também uma autorização indisponível. Versões documentais/portal ampliado permanecem nas próximas etapas e gates25/26.

Cliente não recebe foundation.access: projeção permissions=[], regras próprias de sessão/papel/escritório para portal, RLS próprio de contexto e manutenção dos gates de pedidos/Conta/notificações/categorias. Atores internos seguem exigindo capacidades internas. Não há nova Auth, login, catálogo, pipeline de arquivos, financeiro nem concessão individual.

## Camadas e apresentação

- Backend:2 POST Bearer/no-store, JSON estrito, erros genéricos e DTO allowlist. Uma verificação de identidade e uma RPC por comando/consulta.
- Supabase:3 tabelas privadas com RLS/ACL fechadas; helpers privados e2 wrappersINVOKER; mutex por escritório/revalidação após espera, versão da ficha/contato, idempotência por sessão, auditoria semPII. Índices por token/escritório/ficha/identidade reduzem busca.
- Frontend: áreas incorporadas em Conta/Vínculos, padrão Equipe/Convites, uma área por vez, quatro atalhos mobile e extras no menu. Formulário oculto após emitir código para compactar a entrega. Sem spinner/overlay/rótulo de carregamento. Resposta503 conserva tentativa;401/403 limpa; navegação pendente protegida.
- Worker/Storage/Vercel config: não se aplica mudança; pipeline11 e gates25/26 mantidos. Publicação somente GitHub→Vercel, semActions/deployCLI/API direta.

## Verificações locais executadas

-376 testes Node aprovados; TypeScript frontend/backend e build aprovados; npm audit de produção:0 vulnerabilidades.
- Replay completo final Postgres17:2.137 verificações, com migradorNOSUPERUSER/NOBYPASSRLS, regressões até30 e corrida de duas conexões31. Segunda suíte31 após ajustes:23 verificações; consulta local100amostras/p95≈11ms. Não é medida da rede hospedada.
- Laboratório real GoTrue/PostgREST/Express: pré-vínculo sem acervo, conta errada/UUID/código reutilizado negados, retry exato, contexto cliente sem permissão interna e recuperação real preservando identidade. Sem fixtures hospedadas.
- Revisão independente em duas passagens, com correções de escopo, aliasSQL, falha de sessão, retry e revogação de autorização indisponível. Capturas de apresentação são fictícias.
- Interface/regressões:66 cenários aprovados no conjunto final Desktop/Mobile320–1920, incluindo10 específicos31, quatro perfis, Conta/Vínculos/carregamento/devoluções/especializados30. A primeira execução teve4falhas:3fixtures antigas sem seleção de categoria foram corrigidas;1cenário de busca cancelada passou isoladamente e no conjunto final, sem mudança de produto. Capturas mobile/desktop conferidas visualmente.
- Regressão adicional com publicação histórica existente: revogar identidade08 remove o artefato do portal;6verificações aprovadas.
- Advisor hospedado anterior: aviso já existente de proteção contra senha vazada desativada; não houve alteração de configuração Auth/plano. [Referência](https://supabase.com/docs/guides/auth/password-security#password-strength-and-leaked-password-protection). RLS sem policies em tabelas privadas é fechamento deliberado porACL/RPC, não concessão pública.

## Publicação e continuidade

PR112/merge4bcc15a, Vercel3jq49aot READY: compatibilidade do login publicada antes do schema31. Runtime/schema31 homologados localmente, aguardando publicação pela integração; NÃO afirmar conclusão hospedada neste checkpoint. Antes de qualquer aplicação manual, consultar schema_migrations apósGit e comparar comandos. Nenhuma migration anterior deve ser reaplicada.

Próxima32 somente por novo pedido; nenhuma função de32 foi iniciada.
