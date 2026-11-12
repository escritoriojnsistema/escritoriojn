# Correções — rodapé, cadastro e formulários por categoria

Pedido do usuário após34; não inicia35. Base da implementação904569e/PR123 (então em preview), branch `fix/portal-categorias-aceites`. AGENTS/Livro e módulos existentes conferidos antes de alterar.

## Escopo e integração

- Rodapé compartilhado no fim do fluxo, inclusive acesso, operação, indisponibilidade e404; sem overlay nos controles ou atalhos mobile.
- Cadastro cliente: três aceites separados, não pré-marcados, antes da senha; senha/botão/submit protegidos. A declaração versionada de termos/privacidade/cookies necessários é validada pelo triggerAuth existente e registrada com horário do servidor, sem retroagir contas existentes ou habilitar rastreamento opcional. Convites legítimos e bootstrap preservados.
- Configurações→Categorias→Formulário e anexos: gestor vigente com categories.manage publica campos tipados/opções/obrigatoriedade e slots de arquivos com nome, limite, formatos/classificação. Nenhum formulário, serviço ou preço real é inventado.
- Portal: a categoria publicada mostra seus próprios campos e anexos. Serviço só aparece quando publicado; categoria sem configuração tem orientação explícita. Documentos mantém catálogo/modelos existentes; nova captura de categoria acompanha preparações por serviço/modelo. Respostas e slots ficam em snapshot do mesmo protocolo10, upload privado11/quarentena e envio/distribuição existentes33.
- Backend `/api/category-intake` valida payload, autoridade e projeções; RLS/ACL fechadas e wrappers públicos INVOKER. Campos e anexos obrigatórios conferidos no servidor, inclusive no endpoint antigo de reenviar; arquivo alheio não satisfaz slot. Equipe autorizada vê respostas efetivas e anexos conforme files.read.
- Migrations20261112143114_category_intake e20261112143334_registration_acceptances aplicadas automaticamente porGit após a UI compatível; histórico78/última20261112143334. Não reaplicar nem duplicar as76 anteriores.

## Verificação e limites

Implementação e revisão concluídas:406 testesNode, tipos/build e auditoria de dependências de produção sem vulnerabilidades; replay realSQL com2.257 verificações e migrador sem superuser/BYPASSRLS. 33cenáriosUI distintos aprovados (20rodapé/admin e13cliente, em rodadas complementares). As suítes novas cobrem publicação/permissões, tipos/ordem/opções, anexos, retries503, reconciliação409, navegação e retomada sem segundo protocolo. Regressão de navegação agrupada/leitura34/layout/privacidade:54 aprovados e2 ignorados condicionalmente. ContratosUI usam autoridade fictícia; não substituem o laboratório real.

Auth/REST/Express/Storage reais em laboratório descartável passaram pelo script `scripts/test-category-intake-real.mjs`: rejeição atômica de cadastro sem aceite, registro privado imutável com data do servidor, isolamento entre clientes, abertura concorrente idempotente, validação de dados/slots, PDF privado em quarentena, envio/fila e projeção à equipe. Preparações de serviço33 e modelo comercial capturam também a configuração da categoria. Nenhuma conta, grant, configuração ou arquivo fictício foi criado em produção.

Revisão independente encontrou quatro falhas deUI, reproduzidas e corrigidas: edição de modelo não salva bloqueia envio/troca de área; anexos originais de serviço/modelo continuam acessíveis; retirada da publicação durante bind permite encerrar a preparação antiga; respostas locais não são perdidas em respostas de upload/save. Recuperação adicional503→409 retoma protocolo existente; retorno do seletor de serviço volta às categorias. Rodapé tem reserva adicional quando o zoom faz os atalhos ocuparem duas linhas (teste200px RED→GREEN). Sem spinner/overlay de carregamento; cache, lazy loading e fronteiras de sessão existentes preservados. Não se afirma latência física zero nem teste de aparelho móvel físico.

Evidências em `docs/evidencias/correcoes-portal-categorias-aceites/verificacao.json` e capturas fictícias320/1440. Não se inventou formulário real para as categorias: gestor autorizado publica seus campos/documentos em Configurações→Categorias. Scanner ausente conserva quarentena. Na publicação autorizada o histórico passou de76 para78; ambas as novas migrations foram aplicadas automaticamente porGit, sem aplicação manual duplicada.

## Publicação concluída

Usuário autorizou explicitamente: “Então faça a publicação e aplique as migrações”. PR123 foi integrado por merge7783522; produçãoCdJdicHRREADY confirmou a declaração de cadastro/rodapé no domínio público antes da exigênciaAuth. A base doPR124 foi então ajustada para main e integrada por mergeb449b54, árvore7ef7d7d idêntica à homologada. Produção43hrmZbeREADY, origemGit: https://escritoriojn.vercel.app. SemActions/deploydireto. [Registro](../evidencias/correcoes-portal-categorias-aceites/publicacao.json).

O Supabase aplicou automaticamente as duas migrations:58+12instruções correspondentes aos arquivos,28corpos de funções iguais, três guards dinâmicos presentes, cinco wrappers públicosINVOKER e seis tabelasprivadasRLS/ACLfechadas. Não reaplicar. Contas7/identidades/vínculos/permissões conservados;175/176fingerprints iguais, somente registro do dispatcher de manutenção avançou às22:55, mantendo configuração desde06/11 e sem erro. Seis novas tabelas vazias, sem conta/formulário/preço/anexo fictício hospedado. [Schema](../evidencias/correcoes-portal-categorias-aceites/schema-publicado.json) e integridade-publicada.json.

18cenários públicos no domínio de produção aprovados (rodapé, aceites, payload interceptado, transparência, teclado/zoom), HTML/saúde200 e barreiras privadas401. Compilado confirma metadata versionada e cookies opcionais desativados. Consulta agregadaVercel da implantação sem erros/fatais; semFKnova sem índice. InformativosRLSsem policies são intencionais nas tabelasprivadas deACLfechada; índices novos conservados paraFK/consultas. AvisoAuth preexistente de proteção de senha vazada permanece fora destas alterações; referência em [advisores](../evidencias/correcoes-portal-categorias-aceites/advisores-publicados.json). Sem login privado/fixture hospedada; fluxo funcional real foi verificado no laboratório descartável.

Gestor autorizado configura campos/documentos reais em Configurações→Categorias→Formulário e anexos. Etapa34 publicada e preservada. Próxima35 somente por novo pedido; não refazer as implementações existentes.
