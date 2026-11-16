# Fronteiras e contratos propostos

**Especificação futura, não implementada.** Não há novo endpoint, SDK, credencial, tabela, job, fila ou emissor de eventos. A [flag documental](flags.example.json) de cada item é false. Contratos definitivos exigem desenho e testes próprios antes de ativar qualquer conexão.

## Reutilizar os donos atuais do domínio

| Fronteira existente | Referência atual | Adaptação futura permitida |
| --- | --- | --- |
| Recebimento e alocação | [`PaymentOperation`](../../../shared/payments.ts), [`cashRouter`](../../../server/modules/cash/router.ts), RPC `payment_operate` | Normalizar evidência externa e propor reconciliação ao financeiro oficial; não criar segunda cobrança/pagamento/ledger. |
| Estorno e devolução | [`CorrectionOperation`](../../../shared/corrections.ts), [regras financeiras](../../regras/financeiro.md) | Manter original e limites; estorno lógico, devolução efetiva, taxa e liquidação são fatos distintos. |
| Documento e revisão | [`documentsRouter`](../../../server/modules/documents/router.ts), [`workflowRouter`](../../../server/modules/document-workflow/router.ts) | IA/assinatura não escrevem direto em versão publicada ou decisão. Manter revisão, participantes, checklist e segregação. |
| Arquivo privado | [`attachmentsRouter`](../../../server/modules/attachments/router.ts), [contrato de anexos](../../../shared/attachments.ts) | Bytes, tamanho, tipo eSHA256, estado/quarentena e autorização atuais continuam obrigatórios. Scanner ausente não vira clean. |
| Formalização | [`SignatureCommand`](../../../shared/documentSignatures.ts), RPC `document_signature_command` | Evidência validada é insumo; webhook não equivale a conferência humana nem libera documentos. |
| Entrega/portal | [`DeliveryCommand`](../../../shared/documentDeliveries.ts), RPC `document_delivery_command` | Preservar versão/arquivo/hash/destinatário, gates e confirmação separada; não converter status de provedor em recebimento humano. |
| Notificação | [`notificationKinds`](../../../shared/notifications.ts), [`notificationsRouter`](../../../server/modules/notifications/router.ts) | Notificação é projeção de fato autorizado, não ordem de pagamento, aprovação ou entrega. |

Um adaptador futuro fica no backend e traduz protocolo do fornecedor para um contrato interno validado. UI usa os contratos oficiais existentes e só ganha ação após implementação e aceite explícitos. Não expor token, chave privilegiada, SDK de fornecedor ou comando externo no navegador. Ferramentas conectadas usadas na manutenção não são integrações instaladas no produto.

Os contratos humanos atuais exigem sessão de usuário e revalidação de capacidades/escopo; webhook não possui essa sessão. **Não chamar essas RPCs com usuário inventado nem usar service_role como substituto.** Se a automação exigir ator de serviço, projetar e aprovar separadamente identidade mínima, permissões por ação/escritório/conta, transação canônica e trilha; sem ampliar grants ou contornar RLS nesta etapa. Falta de contrato autorizado deixa o evento aguardando revisão, sem efeito financeiro/documental.

## Envelope interno proposto, versão1

Campos mínimos para um evento aceito pelo futuro adaptador:

| Campo | Regra proposta |
| --- | --- |
| `contract_version` | Inteiro1; versões desconhecidas não geram efeito. |
| `source` | Identidade do adaptador/fornecedor definida no servidor. Não aceitar origem livre como autoridade. |
| `provider_account_ref` | Conta comercial inscrita e verificada; resolve escritório/ambiente no cadastro privado do servidor. |
| `event_id`, `event_type` | Identificador estável do provedor e tipo em allowlist específica. |
| `resource_ref` | Transação/envelope/mensagem/tarefa externa com vínculo interno previamente autorizado. |
| `occurred_at`, `received_at` | Horário do provedor validado e recebimentoUTC do servidor, separados; horário não define precedência sozinho. |
| `correlation_id` | Referência opaca interna para rastreamento, semPII/token. |
| `payload_digest` | Hash dos dados de negócio normalizados conforme versão; não incluir campos de transporte que mudam em retry. Hash bruto, se necessário à perícia, é separado e privado. |
| `data` | DTO mínimo do tipo: centavos/moeda para financeiro; versão/hash para assinatura; destinatário/estado para mensagem; revisão/origem para IA. |

`office_id`, usuário, papel, permissões, capacidade de cobrar/assinar ou estado“confirmado” recebidos do cliente/provedor não concedem autoridade. Resolver vínculo pelo cadastro confiável da conta/recurso; comparar quando o provedor informar identificadores. Valores financeiros em centavos inteiros seguros, moeda explícita e sem conversão silenciosa. Nada deCPF, e-mail, telefone, documento, cartão, token ou payload bruto em evento público/log.

## Recepção, origem e replay seguro

1. Receber somente pelo endpointHTTPS do ambiente e conta inscritos, com tamanho/tipo/versão limitados. Verificar assinatura sobre os bytes originais **antes de parsear/normalizar**, algoritmo conforme contrato do fornecedor, segredo/chave/certificado atual e rotação controlada. Comparação em tempo constante quando aplicável; timestamp/nonce e janela de replay conforme protocolo. IPallowlist, URL obscura, token do frontend ou evento com aparência válida não substituem autenticação criptográfica. Challenge de inscrição não processa evento de negócio.
2. Validar conta, tipo, recurso, escritório e ambiente; rejeitar origem inválida, payload divergente ou vínculo cruzado. Se o fornecedor não oferecer evidência suficiente, não habilitar automação; exigir consulta autenticada/reconciliação e decisão autorizada.
3. Deduplicar atomicamente por `(source, ambiente, provider_account_ref, event_id)` e digest de negócio. Mesmo evento/digest recupera o estado já registrado sem duplicar efeito; mesmoID com negócio diferente gera conflito/quarentena para investigação. Persistência/ACL/retenção desse registro serão desenhadas na implementação; não existem aqui.
4. Deduplicar **também o efeito de negócio** por conta e identidade real da transação/ação externa. Dois event_ids para o mesmo pagamento não criam dois recebimentos; reenvio manual e webhook devem convergir para o mesmo vínculo. Não confundir reenvio com segunda parcela legítima; correlação de pagamentos parciais/devoluções precisa de identidade própria e limites canônicos.
5. Processar com locks/versão e autorização atual depois das esperas. Eventos atrasados/fora de ordem não fazem estado regredir; consultar estado autenticado quando necessário, registrar divergência e evitar “último horário vence”. Evento terminal de devolução não pode ser descartado só porque chegou depois da confirmação: aplicar regra própria com referência ao original.
6. Confirmar recebimentoHTTP apenas após registro durável autorizado. Se houver processamento assíncrono, ACK significa aceito para processamento, não quitação/assinatura/entrega. Protocolo e statusHTTP exatos serão os do fornecedor; erro transitório preserva identidade para retry com backoff/limite, e erro permanente vai para tratamento acompanhado. Não retornar sucesso por captura genérica de exceção.
7. Reprocessamento autorizado reutiliza identidade e estado da operação, confere efeitos anteriores e retoma apenas o que falta. Perda de resposta apósCOMMIT não justifica nova chave. Chamada externa com resposta incerta exige consulta por referência idempotente antes de tentar de novo; sem suporte verificável, encaminhar para conciliação humana. Fato remoto não implica efeito local realizado.

Saídas externas futuras exigem registro durável da intenção e chave antes do envio, sem prometer atomicidade de rede+Postgres. A implementação avaliará intenção/recibo ou padrão transacional adequado no domínio existente; não criar outbox ou microserviço especulativo agora. Recibo liga intenção, referência externa, resultado e eventual efeito interno para reconciliação.

## Desligamento, segurança e aceite futuro

Desligar flag bloqueia novas solicitações externas. Eventos de operações já iniciadas podem precisar ser recebidos e conciliados por caminho controlado, sem iniciar novas cobranças/envios. Não descartar callback financeiro por flagfalse, nem transformar recebimento técnico em execução autorizada. Definir esse comportamento e retenção por fornecedor antes de ligar.

Configuração é exclusiva do ambiente: sandbox/homologação não usa produção, nem aceita seus webhooks. Credenciais só no backend/cofre apropriado; nomes/env/escopos serão aprovados na implementação. Não acrescentar variáveisVITE, service_role no cliente, dadosprivados no cachePWA ou permissões globais. Preservar Auth/RLS/Storage e os bloqueios39 quando aplicáveis.

Aceite mínimo futuro: assinatura inválida/expirada/rotacionada; replay; duas entregas concorrentes; event_ids diferentes para o mesmo fato; conta/escritório/ambiente cruzados; valores/moeda/revisão/hash incompatíveis; eventos fora de ordem; timeout antes/depois do efeito externo eCOMMIT; revogação durante espera; flag desligada com operação em voo; recuperação/reconciliação após indisponibilidade. Provar em ambiente isolado com dados sintéticos e fornecedor sandbox autorizado; nunca usar senha do proprietário.

As novas telas futuras seguirão Equipe/Convites em desktop/mobile/quatro perfis, no máximo4ações principais, extras no menu e sem loader visível. Reusar estados existentes e controlar comandos incertos; operação externa não pode bloquear transição com spinner nem autorizar confirmação otimista. Medir latência/custo reais e definir limites/backoff; não prometer atraso físico zero. Sem novas chamadas ou impacto de performance na Etapa40 documental.
