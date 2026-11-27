import { PortalIdentityPanel } from '../portal-identity/PortalIdentityPanel';
import { useEffect, useRef, useState, type FormEvent } from 'react';
import { ArrowLeft, ArrowRight } from 'lucide-react';
import { Link } from 'react-router-dom';
import type {
  Assignment,
  CustomerMergePreview,
  CustomerRelationCommand,
  CustomerRelationsState,
  RelationCandidate,
  Representation,
  RepresentationKind,
  VerifiedIdentity,
} from '../../../shared/customerRelations';
import { customersError, CustomersError } from '../customers/api';
import { formatCountLabel } from '../rural/ruralListModel';
import { relationsApi } from './api';
import { RelationCandidates } from './RelationCandidates';
import './relations.css';

type Section =
  | 'overview'
  | 'assignments'
  | 'representations'
  | 'identities'
  | 'merges';

const sections = {
  assignments: 'Acesso operacional',
  representations: 'Representantes',
  identities: 'Identidade',
  merges: 'Duplicidades',
} as const;

const statusNames = {
  active: 'Vigente',
  future: 'Futuro',
  expired: 'Expirado',
  revoked: 'Revogado',
  unavailable: 'Indisponível',
  verified: 'Conferido',
};

const kindNames = {
  proxy: 'Procurador',
  representative: 'Representante',
  guardian: 'Responsável',
};

const conflictNames = {
  same_customer: 'Mesma ficha',
  kind: 'Tipos de pessoa diferentes',
  identifier: 'Identificadores diferentes',
  contacts: 'Mais de quatro contatos',
  identity: 'Identidades incompatíveis',
};

function date(value: string) {
  return new Date(value).toLocaleString('pt-BR', {
    dateStyle: 'short',
    timeStyle: 'short',
  });
}

function localNow() {
  const now = new Date();
  return new Date(now.getTime() - now.getTimezoneOffset() * 60000)
    .toISOString()
    .slice(0, 16);
}

export function RelationsPanel({
  office,
  customerId,
  auditAllowed,
  onExit,
  onFatal,
  onPendingChange,
}: {
  office: string;
  customerId: string;
  auditAllowed: boolean;
  onExit: () => void;
  onFatal: (error: CustomersError) => void;
  onPendingChange: (busy: boolean) => void;
}) {
  const [portalMode, setPortalMode] = useState<'identity' | 'representations'>();
  const [portalBusy, setPortalBusy] = useState(false);
  useEffect(() => {
    onPendingChange(portalBusy);
    return () => onPendingChange(false);
  }, [portalBusy, onPendingChange]);

  const [state, setState] = useState<CustomerRelationsState>();
  const [section, setSection] = useState<Section>('overview');
  const [editing, setEditing] = useState(false);
  const [candidate, setCandidate] = useState<RelationCandidate>();
  const [preview, setPreview] = useState<CustomerMergePreview>();
  const [evidence, setEvidence] = useState('');
  const [kind, setKind] = useState<RepresentationKind>('representative');
  const [from, setFrom] = useState(localNow);
  const [until, setUntil] = useState('');
  const [revoke, setRevoke] = useState<
    Assignment | Representation | VerifiedIdentity
  >();
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const [busy, setBusy] = useState(false);
  const [revision, setRevision] = useState(0);

  const pending = useRef<AbortController | null>(null);
  const active = useRef(true);

  useEffect(() => {
    active.current = true;
    return () => {
      active.current = false;
      pending.current?.abort();
    };
  }, []);

  function failed(cause: unknown) {
    const failure = customersError(cause);
    if (failure.status === 401 || failure.status === 403) {
      pending.current?.abort();
      setState(undefined);
      onFatal(failure);
    } else {
      setError(
        failure.status === 409
          ? 'Conflito de versão ou vínculo existente. Confira os vínculos antes de tentar novamente.'
          : failure.status === 422
            ? 'Confira a pessoa, a referência e as datas informadas.'
            : failure.message,
      );
    }
  }

  useEffect(() => {
    const controller = new AbortController();
    pending.current = controller;
    setBusy(true);
    void relationsApi
      .state({ office_id: office, customer_id: customerId }, controller.signal)
      .then(result => {
        if (!controller.signal.aborted) setState(result);
      })
      .catch(cause => {
        if (!controller.signal.aborted) failed(cause);
      })
      .finally(() => {
        if (pending.current === controller) {
          pending.current = null;
          setBusy(false);
        }
      });
    return () => controller.abort();
    // The parent keys this panel by verified session, authority, office and customer.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [office, customerId, revision]);

  function clearForm() {
    setEditing(false);
    setCandidate(undefined);
    setPreview(undefined);
    setEvidence('');
    setRevoke(undefined);
    setFrom(localNow());
    setUntil('');
  }

  function navigate(next: Section) {
    pending.current?.abort();
    pending.current = null;
    setBusy(false);
    clearForm();
    setSection(next);
    setError('');
    setMessage('');
  }

  async function mutate(command: CustomerRelationCommand) {
    if (busy) return;
    const controller = new AbortController();
    pending.current = controller;
    setBusy(true);
    setError('');
    setMessage('');
    try {
      const result = await relationsApi.command(command, controller.signal);
      if (controller.signal.aborted || !active.current) return;
      if (result.access_lost) {
        setState(undefined);
        onExit();
        return;
      }
      setState(result);
      clearForm();
      setMessage('Vínculo atualizado.');
    } catch (cause) {
      if (!controller.signal.aborted) failed(cause);
    } finally {
      if (pending.current === controller) {
        pending.current = null;
        setBusy(false);
      }
    }
  }

  function save(event: FormEvent) {
    event.preventDefault();
    if (!candidate || !state) return;
    const base = { office_id: office, customer_id: state.customer.id };
    if (section === 'identities') {
      return void mutate({
        ...base,
        action: 'identity.verify',
        payload: { membership_id: candidate.id, evidence: evidence.trim() },
      });
    }
    if (
      !from ||
      !Number.isFinite(Date.parse(from)) ||
      (until &&
        (!Number.isFinite(Date.parse(until)) ||
          Date.parse(until) <= Date.parse(from)))
    ) {
      setError('A validade final deve ser posterior ao início.');
      return;
    }
    const dates = {
      valid_from: new Date(from).toISOString(),
      valid_until: until ? new Date(until).toISOString() : null,
    };
    if (section === 'assignments') {
      void mutate({
        ...base,
        action: 'assignment.grant',
        payload: { membership_id: candidate.id, ...dates },
      });
    } else if (section === 'representations') {
      void mutate({
        ...base,
        action: 'representation.grant',
        payload: {
          representative_customer_id: candidate.id,
          kind,
          evidence: evidence.trim(),
          ...dates,
        },
      });
    }
  }

  async function mergeStep(confirm: boolean) {
    if (busy || !state || !candidate || (confirm && !preview)) return;
    const controller = new AbortController();
    pending.current = controller;
    setBusy(true);
    setError('');
    setMessage('');
    try {
      if (!confirm) {
        const result = await relationsApi.preview(
          { office_id: office, source_id: state.customer.id, target_id: candidate.id },
          controller.signal,
        );
        if (!controller.signal.aborted) setPreview(result);
      } else {
        const result = await relationsApi.merge(
          {
            office_id: office,
            source_id: preview!.source.id,
            target_id: preview!.target.id,
            source_version: preview!.source.version,
            target_version: preview!.target.version,
            evidence: evidence.trim(),
            confirm: true,
          },
          controller.signal,
        );
        if (!controller.signal.aborted && active.current) {
          setState(result.state);
          clearForm();
          setMessage('Mesclagem concluída. Você está na ficha de destino.');
        }
      }
    } catch (cause) {
      if (!controller.signal.aborted) {
        failed(cause);
        if (confirm) {
          setPreview(undefined);
          setCandidate(undefined);
          setEvidence('');
        }
      }
    } finally {
      if (pending.current === controller) {
        pending.current = null;
        setBusy(false);
      }
    }
  }

  const allowed =
    state &&
    (section === 'identities'
      ? state.capabilities.can_verify
      : section === 'merges'
        ? state.capabilities.can_merge
        : state.capabilities.can_relate);
  const rows = state && section !== 'overview' ? state[section] : [];

  if (portalMode && state) {
    return (
      <section className="relations-panel">
        <div className="relation-toolbar">
          <button
            type="button"
            data-operation-local-return
            className="relation-back-btn"
            disabled={portalBusy}
            onClick={() => {
              setPortalMode(undefined);
              setRevision(n => n + 1);
            }}
          >
            <ArrowLeft size={17} aria-hidden="true" />
            Voltar aos vínculos
          </button>
        </div>
        <PortalIdentityPanel
          office={office}
          customerId={state.customer.id}
          representations={state.representations}
          mode={portalMode}
          onPendingChange={setPortalBusy}
          onFatal={status => failed(new CustomersError(status))}
        />
      </section>
    );
  }

  return (
    <section className="relations-panel" aria-label="Vínculos do cliente">
      {state && (
        <div className="relation-header">
          <div className="relation-heading">
            <h2>{section === 'overview' ? 'Vínculos' : sections[section]}</h2>
            <span>{state.customer.name}</span>
          </div>
          <p className="customer-note">
            A identidade conferida vincula a conta; documentos seguem as regras
            de liberação. A representação exige autorização separada.
          </p>
        </div>
      )}

      {error && (
        <div className="relation-feedback-row">
          <p className="form-feedback error" role="alert">
            {error}
          </p>
          {!state && (
            <button
              type="button"
              className="relation-back-btn"
              disabled={busy}
              onClick={() => {
                setError('');
                setRevision(value => value + 1);
              }}
            >
              Tentar novamente
            </button>
          )}
        </div>
      )}

      {message && (
        <p className="form-feedback" role="status">
          {message}
        </p>
      )}

      {state &&
        (section === 'overview' ? (
          <div className="relation-overview">
            {Object.entries(sections).map(([key, label]) => (
              <button
                type="button"
                className="relation-overview-button"
                key={key}
                onClick={() => navigate(key as Section)}
              >
                <strong>{label}</strong>
                <span>
                  {state[key as keyof typeof sections].length}
                  {state.truncated[key as keyof typeof sections] ? '+' : ''}{' '}
                  registros
                  <ArrowRight size={17} aria-hidden="true" />
                </span>
              </button>
            ))}
          </div>
        ) : (
          <>
            <div className="relation-toolbar">
              <button
                type="button"
                className="relation-back-btn"
                onClick={() => navigate('overview')}
              >
                <ArrowLeft size={17} aria-hidden="true" />
                Vínculos
              </button>
              <div className="relation-toolbar-actions">
                {allowed &&
                  !editing &&
                  !revoke &&
                  (section === 'identities' ||
                    (section === 'representations' &&
                      state.capabilities.can_verify)) && (
                    <button
                      type="button"
                      className="relation-secondary-btn"
                      disabled={busy}
                      onClick={() =>
                        setPortalMode(
                          section === 'identities'
                            ? 'identity'
                            : 'representations',
                        )
                      }
                    >
                      {section === 'identities'
                        ? 'Convite do portal'
                        : 'Autorizar andamento'}
                    </button>
                  )}
                {allowed && !editing && !revoke && (
                  <button
                    type="button"
                    className="customers-primary-btn relation-primary-btn"
                    disabled={busy}
                    onClick={() => {
                      clearForm();
                      setEditing(true);
                      setError('');
                      setMessage('');
                    }}
                  >
                    {section === 'merges'
                      ? 'Revisar duplicidade'
                      : section === 'identities'
                        ? 'Conferir identidade'
                        : 'Adicionar vínculo'}
                  </button>
                )}
              </div>
            </div>

            {editing ? (
              <div className="relation-editor">
                {!preview && (
                  <RelationCandidates
                    key={section}
                    office={office}
                    kind={
                      section === 'assignments'
                        ? 'team'
                        : section === 'identities'
                          ? 'client'
                          : 'customers'
                    }
                    exclude={state.customer.id}
                    disabled={busy}
                    onSelect={setCandidate}
                    onError={failed}
                  />
                )}
                {section === 'merges' ? (
                  preview ? (
                    <form
                      className="relation-form"
                      onSubmit={event => {
                        event.preventDefault();
                        void mergeStep(true);
                      }}
                    >
                      <dl className="merge-preview">
                        <div>
                          <dt>Origem preservada no histórico</dt>
                          <dd>{preview.source.name}</dd>
                        </div>
                        <div>
                          <dt>Destino ativo · nome e tipo mantidos</dt>
                          <dd>
                            {preview.expected.name} ·{' '}
                            {preview.expected.kind === 'person'
                              ? 'Pessoa física'
                              : 'Pessoa jurídica'}
                          </dd>
                        </div>
                        <div>
                          <dt>Resultado previsto</dt>
                          <dd>
                            {preview.expected.identifier_masked ??
                              'Sem identificador'}{' '}
                            · {preview.expected.contact_count} contatos
                            {preview.expected.copies_identifier
                              ? ' · identificador conservado da origem'
                              : ''}
                          </dd>
                        </div>
                      </dl>
                      <p className="customer-note">
                        A origem deixa a lista ativa. Históricos e referências
                        são preservados; os vínculos da origem serão revogados,
                        sem transferir direitos.
                      </p>
                      {preview.conflicts.length > 0 && (
                        <p className="form-feedback error" role="alert">
                          {preview.conflicts
                            .map(item => conflictNames[item])
                            .join(' · ')}
                        </p>
                      )}
                      <label className="team-field">
                        Referência da conferência
                        <input
                          required
                          maxLength={500}
                          value={evidence}
                          disabled={busy}
                          onChange={event => setEvidence(event.target.value)}
                          aria-describedby="evidence-help"
                        />
                      </label>
                      <p id="evidence-help" className="customer-note">
                        Informe somente a referência interna. Não inclua CPF,
                        contato ou relato pessoal.
                      </p>
                      <div className="relation-actions">
                        <button
                          type="button"
                          className="relation-back-btn"
                          onClick={() => {
                            pending.current?.abort();
                            pending.current = null;
                            setBusy(false);
                            setPreview(undefined);
                            setCandidate(undefined);
                            setEvidence('');
                          }}
                        >
                          Voltar à seleção
                        </button>
                        <button
                          type="submit"
                          className="customers-primary-btn relation-primary-btn"
                          disabled={
                            busy || !preview.can_merge || !evidence.trim()
                          }
                        >
                          Confirmar mesclagem
                        </button>
                      </div>
                    </form>
                  ) : (
                    <div className="relation-actions">
                      <button
                        type="button"
                        className="customers-primary-btn relation-primary-btn"
                        disabled={busy || !candidate}
                        onClick={() => void mergeStep(false)}
                      >
                        Ver prévia da mesclagem
                      </button>
                    </div>
                  )
                ) : (
                  <form className="relation-form" onSubmit={save}>
                    {section === 'representations' && (
                      <label className="team-field">
                        Tipo de representação
                        <select
                          value={kind}
                          disabled={busy}
                          onChange={event =>
                            setKind(event.target.value as RepresentationKind)
                          }
                        >
                          {Object.entries(kindNames).map(([value, label]) => (
                            <option key={value} value={value}>
                              {label}
                            </option>
                          ))}
                        </select>
                      </label>
                    )}
                    {section !== 'identities' && (
                      <div className="relation-dates">
                        <label className="team-field">
                          Válido desde
                          <input
                            type="datetime-local"
                            required
                            value={from}
                            disabled={busy}
                            onChange={event => setFrom(event.target.value)}
                          />
                        </label>
                        <label className="team-field">
                          Válido até (opcional)
                          <input
                            type="datetime-local"
                            value={until}
                            disabled={busy}
                            onChange={event => setUntil(event.target.value)}
                          />
                        </label>
                      </div>
                    )}
                    {section !== 'assignments' && (
                      <>
                        <label className="team-field">
                          Referência da conferência
                          <input
                            required
                            maxLength={500}
                            value={evidence}
                            disabled={busy}
                            onChange={event => setEvidence(event.target.value)}
                            aria-describedby="evidence-help"
                          />
                        </label>
                        <p id="evidence-help" className="customer-note">
                          Somente referência interna, sem CPF, contato ou relato
                          pessoal.
                        </p>
                      </>
                    )}
                    <div className="relation-actions">
                      <button
                        type="submit"
                        className="customers-primary-btn relation-primary-btn"
                        disabled={
                          busy ||
                          !candidate ||
                          (section !== 'assignments' && !evidence.trim())
                        }
                      >
                        {section === 'identities'
                          ? 'Confirmar conferência'
                          : 'Salvar vínculo'}
                      </button>
                      <button
                        type="button"
                        className="relation-back-btn"
                        onClick={() => navigate(section)}
                      >
                        Cancelar
                      </button>
                    </div>
                  </form>
                )}
                {section === 'merges' && (
                  <div className="relation-cancel-row">
                    <button
                      type="button"
                      className="relation-back-btn"
                      onClick={() => navigate(section)}
                    >
                      Cancelar
                    </button>
                  </div>
                )}
              </div>
            ) : revoke ? (
              <div className="relation-confirm">
                <h3>Revogar vínculo de {revoke.name}?</h3>
                <p>
                  A revogação mantém o histórico. O acesso que depende deste
                  vínculo será encerrado.
                </p>
                <div className="relation-actions">
                  <button
                    type="button"
                    className="relation-back-btn"
                    onClick={() => navigate(section)}
                  >
                    Cancelar
                  </button>
                  <button
                    type="button"
                    className="customers-primary-btn relation-primary-btn"
                    disabled={busy}
                    onClick={() =>
                      void mutate({
                        office_id: office,
                        customer_id: state.customer.id,
                        action:
                          section === 'assignments'
                            ? 'assignment.revoke'
                            : section === 'representations'
                              ? 'representation.revoke'
                              : 'identity.revoke',
                        payload: { id: revoke.id, version: revoke.version },
                      })
                    }
                  >
                    Confirmar revogação
                  </button>
                </div>
              </div>
            ) : (
              <div className="relation-list-frame">
                {rows.length > 0 ? (
                  <ul className="relation-list" aria-label={sections[section]}>
                    {rows.map(row => (
                      <li key={row.id}>
                        {'source_id' in row ? (
                          <div>
                            <strong>Mesclagem · {date(row.created_at)}</strong>
                            <small>
                              Origem {row.source_id} → destino {row.target_id}
                            </small>
                          </div>
                        ) : (
                          <>
                            <div>
                              <strong>{row.name}</strong>
                              <small>
                                {statusNames[row.status]}
                                {'kind' in row ? ` · ${kindNames[row.kind]}` : ''}
                              </small>
                              {'valid_from' in row && (
                                <small>
                                  {date(row.valid_from)} →{' '}
                                  {row.valid_until
                                    ? date(row.valid_until)
                                    : 'Sem prazo final'}
                                </small>
                              )}
                              {'evidence' in row && (
                                <small>Referência: {row.evidence}</small>
                              )}
                              {section === 'identities' && (
                                <details className="relation-decision">
                                  <summary>Autor e data da decisão</summary>
                                  <small>
                                    Conferência: {date(row.created_at)} · Autor{' '}
                                    {row.created_by}
                                  </small>
                                  {row.revoked_at && (
                                    <small>
                                      Revogação: {date(row.revoked_at)} · Autor{' '}
                                      {row.revoked_by}
                                    </small>
                                  )}
                                </details>
                              )}
                            </div>
                            {allowed && row.status !== 'revoked' && (
                              <button
                                type="button"
                                className="relation-row-revoke-btn"
                                aria-label={`Revogar vínculo de ${row.name}`}
                                onClick={() => {
                                  setRevoke(row);
                                  setError('');
                                  setMessage('');
                                }}
                              >
                                Revogar
                              </button>
                            )}
                          </>
                        )}
                      </li>
                    ))}
                  </ul>
                ) : (
                  <p className="customer-note relation-empty">
                    Nenhum registro nesta seção.
                  </p>
                )}

                <div className="relation-list-footer">
                  <span>
                    {formatCountLabel(
                      rows.length,
                      'registro',
                      'registros',
                      state.truncated[section],
                    )}
                  </span>
                </div>

                {state.truncated[section] && (
                  <p className="customer-note">
                    Consulta limitada a 50 registros.
                    {auditAllowed ? (
                      <>
                        {' '}
                        Consulte a <Link to="/auditoria">Auditoria</Link> para
                        ampliar a consulta.
                      </>
                    ) : (
                      ' Solicite a consulta completa à gestão autorizada.'
                    )}
                  </p>
                )}
              </div>
            )}
          </>
        ))}
    </section>
  );
}
