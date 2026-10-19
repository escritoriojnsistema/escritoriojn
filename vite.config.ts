import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import { defineConfig, loadEnv, type Plugin } from 'vite';
import express from 'express';
import { resolve } from 'node:path';
import { app } from './server/app.ts';
import { drainBackgroundTasks } from './server/background.ts';

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
    // Vite awaits these hooks before dev restart/shutdown or preview shutdown.
    closeServer() { return drainBackgroundTasks(); },
    closePreviewServer() { return drainBackgroundTasks(); },
  };
}
export default defineConfig(({ mode }) => {
  const local = loadEnv(mode, process.cwd(), 'VITE_SUPABASE_');
  for (const key of ['VITE_SUPABASE_URL', 'VITE_SUPABASE_PUBLISHABLE_KEY']) {
    if (!process.env[key] && local[key]) process.env[key] = local[key];
  }
  return {
    plugins: [localApi(), react(), tailwindcss()],
    // Static imports keep navigation immediate. Split the provider SDK for
    // independent browser caching, loaded with the entry (never on route click).
    build: { rolldownOptions: { output: { codeSplitting: { groups: [
      { name: 'supabase', test: /node_modules\/@supabase\// },
    ] } } } },
  };
});
