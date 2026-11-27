import { CustomersError } from '../customers/api';
import { useEffect, useRef, useState, type FormEvent } from 'react';
import type {
  PortalIdentityCommand,
  PortalIdentityState,
} from '../../../shared/portalIdentity';
import type {
  RelationCandidate,
  Representation,
} from '../../../shared/customerRelations';
import { RelationCandidates } from '../customer-relations/RelationCandidates';
import { CommercialError } from '../documentCommercial/api';
import { formatCountLabel } from '../rural/ruralListModel';
import { createLinkToken, portalIdentityApi } from './api';
import '../customers/customers.css';
import '../customer-relations/relations.css';
import './portalIdentity.css';

const statuses: Record<string, string> = {
  pending: 'Aguardando confirmação',
  consumed: 'Confirmado',
  expired: 'Expirado',
  revoked: 'Revogado',
  unavailable: 'Vínculo indisponível',
  authorized: 'Autorizado',
  recebido: 'Recebido',
  em_analise: 'Em análise',
  aguardando_cliente: 'Aguardando cliente',
  concluido: 'Concluído',
  cancelado: 'Cancelado',
};

const date = (s: string) =>
  new Date(s).toLocaleString('pt-BR', {
    dateStyle: 'short',
    timeStyle: 'short',
  });

export function PortalIdentityPanel({
  office,
  customerId = null,
  representations = [],
  mode = 'identity',
  onPendingChange,
  onFatal,
}: {
  office: string;
  customerId?: string | null;
  representations?: Representation[];
  mode?: 'identity' | 'representations';
  onPendingChange: (busy: boolean) => void;
  onFatal: (status: number) => void;
}) {
  const [data, setData] = useState<PortalIdentityState>();
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const [busy, setBusy] = useState(false);
  const [blocked, setBlocked] = useState(false);
  const [candidate, setCandidate] = useState<RelationCandidate>();
  const [evidence, setEvidence] = useState('');
  const [token, setToken] = useState('');
  const [revealed, setRevealed] = useState('');
  const [relation, setRelation] = useState('');
  const [request, setRequest] = useState('');
  const [until, setUntil] = useState('');
  const [revision, setRevision] = useState(0);

  const pending = useRef<AbortController | null>(null);
  const flight = useRef(false);
  const attempt = useRef<{ command: PortalIdentityCommand; key: string } | null>(
    null,
  );
  const staff = customerId !== null;

  useEffect(() => {
    onPendingChange(busy || attempt.current !== null);
    return () => onPendingChange(false);
  }, [busy, error, onPendingChange]);

  useEffect(
    () => () => {
      pending.current?.abort();
      attempt.current = null;
    },
    [],
  );

  function failed(cause: unknown) {
    const status =
      cause instanceof CommercialError || cause instanceof CustomersError
        ? cause.status
        : 503;
    if (status === 401 || status === 403) {
      setBlocked(true);
      setData(undefined);
      setToken('');
      setRevealed('');
      setEvidence('');
      attempt.current = null;
      onFatal(status);
    }
    if (status !== 503) attempt.current = null;
    setError(
      status === 409
        ? 'O cadastro ou vínculo mudou. Reabra a área e confira as duplicidades.'
        : status === 422
          ? 'Código inválido, expirado ou já utilizado, ou dados incompatíveis.'
          : status === 503
            ? 'Resultado não confirmado. Confira o vínculo ou repita a mesma tentativa.'
            : 'Acesso indisponível.',
    );
  }

  useEffect(() => {
    const c = new AbortController();
    portalIdentityApi
      .state(office, customerId, c.signal)
      .then(v => {
        if (!c.signal.aborted) setData(v);
      })
      .catch(e => {
        if (!c.signal.aborted) failed(e);
      });
    return () => c.abort();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [office, customerId, revision]);

  async function run(command: PortalIdentityCommand) {
    if (flight.current || blocked) return;
    const c = new AbortController();
    pending.current = c;
    flight.current = true;
    setBusy(true);
    setError('');
    setMessage('');
    attempt.current ??= { command, key: crypto.randomUUID() };
    const current = attempt.current;
    try {
      await portalIdentityApi.command(
        office,
        customerId,
        current.command,
        current.key,
        c.signal,
      );
      if (c.signal.aborted) return;
      if (current.command.kind === 'issue') setRevealed(current.command.token);
      attempt.current = null;
      setToken('');
      setEvidence('');
      setCandidate(undefined);
      setMessage(
        current.command.kind === 'accept'
          ? 'Vínculo confirmado. Consulte sua identidade abaixo.'
          : 'Autorização registrada.',
      );
      setRevision(n => n + 1);
    } catch (e) {
      if (!c.signal.aborted) failed(e);
    } finally {
      flight.current = false;
      if (!c.signal.aborted) setBusy(false);
    }
  }

  function submit(e: FormEvent) {
    e.preventDefault();
    if (attempt.current) return void run(attempt.current.command);
    if (!staff) return void run({ kind: 'accept', token: token.trim().toLowerCase() });
    if (mode === 'identity' && candidate && data?.customer_version) {
      return void run({
        kind: 'issue',
        membership_id: candidate.id,
        expected_version: data.customer_version,
        token: createLinkToken(),
        evidence: evidence.trim(),
      });
    }
    if (mode === 'representations' && until && Number.isFinite(Date.parse(until))) {
      void run({
        kind: 'represent',
        relation_id: relation,
        request_id: request,
        valid_until: new Date(until).toISOString(),
        evidence: evidence.trim(),
      });
    }
  }

  const locked = busy || attempt.current !== null;

  useEffect(() => {
    if (!locked) return;
    const before = (e: BeforeUnloadEvent) => {
      e.preventDefault();
      e.returnValue = '';
    };
    const guard = (e: MouseEvent) => {
      if ((e.target as Element)?.closest('a')) {
        e.preventDefault();
        e.stopImmediatePropagation();
      }
    };
    window.addEventListener('beforeunload', before);
    document.addEventListener('click', guard, true);
    return () => {
      window.removeEventListener('beforeunload', before);
      document.removeEventListener('click', guard, true);
    };
  }, [locked]);

  const rows =
    staff && mode === 'identity'
      ? (data?.invitations ?? [])
      : (data?.representations ?? []);

  return (
    <section
      className="portal-identity"
      aria-label={staff ? 'Autorizações do portal' : 'Meu vínculo no portal'}
    >
      <h3>
        {staff
          ? mode === 'identity'
            ? 'Convite seguro do portal'
            : 'Acesso do representante'
          : 'Meu vínculo no portal'}
      </h3>

      {error && (
        <p role="alert" className="form-feedback error">
          {error}
        </p>
      )}
      {message && (
        <p role="status" className="form-feedback">
          {message}
        </p>
      )}

      {!blocked && data && (
        <>
          {!staff && (
            <p className="customer-note">
              {data.identity
                ? `Identidade conferida: ${data.identity.name} · ${date(data.identity.verified_at)}`
                : 'Seu vínculo ainda não foi conferido. Nome ou CPF informado não libera documentos anteriores.'}
            </p>
          )}
          <p className="customer-note">
            {staff
              ? mode === 'identity'
                ? 'Confira a pessoa e entregue o código somente ao contato confirmado da conta selecionada. Código de uso único, válido por 24 horas.'
                : 'Autoriza somente o andamento público de um atendimento, por até 30 dias. Documentos, anexos e financeiro exigem autorização própria.'
              : 'Use o código recebido do escritório. Recuperar a senha não altera sua pessoa vinculada.'}
          </p>

          {staff && mode === 'identity' && !revealed && (
            <RelationCandidates
              office={office}
              kind="client"
              exclude=""
              disabled={locked}
              onSelect={setCandidate}
              onError={failed}
            />
          )}

          {!revealed && (
            <form onSubmit={submit} className="portal-identity-form">
              <fieldset disabled={locked}>
                {!staff ? (
                  <label className="team-field">
                    Código do vínculo
                    <input
                      required
                      autoComplete="off"
                      maxLength={64}
                      minLength={64}
                      pattern="[a-fA-F0-9]{64}"
                      value={token}
                      onChange={e => setToken(e.target.value)}
                    />
                  </label>
                ) : (
                  <>
                    {mode === 'representations' && (
                      <>
                        <label className="team-field">
                          Representação conferida
                          <select
                            required
                            value={relation}
                            onChange={e => setRelation(e.target.value)}
                          >
                            <option value="">Selecione</option>
                            {representations
                              .filter(r => r.status === 'active')
                              .map(r => (
                                <option key={r.id} value={r.id}>
                                  {r.name}
                                </option>
                              ))}
                          </select>
                        </label>
                        <label className="team-field">
                          Atendimento autorizado
                          <select
                            required
                            value={request}
                            onChange={e => setRequest(e.target.value)}
                          >
                            <option value="">Selecione</option>
                            {data.requests.map(r => (
                              <option key={r.id} value={r.id}>
                                {r.protocol}
                              </option>
                            ))}
                          </select>
                        </label>
                        <label className="team-field">
                          Válido até
                          <input
                            required
                            type="datetime-local"
                            value={until}
                            onChange={e => setUntil(e.target.value)}
                          />
                        </label>
                      </>
                    )}
                    <label className="team-field">
                      Referência da conferência
                      <input
                        required
                        maxLength={500}
                        value={evidence}
                        onChange={e => setEvidence(e.target.value)}
                      />
                    </label>
                    <p className="customer-note">
                      Referência interna, sem CPF, contato ou relato pessoal.
                    </p>
                  </>
                )}
              </fieldset>
              <button
                type="submit"
                className="customers-primary-btn relation-primary-btn"
                disabled={
                  busy ||
                  (!attempt.current &&
                    staff &&
                    mode === 'identity' &&
                    !candidate)
                }
              >
                {attempt.current
                  ? 'Repetir a mesma tentativa'
                  : staff
                    ? mode === 'identity'
                      ? 'Gerar convite'
                      : 'Autorizar andamento'
                    : 'Confirmar vínculo'}
              </button>
            </form>
          )}

          {revealed && (
            <div className="portal-token">
              <label className="team-field">
                Código para entrega ao contato confirmado
                <textarea readOnly rows={2} value={revealed} />
              </label>
              <button
                type="button"
                className="relation-back-btn"
                disabled={locked}
                onClick={() => setRevealed('')}
              >
                Ocultar código
              </button>
              <p className="customer-note">
                O código não ficará disponível após sair desta área. Nenhum
                e-mail foi enviado automaticamente.
              </p>
            </div>
          )}

          {rows.length > 0 && (
            <div className="relation-list-frame">
              <ul className="relation-list">
                {rows.map(row => (
                  <li key={row.id}>
                    <div>
                      <strong>
                        {'protocol' in row ? row.protocol : 'Convite de vínculo'}
                      </strong>
                      <small>
                        {statuses[row.status] ?? row.status} · até{' '}
                        {date(
                          'expires_at' in row ? row.expires_at : row.valid_until,
                        )}
                      </small>
                      {'scope' in row && (
                        <small>Escopo: andamento público</small>
                      )}
                    </div>
                    {staff &&
                      ['pending', 'authorized', 'unavailable', 'expired'].includes(
                        row.status,
                      ) && (
                        <button
                          type="button"
                          className="relation-row-revoke-btn"
                          disabled={locked}
                          onClick={() =>
                            void run({
                              kind:
                                'expires_at' in row
                                  ? 'revoke_invite'
                                  : 'revoke_representation',
                              id: row.id,
                            })
                          }
                        >
                          Revogar
                        </button>
                      )}
                  </li>
                ))}
              </ul>
              <div className="relation-list-footer">
                <span>
                  {formatCountLabel(
                    rows.length,
                    staff && mode === 'identity' ? 'convite' : 'autorização',
                    staff && mode === 'identity' ? 'convites' : 'autorizações',
                  )}
                </span>
              </div>
            </div>
          )}
        </>
      )}

      {!data && !blocked && (
        <button
          type="button"
          className="relation-back-btn"
          disabled={busy}
          onClick={() => {
            setError('');
            setRevision(n => n + 1);
          }}
        >
          Consultar vínculo
        </button>
      )}
    </section>
  );
}
