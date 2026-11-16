# Backlog futuro — integrações desativadas

A Etapa40 encerra o mapa documental do manual, **sem novas conexões reais**. Este backlog não habilita produto, fornecedor ou piloto. Cada item depende de um novo pedido, escolha de fornecedor, orçamento, privacidade, desenho revisado e homologação isolada. O piloto39 e a recuperação externa36 continuam pendentes; nenhuma pendência recebe aceite por este registro.

| Item | Integração futura | Flag documental | Estado | Fornecedor/custo |
| --- | --- | --- | --- | --- |
| FUT-IA | [Assistência de IA](integracoes/ia.md) | `ai_assistance` = false | Futura / desativada | Não selecionado / não aprovado |
| FUT-ASS | [Assinatura automática](integracoes/assinatura-automatica.md) | `automatic_signatures` = false | Futura / desativada | Não selecionado / não aprovado |
| FUT-PIX | [Banco e PIX](integracoes/banco-pix.md) | `bank_pix` = false | Futura / desativada | Não selecionado / não aprovado |
| FUT-CARD | [Cartão e maquininha](integracoes/cartao.md) | `card_terminal` = false | Futura / desativada | Não selecionado / não aprovado |
| FUT-WA | [WhatsApp por API](integracoes/whatsapp.md) | `whatsapp_api` = false | Futura / desativada | Não selecionado / não aprovado |

O [exemplo de flags](integracoes/flags.example.json) é somente documentação: não é importado pelo aplicativo, não constitui configuração implantada e editar o arquivo não libera integração. A Etapa40 não cria serviço de flags. Os [contratos comuns](integracoes/contratos.md) são especificação proposta, sem adaptadores, endpoints ou filas implementados.

Hoje, PIX/transferência/cartão são registros e conferências manuais; assinatura24 é conferência humana física/externa, e WhatsApp26 é canal manual com confirmação separada. Os nomes desses meios na UI não afirmam cobrança, assinatura ou mensagem automática. Não adicionar “ativar”, “pagar agora”, “assinar automaticamente” ou outro botão nesta etapa.

## Antes de selecionar um item

O responsável precisa preencher, em registro privado: fornecedor/conta/país de operação; documentação/API/versão; capacidade realmente contratável; cotação/moeda/impostos/franquias/excedentes/teto; tratamento e retenção/suboperadores/transferência de dados; responsáveis; ambiente isolado; autenticação e rotação de segredos; eventos/chaves/reconciliação; aceites e plano de desligamento/retorno. Não é necessário contratar todos os itens juntos.

Os candidatos citados nas fichas servem apenas à pesquisa futura, sem integração, validação comercial, teste ou recomendação de contratação nesta rodada. Valores, disponibilidade de API e condições devem ser confirmados na ocasião; “não cotado” nunca significa gratuito. Nenhum segredo, dado real, payload de webhook ou contrato de cliente deve ser publicado neste repositório.

A liberação futura será granular por escritório, conta do fornecedor, ambiente, finalidade e ação; uma autorização de leitura não permite cobrar, transferir, assinar, enviar documento ou alimentar modelo. Sem configuração válida/atual ou com flag desligada, recusar novas ações externas. Desligamento não apaga fatos financeiros/documentais anteriores nem dispensa reconciliação de operações já iniciadas.
