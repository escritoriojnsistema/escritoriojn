# Fontes oficiais consultadas — 05/11/2026

Consulta via habilidade Firecrawl. Texto do guia ANPD recuperado em PDF completo, 40 páginas. Texto atualizado da LGPD recuperado na Câmara dos Deputados. A URL do Planalto respondeu com bloqueio de aplicação, portanto não foi utilizada como prova de leitura.

- ANPD, Guia orientativo Cookies e proteção de dados pessoais, outubro/2022, versão1.0: https://www.gov.br/anpd/pt-br/centrais-de-conteudo/materiais-educativos-e-publicacoes/guia-orientativo-cookies-e-protecao-de-dados-pessoais.pdf/@@display-file/file
- Câmara dos Deputados, Lei13.709/2018, texto atualizado: https://www2.camara.leg.br/legin/fed/lei/2018/lei-13709-14-agosto-2018-787077-normaatualizada-pl.html

Aplicação: separar tecnologias essenciais de opcionais, informar finalidades, não condicionar serviço a consentimento genérico, desativar opcionais por padrão e permitir rejeição equivalente quando existirem. O aplicativo não instala publicidade nem analytics: não foram criados rastreadores nem categorias falsas para demonstrar aceite/rejeição. Não se pede consentimento para mero login. Informação e retenção por classe dependem dos princípios/fundamentos e arts.9,15,16,18; cinco anos não é prazo universal LGPD.

Sem controlador, CNPJ, endereço ou contato presumidos. A identificação jurídica/canal e políticas por classe foram solicitados pelo coordenador; os avisos deixam a pendência explícita. Isto impede declarar uma política jurídica final aprovada.

Inventário técnico: SDK Supabase usa localStorage de autenticação, verificador PKCE e marcadores locais de encerramento; recuperação tem estado de sessão no navegador. `jn-privacy-notice-v1` armazena a versão do aviso, necessary:true, optional:false, consent:false exclusivamente por ação Salvar somente necessários. Sem PII, sem dados privados em cache de serviço, sem service worker. Registro local não concede autorização. Sem consentimentos opcionais/aceites jurídicos efetivos, nenhum recibo de consentimento foi inventado no banco. Eventual ativação futura de rastreadores requer inventário/base legal, rejeição/preferências reais e recibos necessários antes da ativação.
