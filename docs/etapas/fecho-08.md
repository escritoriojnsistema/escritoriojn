# Etapa08 — vínculos, identidade e duplicidades

Implementada e testada localmente; revisão final e publicação pendentes neste checkpoint. Stack React+Vite/TypeScript, Express /api e Supabase preservada. [Cartão](etapa-08.md), [contrato](contrato-08.md), [regras](../regras/relacionamentos-08.md) e [evidências](../evidencias/etapa-08/validacao.json).

Clientes→ficha→Vínculos permite atribuição/revogação operacional, representação com evidência/vigência, conferência humana e revisão/mesclagem administrativa. Capacidades independentes, isolamento por escritório e sessão, decisões após locks. CPF/e-mail não comprovam identidade. Conferência não altera Auth nem libera portal/documentos; uploads aguardam sua etapa.

Mesclagem exige prévia, versões, evidência e confirmação. Origem/FKs mantidas, três snapshots privados imutáveis, trilha atômica, contatos até4; conflitos e concorrência negados sem transferir permissões. Fixtures locais demonstram referência de atendimento/documento e snapshot antigo inalterados; tabelas futuras não foram criadas em produção. Participantes permanecem contrato tipado com portal_visibility=none.

UI reutiliza shell/cores/tipografia e até4 atalhos autorizados, incluindo Início/Conta. Overview cabe nos quatro tamanhos; listas3/5, formulário longo/zoom/teclado usam rolagem natural, sem corte nem loader. Autor/data da conferência consultáveis. Respostas antigas/sessão diferente/401/403 não reapresentam dados; autorrevogação descarta ficha. Conflito de merge invalida seleção/prévia.

Verificações:65 Node/API,750 SQL375×2 (migrador limitado, ACL/RLS/concorrência),63 Auth reais locais,113 contratos UI sintéticos (112+1dirigido), build frontend/servidor e audit de dependências produção0vulnerabilidades. REDs e correções reais registrados; nenhum teste hospedado criou conta ou enviou e-mail. [Benchmark](../evidencias/etapa-08/benchmark.json):10mil fichas/10conexões/300amostras, p95 busca1779,656ms/estado95,162ms/candidatos1684,023ms, meta local2s; máximo candidato2038,516ms. Não é SLA hospedado/API/browser.

Capturas overview320/360/768/1440 inspecionadas; formulário fullpage com artefato sticky não foi usado como prova de viewport. Espaço de teclado foi simulado por redução da altura; não houve aparelho físico. Revisões banco/API limpas após correções; revisão UI/final em andamento. CLIadvisors local indisponível sem stack54322; validação SQL alternativa executada e advisors hospedados serão conferidos na entrega.

Migration08 criada localmente, SHA25668e908536d01d47886de4cc9a064e3c9ff92f9000ef12364b8241ea26e90c05a; ainda não aplicada. GitHubmain535f6ad e canônico ainda servem pós07. Entrega autorizada seguirá PR/CI→main→deployGit; conectorVercel403 conhecido, sem novas tentativas idênticas. Livro distingue implementado/testado/integrado/publicado. Próximo09 somente após conclusão08 e novo pedido; nenhum catálogo/preço/PWA/documento futuro foi antecipado.
