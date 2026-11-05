# Etapa 25 — regra única de liberação

Pedido autorizado: implementar o cartão25 do Drive preservando a Etapa24/main b951a03.
Reutilizar wf_gate e document_artifact_authorize: avaliar_liberacao25 centraliza o resultado e a única exceção permitida é financeira. Não criar outro editor, entrega26 ou acervo paralelo.

Exceção: eventos imutáveis request/authorize/reject/revoke, motivo obrigatório, validade máxima de30dias, escopo publicação/revisão+arquivoSHA256+cliente vinculado+snapshot financeiro. Mudança do ledger, versão, arquivo, cliente, validade ou autoridade do aprovador invalida o benefício. Capacidade documents.exceptions.request solicita; documents.exceptions.decide decide/revoga, sempre com escopo documental e responsabilidade atuais, seed somenteowner; concessão explícita em Equipe para demais papéis. Autoridade perdida não se recupera implicitamente para exceção antiga: precisa nova autorização.

Releases append-only registram publicação/revisão, arquivo/hash, ator/sessão, cliente, snapshot e exceção após reautorização do worker. Significa acesso autorizado aos bytes, não leitura/recebimento. Estado editorial, assinatura, financeiro e entrega independentes; saldo real nunca é zerado pela exceção. Falha de fonte bloqueia.

Abordagens: estender o contrato existente (escolhida por preservar todas as guardas e os bytes24); criar workflow paralelo (rejeitada por duplicar autoridade). Uma seção selecionável na aba existente Versões e PDF, CSS/padrões Equipe, sem loaders, sem aumentar abas/atalhos. Histórico paginado5; ação única e retorno oficial;503 preserva tentativa,401/403 limpa estado e409 exige reconferência. Sem prometer latência zero.

Testar saldo100/60, decisão/revogação/expiração, versão/arquivo/ledger/identidade alterados, aprovação/assinatura/restrições nunca dispensadas, acesso real e concorrência. GitHub→Vercel semActions; conferir histórico Supabase antes de aplicação. Não fabricar scanner, preços, dados ou grants hospedados. Atualizar Livro/fecho com provas e limites reais.
