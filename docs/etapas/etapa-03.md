# Etapa 03 - Criar banco, perfis e barreiras de acesso
## Objetivo
Garantir que cada pessoa só consiga acessar o escritório e as informações autorizadas.
## Entrada mínima
Etapa 02 ou seu contrato necessário aprovado; falha externa independente deve ser registrada, sem alegar publicação. Ler AGENTS.md, LIVRO_RAIZ.md e docs/regras/acesso.md somente nos tópicos afetados. Reusar código existente da base nova; não importar estado do projeto antigo.
## Fazer nesta rodada
- Criar offices, profiles, roles, permissions, role_permissions, memberships e a base de audit_events.
- Definir PK/FK, unicidades, active, timestamps UTC, office_id e autor confiável.
- Criar foundation.access e audit.read; seeds de papéis sem contas/senhas fixas.
- Implementar RLS e helper de autorização atual, sem recursão nem autoatribuição de privilégios.
- Provisionar proprietário por rotina oficial restrita; seed inclui capacidades da etapa sem depender de cadastro posterior.
- Testar instalação vazia com migrador sem superusuário e ACL/EXECUTE reais; evitar cadeia de helpers por tela.
## Cuidados específicos
- Prova especial: replay vazio/seed e RPC com privilégios semelhantes ao hospedado; não apenas postgres superusuário.
## Aceite
- Migrações recriam o banco isolado; anônimo e usuário sem vínculo não leem dados.
- Usuário A não lê escritório B; payload não troca papel, ator ou escritório.
- Conta/vínculo inativo bloqueia inclusive token antigo; policies não recursam.
- Usuário comum não altera papéis, permissões ou auditoria.
## Conferência pelo usuário
A IA deve mostrar evidência dos testes com duas contas fictícias. Não basta dizer que escondeu botões.
## Encerramento
Dados, backend, frontend e teste relacionados devem estar conectados. Onde não houver impacto, escrever não se aplica e não fabricar mudança. Atualizar Livro e fecho curto com resultado/testes/bloqueios. Próximo passo: Etapa 04. Se incompleta, registrar checkpoint atual, sem avançar por aparência.
