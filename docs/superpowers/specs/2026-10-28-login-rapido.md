# Login com menos espera

Base38f9c234; diagnóstico agregado: my_access_context média16.95ms, health frio1393ms/quente240–311ms, importapp224ms/Auth95.5ms/PDFKit86.8ms. A investigação não atribui toda latência ao banco. Preservar SDK e segurança, reduzir hop/repetição/inicialização.

## Decisão

1. Durante login isolado, consultar my_access_context diretamente por PostgREST JWT usando o mesmo cliente temporário, em lugar de ir ao Express que repete getUser. Adoção continua SOMENTE após contexto correto e SDKsetSession oficial/getUser final confirmado; não falsificar resposta/user nem usar métodos privados do SDK. Projeção compartilhada fecha formas,UID,papéis,office e permissões; REST valida JWT e SQL/RLS verifica sessão/banimento/conta/vínculos/capacidades. Se não houver paridade negativa comprovada em laboratório, não publicar a mudança direta e manter caminho atual.
2. Remover carregamento de PDFKit do caminho de APIs comuns por imports dinâmicos apenas nos handlers PDF. Não alterar nenhum motor, fonte, catálogo, layout ou adaptador histórico de PDF; hashes preservados. Primeiro PDF pode pagar import tardio, login não deve pagar esse custo.
3. Nenhum cache de autoridade, sessão fictícia, service_role no browser/Express, adoção antes403, permissão por metadata, spinner ou prazo aumentado. Guardas de aba/sessão/adoção/cancelamento ficam intactas.

## Aceite

RED/GREEN coldimport sem PDFKit; comparação antes/depois de5subprocessos. Authreal: correto equipe/cliente, portal errado sem substituir sessão anterior, vínculo/role/capacidade/session/banimento/emailconfirmation inválidos, troca concorrente/abandono/tokenrefresh/401/logout. Mesmo UID em todas linhas, capmax100, dadosformadosignoradosfalhamfechado. Medir etapas reais localmente, contagemde requests e ausência hopAPIcontext no login normal. APIcontext antiga preservada para consumidores/foco e fallback técnico, sem transformar erro em autorização.
