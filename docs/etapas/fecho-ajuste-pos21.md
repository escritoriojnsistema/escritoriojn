# Fecho — ajuste pós21

Concluído e publicado em https://escritoriojn.vercel.app. Base21 `f591386` conferida antes de alterações. Escopo: acesso em outros dispositivos, deadlock/rapidez e referências documentais completas cadastradas como rascunhos; não inicia22.

## Resultado

Login deixava de funcionar antes da consulta quando APIs recentes de cancelamento/UUID não existiam. A camada central acrescenta somente primitivas ausentes, usa UUID criptográfico e mantém cancelamento, sessão e negações. Duas sessões novas da mesma conta são independentes; logout/401 não ressuscitam sessão. O erro de opções40P01 confirmado no banco foi eliminado por lock ordenado, preservando identidade/capacidade/escopo após espera.

A biblioteca contém64 minutas autorais completas, adaptadas após leitura integral dos51 modelos internos e24 fontes principais para13 adições. São rascunhos para revisão, sem aprovação, assinatura, entrega ou documento21 criado. Campos específicos são manuais, tipados e validados em JS/API/SQL;14 campos automáticos e snapshots anteriores mantidos. Originais e PII não foram publicados. [Análise completa](../evidencias/ajuste-pos21/analise-documentos.md) e [manifesto](../evidencias/ajuste-pos21/catalogo-minutas.json).

## Verificação

228Node/API,389linhasPASS SQL em dois bancos vazios com migrador limitado,64minutas/1938campos/replay/DTOs/rollback/ACL e corridas reais,45Auth locais distintos(41acesso/sessões+4modelos/documentos). O novo teste percorre importação técnica→UI→aprovação explícita de fixture local→sete campos/2000emojis→autosave→banco→nova versão humana.10UI finais e regressões20/21,320/360/768/1440,12públicos canônicos,build/typecheck/auditprodução0 e revisão independente semP0/P1/P2. [Evidências e limites](../evidencias/ajuste-pos21/verificacao.json), [Auth](../evidencias/ajuste-pos21/auth-relatorio.md), [banco](../evidencias/ajuste-pos21/modelos-banco-relatorio.md), [UI](../evidencias/ajuste-pos21/modelos-frontend-relatorio.md), [revisão](../evidencias/ajuste-pos21/revisao-final.md).

Até quatro atalhos/ações, sidebar e padrãoEquipe mantidos; seções compactas e rolagem natural para conteúdo longo, sem loaders. Página1001:18.888ms local. Tempos locais não prometem latência zero na rede. Aparelhos físicos e Auth pessoal hospedado não foram exercitados; APIs ausentes foram simuladas em Chromium com Auth/PostgREST/banco reais de laboratório. Um timeout de navegação1920 e falhas de bootstrap/HMR sob carga não se repetiram nas rodadas isoladas registradas.

## Publicação e preservação

[PR64](https://github.com/escritoriojnsistema/escritoriojn/pull/64) `92c35a4`, [PR65runtime](https://github.com/escritoriojnsistema/escritoriojn/pull/65) `9b8ec8b`, depois [PR66schema](https://github.com/escritoriojnsistema/escritoriojn/pull/66) `094ad74`; todos VercelSUCCESS porGitHub→Vercel. Migrations incrementais automáticas `20261027162946` e`20261027172917` conferidas no histórico31:1+25comandos/6corpos iguais ao arquivo,385funções históricas preservadas no segundo rollout. Nenhum applymanual/Actions/deployCLI/APIVercel.8assets canônicos idênticos ao build,health200/rotas privadas401/tabelasREST401/importador não exposto404. [Publicação](../evidencias/ajuste-pos21/publicacao.json), [schema](../evidencias/ajuste-pos21/schema-modelos-publicado.json), [bundle](../evidencias/ajuste-pos21/bundle-modelos-publicado.json).

Cadastro real autorizado em um lote técnico:64templates/64versões,zero aprovações/zero documentos,64eventos de operador,resultado e definições conferidos por leitura/replay sem duplicação.5Auth/5vínculos/1cliente/1pedido/17grants preservados; auditoria32→96 pelos64cadastros reais. Não foi usada conta pessoal nem criadofixture na produção. Autoria técnica não simula UID e cada futura edição humana terá seu autor real. [Readback](../evidencias/ajuste-pos21/catalogo-cadastrado.json).

Advisors:nenhumWARN/ERROR ouFKsemíndice novo. RLS sem policies do lote privado é intencional comACLfechada; índice novo sem uso éINFO. Permanecem avisos anteriores de [proteção de senhas vazadas](https://supabase.com/docs/guides/auth/password-security#password-strength-and-leaked-password-protection) eFKs históricas, fora da alteração atual. [Delta](../evidencias/ajuste-pos21/advisors-delta.json).

Reversão segura exige migration corretiva preservando versões/provenance e lote; não apagar dados reais nem restaurar created_byNOTNULL sobre versões técnicas. Reverter o lock reintroduziria o deadlock. Nenhuma reversão destrutiva foi executada. Próxima22 depende de novo pedido; consultar Livro/AGENTS/este fecho.
