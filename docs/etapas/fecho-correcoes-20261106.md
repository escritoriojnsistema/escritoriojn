# Correções integradas posteriores à Etapa 25 — 06/11/2026

Implementação autorizada pelo pedido de correções e pela instrução de concluir e publicar. Preserva a Etapa 25 e não inicia a Etapa 26. Base conferida: `9fa6910`; checkpoint preservado: `288baf2`.

## Resultado funcional

- Níveis 1 e 2 têm permissões individuais independentes; Nível 3 segue acesso geral autorizado. Visualizar, assumir, retomar, editar, transferir e concluir passam pelas verificações atuais do banco. Exceções têm autor, motivo, revogação e escopo de uma solicitação; Nível 1 não concede administração global.
- Pré-atendimento presencial/WhatsApp separa coleta de dados, cliente, notas e anexos da execução. O encaminhamento usa a categoria e encerra a autoridade de coleta. Perder escopo fecha o detalhe imediatamente.
- Categorias são canônicas e sincronizadas com versões de serviços, sem duplicações ou reescrita de históricos. Cadastro/edição exigem nível; legado/importações ficam explicitamente pendentes até escolha do gestor. Abertura pública por RPC também exige categoria.
- Aguardando cliente devolve motivo, notificação, edição de informações/mensagem/documentos e reenvio. Cancelado bloqueia edição/reenvio e permite ocultação própria, conservando arquivo interno; em atendimento é somente acompanhamento. Regras aplicadas no servidor e no banco.
- Catálogo do cliente mostra apenas ofertas/modelos aprovados e autorizados, pastas elegíveis, serviço, categoria, preço e checklist quando presente. Serviços complexos permanecem informativos até atendimento adequado; serviços realmente arquivados não são restaurados por sincronização.
- Exclusão de conta tem motivo único, observação opcional, exportação PDF/ZIP `Meus Documentos`, aviso e ciência. Soft deletion oficial do Auth elimina credenciais e sessões, preservando UUID/FKs. Tombstone impede reativação; clientes saem de buscas/seleções comuns. Arquivados → Contas excluídas permite busca por cliente/documento e consulta autorizada, inclusive de documento preparado após o encerramento.
- Retenção por classe/tipo exige fundamento, finalidade, marco e prazo aprovados, revisão e destinação de backups. Evento legal verificado permite informar o marco fiscal correto. Classificação autoriza agendamento; suspensões, prazos próprios, outros titulares, referências, autoridade atual e política vencida bloqueiam eliminação. Worker com lease/retry apaga Storage e fontes pessoais do documento, conservando IDs, hashes, eventos e ledger. Nenhum prazo universal de cinco anos foi imposto.
- Configurações → Privacidade é exclusiva do superadministrador: nome/razão social, CNPJ opcional, e-mail/telefone e endereço. Por escolha do usuário, aviso inicial usa dados explicitamente fictícios de exemplo; após salvar, a identificação publicada é atualizada. Login/cadastro explicam privacidade, termos e armazenamento necessário. Sem rastreadores opcionais ou consentimento genérico inventado; preferência local versionada.
- Voltar da recuperação preserva sessão e retorna à Conta correta; acesso anônimo volta ao portal adequado. Portal da Equipe fica identificado por texto na home. Menu e atalhos existentes preservados, sem spinner/overlay nas novas ações.
- Painel de retenção usa três áreas compactas, editor sob demanda e grid desktop/mobile; detalhes secundários recolhidos e alvos de 44px. Foram corrigidos dados/rascunhos restantes após 401/403, busca repetida após 503 e detalhe mantido após `access_lost`.

## Validação

- 334 testes Node/API e build frontend/servidor aprovados.
- Dois replays PostgreSQL vazios, com migrador sem superusuário/BYPASSRLS: 1.910 e 1.916 verificações, mais fecho = 3.827 linhas PASS. Incluem níveis, encaminhamento 1/2/3, exceções, coleta, devoluções, catálogo, encerramento, retenção/eliminação automática, datas verificadas, permissões e corridas de papel/convite.
- Jornada real local Auth/PostgREST/API/Storage: PDF e ZIP com bytes exatos; fechamento revoga duas sessões e refresh; novos acessos negados; arquivo inclui terceiro documento posterior; bloqueio/liberação e expurgo automático reais apagam objeto e fontes, conservando hashes/ledger/histórico e objetos alheios. Retry idempotente. Nenhum dado ou fixture hospedado usado.
- Interface: 27 contratos de solicitações/coleta/exceção/arquivo/conta e 3 de configuração de privacidade aprovados; retenção compacta com 13 contratos e 2 rechecagens, em 360/1440px. Recuperação e apresentação pública têm evidências próprias. SDK/API simulados nesses contratos são distintos da jornada real acima.
- Corrigidas falhas encontradas pela revisão: policies de Storage ainda ligadas ao OID da função anterior; corrida convite × exclusão; cópia pessoal nos comandos de intake após expurgo; descoberta/classificação sem capacidade de leitura do domínio; agendador incompatível com chaves gerenciadas. Testes negativos e positivos registrados.
- Índices das novas referências acrescentados após advisors. A projeção pública de privacidade usa função invoker pré-analisada, sem conceder USAGE anônimo no schema privado; prova local PostgreSQL confirma acesso público restrito.

## Desempenho

Entrada pública reduzida de 1.351.244 para 650.907 bytes (−51,83%). Em 12 pares alternados, navegador novo e cache desabilitado, mobile 360×740 com rede controlada de 10Mbit/s e latência de60ms: FCP mediano 1.314 → 810ms (−38,36%). É medição local reproduzível, não SLA/aparelho físico. A rodada sem limitação de rede, concorrente com SQL, registrou516 →536ms; não foi omitida e não comprova ganho de FCP nesse cenário. Dados brutos e scripts constam nas evidências.

## Publicação e operação

- [PR87 — schema](https://github.com/escritoriojnsistema/escritoriojn/pull/87), merge `6c6f30af08171d74a61eccbaee405cdb8ed688e8`; VercelSUCCESS. Oito migrations aplicadas automaticamente: histórico54→62, 229 comandos correspondentes aos arquivos testados; não reaplicar.
- Workers `account-closure` e `retention` ACTIVE/v2, JWT obrigatório. Cron/Vault configurados: fechamento a cada5min e retenção a cadahora. Chamadas reais pelo pg_net retornaram200, processed0/pending0. Sem chaves privilegiadas em Express/Vercel/browser ou Git.
- Antes do frontend: 7Auth, 7vínculos, 17grants individuais, 114eventos e0documentos/arquivos/contas encerradas preservados. Nenhuma classificação jurídica, nível, aprovação ou preço fictício criado no ambiente hospedado.
- Runtime e índices finais: publicação em andamento; registrar PR, deploy, readback e alias antes do fecho definitivo.

## Escolhas operacionais que permanecem configuráveis

O superadministrador deve substituir os exemplos de identificação em Configurações → Privacidade, escolher os níveis das categorias pendentes e aprovar políticas por classe conforme os documentos e obrigações reais. Isso é configuração operacional; o sistema bloqueia encaminhamento/eliminação incorretos enquanto faltar decisão. Não afirmar que todos os dados pessoais foram eliminados: cadastro, fontes de atendimento, registros financeiros/auditoria e backups têm finalidades e prazos independentes, conforme a política aplicável. Não houve teste com usuário real ou dispositivo físico, scanner real ou eliminação de backups hospedados.

Arquivos e evidências: `docs/evidencias/correcoes-integradas/`, `docs/regras/retencao-contas.md`, migrations, módulos de solicitações/conta/privacidade/retenção, componentes React, scripts e testes relacionados. Histórico anterior do Livro preservado. Publicação exclusivamente GitHub→Vercel; GitHub Actions não utilizado.
