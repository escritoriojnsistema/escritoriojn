# Etapa 30 — casos especializados e prazos

## Implementação

Entrada conferida antes de alterações: main6420006, Etapa29 publicada, correções pós28, AGENTS/Livro e manual oficial do Drive (`etapa-30.md`, RF14 em especializados). Caminho: Solicitações → abrir atendimento → Previdenciário e jurídico. Reutiliza a largura, tipografia, campos, menus e navegação de Equipe/Convites em desktop/mobile. Uma área de trabalho por vez; sem spinner/overlay/rótulo de carregamento; ações preservam nome e bloqueiam repetição. Complementos no menu lateral e no máximo4 atalhos móveis. Capturas320/360/768/1440 em evidencias/etapa-30.

`specialized_cases` captura serviço/modalidade/configuração e checklist12 imutável. Participantes são os já autorizados do item10, sem CRM paralelo. Funcionário prepara e encaminha ao proprietário; complementação retorna ao preparador efetivo pela transferência10. Condução exige owner/admin, responsabilidade e capacidades atuais, inclusive chamada direta e retry. `deadlines` guarda marco/prazo interno/externo, data, fonte, responsável atual, alerta, conferência e conclusão autenticada. Sem contagem jurídica automática por dias corridos.

Notas append-only ficam privadas sob specialized.sensitive. Classificações médico/estratégico usam o pipeline11 e exigem capacidade específica desde upload/metadados até download/Storage; cópia e referências compartilháveis são bloqueadas. Proteção de arquivo não muda quarentena. Portal recebe somente modalidade, etapa factual e pendência explicitamente compartilhável; nenhum protocolo interno, prazo, nota, metadado médico ou financeiro interno. Não há promessa de elegibilidade/deferimento.

Honorários consultam o ledger13. `specialized_expenses30` apenas associa despesa existente por ID/versão e mantém aprovação/pagamento/valor no financeiro17. Leitura/vínculo exige também cash.read+expenses.read. Não cria segundo financeiro. Cobranças/Anexos abrem o contexto autorizado do escritório/pedido. Aprovação, formalização, liberação e entrega continuam21–26; conclusão especializada não quita, aprova, libera nem entrega automaticamente.

## Verificação e revisão

- Baseline365Node passou; suíte posterior371Node passou; zero vulnerabilidades nas dependências de produção. API30 autentica Bearer, valida shape, remove campos desconhecidos e mantém no-store/erros sem SQL/PII.
- Primeiro replay completo do schema final:2.113 verificações aprovadas. A reinicialização do ambiente interrompeu a segunda passagem; não foi contada como concluída. Reexecução posterior do SQL30 no banco local preservado:29 verificações aprovadas e17 definições conferidas. Jornada Auth real reconstruiu o schema independentemente e passou.
-60 cenários UI finais de Especializados/Anexos/Cobranças/Despesas passaram, além de39 regressões de Solicitações/Rural27/DITR28/CCIR29. Teste da corrida contextual em Anexos falhou antes da correção e passou depois. Fixtures antigas foram alinhadas aos rótulos já vigentes e ao serviço de presença, sem alterar comportamento do produto.
- Jornada Auth/REST/Express/Storage real local passou, incluindo upload médico, processamento em quarentena, funcionário sem metadados/notas, download direto negado, Storage negado mesmo para clean explicitamente fictício, owner autorizado, encaminhamento/complementação, portal próprio e outra conta negada. Rodada final também cria cobrança13 e despesa17 reais somente no laboratório, vincula ao caso e comprova saldo100/pendência financeira preservados. Cinco roundtrips locais do estado:79,26–99,44ms; medida local, sem SLA hospedado ou promessa de latência zero.
- TypeScript/build finais passaram. Nenhuma dependência nova. Consultas paginadas5/10/20 e índices por escritório/caso/ator/FK; sem buscar listas inteiras no navegador. Área privada continua em chunk de rota.
- Revisão independente estática encontrou duas lacunas corrigidas: gates de autoridade antes de retries e paginação de conclusão de prazos. Corrida de seleção em Anexos recebeu teste RED→GREEN e cancelamento explícito da busca contextual ao escolher manualmente. Nenhum P1 encontrado.

## Publicação

Publicada pelo [PR110](https://github.com/escritoriojnsistema/escritoriojn/pull/110), featuree0cd77b5/merge135a6f0c; árvore379982cb idêntica à homologada. Preview8fBUgNcr e produçãoHSf67D59 READY pela integração GitHub→Vercel. https://escritoriojn.vercel.app. Sem Actions/deploy direto.

Supabase aplicou automaticamente migration20261110193000:54 comandos correspondentes ao arquivo normalizado,17 definições iguais ao laboratório,6 tabelas privadas com RLS/ACL fechadas e2 wrappers INVOKER negando anônimo. **NÃO reaplicar.** Setenta assets publicados iguais ao build com conexão pública de produção; home/health200, APIs privadas401/no-store e8 cenários públicos de navegador aprovados. Integridade dos registros existentes conferida privadamente e preservada; somente o resultado booleano foi publicado. [Publicação](../evidencias/etapa-30/publicacao.json) · [Schema](../evidencias/etapa-30/schema-publicado.json) · [Bundle](../evidencias/etapa-30/bundle-publicado.json).

Advisors: nenhum ERROR ou alerta novo de segurança/performance neste domínio. INFO de RLS privada sem policy é intencional com ACL fechada; proteção contra senhas vazadas desativada é WARN preexistente de Auth, fora desta etapa ([orientação Supabase](https://supabase.com/docs/guides/auth/password-security#password-strength-and-leaked-password-protection)).

## Limites

Sem fixture, Auth, preço, aprovação ou concessão individual hospedada. Capacidade nova tem seed sóowner; demais acessos exigem gestão explícita em Equipe. Scanner real permanece ausente. Clean fictício existiu somente no laboratório para provar a barreira de sensibilidade. Alertas aparecem no acompanhamento do caso; não há envio externo/cron. Datas são conferidas por pessoa competente, sem motor jurídico/feriados. Vínculo de despesa é imutável e não oferece desvinculação; conferir antes de salvar. Não houve aparelho físico, órgão externo ou promessa de resultado. Não se aplica mudança de renderer/worker documental nem de configuração da Vercel.

Próxima etapa31 somente por novo pedido, após fecho30 comprovado.
