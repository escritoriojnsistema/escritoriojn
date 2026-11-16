# FUT-IA — assistência de IA

**Futura / desativada.** Flag documental `ai_assistance=false`; semSDK, modelo, credencial, cobrança, indexação ou envio de dados. [Contratos comuns](contratos.md) · [Backlog](../README.md).

## Fronteira e proposta

Adaptador futuro `AI.propose`: receber somente seleção autorizada e revisão do documento/modelo, finalidade aprovada, limites e referência opaca da tarefa; devolver sugestão separada, versão do modelo/prompt e consumo medido. Nomes são proposta, não interface implementada. Reusar edição/revisão dos documentos21–24; não criar documento final, aprovar, assinar, precificar, confirmar pagamento ou entregar automaticamente. Aplicar sugestão exige humano autorizado, versão atual e os comandos canônicos.

Pesquisa/recuperação futura só pode ler o escopo atual do usuário/escritório; índice vetorial não é autorização. Revalidar na leitura e antes de mostrar/aplicar a sugestão, inclusive depois de espera. Documento, prompt, anexo e resposta são conteúdo não confiável: instruções embutidas não concedem acesso, executam ferramentas ou alteram regra. Saída com referência inexistente, fato inventado ou revisão antiga deve ser recusada ou revisada explicitamente.

## Avaliação futura

| Campo | Registro necessário antes de qualquer teste externo |
| --- | --- |
| Fornecedor | Não selecionado. Candidatos de pesquisa: [OpenAI](https://openai.com/) ou [Anthropic](https://www.anthropic.com/); confirmar produto/API/modelo, região e contrato na ocasião. |
| Custo | Não cotado/aprovado. Levantar preço por entrada/saída/cache, retenção/armazenamento e eventuais ferramentas; estimar chamadas por fluxo ×tokens ×tarifa, moeda/impostos e teto por tarefa/escritório/mês. Sem orçamento medido, não executar. |
| Privacidade | Mapear dados/sensibilidade/finalidade/base aplicável; minimização, pseudonimização e remoção de dados identificáveis antes do envio. Confirmar uso para treinamento, retenção, eliminação, localização/suboperadores e transferência internacional. Não presumir zero retenção ou exclusão de treinamento por padrão. |
| Autenticação | Chave/identidade só no backend, escopo/rotação por ambiente; chamada vinculada a ator e documento autorizados. SDK do navegador não recebe segredo. |
| Evento/webhook | Preferir resposta correlacionada; tarefa assíncrona exige assinatura conforme fornecedor, task_id vinculado à intenção e envelope comum. Sem webhook no produto nesta etapa. |
| Conciliação | Relacionar intenção/tarefa/revisão com resultado e uso faturado; callback repetido não aplica texto duas vezes nem dispara tarefa paga nova. Timeout com estado incerto requer consulta antes de reenviar. |

## Aceite e desligamento futuros

- Humano confere fatos, fontes, nomes/partes e regra; modelo não substitui parecer competente, checklist, validação de dados ou decisão de acesso.
- Ensaiar prompt injection, escopo cruzado, anexo não autorizado, dado sensível, alucinação, revisão concorrente, revogação, timeout, duplicidade, resposta malformada e teto de custo. Sem envio de acervo real para avaliar modelo.
- Recusar nova tarefa quando orçamento/configuração/sessão estiverem inválidos; cancelar/acompanhar tarefas em voo conforme contrato e custo já ocorrido. Não apagar decisão humana ou documento anterior ao desligar.
- Aprovar fornecedor/privacidade/custo, avaliar qualidade e risco no domínio, treinar revisor e homologar antes de nova autorização de ativação. Nenhum desses aceites foi executado aqui.
