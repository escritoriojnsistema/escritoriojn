import { useState } from 'react';
import { 
  Zap, 
  Code2, 
  Layers, 
  ShieldCheck, 
  CheckCircle2, 
  Plus, 
  RotateCcw,
  Sparkles
} from 'lucide-react';
import { BaseCard } from './components/BaseCard';
import { getProjectInfo, formatStackList } from './utils/base';

export default function App() {
  const [count, setCount] = useState<number>(0);
  const projectInfo = getProjectInfo();

  const handleIncrement = () => setCount((prev) => prev + 1);
  const handleReset = () => setCount(0);

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 flex flex-col justify-between selection:bg-indigo-600 selection:text-white">
      {/* Barra de Navegação / Topo */}
      <header className="border-b border-slate-800/80 bg-slate-950/70 backdrop-blur sticky top-0 z-10">
        <div className="max-w-5xl mx-auto px-4 sm:px-6 h-16 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-lg bg-indigo-600 flex items-center justify-center text-white font-bold shadow-md shadow-indigo-600/30">
              <Code2 className="w-5 h-5" aria-hidden="true" />
            </div>
            <div>
              <span className="font-semibold text-white tracking-tight">React + Vite</span>
              <span className="ml-2 text-xs text-indigo-400 font-mono bg-indigo-950/80 border border-indigo-800/60 px-2 py-0.5 rounded-full">
                v{projectInfo.version}
              </span>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <span className="flex h-2 w-2 relative">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
              <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500"></span>
            </span>
            <span className="text-xs text-emerald-400 font-medium">Ambiente Pronto</span>
          </div>
        </div>
      </header>

      {/* Conteúdo Principal */}
      <main className="flex-1 max-w-5xl mx-auto px-4 sm:px-6 py-12 flex flex-col justify-center w-full">
        <section className="text-center space-y-4 max-w-2xl mx-auto mb-12">
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full text-xs font-medium bg-indigo-950/60 text-indigo-300 border border-indigo-800/60">
            <Sparkles className="w-3.5 h-3.5 text-indigo-400" aria-hidden="true" />
            <span>Estrutura Base Inicial</span>
          </div>

          <h1 className="text-3xl sm:text-4xl md:text-5xl font-extrabold tracking-tight text-white">
            Base Principal <span className="text-transparent bg-clip-text bg-gradient-to-r from-indigo-400 to-sky-400">React + Vite</span>
          </h1>

          <p className="text-slate-400 text-base sm:text-lg leading-relaxed">
            Estrutura central limpa, moderna e configurada com TypeScript e Tailwind CSS. Pronta para receber suas regras de negócio e componentes.
          </p>

          <p className="text-xs text-slate-500 font-mono pt-1">
            {formatStackList(projectInfo.stack)}
          </p>
        </section>

        {/* Pilares da Base */}
        <section aria-label="Pilares da Arquitetura" className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-10">
          <BaseCard 
            icon={Zap}
            title="Vite 8"
            description="Ambiente de desenvolvimento ultrarrápido com bundling nativo e tempos de carregamento instantâneos."
            badge="Build"
          />
          <BaseCard 
            icon={Code2}
            title="React 19"
            description="Última versão do React com hooks otimizados, concorrência e tipagem moderna."
            badge="UI"
          />
          <BaseCard 
            icon={ShieldCheck}
            title="TypeScript"
            description="Modo estrito ativo para segurança de tipos, contratos sólidos e prevenção de falhas em tempo de compilação."
            badge="Types"
          />
          <BaseCard 
            icon={Layers}
            title="Tailwind CSS"
            description="Estilização utilitária de alta performance com temas responsivos e design consistente."
            badge="Style"
          />
        </section>

        {/* Teste de Reatividade da Base */}
        <section aria-label="Validação de Reatividade" className="bg-slate-900/40 border border-slate-800 rounded-xl p-6 max-w-md mx-auto w-full text-center">
          <div className="flex items-center justify-center gap-2 text-slate-300 text-sm font-medium mb-3">
            <CheckCircle2 className="w-4 h-4 text-emerald-400" aria-hidden="true" />
            <span>Teste de Reatividade Local</span>
          </div>
          
          <div className="my-4">
            <span className="text-4xl font-extrabold text-white tracking-tight" data-testid="counter-value">
              {count}
            </span>
            <span className="block text-xs text-slate-500 mt-1">Interações registradas</span>
          </div>

          <div className="flex items-center justify-center gap-3">
            <button
              type="button"
              onClick={handleIncrement}
              className="inline-flex items-center gap-2 px-4 py-2 bg-indigo-600 hover:bg-indigo-500 text-white rounded-lg text-sm font-medium transition shadow-md shadow-indigo-600/20 active:scale-95 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:ring-offset-2 focus:ring-offset-slate-900 cursor-pointer"
            >
              <Plus className="w-4 h-4" aria-hidden="true" />
              <span>Incrementar</span>
            </button>

            <button
              type="button"
              onClick={handleReset}
              disabled={count === 0}
              aria-label="Reiniciar contador"
              className="inline-flex items-center gap-2 px-4 py-2 bg-slate-800 hover:bg-slate-700 disabled:opacity-40 disabled:cursor-not-allowed text-slate-300 rounded-lg text-sm font-medium transition active:scale-95 focus:outline-none focus:ring-2 focus:ring-slate-600 focus:ring-offset-2 focus:ring-offset-slate-900 cursor-pointer"
            >
              <RotateCcw className="w-4 h-4" aria-hidden="true" />
              <span>Zerar</span>
            </button>
          </div>
        </section>
      </main>

      {/* Rodapé */}
      <footer className="border-t border-slate-800/80 py-6 text-center text-xs text-slate-500">
        <div className="max-w-5xl mx-auto px-4">
          Base pronta para desenvolvimento • Sem bibliotecas desnecessárias ou dados simulados
        </div>
      </footer>
    </div>
  );
}
