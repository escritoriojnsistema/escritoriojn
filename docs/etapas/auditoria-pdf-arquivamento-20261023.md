# Auditoria: relatório PDF, integridade e históricos

## Escopo e autorização
Pedido posterior à entrega financeira já publicada; preservar essa entrega e as etapas existentes. Implementação e publicação GitHub→Vercel autorizadas, sem Actions, Vercel CLI/API, serviços pagos, fixtures hospedadas ou concessões individuais automáticas. Não declara15–40 concluídas.

## Contrato de implementação
1. Conferir produtores e regressões dos módulos existentes. Acrescentar somente mutações relevantes reais ausentes, com dados técnicos permitidos e sem PII em changes.
2. Auditoria mantém Recentes e recebe Arquivados internamente; o Arquivados genérico continua apenas memberships. Mesmos filtros e paginação nas duas abas. Escolha técnica:90 dias por padrão, por ser a opção que mais conserva contexto recente.
3. Política append-only por escritório:30/60/90 dias. Corte atual é o maior entre o piso histórico persistido e horário do servidor menos a política vigente. Ao trocar política, capturar o corte antigo e conservar esse piso. Aumentar prazo não desarquiva registros. Não apagar ou reescrever audit_events; nenhum cron necessário.
4. audit.read permite recentes. Arquivados exige owner/admin com audit.read+audit.archives; política exige owner/admin com audit.read+audit.manage. Seeds das novas capacidades somente para o papel owner, sem alterar permissões individuais. Banco/API revalidam identidade, sessão e capacidade, inclusive depois de locks.
5. A ação chama-se exatamente Exporta. API gera PDF efetivo com texto selecionável, fontes incorporadas, identidade e cores do escritório, filtros/período, responsável e horário do servidor, detalhes permitidos, cabeçalho/rodapé repetidos, numeração e marca d'água ESCRITÓRIO JN discreta em todas as páginas.
6. Exportação materializa snapshot transacional imutável do conjunto filtrado e da classificação temporal. Lotes estáveis por ordinal não incluem novos eventos nem mudam se política/nome mudar. Limite operacional explícito de10000 eventos e tamanho de arquivo compatível com a API; exceder falha antes de liberar PDF, nunca produz relatório parcial. Refine período/filtros para volumes maiores. Cada lote e conclusão revalidam sessão/permissões atuais. Revogação bloqueia entrega.
7. PDF final recebe protocolo; SHA256 dos bytes finais é registrado em cache append-only autorizado ligado ao snapshot, escritório, autor, quantidade e tamanho. Esse cache não é autoridade: como a mesma sessão pode chamar a RPC diretamente, a verificação calcula SHA256 localmente e a API regenera o PDF canônico do snapshot oficial imutável para a comparação. Preservar renderer/adaptador/catálogo/fontes/versões da apresentação1; alterações futuras exigem versão nova. Um hash antecipado divergente não veta a geração canônica nem confirma arquivo forjado. Não enviar o conteúdo do arquivo para verificar. Registro comprova correspondência ao arquivo registrado, não é assinatura digital, certificado oficial ou impedimento absoluto de conversão/edição.
8. Política e conclusão de relatório emitem auditoria transacional sem conteúdo pessoal; falha de auditoria reverte a mutação. Interface mantém rótulos estáveis, sem spinner/overlay, até4atalhos, alvos44px/inputs16px e descarte de respostas de outra sessão/autoridade.

## Plano e evidências exigidas
- Banco/contratos: política, snapshot, registro de integridade, RPCs/ACL e atualização dos catálogos de permissão; testar isolamento, revogação, rollback, limites e classificação monotônica em banco descartável.
- PDF: implementação isolada e testes reais de extração/acentuação, texto longo, múltiplas páginas e marca d'água; verificar visualmente páginas.
- API/UI: exportação binária, verificação, política e abas com filtros; testes de validação, permissões, sessão obsoleta e desktop/mobile.
- Produção: PR/revisão/testes proporcionais, merge autorizado, status Vercel via GitHub e assets canônicos; reler schema_migrations e comparar SQL antes de qualquer aplicação manual.
- Fecho: resultados reais, falhas/limites e próxima operação no Livro/fecho/evidências. Estado atual: publicada/verificada porGitHub→Vercel, PR Profissionalizar auditoria integrado. [Fecho](fecho-auditoria-pdf.md) e [publicação](../evidencias/auditoria-pdf/publicacao.json).

## Revisão integrada
Revisora independente Goodall e rechecagem do coordenador: corrigidos limites de período não alinhados à meia-noiteUTC na RPC, conflito de hash antecipado da mesma sessão e código de ação em inglês no PDF. Regressões SQL/API confirmam o contrato. Sem bypass de escritório/capacidade, concessão individual automática ou truncamento confirmado. [Cobertura dos produtores reais](../evidencias/auditoria-pdf/produtores.md).
