import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import { defineConfig, type Plugin } from 'vite';
import { app } from './server/app.ts';

function localApi(): Plugin {
  return {
    name: 'escritorio-jn-api',
    configureServer(server) { server.middlewares.use(app); },
    configurePreviewServer(server) { server.middlewares.use(app); },
  };
}
export default defineConfig({ plugins: [localApi(), react(), tailwindcss()] });
