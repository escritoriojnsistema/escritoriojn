# Ajuste de Conta e correções cadastrais — 21/10/2026

Pedido: edição dos dados pessoais pela equipe; cliente propõe alterações em uma solicitação; consulta e aplicação por permissões independentes; opção Atribuir a mim; protocolos para todos os tipos; continuidade no Livro Raiz.

Reaproveitar Conta, Auth/Supabase, solicitações10, notificações12 e distribuição pós12. Nome, CPF e e-mail são dados pessoais; perfil/escritório/permissões permanecem governança. Conta lê fontes oficiais, sem inferir identidade por contato. CPF antigo da equipe existe somente como hash/máscara e não é reversível; novos convites passam a reter o CPF completo após conferência válida, sem reescrever um CPF já conhecido. Novo CPF completo será persistido sob ACL privada e validado nas três camadas.

Equipe salva nome/CPF e prepara a troca de e-mail pelo fluxo oficial de confirmação do Supabase. Cliente envia valores propostos, sem alterar o cadastro. Owner consulta/aplica; demais exigem accounts.corrections.read e accounts.corrections.apply, além do acesso aos pedidos. Aplicação respeita responsável atual e versão; proposta e aplicação são preservadas. E-mail aprovado fica pendente de confirmação pelo titular, sem trocar credenciais diretamente no banco. Não criar conta, vínculo ou permissão por comparação de CPF/e-mail.

Atualizar somente vínculos conhecidos: identidade da mesma conta e origem cadastral explicitamente ligada ao membership, sem seguir mesclagem para outra pessoa. Dados de histórico/snapshots continuam históricos. Operações registram evento sem dados pessoais no audit.changes. Pedidos novos reutilizam contador/protocolo/idempotência10. Avisos não carregam campos pessoais da proposta.

Aceite: três perfis internos editam dados; cliente abre formulário preparado e Enviar aparece após alteração; solicitante/owner/equipe autorizada acompanham; sem permissão não há leitura nem aplicação por API/RPC; ex-responsável acompanha sem editar; versão obsoleta e identificador conflitante na ficha ligada conflitam; confirmação de e-mail sincroniza fontes; seletores distinguem o próprio vínculo de terceiros. Desktop/mobile seguem Equipe, quatro atalhos, sem loader.

Validação: testes de entrada/DTO/API, SQL em banco descartável/replays/concorrência, contratos responsivos e Auth real local. Build/typecheck, revisão de autorização e publicação exclusivamente GitHub→Vercel, Actions desativado. Não inserir fixtures nem modificar contas reais durante testes. Antes de DDL remota verificar histórico após Git para evitar reaplicação.

Estado: APROVADA, PUBLICADA E VERIFICADA em22/10/2026. [Fecho](fecho-ajuste-conta.md) e [publicação](../evidencias/ajuste-conta/publicacao.json). 108Node/API,1432SQL,50UI distintos,23Auth locais e56E2E públicos locais+56canônicos aprovados. Supabase aplicou a migração porGit;79comandos/31corpos ativos correspondem ao arquivo testado. Ajustes anteriores preservados em docs/etapas/fecho-ajuste-pos12.md.
