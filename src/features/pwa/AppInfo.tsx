import { Smartphone } from 'lucide-react';
import { InfoTrigger } from '../privacy/InfoTrigger';
import { useInstallPrompt } from './useInstallPrompt';
import { appVersion } from './version';

const formatDate = (value: string) =>
  new Intl.DateTimeFormat('pt-BR', { dateStyle: 'medium' }).format(new Date(value));

export function AppInfo() {
  const { installed, standalone, record } = useInstallPrompt();
  return (
    <section className="privacy-page copyright-page">
      <header className="privacy-doc-header">
        <div className="privacy-doc-title-row">
          <span className="privacy-doc-icon" aria-hidden="true">
            <Smartphone size={20} strokeWidth={1.9} />
          </span>
          <div>
            <p className="eyebrow">Escritório JN</p>
            <h2>App</h2>
          </div>
        </div>
      </header>
      <div className="privacy-section copyright-card">
        <dl className="controller-dl">
          <div>
            <dt>Instalação neste dispositivo</dt>
            <dd>{installed ? 'Confirmada' : 'Ainda não confirmada neste navegador'}</dd>
          </div>
          <div>
            <dt>
              {standalone
                ? 'Versão em uso'
                : installed && record?.version
                  ? 'Última versão registrada no app'
                  : 'Versão disponível'}
            </dt>
            <dd>
              {standalone || !installed
                ? appVersion
                : (record?.version ?? 'Abra pelo ícone do aplicativo para consultar')}
            </dd>
          </div>
          {installed && (
            <div>
              <dt>Data de instalação</dt>
              <dd>
                {record?.installedAt
                  ? formatDate(record.installedAt)
                  : 'Data indisponível neste navegador'}
              </dd>
            </div>
          )}
          {installed && !record?.installedAt && record?.firstOpenedAt && (
            <div>
              <dt>Primeira abertura registrada</dt>
              <dd>{formatDate(record.firstOpenedAt)}</dd>
            </div>
          )}
        </dl>
        {!installed && <InfoTrigger section="install" className="secondary-button" />}
      </div>
    </section>
  );
}
