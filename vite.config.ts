import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import { defineConfig, type Plugin } from 'vite';
import express from 'express';
import { resolve } from 'node:path';
import { app } from './server/app.ts';

function localApi(): Plugin {
  function localAssets(directory: string) {
    const assets = express();
    assets.disable('x-powered-by');
    assets.use(express.static(directory));
    assets.use((_req, res) => { res.status(404).type('text').send('Arquivo não encontrado.'); });
    return assets;
  }
  return {
    name: 'escritorio-jn-api',
    configureServer(server) {
      server.middlewares.use('/assets', localAssets(resolve(server.config.publicDir, 'assets')));
      server.middlewares.use(app);
    },
    configurePreviewServer(server) {
      server.middlewares.use('/assets', localAssets(resolve(server.config.root, server.config.build.outDir, 'assets')));
      server.middlewares.use(app);
    },
  };
}
export default defineConfig({ plugins: [localApi(), react(), tailwindcss()] });
