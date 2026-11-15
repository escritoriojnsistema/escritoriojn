# Importação37 — procedimento e limites

Entrada em **Configurações→Importação** por superadministrador com settings.access, customers.read/read_all/create, charges.read/create/adjust, requests.read efiles.read vigentes no mesmo escritório. Cargo sozinho não concede acesso. Nenhuma nova permissão ou concessão foi criada. API/RPC repetem autorização e sessão atuais após o lock; identidade, vínculo cadastral ou cache não são autoridade.

## Preparar a fonte

No menu lateral, **Modelo de importação** descarrega JSONUTF-8 fictício de cinco linhas. Não confirmar esse modelo na produção: o exemplo só demonstra a conferência. O laboratório usa três cadastros válidos, uma duplicidade e uma linha inválida; nenhuma fixture é semeada no ambiente hospedado.

Substitua source por referência estável da fonte, as_of pela data de corteYYYY-MM-DD e os dois totais por centavosBRL inteiros positivos ouzero. expected_debit_cents eexpected_credit_cents são conferidos separadamente; crédito não compensa débito para aparentar conciliação. Limite100linhas/256KiB por arquivo,profundidadeJSONmáxima16. O banco conta bytesJSONcompacto preservando espaços dentro das strings; não usa o tamanho aumentado da representaçãoJSONB. Para acervo maior, dividir em lotes com referências distintas e totais da respectiva parcela. Não importar o estado, funções, credenciais, Auth, pagamentos ou autorizações de outro projeto.

Cada linha contém:

| Campo | Contrato |
| --- | --- |
| source_id | Referência externa estável e única no escritório,1–80caracteresASCII letras/dígitos/ponto/hífen/barra/doispontos/underscore. Nunca reutilizar para uma intenção diferente. |
| customer_id /customer_version | null/null para novo cadastro. Para vincular pessoa existente, UUID eversão atuais da ficha08, conferência de identidade08 ativa e dados correspondentes. Nenhuma associação automática porCPF/e-mail/nome. |
| kind /name /identifier /contacts | Mesmo cadastro07: person/company,nome,CPF/CNPJválido ou vazio,até4contatos email/phone. Normalização canônica no banco; CPF válido não prova identidade. |
| opening_cents | InteiroBRL: positivo representa obrigação inicial a receber; negativo representa crédito inicial informado pela fonte. Máximo absoluto1trilhão de centavos. Não é recebimento/receita, quitação ou crédito gastável. |
| evidence | Referência privada da conferência/origem,5–500caracteres. Usar referência documental, sem copiar dados pessoais ou segredos para explicações. |
| file_id | null ou UUIDde arquivo já enviado/validado pelo pipeline11, no atendimento da pessoa explicitamente verificada. |

A origem e as referências devem identificar o acervo sem nomes,CPF,contatos,senha ou segredo. A seleção do arquivo fica apenas em memória; não armazenamos seu conteúdo em localStorage/cachePWA. Informações são enviadas porPOSTprivado/no-store, nunca porURL, audit.changes ou logs técnicos.

## Conferir e confirmar

**Conferir lote** produz prévia oficial sem gravar clientes/lote. Resultado porlinha: novo cadastro, vínculo explícito, já importada ou rejeitada com motivo. O helper07 normaliza identificadores/contatos; coincidência de nome, identificador ou contato retém a linha para conferência, sem escolher pessoa/mesclar fichas. Homônimos precisam ser conferidos e vinculados explicitamente, sem criar duplicidade pelo importador.

Referência repetida no lote é rejeitada. Referência já aceita em qualquer lote do mesmo escritório não duplica efeito, mesmo renomeando/reordenando o arquivo; conteúdo diferente da mesma referência bloqueia nova confirmação. Arquivo inteiro repetido retorna seu lote atual, inclusive revertido. Linhas rejeitadas não geram cadastros, vínculos nem obrigações. O usuário deve conferir os totais das linhas aceitas contra o recorte correto da fonte; valores rejeitados não são silenciosamente incorporados.

Confirme somente após conferir origem, corte, linhas e totais separados. A transação recalcula a prévia e seu fingerprint sob lock; mudança de cadastro, identidade, arquivo ou escopo exige reconferência. O hash não concede acesso.503 conserva comando/chave/corpo e trava navegação/logout até confirmação;409pede nova prévia;401/403limpam a memória e bloqueiam. Nenhum arquivo/payloadpessoal é persistido no navegador.

Novos cadastros são criados peloCRUDcanônico07 e aparecem em Clientes, sem contaAuth ou conferência fictícia. Em pessoa existente, o importador apenas vincula a ficha, sem sobrescrever nome/contatos/identidade. O relatório persistido não duplica nomes de clientes: resolve nomes atuais da ficha autorizada; rejeições confirmadas conservam referência/motivo sem nome. ExportaçãoJSONde prévia/resultado é ação explícita no menu lateral e precisa ser guardada pelo operador em local privado.

## Arquivos e saldos

Arquivos antigos devem primeiro passar pelo fluxo **Solicitações→Anexos**11 no atendimento autorizado. Depois da conferência08, use uma linha documental com source_id próprio,customer_id/customer_version atuais efile_id. Arquivo de outra pessoa/atendimento,sem validação debytes/hash/tamanho,em limpeza/exclusão ou fora do escopo é rejeitado. A referência37 protege o arquivo contra limpeza. Regras especiais30 para médico/estratégico continuam valendo. Não há transferência de bytes porJSON, URLpública ou nova rotinaStorage.

Quarentena continua quarentena. Prévia privada autorizada pós34 não é liberação final: importação não define clean, aprovação, assinatura, publicação, saldo quitado, release25 ou entrega26/32. Nenhum documento interno/PDF é fabricado a partir do registro legado.

Valores iniciais ficam na proveniência privada37, com fonte,data de corte,cliente,evidência e centavos. Nenhum charge_item/payment/payment_allocation/cash_entry é criado por importar. Cobranças13/recebimentos15/extratos e relatórios19 permanecem com suas bases e motores originais. Este importador registra/concilia a abertura; não habilita recebimento ou compensação dessa abertura. Não usar cobrança de serviço fictícia para contornar esse limite.

## Reversão

No **Histórico**, selecione lote→Conferir→**Plano de reversão**. Confira o efeito, informe motivo e confirme. Acrescenta decisão imutável porator/sessão/chave, inativando obrigações/créditos desse lote. Não usaDELETE, não altera cliente/contato/identidade/arquivo/atendimento/cobrança/pagamento posterior e não reabre caixa. Referências de arquivo são preservadas como proveniência histórica; reversão não é expurgo de dados nem liberação para exclusão. Atendimento, pagamento ou correção posterior precisam de sua própria operação autorizada.

Lote revertido permanece no histórico; repetir a importação não o ressuscita. Correção de fonte exige conferência operacional e nova referência de origem apropriada, sem reutilização para apagar histórico. Nenhum relatório financeiro antigo é reescrito.

## Validação e operação externa

Laboratório descartável comAuth/REST/Express/Storage reais; sem senha do proprietário oufixturehospedada. Produção só recebe código/schema porGitHub→Vercel,semActions. Recuperação externa36,agenda,alertas,custódia e métricas dos provedores continuam pendentes por decisão do usuário e editáveis em Continuidade; não são considerados resolvidos pela importação37. Não executar importação real de acervo sem fonte conferida pelo gestor. Etapa38 exige novo pedido.
