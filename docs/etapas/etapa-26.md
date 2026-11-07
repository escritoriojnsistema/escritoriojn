# Etapa 26 - Entregar, imprimir e registrar envio por WhatsApp
## Objetivo
Entregar apenas o resultado elegível e saber qual arquivo foi enviado para quem.
## Entrada mínima
Etapa 25 ou seu contrato necessário aprovado; falha externa independente deve ser registrada, sem alegar publicação. Ler AGENTS.md, LIVRO_RAIZ.md e docs/regras/documentos.md somente nos tópicos afetados. Reusar código existente da base nova; não importar estado do projeto antigo.
## Fazer nesta rodada
- Criar deliveries com versão/hash, destinatário, canal, operador, data e resultado.
- Aplicar avaliarLiberacao em download, impressão final e compartilhamento.
- Enviar/registrar WhatsApp manual com destinatário conferido e canal seguro.
- Distinguir tentativa, disponibilização e confirmação; tratar revogação para acessos futuros.
## Cuidados específicos
- Aplicar prevenção de erro pertinente; não tocar ambiente/cadastro fora deste domínio.
## Aceite
- URL conhecida não dá acesso sem regra; versão bloqueada não é entregue por rota alternativa.
- Troca de destinatário exige vínculo/capacidade; estorno bloqueia novas entregas pertinentes.
- Abrir conversa/imprimir não marca recebimento comprovado automaticamente.
## Conferência pelo usuário
Tente imprimir pendente, confirme bloqueio; quite e entregue por canal de teste. Veja hash, canal e destinatário no histórico.
## Encerramento
Dados, backend, frontend e teste relacionados devem estar conectados. Onde não houver impacto, escrever não se aplica e não fabricar mudança. Atualizar Livro e fecho curto com resultado/testes/bloqueios. Próximo passo: Etapa 27. Se incompleta, registrar checkpoint atual, sem avançar por aparência.

Fonte conferida no Drive em07/11/2026: `1djLW4wAiTt7z02MZwVX_4pm1Swu1Z3yg`.
