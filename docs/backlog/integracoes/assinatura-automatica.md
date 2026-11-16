# FUT-ASS — assinatura por provedor

**Futura / desativada.** Flag documental `automatic_signatures=false`; nenhuma chave, envelope remoto, assinatura paga ou serviço de certificação ativado. [Contratos comuns](contratos.md) · [Backlog](../README.md).

## Fronteira e proposta

Adaptador futuro `SignatureProvider.request/status/evidence`: vincular envelope à publicação/revisão, SHA256 do arquivo exato, participantes e política de saída aprovados. Reusar arquivo privado11, formalização24 e gates25/entrega26. O modo“externo” atual é conferência humana; não significa API de assinatura automática.

Evento“assinado” do fornecedor é evidência a verificar, não aprovação editorial, liberação financeira ou entrega. Provar identidade/participação, integridade e validade exigida pelo tipo documental, cadeia de evidências e novo arquivo resultante. Bytes assinados podem diferir do arquivo enviado: preservar ambos os hashes e a cadeia verificável, sem sobrescrever o original nem exigir igualdade impossível entre entrada e saída. Nova versão/revogação invalida reaproveitamento automático; scanner/quarentena mantêm suas regras.

## Avaliação futura

| Campo | Registro necessário |
| --- | --- |
| Fornecedor | Não selecionado. Candidatos de pesquisa: [Clicksign](https://www.clicksign.com/) ou [D4Sign](https://d4sign.com.br/); confirmar API, modelo de assinatura e requisitos jurídicos/certificação do serviço. Não presumir equivalênciaICP-Brasil. |
| Custo | Não cotado/aprovado. Plano/mínimo +envelopes/documentos/signatários +identificação/carimbo/certificação +armazenamento/excedentes/impostos, conforme cotação; teto e cancelamento definidos antes de enviar. |
| Privacidade | Identificação, contato, conteúdo, evidências e biometria, se exigida: justificar necessidade, minimizar, definir custódia/retenção/eliminação, acesso, suboperadores e jurisdição. Biometria não integra o escopo sem avaliação específica. |
| Autenticação | Backend com credencial por ambiente/conta; inscrição de callback e rotação conforme fornecedor. Nunca enviar segredo ao cliente ou aceitar token de usuário como credencial de provedor. |
| Evento/webhook | Envelopeconta/event_id vinculados à intenção autorizada; assinatura criptográfica sobre corpo original, anti-replay e consulta autenticada da evidência final. Webhook sem prova suficiente não confirma formalização. |
| Conciliação | Intenção ×envelope ×revisão/hashes ×signatários ×estado ×fatura. Repetição/cancelamento/timeout não criam envelopes pagos novos; consultar referência estável. Validar arquivo/evidências antes do contrato oficial interno. |

## Aceite e desligamento futuros

- Homologar adulteração, outro envelope/conta, signatário incorreto, arquivo parcial, ordem/replay, hash inválido, assinatura incompleta/recusada, timeout e nova versão/revogação durante espera.
- Revisor competente valida a evidência e os demais gates. Automação de conferência, se desejada depois, exige contrato/identidade/permissão específicos, revisão jurídica e autorização; não fabricar sessão humana para chamar `document_signature_command`.
- Desligar impede novos envelopes e acompanha os existentes por caminho controlado; revogar acesso futuro não desfaz assinatura, arquivo já baixado ou obrigação contratual.
- Nenhuma contratação, validade jurídica, assinatura real ou aceite humano foi comprovado pela Etapa40.
