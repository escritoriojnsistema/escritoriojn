# Revisão independente

Revisão somente leitura do diff contra main5558136, com reproduções Chromium separadas do runner de regressões. Nenhum arquivo foi alterado pelo revisor.

Achados corrigidos e novamente reproduzidos:
- Cliente que aceita convite legítimo não deve terminar bloqueado no painel de equipe. Seleção explícita somente após aceite oficial e nova verificação.
- Quota em localStorage não pode perder a escolha no reload. Fallback sessionStorage com revisão mais recente também supera marcador local antigo que não pôde ser atualizado.
- Resposta atrasada de aceite da sessãoA não pode mudar área nem URL da sessãoB. `expectedScope` e retorno boolean impedem efeitos tardios.

Revisor confirmou os três cenários após as correções. Não encontrou ampliação de permissões, combinação entre escritórios ou bypass de API/RLS. A preferência de portal não concede autoridade.
