# Plano de implementação — Etapa37

Objetivo: importar acervo legado com conferência humana e reversão lógica, preservando01–36.
Arquitetura: React/Vite/Express/Supabase existentes; módulo de importação em Configurações, sem CRM, caixa ou pipelinePDF paralelos. Referências canônicas customers08/files11 e valores de abertura próprios deste domínio.
Especificação: etapa-37.md e regras/operacao.md; base5f62751,80migrations/última20261114153947.

## Decisões de implementação

- ArquivoJSON UTF-8 até256KiB/100linhas, modelo descarregável. source_id estável e único por escritório, origem e data de corte explícitas. Cada linha conserva origem; normaliza cadastro com helper07, sem associar por nome/contato.
- Prévia oficial sem persistir lote; revalidar sob lock e comparar fingerprint antes de confirmar. Erros por linha não inviabilizam as linhas válidas; débitos/créditos aceitos devem conferir separadamente com os totais declarados da fonte.
- Acesso owner+settings.access+customers.read/read_all/create. Valores exigem charges.read/create/adjust atuais; arquivo exige files.read+requests.read e gate11. Sem novas capabilities/grants.
- Novo cadastro é não verificado. Vínculo explícito com pessoa existente exige identificação08 ativa e versão exata. Arquivo já enviado por11 só pode ser associado ao cliente verificado do seu próprio atendimento. Capturar SHA256, proteger referência; nunca copiar bytes, aprovar, assinar ou liberar.
- Valores iniciais são memória de obrigações/créditos de abertura, sem payments/cash_entries/charge_items e sem inclusão em receita19. Não são quitação nem crédito gastável. A tela identifica que o recebimento dessa abertura não está habilitado por este importador.
- Reversão acrescenta decisão e inativa efeitos de abertura; conserva cadastros, relações, referências de arquivo e histórico, sem DELETE nem alterações em pagamentos/atendimentos posteriores. Reimportação não ressuscita lote revertido.
- UI uma área por vez,3/5linhas por página,até4ações,sidebar existente,semloaders.503 conserva comando/chave/corpo e bloqueia saída;409exige nova prévia;401/403limpa.

## Execução e verificações

- [x]1. ContratoJSON/normalização/limites e relatório tipado: testesNode RED→GREEN, semPII em URL/log/cache.
- [x]2. Migration: tabelasprivadasRLS/ACLfechadas, wrappersINVOKER, prévia/aplicação/replay/reversão; exercício Auth/REST/Express real local com5linhas, concorrência, revogação e arquivo11.
- [x]3. API e interface Configurações→Importação: modelo,prévia,confirmação,histórico,relatório e reversão; testes320/390/768/1440/quatroperfis/503.
- [ ]4. Revisão independente única, corrigir achados materiais com testes; suíteNode/build/tipos/audit e regressões pertinentes.
- [ ]5. Publicar porGitHub→Vercel, conferir históricoSupabase apósGit antes de qualquerapply; verificar domínio/barreiras/cache/PWA e atualizar Livro/AGENTS/fecho/evidências.

## Foco de revisão

Fonte renomeada/reordenada, identificador/contato duplicados semCPF, centavos negativos sem compensar totais, vínculo08 revogado depois da prévia, erro503 com confirmação já executada e reversão após referência posterior.

## Registro

15/11: histórico/fecho36/manual37 conferidos antes de modificar. Usuário autorizou implementação/publicação neste pedido. Implementação na branchfeat/etapa-37, checkout exclusivo limpo; testesbase em execução. Recuperação36 continua pendente, não bloqueia o contrato mínimo37 segundo o manual. FormatoJSON escolhido para preservar tipos e vínculos explícitos sem nova dependênciaCSV. Não importar dados reais nem criar fixtures hospedadas.

Revisão independente: umP2 de contagemJSONB corrigido com contador de bytesJSONcompacto/limite de profundidade16 e loteUnicode261.892bytes RED→GREEN; helpers privados semexecuteapp. TesteSQLintegral detectou FKdearquivo37 semguarddinâmico11; adicionado triggercanônico de exclusão, semalterar funções anteriores. Cobertura ampliada para perda de resposta apósCOMMITreal, chaves diferentes concorrentes, identidade08revogada apósprévia e paginação3/5. Benchmark realAPI100linhas/10.004cadastros,5amostras sequenciais:p50≈722ms/p95≈769ms; não representa10usuários distintos nem SLA hospedado.
