# Fecho26 — entregas, impressão e WhatsApp manual

Estado: concluída, publicada e verificada em https://escritoriojn.vercel.app pela integração GitHub→Vercel. Base `2a96843`/Etapa25 mais correções07/11 conferida antes de editar. [Cartão do Drive](etapa-26.md), [escopo](../superpowers/specs/2026-11-07-etapa-26-entregas.md).

## Comportamento

`private.deliveries` registra publicação/revisão, arquivo/hash/tamanho, cliente/contato conferido, canal, operador/session_id e UTC do servidor. Eventos separam tentativa, disponibilização, confirmação e revogação. Download privado gera disponibilização de acesso autorizado, sem afirmar transporte completo, leitura ou recebimento. Legado25 não foi retroativamente convertido em entrega fictícia.

Impressão e WhatsApp manual usam o proxy/worker24 e os bytes preservados. Acesso explícito revalida antes/depois do worker, compara hash e conserva a regra25. Disponibilização declarada exige release25 posterior à tentativa, do mesmo operador/sessão/destinatário/publicação/hash/arquivo; confirmação exige evento distinto e evidência. Nenhuma abertura de conversa ou diálogo de impressão marca recebimento. WhatsApp contém somente número oficial conferido e texto genérico, sem link/documento/identificadores do sistema; o operador baixa e anexa o PDF manualmente. Sem automação de envio real.

Destinatário limitado ao cliente vinculado ao pedido. Telefone alterado invalida tentativa anterior e a conferência visual precisa ser refeita; não há campo para telefone arbitrário. `documents.deliver` e `documents.deliveries.revoke` integram concessão explícita em Equipe, seed somenteowner. Revogação exige owner/admin com capacidade/responsabilidade e bloqueia novos acessos finais da publicação, inclusive por rotas anteriores/portal, sem prometer recolher bytes já obtidos. Atendimento concluído pode entregar resultado elegível sem editar documento/pedido; cancelamento/estorno/novas versões/assinatura/restrições continuam bloqueando pelo gate existente.

Eventos/comandos imutáveis, idempotência por ator/chave/corpo, evento esperado e rechecagem de autoridade após esperas. ACL/RLS fechadas, wrappers públicosINVOKER, sem URLs Storage públicas/assinadas. Nomes/telefones/notas das entregas participam da redação controlada pelo motor existente de retenção: só reserva/lease/eliminação física/ausência de hold autorizam remover conteúdo pessoal, conservando hash/versão/FKs. Nenhuma política jurídica nova.

## UI e desempenho

Entregas e impressão integra o seletor documental existente; sem quinta aba/atalho e uma área por vez. Padrões Equipe, checkbox/alvos44px, campos16pxmobile, ações por seletor, histórico paginado5/recolhível, botões com rótulos estáveis e sem spinner/overlay.503 preserva tentativa;409 exige reconferência;401/403 descarta dados/arquivo. Estado privado continua preso à sessão/autoridade do editor. Consultas indexadas por escritório/publicação/entrega, sem listas ilimitadas nem novo serviço/SDK/pipeline de PDF. Não há promessa de latência zero/rede instantânea.

## Provas executadas

- 346 testes Node/API passaram; includes DTO estrito/PII removida, comandos forjados, proxy com bytes exatos e negação concorrente depois do worker.
- Dois replays SQL do domínio21→26/correções, migrador semSUPER/BYPASSRLS, passaram:1.519linhasPASS no total,48assertivas26 impressas mais redação26 executada dentro do teste de retenção. Incluem WhatsApp/telefone alterado, snapshotfinanceiro alterado, impressão pendente, autoridade de caixa insuficiente, outro escritório/cliente, duplicidade/conflito, confirmação separada, atendimento concluído, imutabilidade/ACL e revogação por rota alternativa. Corridas históricas de sessão/saldo/assinatura e encerramento também executadas.
- 37contratosbrowser24–26:36passaram no lote inicial; um cenário histórico1440 não encontrou editor após navegação e passou na rechecagem isolada. Todos os9novos26 passaram, incluindo quatro larguras320/360/768/1440,503,401/403, bloqueio pendente e nova conferência após mudança do telefone. Screenshot360 inspecionado.
- Build frontend/servidor/typecheck e diff-check passaram; auditprodução0. Aviso preexistente do chunk operacional>500kB permanece; não mudou o mecanismo de divisão nesta etapa.
- Revisão independente encontrou doisP2: disponibilização sem autorização posterior do arquivo e conferência visual reutilizada para telefone novo. Ambos corrigidos com regressões: SQL negaavailable semrelease e browser telefoneRED→GREEN. Correção deambiguidadeSQL emcontact_position observada no novo cenárioWhatsApp e verificada nos dois replays finais.

## Limites e publicação

Jornada Auth/REST/Express/Storage/PDF real local aprovada com `scripts/test-deliveries26-real.mjs`: download/artefato preservados byte a byte, tentativa/idempotência, disponibilização negada antes de acesso privado, confirmação explícita e revogação bloqueando equipe/portal, sem afetar outra publicação. O pull padrão do Storage falhou por falta de espaçoVFS; a recuperação usou rootfs da mesma imagem oficial fixada, manifest/layersSHA256conferidos, via lançador já existente no laboratório. Nenhuma alteração do produto/worker para contornar o teste. Não houve envioWhatsApp externo, impressão física, teste de scanner/assinatura criptográfica, aparelho físico ou uso de conta pessoal hospedada.

Sem alteração dos motoresPDF/workerEdge, Auth, cadastro/serviços/preços reais ou configuraçõesVercel: não se aplica modificar essas camadas além da integração Git existente. Supabase/migration e runtimeFrontend/Express foram publicados e conferidos. Nenhuma fixture hospedada. SemActions/deployCLI/API Vercel. Etapa27 não iniciada.

## Publicação e conferência hospedada

Compatibilidade[PR95](https://github.com/escritoriojnsistema/escritoriojn/pull/95):commit`4d6e0b1`,merge`dcffe3f4`,Vercel`BgWQuY3684bEEhi1xdHvQ6F664No`SUCCESS, antes do schema. Runtime/schema[PR96](https://github.com/escritoriojnsistema/escritoriojn/pull/96):commit`fae99b3`,merge`0ff5a764`,árvore`851b5bfe`igualàhomologada,Vercel`Gu1WoD4PzXBQgW55ykmtyVUAWpGp`SUCCESS. [Publicação](../evidencias/etapa-26/publicacao.json).

Migration`20261107144130` aplicada automaticamente apósGit:32comandos na mesma ordem iguais ao arquivo,7corposprivadosMD5iguais,3wrapperspúblicosINVOKERsóauthenticated/semEXECanônimo e3tabelasRLS/ACLfechadas. Seed2somenteowner, nenhum grantindividual novo. Histórico66→67;7Auth/7vínculos/17grantsindividuais e0documentos/arquivos/publicações/entregas preservados. **NÃO reaplicar migration.** [Schema](../evidencias/etapa-26/schema-publicado.json),[ACL](../evidencias/etapa-26/acl-publicada.json).

Build com configuração pública extraída do próprio bundle publicado:8assetscanônicosSHA256iguaisao build,entry`index-B2EE63MX.js`,home/health200,5APIs401;3contratosbrowserpúblicos360/1440passaram.9UI26repetidos para capturar apresentação final passaram novamente. [Bundle/barreiras](../evidencias/etapa-26/bundle-publicado.json). Sem jornada com contas pessoais hospedadas; positivafoicomprovadanolaboratório real.

Advisors semERROR;INFO deRLSprivadassem policy/índices ainda sem uso é compatível comACLfechada/base vazia; nenhumaFK26semíndice. WARNpreexistente de proteção de senhas vazadas desativada preservado, sem mudança deAuth: [orientaçãoSupabase](https://supabase.com/docs/guides/auth/password-security#password-strength-and-leaked-password-protection). [Advisors](../evidencias/etapa-26/advisors.json).

## Checklist final

- [x] Etapa26 conforme cartão doDrive; tentativa/disponibilização/confirmação distintas.
- [x] PadrãoDesktop/MobileEquipe, até4açõesprincipais; sem novo atalho/aba, histórico recolhível/paginado e rolagemnatural quando necessária.
- [x] Mesmo painel/fluxo, sem loaders visíveis;503mantémtentativa,401/403limpa.
- [x] Backend↔Frontend revisados; índices e revalidações necessárias preservados, sem prometer latênciazero.
- [x] Backend,Frontend,Supabase,GitHub,Vercel eLivro conferidos; PDF/Edge e cadastro/Auth preservados.
- [x] SemActions,fixtureshospedadas ou envioexterno não solicitado; próximo27somente por novo pedido.

Fechamento seguinte somente documental; não repetir banco/E2E/deploy funcional sem mudança executável.
