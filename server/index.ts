import { app } from './app.js';
import { drainBackgroundTasks } from './background.js';

const port = Number(process.env.PORT ?? 3001);
const host = process.env.HOST ?? '127.0.0.1';
const server = app.listen(port, host, () => console.info(`API disponível em http://${host}:${port}/api/health`));
server.on('error', (error: NodeJS.ErrnoException) => {
  console.error(`Não foi possível iniciar a API (${error.code ?? 'UNKNOWN'}). Verifique HOST/PORT e se a porta está livre.`);
  process.exitCode = 1;
});
// Stop accepting requests, then let committed invitations finish their bounded
// transport before the local Express process exits. Vercel uses waitUntil instead.
let closing=false;
function shutdown() {
  if(closing)return;
  closing=true;
  server.close(()=>{void drainBackgroundTasks().then(()=>{process.exitCode??=0;});});
}
process.once('SIGTERM',shutdown);
process.once('SIGINT',shutdown);
