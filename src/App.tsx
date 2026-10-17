import { ArrowDown, BriefcaseBusiness, Files, Landmark, UsersRound } from 'lucide-react';
import { BaseCard } from './components/BaseCard';
import { ApiStatus } from './features/home/ApiStatus';

export default function App() {
  return (
    <div className="app">
      <a className="skip-link" href="#conteudo">Ir para o conteúdo</a>
      <header className="site-header">
        <a className="brand" href="/" aria-label="Escritório JN — início">
          <span className="brand-mark" aria-hidden="true">JN<span /></span>
          <span className="brand-name">ESCRITÓRIO <strong>JN</strong><small>Organização para o dia a dia</small></span>
        </a>
        <span className="stage-tag">Etapa 01 <span>·</span> Base inicial</span>
      </header>
      <main id="conteudo">
        <section className="hero" aria-labelledby="welcome-title">
          <div className="hero-copy">
            <p className="eyebrow"><span className="gold-line" /> Um novo começo</p>
            <h1 id="welcome-title">Seu escritório,<br /><em>bem organizado.</em></h1>
            <p className="hero-description">Um só lugar para cuidar dos atendimentos, documentos e da rotina do Escritório JN.</p>
            <a className="outline-link" href="#construcao">Conheça a base do projeto <ArrowDown size={16} aria-hidden="true" /></a>
          </div>
          <ApiStatus />
        </section>
        <section className="foundation" id="construcao" aria-labelledby="foundation-title">
          <div className="section-heading">
            <div><p className="eyebrow">Construindo passo a passo</p><h2 id="foundation-title">Uma base para toda a sua rotina.</h2></div>
            <p>Os módulos serão disponibilizados nas próximas etapas.</p>
          </div>
          <div className="module-grid">
            <BaseCard icon={UsersRound} title="Clientes" description="Cadastros, contatos e vínculos em um lugar." />
            <BaseCard icon={BriefcaseBusiness} title="Atendimentos" description="Serviços, pedidos e acompanhamento da equipe." />
            <BaseCard icon={Files} title="Documentos" description="Modelos, aprovações e entregas com histórico." />
            <BaseCard icon={Landmark} title="Financeiro" description="Cobranças, recebimentos e controle de caixa." />
          </div>
          <p className="stage-note">Esta é a base inicial do sistema. O acesso com sua conta será disponibilizado na etapa 04.</p>
        </section>
      </main>
      <footer className="site-footer"><span>© Escritório JN</span><span>Construído com cuidado. Uma etapa de cada vez.</span><span className="footer-version">Base 0.1.0</span></footer>
    </div>
  );
}
