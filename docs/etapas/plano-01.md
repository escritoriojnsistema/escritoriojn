# Etapa 01 — plano de implementação

**Objetivo:** base executável React + Vite + TypeScript e API Express pública mínima, sem dados de negócio.
**Especificação:** `etapa-01.md` e `../ARQUITETURA.md`, extraídas do Drive em 17/10/2026.
**Arquitetura:** navegador → GET `/api/health` → Express → resposta tipada. Nenhum banco necessário para liveness.
**Execução:** nesta sessão, conforme solicitação de implementar a etapa inteira. O manual pede conclusão do escopo sem confirmações rotineiras.

## Restrições e revisão
- Preservar main e todos os recursos existentes. Destinos externos dependem de identificação confirmada.
- Sem credenciais, SDK de IA, tabelas especulativas, login ou estado herdado.
- Verificar API inacessível, resposta HTML inesperada, timeout, repetição e tela estreita.
- Health comprova somente o processo da API, nunca prontidão de Supabase/login/deploy.
- Falta de dependência deve produzir instrução clara; preview local precisa encontrar a API.

## Entregas sequenciais
1. [x] Fixar versões disponíveis/Node e lockfile; criar instruções e registrar fontes/limitações.
2. [x] Escrever teste do health e observar falha na base sem API; implementar contrato em `shared/api.ts`, montagem em `server/app.ts` e integração local em `vite.config.ts`.
3. [x] Testar leitura do health real e falha/repetição no navegador; implementar `src/features/home/`, atualizar `App.tsx`, cartão e estilos navy/claro/dourado.
4. [x] Provar `npm ci`, typecheck, testes e build; verificar HTTP dev/preview e telas 360/768/1440; registrar resultados no Livro e fecho.
5. [x] Revisar diff e preparar commit local. Branch/PR remotos ficam pendentes de confirmar destino; sem merge ou publicação.

## Interfaces
`HealthResponse = { data: { status: 'ok'; service: 'escritorio-jn-api' } }`.
`ApiErrorResponse = { error: { code: string; message: string; request_id: string } }`.
`readHealth(signal?: AbortSignal): Promise<HealthResponse>` usa URL relativa, valida contrato e rejeita HTTP/JSON/timeout inválidos.

## Critérios de aceite
Tela inicial e health respondem sem `.env`; instalação limpa reproduz; build compila frontend/backend; UI reflete a resposta e permite repetir em falha.
Banco: não se aplica à 01; inventário remoto somente leitura. GitHub: branch revisável. Vercel: configuração/publicação da etapa 02 não antecipada.
