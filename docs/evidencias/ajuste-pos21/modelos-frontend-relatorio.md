# Ajuste pós21 — contrato, API e frontend de modelos/documentos

Implementação local do Task2, alinhada ao contrato SQL com o agente responsável pela migration. Nenhuma alteração de Auth, SQL, Livro, conta real, produção, commit ou deploy foi realizada neste trabalho.

## Comportamento

- Campos `documento.[a-z][a-z0-9_]{0,63}` são manuais, declarados por versão e têm sete tipos: texto, data, valor, número, CPF, CNPJ e CPF ou CNPJ (`tax_id`). Máximo80 variáveis/overrides; declaração e placeholders precisam corresponder exatamente no modelo.
- Os14 campos automáticos mantêm fonte e tipo. Nomes de campos custom não selecionam pessoa, papel, ficha ou valor financeiro. O total automático conserva o snapshot do serviço.
- Valores manuais aceitam2000 pontos Unicode; formulário e renderer mantêm nomes automáticos120/demais500. Overrides legados continuam aceitando500 também para nomes: versões antigas com nome121–500 reabrem e mostram `invalid_value`, impedindo conclusão.501 continua recusado.
- `tax_id` atende a fonte integral de nove minutas que admitem PF/PJ no mesmo campo, conforme conferência do coordenador. Valida CPF ou CNPJ por dígitos verificadores, mascara CPF até11 dígitos e CNPJ acima11, sem alterar os14 automáticos.
- CPF/CNPJ usam `shared/identifiers.ts`, máscara incremental e somente dígitos nos novos envios da UI. Checksum inválido e placeholder obrigatório apagado impedem concluir; rascunho parcial permanece corrigível.
- `TemplateForm.text()` conserva tipo/rótulo/obrigatoriedade dos campos existentes e cria custom novo como texto. Somente custom permite selecionar tipo. Campos custom mostram sempre “Preenchimento manual”, inclusive após ajustes locais.
- DTO de versão permite `created_by:null` somente com `source_import_id` UUID. Autoria humana continua UUID e sem importação; legado sem a propriedade é aceito. A interface usa o nome técnico recebido e explicita revisão/aprovação humana.
- Limites JSON: modelos256kb e documentos1mb. DTO documental aceita os valores manuais completos; nenhum truncamento de texto foi introduzido.
- Rotas, navegação Equipe, quatro atalhos móveis, mensagens e ausência de loaders preservados. Seções compactas existentes mantidas; texto manual longo usa textarea com rolagem natural.

## RED/GREEN

1. Testes novos de gramática, tipos manuais, declaração exata,80/81, Unicode2000/2001, fonte exclusivamente manual, CPF/CNPJ e DTO técnico falharam antes da implementação; passaram após contrato/DTO/renderer.
2. API real Express com provedor fictício local: payloads autorizados acima dos limites antigos responderam413 no RED e200 após256kb/1mb. O teste documental usa80 valores de2000 emojis, verificando transporte UTF8 integral até o RPC. O provedor de teste recebeu decoder UTF8 incremental para não corromper buffers partidos.
3. UI RED confirmou CNPJ sem máscara, ausência de seleção de tipo custom e ausência do aviso técnico. A execução intermediária identificou label do novo select; `aria-label` explícito corrigiu a identificação acessível. Um erro sintático de JSX foi corrigido antes do typecheck final.
4. `tax_id`: unit/UI RED confirmou a ausência do sétimo tipo; GREEN cobre CPF11 e CNPJ14 válidos,12/13 dígitos e checksums inválidos, máscara/transporte e campos manuais2000 Unicode em320/360/768/1440.
5. Regressão adicional de compatibilidade legada nome121/500 falhou no RED e passou após preservar500 no input/DTO e120 no renderer/UI.

## Validação executada

- `npm test`:226/226 no primeiro fechamento do contrato (antes da regressão adicional de nome legado).
- `node --import tsx --test tests/models-manual-fields.test.ts tests/documents21-render.test.ts tests/documents21-api.test.ts tests/templates-contract.test.ts tests/templates-api.test.ts`:26/26 após compatibilidade legada e adição de `tax_id`.
- `npm run build`:passou (frontend e servidor); `npm run typecheck` final:passou.
- UI anterior:45/46 passaram, incluindo todas as regressões20/21, manuais320/360/768/1440 e geometria13/14 nas quatro larguras pedidas. Houve um timeout de navegação de30s em `charges workspace1920`; repetição isolada passou em3s, sem mudança financeira.
- UI final com `tax_id`:10/10 (`node scripts/test-team-ui.mjs --grep 'pós21:|charges workspace 1920' --timeout 60000`). Inclui sete opções de tipo, preservação dos metadados, CPF/CNPJ/tax_id, transporte só dígitos,2000 emojis, placeholder obrigatório removido, autoria técnica e aprovação humana explícita. As quatro larguras não apresentaram overflow horizontal, loaders ou mais de quatro atalhos móveis.
- `git diff --check`:passou.

As verificações de UI usam contratos fictícios locais e não provam autenticação/banco reais. SQL/RLS/importação/locks e Auth real pertencem às verificações específicas conduzidas pelo coordenador e agente de banco. Não foi executada publicação nem importação hospedada nesta subtarefa.

## Evidências locais preservadas

- `modelos-node-resultados.log`:26 testes afetados verdes.
- `modelos-ui-resultados.log`:10 testes finais verdes; a repetição financeira1920 está identificada no log.
- `modelos-build.log`:build final com o sétimo tipo.
- `modelos-ui-rodada-regressoes.log`:rodada45/46, incluindo o timeout relatado.
- `modelos-dados-320.png`, `modelos-dados-1440.png`, `modelos-editor-320.png`, `modelos-editor-1440.png`:capturas dos formulários manuais. Demais larguras em `/workspace/scratch/ajuste-pos21-ui/`.

Próximo checkpoint: revisão integrada do coordenador, suite completa final após todas as subtarefas e publicação conforme o plano. Nenhuma lacuna funcional conhecida permanece nesta subtarefa.
