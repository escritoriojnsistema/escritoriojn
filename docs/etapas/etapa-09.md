# Etapa 09 — Cadastrar serviços, preços e políticas

Fonte: [cartão oficial no Drive](https://drive.google.com/file/d/13bnnkDOPTWkZtwqyVegpPhGh3i0Brv2Z/view), consultado em 20/10/2026. Entrada: Etapa08 publicada; ler AGENTS/Livro e atendimento no tópico catálogo.

Objetivo: catálogo por escritório, versões imutáveis com categoria, unidade, preço em centavos, vigência, campos/checklist, pessoa/participantes, aprovação, assinatura, quitação e capacidades. Desconto/acréscimo/cortesia/preço manual exigem política, capacidade atual e motivo. Quantidade inteira limitada pela versão.

Aceite: Xerox de Teste R$0,50 sem CPF e Contrato de Teste R$100,00 com pessoa/participantes/campos; preço novo preserva snapshot/histórico; funcionário sem capacidade não altera catálogo. Exemplos somente fictícios em laboratório. Sem criar pedidos da10, contas Auth, pagamentos ou documentos nesta09.

## Contrato da implementação

- `services` identifica código único por escritório; `service_versions` guarda a definição inteira, autor, motivo e vigência. Nunca UPDATE/DELETE de versões; vigência final derivada da próxima versão. Publicar imediatamente ou agendar depois da última vigência; não retroagir nem substituir agendamento silenciosamente.
- `services.read` consulta; `services.manage` publica com read; `services.perform` simula item. Capacidades de aprovação/ajuste independentes, seed somente owner; demais perfis por concessão explícita na gestão existente. Cliente não acessa catálogo interno.
- RPC seleciona versão vigente pelo relógio do banco e calcula snapshot em inteiros. Futuro pedido10 deve chamar o mesmo cálculo dentro de sua transação e persistir snapshot, nunca confiar em cotação fornecida pelo navegador. Nenhuma tabela fictícia de pedidos em produção.
- Percentuais em pontos-base: arredondar o valor do ajuste para o centavo mais próximo, meio para cima, e depois somar/subtrair do subtotal. Preço manual é unitário; cortesia zera o total. Uma verificação de identidade na API e uma RPC por operação, autoridade reavaliada após lock; RLS+ACL sem leitura/escrita bruta. Auditoria sem nomes/campos/motivos livres, na mesma transação.
- Reutilizar shell, sidebar e quatro atalhos móveis; lista3/5, seções recolhíveis no mesmo formulário e histórico paginado. Sem spinner/loader/overlay; rótulos estáveis, erro/sucesso e repetição bloqueada. Dados só em memória da sessão; troca de escritório/sessão/autoridade descarta resultado e formulário.
- GitHub Actions permanece desativado. Preparar PR e validar localmente. Publicação técnica por Git e migration aditiva seguem a autorização permanente registrada nos fechos06/07 e docs/PLUGINS, reforçada pelo pedido integral09 e orientação GitHub→Vercel nesta sessão. Preview não comprova banco atualizado.

## Verificações

API: autenticação, validação estrita, DTO, 401/403/409/422/503 sem SQL. Banco: replay com migrador limitado, ACL/RLS, versões/centavos/vigência, snapshot anterior, concessão e revogação, corrida/rollback. UI: vazio, cadastro, alteração/histórico, estados pendentes/erro, isolamento, mobile/desktop/zoom. Fecho registra somente evidências executadas e limites de publicação/performance.
