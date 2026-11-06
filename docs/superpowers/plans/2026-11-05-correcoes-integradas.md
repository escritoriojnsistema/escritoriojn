# Correções integradas Implementation Plan

> Execução por domínios independentes conforme dispatching-parallel-agents; testes antes das alterações. Coordenador integra contratos compartilhados e executa suítes sequenciais.

**Goal:** concluir os14requisitos e validar20cenários do pedido05/11.
**Architecture:** wrappers/guards/RPCs no banco existente; UIEquipe reutilizada; rolloutGit compatível.
**Tech Stack:** React/Vite/Express/Supabase.
**Spec:** ../specs/2026-11-05-correcoes-integradas.md

## Global Constraints
SemActions; semfixtures/grants/preços/níveis reais inventados; preservar25/bytes/Auth/FKs. Registrar política jurídica pendente; nunca aplicar5anos universalmente. Nãoalterararquivo de outrodomínio semcoordenar.

## Review Focus
BypassUUID/RPC/Storage; legado semnível; exceção limitada a umpedido; cancelamento/retornosconcorrentes; logoutcomdadosretidos; primeirocarregamentosemcache.

### Task1 — Níveis, categorias, transferências e pré-atendimento
- [ ] Diagnosticar funçõesatuais e escrever testesnegativos/positivos20cenários1–7.
- [ ] Migrationaditiva níveis/categoria canônica/roteamento/guardas eUIconfiguração/pré-atendimento.
- [ ] VerificarSQL/API/UI e declararcontratos aoTask2/4.

### Task2 — Devolução e cancelamento online
- [ ] Testes de propriedade/estados/motivo/notifications/edição/anexos/ocultação/reenvio.
- [ ] Servidor/banco e UIcliente/equipe conectados; integrar guardasTask1.
- [ ] Verificarcenários8–10/16/20 afetados.

### Task3 — Exclusão de conta e retenção
- [ ] Ler política/lei; tests exclusão/sessões/export/arquivo/retenção/purge/hold.
- [ ] Implementar todosos4passos/serviços/RLS/cron/arquivo privado; sem prazo sem fundamento.
- [ ] Verificarcenários13–15; registrar pendênciaslegais exatas.

### Task4 — Privacidade, recuperação, home e performance
- [ ] Medirbaselinefrio; fonteslegaisoficiais; testes navegação/opçõescookies/portalEquipe.
- [ ] Implementar avisos/preferências/versionamento/login/signup; Voltar; shellpúblicorápido.
- [ ] Medircomparação everificarcenários16–19.

### Task5 — Catálogo cliente, integração e publicação
- [ ] Diagnosticar banco/visibilidade; sincronizar apenas aprovadoselegíveis/serviços/preço, semfake.
- [ ] Cobrircenários11–12 e integrar todosdomínios/testes20cenáriosSQL/Node/UI/Auth.
- [ ] Revisãoindependente; corrigirachadoscomtestes; publicarGit→Vercel/schema/Edgequandoafeta.
- [ ] Readback/banco/contagens/ACL/bytes/assets eLivro/relatório completo,semomitirpendência.
