# Etapa 24 — assinatura manual, GOV.BR e cartório

Fonte oficial: [cartão24 do Drive](https://drive.google.com/file/d/16jY65-HyAq91f-sL9HsEyOQo-IYGeK3y/view). [Especificação aprovada](../superpowers/specs/2026-11-04-etapa-24-formalizacao.md) e [plano](../superpowers/plans/2026-11-04-etapa-24-formalizacao.md). Base: Etapa23 publicada em main1e45dd3; nenhuma etapa paralela ou importação do sistema antigo.

## Entrega

Formalização por publicação/revisão exata no editor existente, dentro de Versões e PDF. Modalidades não exigida, física/cartório e eletrônica externa preservam suas diferenças. Configuração não dispensa nem troca uma exigência aprovada; alterações posteriores exigem nova revisão e formalização própria. Histórico pré24 físico permanece como conferência anterior, sem fabricar signatários/hash/evidência.

`documents.signatures.manage` configura, importa, registra ato físico e invalida; `documents.signatures.validate` registra decisão humana externa. Ambas dependem de acesso documental, escopo/responsabilidade e sessão atuais. Arquivo11 exige suas capacidades próprias. Seed somente owner; demais concessões são explícitas em Equipe/convites/delegações, sem alteração individual automática.

Saída do PDF base para assinatura tem autorização/evento próprios e política antes/depois da quitação. Signatários/configuração precisam existir antes da saída. A tarefa financeira pode ser criada antes da assinatura, permitindo cobrar sem ciclo; isso nunca concede entrega final. Download final revalida revisão, editorial, identidade, assinatura, financeiro/restrições e integridade, antes e depois de ler os bytes.

O PDF externo entra pelo pipeline11, sem sobrescrita/conversão. Sua referência e SHA256 ligam o original à conferência humana e à entrega. O worker entrega o original validado, nunca PDF regenerado. Rubrica/imagem, hash ou clique não provam assinatura criptográfica, validade jurídica ou recebimento. GOV.BR/ITI/cartório permanecem procedimentos externos manuais; nenhuma credencial ou documento é enviado automaticamente a eles.

## Limitação operacional real

Pipeline11 mantém arquivos estruturalmente válidos em quarentena sem scanner configurado. A Etapa24 conserva esse bloqueio; conferência humana não marca arquivo como clean. Homologação local positiva com fixture de scanner deve ser identificada como fictícia e não comprova antivírus/assinatura criptográfica reais. Não declarar importação/validação externa operacional no ambiente hospedado sem resolver a configuração real por procedimento autorizado.

## Camadas e aceite

- SQL aditivo: `20261104130612_document_signatures24.sql`, eventos/comandos privados imutáveis, RLS/ACL/FKs/índices, RPCs e extensão dos guards existentes.
- Express: `/api/document-workflow/signature-state`, `/signature-command` e saída `/artifact` com `action:signing`; contratos estritos/whitelist e no-store.
- Worker `document-artifacts`: saída distinta, arquivo final selecionado pelo banco, limites de bytes, SHA256 e reautorização; renderers históricos intactos.
- Interface: seletor existente e campos/padrões Equipe/Convites, quatro abas preservadas, sem spinner/overlay/rótulo pendente, idempotência503 e descarte por sessão/autoridade.
- GitHub/Vercel: publicação por integração Git, sem Actions nem deployCLI/API Vercel; apósGit conferir históricoSQL antes de aplicação manual.

Resultados efetivamente executados, publicação e limitações ficam em [fecho24](fecho-24.md). Até esse fecho ser verificado, não interpretar este contrato como prova de conclusão/publicação. Próxima25 não iniciada.
