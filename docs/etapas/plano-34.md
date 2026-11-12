# Plano de implementação — Etapa 34

**Objetivo:** leitura voluntária da versão visível e acessibilidade nos shells existentes.
**Arquitetura:** React/Vite/TypeScript preservados. Componente de voz reutilizável com Web Speech, apenas vozes marcadas locais, pt-BR prioritário/português alternativo. Editor usa sua prévia resolvida. Portal e versões usam extração local preguiçosa de texto do PDF autorizado existente (PDF.js/worker servido pelo próprio app). Nenhuma leitura do texto interno pelo cliente, novo endpoint, OCR, API externa ou cache persistente. Texto extraído é exibido como alternativa acessível, sem alegar equivalência visual/assinatura. PDF sem texto: fallback humano.
**Referência:** etapa-34.md, portal-pwa.md/RF18, AGENTS e Livro.

## Restrições

Manter Equipe/Convites, uma área ativa, até4atalhos/mobile e demais destinos no menu; controles44px/inputs16px; rolagem natural em zoom. Nenhum loader. Preservar identidade31, gates25/26, compartilhamento32 e pedidos33; sem migrations/grants/fixtures hospedadas. GitHub→Vercel, semActions/deploydireto.

## Decisões e alternativas

Síntese remota foi descartada por privacidade e custo. Texto do editor enviado ao cliente seria outra projeção e poderia divergir de PDF assinado: descartado. Ler os mesmos bytes liberados mantém o gate e permite fallback para PDF digitalizado. Voz remota/privacidade desconhecida não é acionada; texto continua disponível. Pausa é oferecida quando métodos existem; falha orienta parar/reiniciar. Sem promessa de latência física zero.

## Tarefas e verificação

- [x] 1. Testes de voz: sem início automático, só português local, pausas/retomada/parada, textos longos e cancelamento de callbacks antigos. Criar controlador em src/features/documentReading/speech.ts e testes Node; executar RED→GREEN.
- [x] 2. Componente de leitura e extração PDF local: ReadAloud.tsx, pdfText.ts e PdfReading.tsx. Integrar DocumentEditor, VersionsPanel e PortalLibrary. Testes de navegador exercitam PDF real, acesso negado, revisão/edição/navegação, voz ausente/remota/erro, sem vazamento externo nem persistência.
- [x] 3. Acessibilidade compartilhada: foco de main/atalho, contraste e reflow; verificar shell/logins e jornadas dos quatro perfis, teclado,320/375/768/1440 e zoom200%, sem indicadores de carregamento.
- [x] 4. Tipos/build, suíte Node, contratos do domínio e regressões pertinentes; auditprodução; consulta remota somente leitura de Supabase e integração Git/Vercel. Atualizar fecho, Livro, AGENTS e evidências. Criar commit/PR com resultado revisável; publicação conforme autorização aplicável.

## Pontos de revisão

Voz carregada tarde ou removida; callback antigo após cancelamento; PDF sem texto/criptografado/complexo; revogação/versão alterada durante extração; navegação com zoom/teclado virtual. Nenhum destes pode produzir voz automática, texto antigo ativo ou conteúdo em log/notificação.
