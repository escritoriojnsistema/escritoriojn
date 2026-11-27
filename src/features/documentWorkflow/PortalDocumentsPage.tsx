import { useState } from 'react';
import { Navigate } from 'react-router-dom';
import { useAuth } from '../auth/AuthProvider';
import { OperationHeading, OperationLayout } from '../operation/OperationLayout';
import { OperationalFeedback } from '../operation/OperationalAccess';
import { paths } from '../../app/routes';
import { PortalLibrary } from '../portalDocuments/PortalLibrary';
import '../team/team.css';
import '../customers/customers.css';
import '../documents/documents.css';

export default function PortalDocumentsPage({
  embedded = false,
  fixedOffice,
  onPendingChange,
}: {
  embedded?: boolean;
  fixedOffice?: string;
  onPendingChange?: (v: boolean) => void;
} = {}) {
  const auth = useAuth();
  const [selected, setSelected] = useState('');
  const [busy, setBusy] = useState(false);

  const contexts = auth.contexts.filter(c => c.role_code === 'client');
  const context =
    contexts.find(c => c.office_id === (fixedOffice ?? selected)) ??
    (!fixedOffice ? contexts[0] : undefined);

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

  const officeSelector =
    !fixedOffice && contexts.length > 1 ? (
      <label className="documents-office-select" htmlFor="portal-documents-office">
        <span>Escritório</span>
        <select
          id="portal-documents-office"
          value={context.office_id}
          disabled={busy}
          onChange={e => setSelected(e.target.value)}
        >
          {contexts.map(c => (
            <option key={c.office_id} value={c.office_id}>
              {c.office_name}
            </option>
          ))}
        </select>
      </label>
    ) : undefined;

  const content = (
    <div className={`documents-main${embedded ? ' is-embedded' : ' is-viewport-screen'}`}>
      {!embedded && (
        <OperationHeading
          context={context}
          showRole={false}
          title="Meus documentos"
          description="Seu acervo autorizado e contratos compartilhados por versão."
          action={officeSelector}
        />
      )}
      <PortalLibrary
        key={auth.sessionKey + context.office_id + context.permissions.join(',')}
        context={context}
        onPendingChange={onPendingChange ?? setBusy}
      />
    </div>
  );

  return embedded ? (
    content
  ) : (
    <OperationLayout client busy={busy} viewportLock>
      {content}
    </OperationLayout>
  );
}
