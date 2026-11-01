# Revisão comercial — 01/11/2026

Revisão estática da migration `20261101143627_document_commercial_folders.sql`, helpers de autorização e rotas comerciais. Não foram executados testes SQL nesta revisão nem alterados dados.

## Serviço com campos ou participantes opcionais é contratável

A projeção, a ativação e a contratação rejeitam somente `participants_min > 0` e campos cujo atributo `required` é verdadeiro. Um serviço com `person_required=true`, `participants_min=0` ou um campo opcional continua elegível, embora a contratação persista `participant_ids=[]` e `fields={}`. Isso contraria a premissa de que serviços com participantes ou campos ficam indisponíveis até que a contratação suporte esses dados. O checklist não vazio já é rejeitado.

Reprodução proposta em banco local com fixtures válidas: publicar uma versão de serviço com `person_required=true`, `participants_min=0`, ou uma versão com `fields` contendo objeto válido com `required=false`; vinculá-la a oferta e consultar `public.document_offer_form` com sessão autorizada. A projeção atual retorna a oferta. Invocar `public.document_booking_create` com os IDs e revisão retornados, em uma sessão autorizada, cria item com os valores vazios mencionados. Conferir com:

```sql
SELECT sv.definition->>'person_required', sv.definition->>'participants_min',
       sv.definition->'fields', ri.fields, ri.participant_ids
FROM public.request_items ri
JOIN public.service_versions sv ON sv.office_id=ri.office_id AND sv.id=ri.version_id
WHERE ri.id = :request_item_id;
```

Correção: aplicar a mesma regra de elegibilidade ao configurar, projetar e contratar: rejeitar `person_required=true` e qualquer `fields` não vazio enquanto não houver suporte, além das verificações existentes. A projeção staff é gerada por cópia da projeção principal; garantir que preserve o mesmo critério. Testar ambos os casos e confirmar que serviço sem esses recursos continua contratável.

## Observações de revisão

O helper de escrita `templates_actor20` bloqueia o escritório antes de verificar novamente identidade e permissões; `requests_actor(..., true)` também toma lock incompatível no escritório. Assim, as aparentes inversões de locks entre operações comerciais ficam serializadas no fluxo normal. Não foi comprovada falha de corrida de exclusão/movimentação ou de revogação apenas pela ausência de uma segunda chamada no comando de pastas. A captura do preço usa `services_snapshot` na transação de criação e mantém versão e intake imutáveis. Essas observações são estáticas e não substituem testes concorrentes ou de ponta a ponta.

## Resolução pelo coordenador

O catálogo final recusa serviços com campos09 ou checklist10 e participantes obrigatórios não capturados. O contrato09/10 permite omitir participantes opcionais; não se inventou uma coluna `participants_max`. As observações iniciais de lock foram retiradas pelo revisor após conferir a serialização por escritório; adicionalmente, a revalidação da sessão após esperas foi reforçada e a corrida de sessão revogada passou em dois replays locais. Estes registros não equivalem a uma revisão independente nova do conjunto final.
