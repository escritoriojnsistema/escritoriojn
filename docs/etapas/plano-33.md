# Pedidos digitais33 — plano de implementação

**Objetivo:** concluir pedidos digitais por serviço, anexos e complementação na fila10 existente, sem segundo protocolo/financeiro/banco de atendimentos.
**Base:** maind905485/Etapa32 publicada, árvore limpa; AGENTS/Livro/fecho32/portal-pwa e manualDrive33 conferidos. React19+Vite8+TypeScript7, Express5, Supabase/Postgres17, GitHub→Vercel.

## Arquitetura e decisões

Reutilizar modelos/ofertas aprovadas21 para Documentos e publicar explicitamente o formulário dos demais serviços09 em Serviços→Pedidos digitais, com services.manage vigente. Não expor automaticamente serviços/campos internos. A publicação confirma a versão e o conteúdo que o gestor revisou; nenhum serviço/preço/permissão real será inventado. O catálogo novo não duplica os modelos da categoriaDocumentos.

Cada abertura registra um único atendimento/protocolo10 e snapshot09. O primeiro estado é aguardando_cliente para anexar pelo pipeline11 existente; somente Enviar solicita distribuição existente por categoria/nível/presença/capacidade. A continuação substitui a área do formulário, sem nova tela de cadastro. Pedido em preparação aparece somente ao próprio cliente/à equipe autorizada; não é comunicado como enviado. Captura revisão da publicação; retirada, mudança da versão ou revisão impedem o primeiro envio sem apagar os dados. O formulário novo de modelos estende booking21 de forma compatível, preservando chamadas antigas e geração documental.

Dados por serviço: campos09 tipados, quantidade/preço da versão atual calculados no servidor e checklist do cliente09/12 (nunca interno). Pendências12 continuam pendentes: declaração/anexo do cliente não valida nem dispensa exigência. Participantes e identidade08, quando necessários à execução, são conferidos pela equipe; conta mínima pode iniciar pedido próprio. Sem escolha de cliente/responsável/privilégio/ajuste/preço pelo payload.

Snapshots de entrada33 ligados ao item10 e revisões append-only preservam o original; staff lê os valores efetivos no detalhe10. Formulários/devoluções usam portal_request_state/command existentes, combinando campos do modelo com prefixo reservado para os de serviço, mantendo validação dos tipos/obrigatórios. Sem ampliar request_in_scope32/anexos para contrato compartilhado. Arquivos continuam privados, em quarentena e sem URL pública.

Idempotência: mesmos chave/corpo reconciliam o atendimento existente; chave aleatória isolada por UID/session_id/escritório pode ser mantida em sessionStorage, sem payload/token/PII/arquivo. Retomada consulta somente o pedido próprio no servidor. Nova sessão não herda rascunho local nem autoridade. Mesma chave com corpo diferente exige reconferência. Limite compartilhado de20aberturas/10min e100/dia por usuário/escritório e bloqueio de abertura equivalente recente; retries reconciliados não gastam limite. Guardar somente nonce, nunca estado de negócio.401/403limpa;503preserva tentativa/nonce e bloqueia saída;409reconferência.

Alterar apenas pontos necessários: contratos/shared; router de pedidos digitais; RPCs/ACL/RLS e wrappers de booking/retorno/detalhe; componentes incorporados em Serviços/Solicitações/catálogo; testes focados e reais. Não aplicar34/voz/PWA35. Sem novo menu/atalhos (máx4); padrões Equipe/Convites, alvos44px/inputs16px, uma área por vez, páginas3mobile/5desktop, sem loaders. Integridade financeira e gates25/26/32 preservados.

Alternativas descartadas: formulário livre como única opção não cobre campos/checklist; expor serviços internos automaticamente viola a publicação explícita; outro cadastro/protocolo/Storage/financeiro duplicaria a base.

## Execução e critérios

- [x] Contratos/API RED→GREEN: Bearer/no-store, corpos exatos, DTOallowlist, erros genéricos,429/retry, sem dados internos/preço/responsável forjados.
- [x] Banco RED→GREEN: configuração explícita/versionada, abertura e retomada próprias, snapshot09/item10/retorno12/Storage11, booking compatível, limites e concorrência/idempotência. Migrador sem superusuário/BYPASSRLS. Verificar deriva de versão e validade após locks.
- [x] UI: configuração de publicação, formulário por serviço/modelo, continuação com anexos e envio, retorno/revisão tipados e pendências; nonce sem PII, busy/navegação protegidos até nos incorporados. Dados tardios de outra sessão/escritório descartados.
- [x] Verificação: Node/tipos/build/audit; replay SQL completo e regressões31/32; Auth/REST/Express/Storage reais locais com comprador correto/terceiro, anexo real/quarentena, funcionário autorizado, reenvio e notificação semPII. Interface320/375/768/1440/quatro perfis e até4atalhos, sem loader/overflow.
- [x] Revisão independente de autoridade/retomada/replays/race/limites e arquitetura antes de publicar.
- [x] GitHub→Vercel apenas/semActions; consultar histórico remoto antes de aplicação manual; conferir schema/bundle/integridade/public endpoints; atualizarLivro/AGENTS/fecho e evidências.34 não iniciada.

## Foco de revisão

Conta/UID diferente conhecendo nonce/UUID não retoma ou anexa; preço/versão alterados durante espera não são aceitos silenciosamente; retries após publicação revogada ou perda de autoridade não contornam decisão; anexo/503 não solta navegação ou cria novo protocolo; duas confirmações concorrentes entram uma vez na fila e não validam checklist ou quitação.
