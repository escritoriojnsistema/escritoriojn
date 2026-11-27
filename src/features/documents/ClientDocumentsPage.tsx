import { useState } from 'react';
import { Navigate, useSearchParams } from 'react-router-dom';
import { paths } from '../../app/routes';
import { useAuth } from '../auth/AuthProvider';
import { OperationHeading, OperationLayout } from '../operation/OperationLayout';
import { OperationalFeedback } from '../operation/OperationalAccess';
import DocumentCatalogPage from '../documentCommercial/DocumentCatalogPage';
import PortalDocumentsPage from '../documentWorkflow/PortalDocumentsPage';
import './documents.css';

type Tab = 'models' | 'mine';

/**
 * Client counterpart of Documentos: folders, prices and categories plus the
 * documents already issued to the signed-in account, in a single zero-scroll destination.
 */
export default function ClientDocumentsPage() {
  const auth = useAuth();
  const [selected, setSelected] = useState('');
  const [busy, setBusy] = useState(false);
  const [params, setParams] = useSearchParams();

  const contexts = auth.contexts.filter(context => context.role_code === 'client');
  const context = contexts.find(item => item.office_id === selected) ?? contexts[0];

  if (auth.status === 'loading') return <OperationalFeedback status="loading" />;
  if (auth.status === 'signedOut' || auth.status === 'expired') {
    return <Navigate replace to={paths.client} />;
  }
  if (auth.status !== 'authorized' || !context) {
    return (
      <OperationalFeedback
        status={auth.status === 'unavailable' ? 'unavailable' : 'denied'}
      />
    );
  }

  const tab: Tab = params.get('aba') === 'meus' ? 'mine' : 'models';

  const officeSelector =
    contexts.length > 1 ? (
      <label className="documents-office-select" htmlFor="client-documents-office">
        <span>Escritório</span>
        <select
          id="client-documents-office"
          value={context.office_id}
          disabled={busy}
          onChange={event => setSelected(event.target.value)}
        >
          {contexts.map(item => (
            <option key={item.office_id} value={item.office_id}>
              {item.office_name}
            </option>
          ))}
        </select>
      </label>
    ) : undefined;

  return (
    <OperationLayout client busy={busy} viewportLock>
      <div className="documents-main documents-hub is-viewport-screen">
        <OperationHeading
          context={context}
          showRole={false}
          title="Documentos"
          description="Consulte pastas, modelos, categorias e preços. O conteúdo dos modelos não é exibido."
          action={officeSelector}
        />

        <div
          role="tablist"
          aria-label="Áreas de documentos"
          className="documents-primary-tabs"
        >
          <button
            type="button"
            role="tab"
            aria-selected={tab === 'models'}
            disabled={busy}
            onClick={() => setParams({}, { replace: true })}
          >
            Modelos e preços
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={tab === 'mine'}
            disabled={busy}
            onClick={() => setParams({ aba: 'meus' }, { replace: true })}
          >
            Meus documentos
          </button>
        </div>

        <div className="documents-hub-panel">
          {tab === 'models' ? (
            <DocumentCatalogPage
              key={auth.sessionKey + context.office_id}
              client
              embedded
              fixedOffice={context.office_id}
              onPendingChange={setBusy}
            />
          ) : (
            <PortalDocumentsPage
              key={auth.sessionKey + context.office_id}
              embedded
              fixedOffice={context.office_id}
              onPendingChange={setBusy}
            />
          )}
        </div>
      </div>
    </OperationLayout>
  );
}
