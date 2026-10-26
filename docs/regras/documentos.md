# Modelos, editor, PDF, aprovação e entrega

Referência de negócio e integridade. Leia apenas este arquivo quando a etapa o indicar; decisões vigentes abaixo prevalecem sobre propostas antigas.

### Regra de versão e acesso documental
Preservar readDocumentAccess ou contrato equivalente único: identidade/vínculo, relação/capacidade, versão, revisão, financeiro, assinatura e restrições. Dono da conta não ganha acesso a todo documento com o mesmo CPF informado. Participantes principais e adicionais têm vínculo/limites/escopo explícitos, sem transferência automática de direitos por mesclagem.
Saída para assinatura é evento separado da entrega final, autorizado e auditado. Aplicar política por tipo de documento para evitar exigir assinatura de um arquivo que nunca pôde sair para assinar. Exceção financeira dispensa apenas quitação; aprovação, identidade, sigilo e assinatura obrigatória permanecem.
Prévia interna de rascunho não exige quitação, mas exige capacidade de trabalho. Download/impressão/envio final exigem elegibilidade. Impressão ou abertura de WhatsApp não comprovam recebimento. Arquivo eletrônico assinado mantém os bytes originais; derivações não herdam sua validação. Imagem de rubrica não substitui validação criptográfica. Adequação jurídica e documentos de entrega obrigatória são avaliados pelo responsável competente.


RF-07: editor amplo no desktop, etapas acessíveis no mobile, painel de dados, modelo, variáveis, pendências, revisão, prévia e gravação. Inteligência inicial significa regras objetivas, preenchimento e checklists; não há chamadas a modelos de IA.
Modelo tem versão, autor, responsável aprovador, vigência, tipo, variáveis tipadas, validações, política de assinatura e requisitos de revisão. Um contrato real e uma declaração real do escritório são pendentes; modelos de exemplo devem ser marcados como demonstração sem validade operacional.
Sintaxe proposta: {{cliente.nome}}, {{participante.vendedor.nome}}, {{servico.descricao}}. Renderer reconhece apenas campos permitidos, escapa conteúdo e não executa JavaScript/SQL fornecido pelo modelo. Variável obrigatória ausente bloqueia a finalização; não inventar endereço, cláusula ou participante.
Datas, valores e números usam formato brasileiro na apresentação. Valores por extenso precisam de regra/testes com centavos, singular e limites suportados. Texto editado no documento não altera automaticamente cadastro central.
Autosave em servidor de rascunho com versionamento otimista; gravar com revision esperada e retornar conflito quando outra pessoa alterou. Nunca usar last-write-wins silencioso. Sanitizar HTML, limitar conteúdo e não carregar recursos remotos arbitrários durante geração de PDF.
Modelo aprovado não é editado em lugar: criar nova versão. Documento guarda versão do modelo, dados resolvidos e conteúdo final para reprodução histórica. Revisão jurídica é humana e separada de validação técnica de campos.

RF-08: documento lógico agrupa versões; versão guarda conteúdo/snapshot, autor, revisão, hash e arquivos associados. Aprovação, assinatura, liberação e entrega sempre referenciam versão/arquivo exatos.
Proposta: workflow editorial em rascunho, em_revisao, aprovado, rejeitado ou substituido. Correção após envio retorna nova revisão; alteração de aprovado cria nova versão e exige aprovação própria. Aprovação da versão 2 não aprova automaticamente a 3.
PDF final tem layout estável, fontes com acentos, margens, numeração, identidade e data coerentes. Prévia deve mostrar a versão que será entregue. Arquivo oficial é produzido no servidor ou por processo confiável com resultado preservado; imagem na tela não prova identidade do PDF.
Material de trabalho pode ser pré-visualizado por equipe autorizada com marca RASCUNHO. Download/impressão final usam a mesma regra de liberação. Usuário com acesso de edição pode fotografar ou copiar o conteúdo; o sistema controla entrega oficial e registra acesso, não promete impedir qualquer reprodução física.
Hash identifica bytes; não substitui assinatura ou revisão jurídica. Ao importar PDF assinado, preservar original exato e tratar cópias de visualização como derivadas. Não adicionar rodapé, comprimir, mesclar ou imprimir-para-PDF sobre o original assinado.
Entrega registra versão, arquivo/hash, destinatário, canal, operador, horário e resultado. Impressão solicitada não prova recebimento físico; download não prova que o cliente leu. Registrar tentativa, disponibilização e confirmação como eventos distintos.

RN-01: editorial, financeiro, assinatura e entrega são dimensões independentes. A interface pode mostrar todos os badges e uma explicação derivada como 'Aprovado; saldo de R$ 40,00; download bloqueado'. Não manter um único status livre que possa dizer liberado sem critérios satisfeitos.

| Dimensão | Estados ou resultado |
| --- | --- |
| Editorial | rascunho, em_revisao, aprovado, rejeitado, substituido |
| Financeiro | aberto, parcial, quitado, cancelado; derivado de cobrança e alocações válidas |
| Assinatura | nao_exigida, pendente, em_validacao, validada, invalida |
| Entrega | bloqueada, elegivel, disponibilizada, entregue, acesso_revogado |
| Exceção | solicitada, autorizada, recusada, expirada, revogada |

Regra proposta de entrega oficial: identidade e vínculo ativos + capacidade/relação autorizada + versão atual apta + aprovação válida (ou revisão dispensada pelo serviço) + assinatura satisfeita quando exigida + pagamento suficiente (ou cortesia autorizada/exceção financeira válida) + arquivo disponível e íntegro + nenhuma restrição legal/operacional impeditiva.
Exceção financeira dispensa apenas condição financeira; não ignora aprovação, identidade, assinatura obrigatória ou confidencialidade. Autorização deve indicar documento/versão, cobrança/saldo, destinatário ou escopo, motivo, aprovador e validade. Novo preço, versão ou saldo relevante obriga reavaliação conforme escopo.
Operação de liberação revalida dados atuais e registra decisão atomicamente. Antes de gerar link ou imprimir final, verificar novamente elegibilidade. Proteger contra estorno simultâneo, versão substituída e concessão revogada. RN-02: impossibilidade de obter estado confiável resulta em bloqueio com orientação, nunca liberação por falha.
Pendente jurídico: política comercial de quitação não pode automaticamente justificar retenção de originais de clientes ou de documentos cuja entrega seja obrigatória. Exceções legais e deveres profissionais precisam ser definidos pelo responsável; sistema deve suportar política específica por tipo de documento.

RF-09: fila mostra motivo, versão, responsável, prazo interno, pendências e dados necessários. Aprovar, rejeitar ou devolver exige capacidade atual, referência de versão e registro de observação quando requerido. Mudança de conteúdo invalida decisão para a nova versão.
Proposta: evitar autoaprovação pelo funcionário que preparou; proprietário pode acumular execução e aprovação quando regra do serviço admitir, com identificação explícita. Delegação tem escopo e validade; CCIR/CAR permanece reservado ao proprietário conforme base original até nova decisão expressa.
Distinções obrigatórias: aprovar conteúdo, confirmar recebimento, validar assinatura e autorizar exceção são operações diferentes. Tela não deve oferecer um botão que faça todas sem indicar o que será autorizado.
Notificações são criadas após sucesso ou por outbox transacional quando necessárias; falha de alerta não duplica aprovação. Decisão repetida com mesma chave retorna o resultado anterior; decisão conflitante devolve erro e estado atualizado.
Retirar pedido de aprovação exige motivo e revisão auditada. Prazo interno expirado não produz aprovação automática. Férias, desligamento e substituição de responsável têm fluxo de transferência que não perde histórico.

RF-15: modalidade por documento: não exigida, assinatura física/cartório ou assinatura eletrônica externa. Adequação ao tipo de ato é validada pelo responsável; assinatura GOV.BR não substitui toda exigência de cartório ou instrumento específico.
O serviço oficial GOV.BR exige conta prata ou ouro [F6]. Cliente opera sua própria conta; sistema JN não guarda senha, token ou código GOV.BR. Fluxo manual: finalizar versão, aprovar conteúdo, disponibilizar para formalização conforme política, assinar externamente, importar original, validar em serviço oficial e registrar evidência.
Resolver o ciclo de assinatura versus pagamento: se assinatura for exigida antes de entrega, permitir saída controlada 'para assinatura', autorizada e auditada, distinta da entrega final. Se a política impedir qualquer envio antes da quitação, cobrar antes de iniciar assinatura externa. Nenhum estado circular exige assinatura de arquivo impossível de obter.
Assinatura registra signatários esperados, signatários verificados, tipo, arquivo/hash, data de importação, responsável e resultado/evidência da validação. Imagem de rubrica ou texto 'assinado' não comprova assinatura criptográfica.
Preservar os bytes originais; o guia oficial alerta contra salvar pela função imprimir porque isso não preserva a assinatura eletrônica [F7]. Impressão física é representação, não cópia eletrônica com a assinatura criptográfica. Rejeitar validação de arquivo diferente do que será entregue.
Assinaturas múltiplas precisam de sequência e versão apropriadas; alteração de conteúdo após assinatura exige nova formalização. Evidência técnica não substitui avaliação jurídica do ato. URLs oficiais: https://assinador.iti.br/ e https://validar.iti.gov.br/.

