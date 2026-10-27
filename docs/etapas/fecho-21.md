# Etapa21 — Preencher documentos e editar com participantes

Base20 `93c8bf0`, Livro/AGENTS e cartão21 do Drive conferidos antes das alterações. Contrato em [Etapa21](etapa-21.md), regras em [Documentos](../regras/documentos.md). Implementação e publicação das camadas autorizadas pelo pedido; fluxo GitHub→Vercel, sem Actions.

Estado: implementação local validada e revisão independente sem achados bloqueantes. Publicação pendente.

`/documentos` liga um atendimento/item10 a uma versão aprovada vigente20. Cria rascunho com fontes capturadas do cliente, serviço e participantes escolhidos por papel. Ajustes pertencem ao documento; não atualizam cadastros nem recalculam preços históricos. Comprador/vendedor são distintos. Demonstração conserva marca sem validade operacional.

Editor de texto simples, campos automáticos tipados, datas reais, CPF e valores/centavos/extenso em português. Pendências de campos ou placeholders removidos impedem a conclusão técnica. HTML permanece literal. O servidor valida novamente antes de concluir preenchimento. PDF, ciclo editorial, assinatura e entrega pertencem às etapas seguintes.

Autosave900ms, uma tentativa por vez, revisão esperada e chave estável. Digitação durante a gravação fica local e segue na próxima revisão.503 conserva tentativa;409 congela sem sobrescrever texto local, com descarte/reabertura explícitos.401/403/troca de identidade/autoridade abortam e limpam; sem PII em armazenamento local. Revisões, fontes, participantes, preparação e comandos ficam preservados.

Padrão Equipe desktop/mobile; dados/texto/revisão em uma página, três abas no mobile e uma ação principal de conclusão. Extras no menu lateral. Sem spinner, overlay ou rótulo de espera. Formulário padrão cabe320×740 e1440×900; conteúdo longo/zoom usam rolagem natural.

API Express autentica Bearer, valida contratos fechados/180KB, retorna DTO projetado/no-store e chama uma RPC. Capacidades documents.read/create/update seed somenteowner, com requests.read/customers.read/escopo atual; cliente excluído. Escrita segue responsável atual/triagem autorizada e pedidos abertos. Fontes mescladas históricas exigem read_all vigente e nunca seguem o alvo. Gate único revalida depois dos locks e em retry. Auditoria8 separada preserva22arquivos históricos de apresentações1–7, motor e fontes.

Provas até o momento:209Node/API,14UI21+13regressões20,6Auth reais locais,11públicos locais, build/typecheck/servidor, auditprodução0. [Verificação](../evidencias/etapa-21/verificacao.json). Dois replaysSQL com migrador limitado passaram:209linhasPASS,12corridas e carga1001documentos; busca19.443mslocal após otimização3463.818ms, sem SLAhospedado. Revisão e publicação serão registradas neste fecho ao terminar. Próxima22 somente por novo pedido.
