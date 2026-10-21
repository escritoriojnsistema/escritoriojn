# Ajustes pós12 — publicados e verificados

Publicado em https://escritoriojn.vercel.app pela integração GitHub→Vercel, sem GitHub Actions. [PR27](https://github.com/escritoriojnsistema/escritoriojn/pull/27), feature37f5f1e2026992ffe8be436d5f95102cae340f8b, merge9728e198c45a427c1f0a3d85ec0ce7b0e9b82ee3; árvore45ac4b6824e1310970efb1059b915f3212609571 igual à validada. Vercel produção7FTJvzdbydm49HwFRQxmZPGh2Sxc SUCCESS.

## Entrega

- Áreas privadas usam a largura de Equipe e convites. Busca/filtro/botão alinhados em Pendências e Notificações; telas públicas conservam composição própria e centralização responsiva.
- Sino superior por conta/escritório no desktop e mobile para equipe e cliente. Quatro atalhos móveis preservados; demais destinos no menu. Sem loaders nas transições e ações.
- Seleção de responsáveis mostra nome, função e elegibilidade. Contas sem acesso exibem impedimento e entrada para gestão explícita de permissões; nenhuma conta real recebeu concessão automática.
- Criador e responsáveis anteriores acompanham; responsável atual atende. Retomada para si exige owner/admin com requests.reclaim, motivo, versão e revalidação após locks. Ex-responsável não altera pedido, checklist, anexos, Storage ou limpeza.
- Cliente recebe cada troca com nome/protocolo/data e consulta o nome atual no pedido. Só usa a conta já vinculada ao pedido; sem vínculo, manter interno. Sem função, nota, motivo, ficha ou preço interno no aviso.

## Verificação

101 testes Node/API, 13 execuções Node direcionadas finais, 1.356 verificações PostgreSQL (678×2), 66 contratos UI distintos, 14 Auth/Storage reais distintos e 55 E2E públicos locais +55 no domínio publicado aprovados. Build/typecheck e audit de dependências de produção sem vulnerabilidades. Testes autenticados ocorreram no laboratório descartável GoTrue/PostgREST/Storage/Edge; nenhuma conta hospedada foi usada para login ou teste.

O fluxo real provou delegação, retomada, acompanhamento, bloqueio de upload já iniciado, dois avisos do cliente e abertura do pedido correto. O envio móvel teve503transitório no conjunto e passou isoladamente. Dois timeouts de módulos do Vite durante build concorrente também passaram isoladamente; as baterias finais foram separadas. Startup local do Storage teve timeout recuperado; limite de inicialização do laboratório foi ajustado, sem alterar timeout do produto.

80 combinações área×viewport verificadas:11áreas da equipe e5do cliente em320/360/768/1440/1920. Capturas fictícias antes/depois e regressões de zoom, altura curta, quatro atalhos, sessão/autoridade e rascunho estão nas evidências. Conteúdo extenso/zoom mantém rolagem natural.

Revisão independente semP1/P2 pendentes. O sino na própria caixa ignorava uma nova seleção de escritório; corrigido com navegação por location.key e destino autorizado, com RED→GREEN. [Parecer](../evidencias/ajuste-pos12/revisao.md).

## Supabase e produção

Migração20261021124414_request_followup_client_notifications aplicada automaticamente pela integração Git, sem apply manual.44comandos e27corpos ativos correspondem ao arquivo validado, SHA256fb3f9c21877dac38be6f9b6916b174e948f9c6da79f8066f44c730f973a83c21. Três novas RPCs públicas invoker/search_path vazio, somenteauthenticated; zero EXECUTE anônimo nas27funções. RLS e ACL da caixa preservadas, sem acesso bruto.

16migrations,36permissões/39relações de papel. requests.reclaim seed somenteowner; zero concessões individuais dessa capacidade.5Auth/5vínculos/1ficha preservados;0pedidos/0arquivos/0avisos hospedados no readback. Edge Functions existentes ativas com JWT obrigatório; não houve alteração de código Edge. API, guards de banco e integrações10–12 reutilizados.

Bundle público /assets/index-BIM4zjrY.js idêntico ao build local, SHA2565b390d8728b11ce267f7d15e2fbba5bdd849e398d3ca9c5e098d5a20fad2b786; HTML/health200 e endpoints privados anônimos401. [Prova](../evidencias/ajuste-pos12/publicacao.json).

Advisors semERROR:30INFO de RLS privada sem policy/sem GRANT,1WARN preexistente de proteção de senha vazada,3FKs sem índice preexistentes e68índices sem uso INFO. Não houve configuração automática de serviço pago ou credencial.

## Continuidade

Resumo do sino usa índice, cache curto, foco e atualização30s enquanto visível; não é push/e-mail nem promessa de latência zero da rede. Benchmark local de10milavisos/10conexões/300amostras: p95lista944,589ms, checklist131,510ms e resumo77,265ms; sem SLA hospedado. [Medições](../evidencias/ajuste-pos12/benchmark.json).

Rollback somente de código compatível com o catálogo e os guards pós12; preservar atribuições, histórico, avisos e dados. Não executar DROP/reset nem conceder permissões a contas para teste. Próxima etapa somente por novo pedido. Retomar por AGENTS, Livro e [contrato](ajuste-pos12-layout-distribuicao.md).
