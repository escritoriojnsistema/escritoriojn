# Etapa 35 — implementação e homologação

Pedido14/11/2026: implementação completa conforme manual no Drive, incluindo GitHub→Vercel, sem GitHub Actions. Basee71b477 conferida com AGENTS/Livro e últimos merges antes de modificar. Etapa34 e correções posteriores preservadas.

## Resultado

- Identidade JN em manifesto estável, start/scope públicos `/`, standalone, PNG192/512 maskable em área segura e Apple180, metadados iOS/tema/safe-area.
- `/instalar` pública, seletor de dispositivo para reduzir rolagem, instruções Chrome/Android, Safari/iPhone e Chrome/Edge desktop. Prompt opcional só por ação humana; modo instalado/fallback textual. Link público no rodapé e ação secundária na sidebar/drawer de todos os perfis. Marca retorna ao portal atual verificado. Sem spinner/banner de atualização/reload automático.
- Equipe: Caixa/Solicitações/Clientes/Ajustes somente conforme capacidades já vigentes, fallback para menos módulos; nenhuma soma de permissões entre escritórios. Cliente conserva navegação própria. Desktop agrupado e busy/POP/503 preservados.
- Worker registra silenciosamente depois do load apenas em contexto seguro de produção, sem chamada adicional de banco. Cache de uma versão contém exatamente `/offline.html` e três PNGs públicos; nenhum bundle/index/rota autenticada/API/Auth/Storage/token/PDF/relatório/resposta privada entra no CacheStorage. GET de navegação usa rede; falha de transporte mostra só orientação pública. ErrosHTTP preservados; API/Auth/Storage/arquivos não recebem fallbackHTML.
- Hash do build versiona o cache. Sem skipWaiting, claim, comando externo de ativação ou reload: a nova versão aguarda todas as abas. Ativação remove apenas caches JN antigos. Não há fila/escrita offline. Conta/portais continuam sujeitos aos mesmos gates/limpeza de memória já existentes; downloads manuais permanecem fora desse controle.
- Backend/hosting: exceção exata dos arquivos públicos ao no-store geral, com revalidação HTTP, preservando no-store de APIs/telas privadas e MIME correto. A primeira execução de navegador revelou que no-store nos próprios arquivos públicos impedia instalar o cache neste Chromium; exceção pública corrigiu a reprodução. Vercel exclui arquivosPWA do rewriteSPA. HTTPS já fornecido pela hospedagem; sem mudança direta de projeto/domínio/segurança.
- Supabase: schema/Auth/Storage/Edge/permissões **não se aplica**, pois instalação é do navegador. Leitura79migrations/última20261113140739 confirmada; nenhuma migration reaplicada, fixture hospedada ou grant criado.

## Evidências e limites

Node412/412, tipos/build e auditprodução0 aprovados. UIregressão106/106: quatro perfis,320–1440, anexos/PDF/503/POP, isolamento de portal e leitura34. PWA7cenários contra build real: layout/foco/zoom200, prompt explícito/fallback, cacheallowlist/reaberturaoffline/retornorede, manifesto e installability doChrome sem erros, atualização aguardando duas abas com chave e File preservados. Testes usam dados fictícios somente locais; não representam login privado hospedado. Complementares:37aprovados/2pulos e três falhas de alvo de toque no novo linkInstalar do rodapé; corrigido para44px e suíte inteira de rodapé9/9 aprovada. União sem duplicidade:135cenáriosUI aprovados. As falhas intermediárias de zoom, label do seletor e cabeçalhoPWA foram reproduzidas e corrigidas antes da publicação. Publicação é registrada abaixo.

Revisão independente sem achados de segurança/correção; observação menor aceita: evento beforeinstallprompt emitido antes de abrir `/instalar` pode não oferecer o botão opcional, mantendo instalação pelo menu documentado. Sem dependência nova; parser/workerPDF e contratos anteriores conservados. Acesso inicial continua lazy; SW acrescenta só quatro arquivos públicos pequenos, de modo assíncrono. Sem promessa de latência física zero.

Não há dispositivoAndroid/iPhone físico neste ambiente. Instruções e manifestoChrome foram verificados; não afirmar instalação física/Safari real. WebKit baixado mas execução indisponível por bibliotecasLinux ausentes, sem helper/sudo e sem pacotes disponíveis no índice local. Conferência humana: no dispositivo suportado, instalar pelo menu indicado, fechar/reabrir, desligar a rede e confirmar que só aparece a orientação pública.

## Publicação

Checkpoint: PR128/feature2c51a79 criado pelo conectorGitHub. Primeira prévia rejeitada antes do build: padrão agrupado do cabeçalho público incompatível com parserVercel. Corrigido para quatro sources literais, mantendo a allowlist; produção anterior preservada. Publicação/READY e verificaçõesHTTPS/MIME/401 serão registrados após retorno real da integraçãoGitHub→Vercel. Não iniciar36 automaticamente.
