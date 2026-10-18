# Correção urgente — portais separados

Causa: ambos os formulários enviavam toda sessão válida a /acesso, que escolhia a área pelo papel. A equipe podia usar a entrada de cliente e chegar ao painel da equipe. A API já recusava o escopo contrário; faltava conferir a entrada.

Tentativa de senha em SDK isolado/memória; /api/auth/context?area=team|client confirma identidade/vínculo atuais antes de adotar sessão pelo setSession oficial. Recusa não altera outra sessão válida. Cancelamento e guard no commit impedem tentativa abandonada de substituir login posterior. Cliente ignora invite; equipe aceita UUID somente para continuar convite, autorizado pela própria API. Cadastro e convites preservados.

Laboratório descartável: quatro perfis entram na área certa e são recusados na oposta; vínculo ausente/inativo, indisponibilidade, convite indevido no cliente, sessão válida preservada e adoção atrasada. Regressões RED antes das correções;26 Auth reais +2 adicionais,23 Node,build/typecheck passaram. Contas hospedadas, SMTP/templates, API/RLS/banco não alterados. SDK2.118.0 preservado; SupportedStorage conserva persistência/PKCE/fallback. Web Locks entre abas compatíveis; fallback síncrono na aba.

Git/CI/Vercel pendente neste checkpoint; módulo06 segue no plano. Publicação técnica já autorizada no histórico. Rollback só código ao89c4b7b.

Verificação complementar concluída:23 contratos UI e34 E2E públicos locais passaram. Primeiro ensaio Auth sem executablePath falhou por browser ausente; execução válida usou /usr/bin/chromium e passou. Revisão independente encontrou duas corridas P2; ambas reproduzidas RED e corrigidas com sessão efêmera/guard de commit.

Publicado: PR9, feature e8c6f1d33c69eee196a11a8b82ed30c0c4708796, merge89325f4e4aec265bb5a71eedbcadc5313a55a590. CI39159375240 SUCCESS nos três jobs; Vercel Emr8Kzc27GiXMXqYB8CGMunVxsoC SUCCESS. Canônico conferido: AccessPage com validação do portal servido, Conta disponível, health200, Auth/Team401 e rotas protegidas. Prova externa anônima em /workspace/shared/etapa06-portais-publicacao.json; identidades reais não usadas. Etapa06 completa segue em branch própria.
