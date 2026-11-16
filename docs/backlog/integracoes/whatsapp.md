# FUT-WA — mensagens por WhatsApp

**Futura / desativada.** Flag documental `whatsapp_api=false`; semMeta/BSP conectado, template remoto, número inscrito ou envio automático. O WhatsApp26 existente continua manual. [Contratos comuns](contratos.md) · [Backlog](../README.md).

## Fronteira e proposta

Adaptador futuro `MessagingProvider.send/status` recebe intenção autorizada, conta/canal verificados, destinatário conferido e template/finalidade aprovados; devolve referência de mensagem e estado técnico. Reusar notificações internas12, arquivo privado11 e entrega26/portal32, preservando os respectivos escopos. Notificação interna não é autorização para enviar conteúdo a um telefone.

Validar contato atual e vínculo com pessoa/destinatário, finalidade, escolha/opt-in exigidos pelo canal, restrições de horário/template e meios de oposição aplicáveis. Ter telefone no cadastro não autoriza marketing ou entrega de qualquer documento. Preferir aviso mínimo e acesso ao portal com autorização atual; telefone, nome do arquivo, título ou mensagem também podem revelar dados. Envio de arquivo privado depende de revisão específica, gates atuais, hash/versão exatos e política do fornecedor; nuncaURLpública permanente.

## Avaliação futura

| Campo | Registro necessário |
| --- | --- |
| Fornecedor | Não selecionado. Avaliar [MetaWhatsAppBusinessPlatform](https://business.whatsapp.com/products/business-platform) diretamente ouBSP autorizado a escolher, com conta/número/contrato do escritório e ambiente de teste. Não usar automação de sessão pessoal/WebWhatsApp. |
| Custo | Não cotado/aprovado. Tarifação vigente por país/tipo/template/mensagem ou unidade do contrato +BSP/número/setup/excedentes; confirmar métrica e janelas atuais. Definir teto por campanha/finalidade/escritório, sem presumir mensagens gratuitas. |
| Privacidade | Mapear conteúdo, contato, metadados, retenção, operadores/suboperadores, transferência e eliminação; minimizar aviso e comprovar finalidade/base. Credencial oulinkassinado nunca vai para log, backlog ouIA. Definir canal privado para falha e exercício de direitos. |
| Autenticação | Token de conta com escopos mínimos só no backend; webhook autenticado conformeMeta/BSP sobre corpo original, rotação e anti-replay. Challenge de inscrição não valida callback de negócio. |
| Evento/webhook | message_id/conta/destinatário vinculados à intenção e eventos de estado deduplicados. Recebido tecnicamente/enviado/entregue/lido são estados do canal, não aceite humano de documento nem comprovação de identidade. |
| Conciliação | Intenção/template/versão/destinatário ×referência externa ×estado ×tarifação. Retry de callback não reenvia mensagem; envio com resposta incerta requer consulta/correlação, evitando cobrança/envio duplicados. |

## Aceite e desligamento futuros

- Testar número incorreto/alterado, vínculo revogado, conta alheia, opt-out, template recusado, limite de custo, replay, eventos fora de ordem, callback fraudulento e timeout depois do envio.
- Confirmação de recebimento26 continua ato separado, com autoridade e evidência adequadas; callback“read” não chama `document_delivery_command` como se fosse humano. Não incluir anexos em quarentena nem liberar aprovação/assinatura/financeiro.
- Desligar impede novas mensagens automáticas, conserva estados/custos de mensagens em voo e trilha; não revoga documento já enviado/baixado nem promete eliminar cópias no destinatário.
- Não expor botão de integração automática nesta etapa. Mudanças futuras deUI devem manter até4ações principais, menu lateral, padrõesEquipe/Convites e transições sem loader, com escopo e aceite próprios.
