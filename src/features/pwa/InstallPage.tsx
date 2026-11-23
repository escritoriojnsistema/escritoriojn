import { useId, useState } from 'react';
import { Download, ShieldCheck, Smartphone } from 'lucide-react';
import { SiteFooter, SiteHeader } from '../../app/SiteLayout';
import {useInstallPrompt} from './useInstallPrompt';
import './pwa.css';

export default function InstallPage({embedded=false}:{embedded?:boolean}){
  const {installed,available,install:requestInstall}=useInstallPrompt();
  const deviceId=useId(),safetyId=useId(),selectId=useId();
  const [error, setError] = useState('');
  const [device, setDevice] = useState(() =>
    /iPhone|iPad|iPod/i.test(navigator.userAgent)
      ? 'ios'
      : /Android/i.test(navigator.userAgent)
        ? 'android'
        : 'desktop',
  );

  async function install() {
    setError('');
    try {
      await requestInstall();
    } catch {
      setError('Use o menu do navegador e siga as instruções abaixo.');
    }
  }

  const Page=embedded?'section':'main';
  const content=(
      <Page id={embedded?undefined:'conteudo'} className="pwa-main">
        <header className="pwa-hero">
          <p className="eyebrow">Escritório JN</p>
          {embedded?<h2>Instalar aplicativo</h2>:<h1>Instalar aplicativo</h1>}
          <p>Acesse pelo ícone na sua tela inicial, com a mesma conta e proteção.</p>
        </header>

        <div className="pwa-sections">
          <section className="pwa-card" aria-labelledby={deviceId}>
            <h2 id={deviceId}>
              <Smartphone size={19} aria-hidden="true" />
              No seu dispositivo
            </h2>
            <div className="pwa-device">
              <label htmlFor={selectId}>Dispositivo</label>
              <select
                id={selectId}
                value={device}
                onChange={event => setDevice(event.target.value)}
              >
                <option value="android">Android · Chrome</option>
                <option value="ios">iPhone · Safari</option>
                <option value="desktop">Computador · Chrome / Edge</option>
              </select>
            </div>

            {installed ? (
              <p role="status" className="form-feedback">
                O aplicativo já está aberto no modo instalado.
              </p>
            ) : (
              available && (
                <button
                  type="button"
                  className="primary-button button button-primary"
                  onClick={() => void install()}
                >
                  <Download size={18} aria-hidden="true" />
                  Instalar neste dispositivo
                </button>
              )
            )}

            {error && (
              <p role="alert" className="form-feedback error">
                {error}
              </p>
            )}

            <div className="pwa-steps">
              {device === 'android' ? (
                <>
                  <h3>Android · Chrome</h3>
                  <p>
                    No menu ⋮, escolha <strong>Instalar aplicativo</strong> ou{' '}
                    <strong>Adicionar à tela inicial</strong> e confirme. Se disponível, você também pode usar o botão
                    de instalação desta página.
                  </p>
                </>
              ) : device === 'ios' ? (
                <>
                  <h3>iPhone · Safari</h3>
                  <p>
                    Abra este endereço no Safari, toque em <strong>Compartilhar</strong> →{' '}
                    <strong>Adicionar à Tela de Início</strong>. Ative <strong>Abrir como App</strong>, se disponível, e
                    confirme em <strong>Adicionar</strong>.
                  </p>
                </>
              ) : (
                <>
                  <h3>Computador</h3>
                  <p>
                    No Chrome ou Edge compatível, use o ícone de instalação na barra de endereço ou a opção de instalar
                    no menu.
                  </p>
                </>
              )}
            </div>

            <p className="pwa-note">Com internet e endereço seguro (HTTPS), instale e depois feche e reabra pelo ícone.</p>
          </section>

          <section className="pwa-card" aria-labelledby={safetyId}>
            <h2 id={safetyId}>
              <ShieldCheck size={19} aria-hidden="true" />
              Conexão e atualizações
            </h2>
            <ul className="pwa-checklist">
              <li>Sem internet, só há orientação pública. Clientes, documentos, relatórios e caixa não ficam disponíveis offline.</li>
              <li>Para atualizar, conclua as operações pendentes, feche todas as abas e janelas e reabra. Não recarregamos operações em andamento.</li>
              <li>A instalação não substitui o login: sair ou trocar de conta exige nova verificação de acesso.</li>
              <li>Arquivos baixados por você permanecem no dispositivo.</li>
            </ul>
          </section>
        </div>
      </Page>
  );
  return embedded?content:<div className="public-site pwa-shell"><SiteHeader/>{content}<SiteFooter/></div>;
}
