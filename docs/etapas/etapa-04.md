# Etapa 04 - Implementar login, saída e recuperação de acesso
## Objetivo
Entrar com conta real de teste, sair e recuperar acesso sem criar login fictício.
## Entrada mínima
Etapa 03 ou seu contrato necessário aprovado; falha externa independente deve ser registrada, sem alegar publicação. Ler AGENTS.md, LIVRO_RAIZ.md e docs/regras/acesso.md somente nos tópicos afetados. Reusar código existente da base nova; não importar estado do projeto antigo.
## Fazer nesta rodada
- Conectar Supabase Auth com clientes browser/server apropriados e verificação de identidade no servidor.
- Implementar login, logout, painel protegido, sessão expirada, acesso negado, recuperação e callback.
- Aplicar as capacidades atuais da etapa 03 e evitar cache público de páginas privadas.
- Validar redirects, cookies e proteção de requisições conforme a stack; não guardar senhas no banco da aplicação.
- Criar cadastro público somente cliente, confirmação/recuperação e conta mínima, sem conferir identidade/acervo por CPF.
- Preservar decisão de não exigir autenticador/QR/TOTP; erros SMTP são classificados e testados sem segredo no chat.
## Cuidados específicos
- Sem autenticador obrigatório. Recuperação local não comprova entrega de e-mail externo; teste cada ambiente corretamente.
## Aceite
- Login válido funciona; senha errada não entra; logout bloqueia área interna.
- Conta sem vínculo e conta inativa são negadas mesmo autenticadas.
- Metadata editável não concede autorização.
- Recuperação/callback válido funciona no ambiente de teste; inválido/expirado é recusado; e-mail não configurado é bloqueio explícito.
## Conferência pelo usuário
Use uma conta fictícia para entrar e sair. Tente abrir o painel após sair. Solicite recuperação e confira o destino correto.
## Encerramento
Dados, backend, frontend e teste relacionados devem estar conectados. Onde não houver impacto, escrever não se aplica e não fabricar mudança. Atualizar Livro e fecho curto com resultado/testes/bloqueios. Próximo passo: Etapa 05. Se incompleta, registrar checkpoint atual, sem avançar por aparência.
