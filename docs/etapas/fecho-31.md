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

**APROVÁVEL — publicada e verificada.** PR112/merge4bcc15a/Vercel3jq49aotREADY publicou compatibilidade do login antes do schema31. PR113/featuref7860608/mergedb62ea92, árvore95b47002, VercelCvPcKh9kREADY/origemGit: https://escritoriojn.vercel.app.

Migration20261110233856 foi aplicada automaticamente pela integração apósGit.32comandos correspondentes ao arquivo e13definições finais iguais ao Postgres17 homologado.3tabelas novasRLS/ACL fechadas;2wrappersINVOKER/autenticado/anonnegado;cliente sem foundation.access. **NÃO reaplicar.** Nenhuma aplicação manual foi feita.

72assets publicados iguais byteabyte ao build com configuração pública real,8cenários públicos hospedados aprovados, home/health200 e APIs privadas401/no-store. Cadastros/Auth/memberships e permissões individuais conferidos e preservados; não publicar contagens/hashes sensíveis. Zero registros de teste31 hospedados. Advisor mantém apenas aviso de senha vazada desativada já existente; tabelas privadas novas seguem fechamento deliberado porRLS/ACL/RPC. Não houve contratação ou alteração de configuraçãoAuth.

Evidências:[verificação local](../evidencias/etapa-31/verificacao-local.json),[schema](../evidencias/etapa-31/schema-publicado.json),[bundle](../evidencias/etapa-31/bundle-publicado.json),[publicação](../evidencias/etapa-31/publicacao.json). Sem mudanças emActions ou deploydiretoVercel. Limites: homologação de contas/recuperação ocorreu em laboratório real local, testes hospedados foram públicos/read-only e conferência de schema/integridade; não houve login privado de usuário real ou envio de convite real de teste.

Próxima32 somente por novo pedido; nenhuma função de32 foi iniciada.
