# Referências documentais — análise e preparação

A última etapa conferida foi a21 publicada. Este ajuste não inicia22. O usuário autorizou usar MODELOS DE DOCUMENTOS como referência, preservar os originais e cadastrar versões adaptadas completas como rascunhos para revisão.

## Leitura das fontes

Foram lidos os51 DOCX da coleção interna, incluindo corpo, tabelas/caixas de texto, cabeçalhos, rodapés e notas; as mídias incorporadas pertinentes foram inspecionadas. A primeira adaptação resumida foi ampliada para conservar o documento completo por natureza: qualificações por papel, objeto, cláusulas, obrigações, pagamentos/prazos, efeitos/encerramento quando pertinentes, pedidos, local/data, assinaturas, testemunhas e anexos.

Na coleção externa foram comparadas55 famílias com524 arquivos, predominantemente casos preenchidos. O inventário serviu para localizar tipos, cópias e documentos classificados em pastas inadequadas. Para13 adições foram lidas24 fontes principais integrais:19 DOCX, três PDFs com quatro páginas lidas e vistas, e dois DOC binários de conteúdo duplicado. Ofícios e comodatos repetidos ficaram como referência secundária; temporários do Office e materiais geográficos/cadastrais não viraram minutas. Isso não constitui auditoria jurídica individual de todos os524 casos pessoais.

## Resultado autoral

O catálogo final contém64 minutas,1938 campos declarados e249315 caracteres de texto com placeholders compilados; máximo8025 caracteres e60 campos por modelo. Os códigos DRIVE-001 a DRIVE-064 identificam esta seleção. O manifesto público contém somente títulos genéricos, contagens e hashes. Textos originais, casos pessoais, nomes de arquivos pessoais, IDs individuais e mapa de origem permanecem privados. O payload completo adaptado foi validado em laboratório; sua cópia no sistema fica sujeita às permissões20.

As cláusulas foram reescritas, com correção de contradições de partes/datas/objeto, quitação genérica, renúncia antecipada ou afirmações não verificadas. Incluem, entre outros, contratos rurais/urbanos, arrendamentos, doações, declarações, requerimentos municipais/registrários, energia e ofícios por destinatário. Manifestação e consentimento de laqueadura mantêm finalidades distintas e revisão clínica/legal. Não se presume propriedade, fato, recebimento, elegibilidade clínica ou enquadramento trabalhista.

Todos os modelos exigem revisão do documento e são cadastrados sem aprovação. Campos condicionais devem ser ajustados pelo revisor ao caso; não se deve preencher CPF/data inválidos para indicar “não se aplica”. A revisão cria versão humana nova e preserva a versão técnica. Aprovação é uma decisão explícita e exata20; somente uma versão aprovada vigente entra nas opções21. Não foram antecipados assinatura/entrega/ciclo editorial22.

## Campos conectados ao sistema

Os campos específicos são exclusivamente manuais `documento.*`, com texto, data, valor, número, CPF, CNPJ ou CPF/CNPJ. Documento pode ter até80 campos, texto manual2000 pontos Unicode e validação no frontend/API/banco. Valores contratuais não utilizam automaticamente o preço do serviço. Os14 campos automáticos anteriores e seus snapshots continuam intactos. CPF/CNPJ usam máscara incremental, checksum e transporte somente de dígitos; isso não prova identidade.

A importação é uma operação técnica privada, com lote/hash/replay e auditoria do papel real do banco. Autor humano nulo só é aceito com provenance válida do lote; não foi criada sessão ou atribuída autoria a uma pessoa que não atuou. Repetição exata retorna o resultado persistido; conflito não sobrescreve nenhum modelo.

## Verificação

64 definições passaram pelo contratoJS e resolução determinística com preenchimento fictício válido; todas vazias mantêm pendências obrigatórias. Dois replays PostgreSQL17 importaram e consultaram cada definição pela RPC20 autorizada, comprovaram replay/ausência de aprovação/documento/PDF e desfizeram a validação local por rollback. O fluxo Auth real adicional confirmou importação técnica→interface→aprovação humana de fixture local→sete campos/2000 emojis→autosave→banco e edição posterior humana sem reaprovação automática. Nenhuma fixture foi enviada à produção.
