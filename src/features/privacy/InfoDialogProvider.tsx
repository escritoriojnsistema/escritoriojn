import { useEffect, useRef, useState, type ReactNode } from 'react';
import { X } from 'lucide-react';
import { useLocation } from 'react-router-dom';
import { Brand } from '../../ui/Brand';
import { AppInfo } from '../pwa/AppInfo';
import InstallPage from '../pwa/InstallPage';
import { CopyrightPage } from './CopyrightPage';
import { InfoContext, infoTitles, type InfoSection } from './InfoTrigger';
import PrivacyPage from './PrivacyPage';

export function InfoDialogProvider({ children }: { children: ReactNode }) {
  const [info, setInfo] = useState<{ section: InfoSection; locationKey: string }>();
  const { key } = useLocation();
  const section = info?.locationKey === key ? info.section : undefined;
  const dialog = useRef<HTMLDialogElement>(null);

  useEffect(() => {
    const element = dialog.current;
    if (!element) return;
    if (section && !element.open) element.showModal();
    else if (!section && element.open) element.close();
  }, [section]);

  return (
    <InfoContext.Provider value={next => setInfo({ section: next, locationKey: key })}>
      {children}
      <dialog
        ref={dialog}
        className="quick-info-dialog"
        aria-label={section ? infoTitles[section] : undefined}
        onClose={() => setInfo(undefined)}
        onClick={event => {
          if (event.target !== event.currentTarget) return;
          const bounds = event.currentTarget.getBoundingClientRect();
          if (
            event.clientX < bounds.left ||
            event.clientX > bounds.right ||
            event.clientY < bounds.top ||
            event.clientY > bounds.bottom
          ) {
            dialog.current?.close();
          }
        }}
      >
        {section && (
          <div className="quick-info-shell">
            <div className="quick-info-actions">
              <Brand light emblem="scale" decorative />
              <button
                type="button"
                className="quick-info-close"
                autoFocus
                onClick={() => dialog.current?.close()}
              >
                <X size={16} aria-hidden="true" />
                <span>Fechar</span>
              </button>
            </div>
            <div className="quick-info-body">
              {section === 'install' ? (
                <InstallPage embedded />
              ) : section === 'copyright' ? (
                <CopyrightPage />
              ) : section === 'app' ? (
                <AppInfo />
              ) : (
                <PrivacyPage section={section} embedded />
              )}
            </div>
          </div>
        )}
      </dialog>
    </InfoContext.Provider>
  );
}
