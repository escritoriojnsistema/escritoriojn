import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import { defineConfig, loadEnv, type Plugin } from 'vite';
import express from 'express';
import { resolve } from 'node:path';
import {createHash} from 'node:crypto';
import {readFileSync,writeFileSync,readdirSync} from 'node:fs';
import { app } from './server/app.ts';
import { drainBackgroundTasks } from './server/background.ts';

function pwaVersion():Plugin {
  let directory='';
  return {name:'jn-public-pwa-version',apply:'build',configResolved(config){directory=resolve(config.root,config.build.outDir);},closeBundle(){
    const hash=createHash('sha256');
    function collect(path:string){for(const entry of readdirSync(path,{withFileTypes:true}).sort((a,b)=>a.name.localeCompare(b.name))){const file=resolve(path,entry.name);if(entry.isDirectory())collect(file);else hash.update(entry.name).update(readFileSync(file));}}
    collect(directory);
    const worker=resolve(directory,'sw.js');
    writeFileSync(worker,readFileSync(worker,'utf8').replace('__BUILD_VERSION__',hash.digest('hex').slice(0,20)));
  }};
}

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
    plugins: [localApi(), react(), tailwindcss(), pwaVersion()],
    // Shared runtime remains stable. The access form warms the small panel
    // router; business screens are fetched only when their route is opened.
    build: { rolldownOptions: { output: { codeSplitting: { groups: [
      { name: 'supabase', test: /node_modules\/@supabase\// },
      { name: 'react', test: /node_modules\/(react|react-dom|react-router|react-router-dom|scheduler)\// },
      { name: 'icons', test: /node_modules\/lucide-react\// },
    ] } } } },
  };
});
