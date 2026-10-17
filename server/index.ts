import { app } from './app.js';

const port = Number(process.env.PORT ?? 3001);
const host = process.env.HOST ?? '127.0.0.1';
const server = app.listen(port, host, () => console.info(`API disponível em http://${host}:${port}/api/health`));
server.on('error', (error: NodeJS.ErrnoException) => {
  console.error(`Não foi possível iniciar a API (${error.code ?? 'UNKNOWN'}). Verifique HOST/PORT e se a porta está livre.`);
  process.exitCode = 1;
});
