import { CategoryRequestSummary } from '../categoryIntake/CategoryRequestSummary';
import { SpecializedPanel } from '../specialized/SpecializedPanel';
import { specializedKinds, specializedStages } from '../../../shared/specialized';
import type { ReactNode } from 'react';
import { RuralWorkflowPanel } from '../rural/RuralWorkflowPanel';
import { ruralStages } from '../../../shared/ruralWorkflow';
import { RequestTransferException } from './RequestTransferException';
import { RequestCollection } from './RequestCollection';
import { PortalRequestReturn } from './PortalRequestReturn';
import { modelApi } from '../documentCommercial/modelApi';
import { IntakeRequestItem } from '../documentCommercial/IntakeRequestItem';
import { useEffect, useState, type FormEvent } from 'react';
import { CheckSquare, CreditCard, Paperclip } from 'lucide-react';
import {
  requestStatuses,
  requestStatusLabels,
  publicRequestStatusLabels,
  type RequestDetail as Detail,
  type RequestMutation,
  type RequestOption,
  type RequestStatus,
  type StaffRequestDetail,
} from '../../../shared/requests';
import { Link } from 'react-router-dom';
import { paths } from '../../app/routes';
import { serviceMoney } from '../../../shared/services';
import { AccountCorrectionDetail } from './AccountCorrectionDetail';
import { RequestReviewStatus } from './RequestReviewStatus';
import { RequestPicker } from './RequestPicker';
import { RequestItems, itemInputs, type DraftItem } from './RequestItems';
import type { RequestsError } from './api';
import type { RequestDeletionResult } from '../../../shared/requestDeletion';
import { RequestDeleteSection } from './RequestDeleteModal';
import { ManualPaymentAction } from '../cash/ManualPaymentAction';
import {
  formatEntityTotal,
  getRequestStatusPresentation,
} from './requestsListModel';

const date = (value: string) =>
  new Date(value).toLocaleString('pt-BR', {
    dateStyle: 'short',
    timeStyle: 'short',
  });
const originLabels = {
  presencial: 'Presencial',
  whatsapp: 'WhatsApp',
  portal: 'Portal do cliente',
};

export function RequestDetail({
  office,
  data,
  permissions,
  busy,
  onMutate,
  onFailure,
  onUpdated,
  onAccessLost,
  onPendingChange,
  onActionsChange,
  onDeleted,
  onArchived,
}: {
  office: string;
  data: Detail;
  permissions: string[];
  busy: boolean;
  onHistory?: (page: number) => void;
  onMutate: (mutation: RequestMutation) => void;
  onFailure: (failure: RequestsError) => void;
  onUpdated?: (data: Detail) => void;
  onAccessLost: () => void;
  onPendingChange?: (value: boolean) => void;
  onActionsChange?: (v: ReactNode) => void;
  onDeleted?: (result: RequestDeletionResult) => void;
  onArchived?: () => void;
}) {
  const [ruralExpanded, setRuralExpanded] = useState(false);
  const [specializedExpanded, setSpecializedExpanded] = useState(false);

  useEffect(() => {
    setRuralExpanded(false);
    setSpecializedExpanded(false);
  }, [data.id]);

  const presentation = getRequestStatusPresentation(
    data.portal
      ? {
          public_status: data.public_status,
          rural_progress: data.rural_progress ?? null,
          specialized_progress: data.specialized_progress ?? null,
        }
      : {
          status: data.status,
          public_status: data.public_status,
        },
  );

  const canFilesLink =
    !data.portal &&
    !data.category_intake &&
    ['files.read', 'requests.read'].every(p => permissions.includes(p)) &&
    !ruralExpanded &&
    !specializedExpanded;
  const canChecklistLink =
    !data.portal &&
    permissions.includes('checklists.read') &&
    !ruralExpanded &&
    !specializedExpanded;

  return (
    <article className="request-detail requests-subview-card">
      <header className="requests-detail-head">
        <div className="requests-detail-meta">
          <span className="requests-protocol-code requests-detail-protocol">
            {data.protocol}
          </span>
          <span
            className={`request-status-pill is-${presentation.tone}`}
          >
            {presentation.progressLabel ?? presentation.label}
          </span>
          {data.category_name && (
            <span className="requests-detail-category">
              {[data.category_parent_name, data.category_name]
                .filter(Boolean)
                .join(' › ')}
            </span>
          )}
        </div>
        <div className="requests-detail-shortcuts">
          {canFilesLink && (
            <Link
              className="requests-shortcut-btn"
              aria-disabled={busy || undefined}
              onClick={e => {
                if (busy) e.preventDefault();
              }}
              to={paths.attachments}
              state={{
                office_id: office,
                request_id: data.id,
                request_protocol: data.protocol,
              }}
            >
              <Paperclip size={15} aria-hidden="true" />
              <span>Anexos deste atendimento</span>
            </Link>
          )}
          {canChecklistLink && (
            <Link
              className="requests-shortcut-btn"
              to={paths.checklists}
              state={{ office_id: office, request_id: data.id }}
            >
              <CheckSquare size={15} aria-hidden="true" />
              <span>Ver checklist e pendências</span>
            </Link>
          )}
          {data.portal && (
            <Link
              className="requests-shortcut-btn"
              aria-disabled={busy || undefined}
              onClick={e => {
                if (busy) e.preventDefault();
              }}
              to={paths.clientPayments}
              state={{ office_id: office, request_id: data.id }}
            >
              <CreditCard size={15} aria-hidden="true" />
              <span>Ver cobrança e pagamento</span>
            </Link>
          )}
        </div>
      </header>

      <div className="requests-subview-scroll">
        {!data.portal && data.category_intake && (
          <CategoryRequestSummary
            state={data.category_intake}
            office={office}
            canFiles={
              permissions.includes('files.read') &&
              permissions.includes('requests.read')
            }
          />
        )}

        {data.portal && data.rural_progress && (
          <section className="request-message" aria-label="Progresso CCIR/CAR">
            <h2>
              {data.rural_progress.kind} ·{' '}
              {ruralStages[data.rural_progress.stage]}
            </h2>
            {data.rural_progress.pending && (
              <p>Pendência compartilhada: {data.rural_progress.pending}</p>
            )}
            <p className="customer-note">
              Conclusão interna não confirma aceitação pelo órgão. O resultado
              segue as regras de liberação e entrega.
            </p>
          </section>
        )}

        {data.portal && data.specialized_progress && (
          <section
            className="request-message"
            aria-label="Progresso previdenciário e jurídico"
          >
            <h2>
              {specializedKinds[data.specialized_progress.kind]} ·{' '}
              {specializedStages[data.specialized_progress.stage]}
            </h2>
            {data.specialized_progress.pending && (
              <p>Pendência compartilhada: {data.specialized_progress.pending}</p>
            )}
            <p className="customer-note">
              Andamento factual. Não há promessa de deferimento. Conclusão
              interna não libera automaticamente documentos.
            </p>
          </section>
        )}

        {!data.portal &&
          data.specialized_workflow === true &&
          !ruralExpanded &&
          (data.specialized_category_access ||
            [
              'specialized.read',
              'customers.read',
              'requests.read',
              'checklists.read',
            ].every(p => permissions.includes(p))) && (
            <SpecializedPanel
              key={`specialized:${data.id}`}
              requestProtocol={data.protocol}
              office={office}
              requestId={data.id}
              requestVersion={data.version}
              permissions={permissions}
              onExpandedChange={setSpecializedExpanded}
              onActionsChange={onActionsChange}
              onPendingChange={onPendingChange}
              onUpdated={onUpdated}
              onFailure={onFailure}
            />
          )}

        {!data.portal &&
          data.rural_workflow === true &&
          !specializedExpanded &&
          (data.rural_category_access ||
            [
              'rural.read',
              'customers.read',
              'requests.read',
              'checklists.read',
            ].every(p => permissions.includes(p))) && (
            <RuralWorkflowPanel
              onExpandedChange={setRuralExpanded}
              key={`rural:${data.id}`}
              office={office}
              requestId={data.id}
              requestVersion={data.version}
              onPendingChange={onPendingChange}
              onUpdated={onUpdated}
              onFailure={onFailure}
            />
          )}

        <div hidden={ruralExpanded || specializedExpanded}>
          <dl className="service-facts">
            <div>
              <dt>Abertura</dt>
              <dd>{date(data.created_at)}</dd>
            </div>
            <div>
              <dt>Última atualização</dt>
              <dd>{date(data.updated_at)}</dd>
            </div>
          </dl>

          {data.correction && (
            <AccountCorrectionDetail
              key={`correction:${data.id}`}
              office={office}
              data={data}
              onUpdated={onUpdated ?? (() => {})}
              onFailure={onFailure}
            />
          )}

          {data.portal && !data.linked_view && !data.correction && (
            <PortalRequestReturn
              key={data.id}
              office={office}
              requestId={data.id}
              onFailure={onFailure}
              onUpdated={onUpdated}
              onPendingChange={onPendingChange}
            />
          )}

          {data.portal && !data.linked_view && (
            <RequestReviewStatus
              office={office}
              requestId={data.id}
              onFailure={onFailure}
            />
          )}

          {data.portal && data.portal_history && (
            <details className="service-section">
              <summary>Histórico público do atendimento</summary>
              <ul
                className="request-history requests-history-scroll"
                aria-label="Histórico público do atendimento"
              >
                {data.portal_history.items.map((h, i) => (
                  <li key={h.at + i} className="requests-history-item">
                    <strong>{publicRequestStatusLabels[h.status]}</strong>
                    <small>{date(h.at)}</small>
                  </li>
                ))}
              </ul>
              <div className="requests-list-footer">
                <span>
                  {formatEntityTotal(
                    data.portal_history.total,
                    'registro',
                    'registros',
                  )}
                </span>
              </div>
            </details>
          )}

          {data.portal ? (
            <>
              <dl className="service-facts">
                <div>
                  <dt>Quem está atendendo</dt>
                  <dd>{data.assignee_name ?? 'Aguardando atendimento'}</dd>
                </div>
              </dl>
              {data.message && (
                <section className="request-message">
                  <h2>Sua mensagem</h2>
                  <p>{data.message}</p>
                </section>
              )}
              {data.services.length > 0 && (
                <section className="request-message">
                  <h2>Serviços</h2>
                  <ul>
                    {data.services.map((name, index) => (
                      <li key={index}>{name}</li>
                    ))}
                  </ul>
                </section>
              )}
              <p className="customer-note">
                Acompanhe aqui as atualizações da equipe. Concluído indica o
                encerramento do atendimento.
              </p>
            </>
          ) : (
            <>
              <RequestCollection
                key={`collection:${data.id}`}
                office={office}
                data={data}
                busy={busy}
                onUpdated={onUpdated ?? (() => {})}
                onFailure={onFailure}
                onAccessLost={onAccessLost}
              />
              <RequestTransferException
                key={`transfer:${data.id}`}
                office={office}
                data={data}
                busy={busy}
                onUpdated={onUpdated ?? (() => {})}
                onFailure={onFailure}
                onAccessLost={onAccessLost}
              />
              <StaffDetail
                office={office}
                data={data}
                permissions={permissions}
                busy={busy}
                onMutate={onMutate}
                onFailure={onFailure}
              />
            </>
          )}

          {onDeleted && (
            <RequestDeleteSection
              office={office}
              requestId={data.id}
              requestVersion={data.portal ? undefined : data.version}
              protocol={data.protocol}
              title={data.title}
              portal={data.portal}
              canViewCharges={permissions.includes('charges.read')}
              disabled={busy}
              onPendingChange={onPendingChange}
              onDeleted={onDeleted}
              onArchived={onArchived}
            />
          )}
        </div>
      </div>
    </article>
  );
}

function StaffDetail({
  office,
  data,
  permissions,
  busy,
  onMutate,
  onFailure,
}: {
  office: string;
  data: StaffRequestDetail;
  permissions: string[];
  busy: boolean;
  onMutate: (mutation: RequestMutation) => void;
  onFailure: (failure: RequestsError) => void;
}) {
  const total = data.items.reduce(
    (sum, item) => sum + item.snapshot.total_cents,
    0,
  );
  return (
    <>
      <dl className="service-facts">
        <div>
          <dt>Origem e prioridade</dt>
          <dd>
            {originLabels[data.origin]} ·{' '}
            {data.priority === 'urgent' ? 'Urgente' : 'Normal'}
            {data.priority_reason && ` — ${data.priority_reason}`}
          </dd>
        </div>
        <div>
          <dt>Responsável atual</dt>
          <dd>{data.assignee_name ?? 'Sem responsável'}</dd>
        </div>
        <div>
          <dt>Criador do atendimento (imutável)</dt>
          <dd>{data.created_by_name ?? 'Criador registrado'}</dd>
        </div>
        <div>
          <dt>Pessoa do atendimento</dt>
          <dd>{data.customer_name ?? 'Não informada'}</dd>
        </div>
      </dl>

      {data.following_only && (
        <p className="customer-note">
          {data.category_access_mode === 'read'
            ? 'Sua autorização nesta categoria permite leitura e pré-atendimento.'
            : 'Você está acompanhando este atendimento. Somente o responsável atual pode alterar o pedido, os anexos e o checklist.'}
        </p>
      )}

      {data.can_update && data.status === 'aberto' && (
        <button
          className="primary-button"
          disabled={busy}
          onClick={() =>
            onMutate({
              kind: 'status',
              status: 'em_atendimento',
              reason: 'Atendimento assumido pelo responsável atual',
            })
          }
        >
          Assumir atendimento
        </button>
      )}

      <p className="request-total">
        <span>Total registrado</span>
        <strong>{serviceMoney(total)}</strong>
      </p>
      <p className="customer-note">
        Valores preservados na abertura/classificação. Concluir não confirma
        quitação, aprovação, assinatura ou entrega.
      </p>

      {data.status !== 'cancelado' && (
        <ManualPaymentAction
          key={`manual-pay:${data.id}`}
          office={office}
          requestId={data.id}
          protocol={data.protocol}
          origin={data.origin}
          customerName={data.customer_name}
          disabled={busy}
          returnLabel={`Voltar para ${data.protocol}`}
        />
      )}

      {data.message && (
        <details className="service-section">
          <summary>Mensagem enviada pelo cliente</summary>
          <p className="request-message-text">{data.message}</p>
        </details>
      )}

      <details className="service-section">
        <summary>Itens e valores registrados ({data.items.length})</summary>
        {data.items.map(item => (
          <section className="request-stored-item" key={item.id}>
            <h2>{item.snapshot.definition.name}</h2>
            <p>
              {item.snapshot.quantity} {item.snapshot.definition.unit} · v
              {item.snapshot.version} · {serviceMoney(item.snapshot.total_cents)}
            </p>
            <p className="customer-note">
              Preço unitário: {serviceMoney(item.snapshot.unit_price_cents)}.
              Ajuste:{' '}
              {item.snapshot.adjustment.kind === 'none'
                ? 'Sem ajuste'
                : `${item.snapshot.adjustment.kind} — ${item.snapshot.adjustment.reason}`}
            </p>
            <dl className="service-facts">
              {item.snapshot.definition.fields.map(field => (
                <div key={field.key}>
                  <dt>{field.label}</dt>
                  <dd>{item.fields[field.key] || 'Não informado'}</dd>
                </div>
              ))}
            </dl>
            {item.participant_ids.length > 0 && (
              <p className="customer-note">
                Participantes registrados: {item.participant_ids.length}
              </p>
            )}
            {item.checklist.length > 0 && (
              <ul className="request-checklist-read">
                {item.checklist.map(value => (
                  <li key={value}>{value}</li>
                ))}
              </ul>
            )}
          </section>
        ))}
      </details>

      {permissions.includes('documents.read') &&
        permissions.includes('customers.read') &&
        data.items.map(item => (
          <IntakeRequestItem
            key={`${item.id}:${data.version}`}
            office={office}
            requestId={data.id}
            itemId={item.id}
            canCreate={
              data.can_update && permissions.includes('documents.create')
            }
            disabled={busy}
            onFailure={onFailure}
          />
        ))}

      {(data.can_update ||
        data.can_cancel ||
        data.can_transfer ||
        data.can_reclaim) && (
        <RequestActions
          key={data.id}
          office={office}
          data={data}
          permissions={permissions}
          busy={busy}
          onMutate={onMutate}
          onFailure={onFailure}
        />
      )}

      <details className="service-section">
        <summary>Histórico do atendimento</summary>
        <ul
          className="request-history requests-history-scroll"
          aria-label="Histórico da solicitação"
        >
          {data.history.map(h => (
            <li key={h.id} className="requests-history-item">
              <strong>
                {h.kind === 'created'
                  ? 'Abertura'
                  : h.kind === 'note'
                    ? 'Nota interna'
                    : h.kind === 'transfer'
                      ? 'Transferência'
                      : h.kind === 'triage'
                        ? 'Classificação'
                        : 'Mudança de status'}
                {h.to_status ? ` · ${requestStatusLabels[h.to_status]}` : ''}
              </strong>
              <small>
                {h.actor_name ?? 'Membro da equipe'} · {date(h.created_at)}
              </small>
              {h.reason && <p>{h.reason}</p>}
            </li>
          ))}
        </ul>
        <div className="requests-list-footer">
          <span>
            {formatEntityTotal(data.history_total, 'registro', 'registros')}
          </span>
        </div>
      </details>
    </>
  );
}

function RequestActions({
  office,
  data,
  permissions,
  busy,
  onMutate,
  onFailure,
}: {
  office: string;
  data: StaffRequestDetail;
  permissions: string[];
  busy: boolean;
  onMutate: (mutation: RequestMutation) => void;
  onFailure: (failure: RequestsError) => void;
}) {
  const [status, setStatus] = useState<RequestStatus>(
    data.can_update ? data.status : 'cancelado',
  );
  const [reason, setReason] = useState('');
  const [note, setNote] = useState('');
  const [transferReason, setTransferReason] = useState('');
  const [assignee, setAssignee] = useState<RequestOption>();
  const [review, setReview] = useState([false, false, false, false]);
  const [error, setError] = useState('');
  const [items, setItems] = useState<DraftItem[]>([]);
  const [customer, setCustomer] = useState<RequestOption | undefined>(
    data.customer_id
      ? { id: data.customer_id, label: data.customer_name ?? 'Pessoa vinculada' }
      : undefined,
  );
  const [triageReason, setTriageReason] = useState('');
  const [booked, setBooked] = useState(false);

  useEffect(() => {
    if (data.origin !== 'portal' || !data.items.length) return;
    const c = new AbortController();
    void modelApi
      .booked(office, data.id, c.signal)
      .then(v => {
        if (!c.signal.aborted) setBooked(v);
      })
      .catch(() => {});
    return () => c.abort();
  }, [office, data.id, data.items.length, data.origin]);

  const canUpdate = data.can_update;
  const canCancel = data.can_cancel && permissions.includes('requests.cancel');
  const canTransfer =
    data.can_transfer && permissions.includes('requests.transfer');

  useEffect(() => {
    setStatus(canUpdate ? data.status : 'cancelado');
    setReason('');
    setNote('');
    setTransferReason('');
    setAssignee(undefined);
    setReview([false, false, false, false]);
    setError('');
    setItems([]);
    setTriageReason('');
  }, [data.version, data.status, canUpdate]);

  function run(event: FormEvent, mutation: () => RequestMutation) {
    event.preventDefault();
    if (busy) return;
    setError('');
    try {
      onMutate(mutation());
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Confira os dados.');
    }
  }

  const requireReason = (value: string) => {
    if (!value.trim() || value.length > 500 || /[\u0000-\u001f\u007f]/.test(value)) {
      throw new Error('Informe um motivo de até 500 caracteres.');
    }
    return value.trim();
  };

  return (
    <details className="service-section">
      <summary>Ações do atendimento</summary>
      {error && (
        <p role="alert" className="form-feedback error">
          {error}
        </p>
      )}
      <div className="request-actions">
        {data.can_reclaim && (
          <form
            onSubmit={e =>
              run(e, () => ({
                kind: 'reclaim',
                reason: requireReason(transferReason),
              }))
            }
            noValidate
          >
            <fieldset disabled={busy}>
              <label className="team-field">
                Motivo da retomada
                <input
                  maxLength={500}
                  value={transferReason}
                  onChange={e => setTransferReason(e.target.value)}
                />
              </label>
              <p className="customer-note">
                Você assumirá o atendimento. O responsável anterior poderá
                acompanhar; o cliente com conta vinculada será avisado com seu
                nome.
              </p>
              <button className="team-text-button" disabled={busy}>
                Retomar atendimento para mim
              </button>
            </fieldset>
          </form>
        )}

        {(canUpdate || canCancel) && (
          <form
            onSubmit={e =>
              run(e, () => {
                if (status === 'cancelado' && !review.every(Boolean)) {
                  throw new Error(
                    'Marque as quatro conferências manuais antes de cancelar.',
                  );
                }
                return {
                  kind: 'status',
                  status,
                  reason: requireReason(reason),
                  ...(status === 'cancelado'
                    ? {
                        cancellation_review: {
                          charges_reviewed: true as const,
                          refunds_reviewed: true as const,
                          deliveries_reviewed: true as const,
                          external_reviewed: true as const,
                        },
                      }
                    : {}),
                };
              })
            }
            noValidate
          >
            <fieldset disabled={busy}>
              <div className="request-grid">
                <label className="team-field">
                  Novo status
                  <select
                    value={status}
                    onChange={e => setStatus(e.target.value as RequestStatus)}
                  >
                    {requestStatuses
                      .filter(s => (s === 'cancelado' ? canCancel : canUpdate))
                      .map(s => (
                        <option key={s} value={s}>
                          {requestStatusLabels[s]}
                        </option>
                      ))}
                  </select>
                </label>
                <label className="team-field">
                  Motivo da mudança
                  <input
                    maxLength={500}
                    value={reason}
                    onChange={e => setReason(e.target.value)}
                  />
                </label>
              </div>
              {status === 'cancelado' && (
                <fieldset className="request-cancellation">
                  <legend>Conferência manual para cancelamento</legend>
                  <p className="customer-note">
                    Confira fora deste sistema os efeitos pendentes. Não há
                    verificação financeira ou documental automática nesta etapa.
                  </p>
                  {[
                    'Conferi cobranças manualmente',
                    'Conferi reembolsos manualmente',
                    'Conferi entregas manualmente',
                    'Conferi processos externos manualmente',
                  ].map((label, i) => (
                    <label className="service-check" key={label}>
                      <input
                        type="checkbox"
                        checked={review[i]}
                        onChange={e =>
                          setReview(values =>
                            values.map((v, n) =>
                              n === i ? e.target.checked : v,
                            ),
                          )
                        }
                      />
                      <span>{label}</span>
                    </label>
                  ))}
                </fieldset>
              )}
              <button className="team-text-button" disabled={busy}>
                Alterar status
              </button>
            </fieldset>
          </form>
        )}

        {canUpdate && (
          <form
            onSubmit={e =>
              run(e, () => {
                if (!note.trim()) {
                  throw new Error('Escreva a nota interna antes de registrar.');
                }
                return { kind: 'note', note: note.trim() };
              })
            }
            noValidate
          >
            <fieldset disabled={busy}>
              <label className="team-field">
                Nota interna
                <textarea
                  rows={2}
                  maxLength={2000}
                  value={note}
                  onChange={e => setNote(e.target.value)}
                />
              </label>
              <button className="team-text-button" disabled={busy}>
                Registrar nota
              </button>
            </fieldset>
          </form>
        )}

        {canTransfer && (
          <details className="service-section">
            <summary>Transferir responsável</summary>
            <form
              onSubmit={e =>
                run(e, () => {
                  if (!assignee) {
                    throw new Error('Selecione o novo responsável.');
                  }
                  return {
                    kind: 'transfer',
                    assignee_id: assignee.id,
                    reason: requireReason(transferReason),
                  };
                })
              }
              noValidate
            >
              <fieldset disabled={busy}>
                <RequestPicker
                  office={office}
                  kind="assignees"
                  label="responsável"
                  correction={!!data.correction}
                  value={assignee}
                  busy={busy}
                  onSelect={setAssignee}
                  onFailure={onFailure}
                />
                <label className="team-field">
                  Motivo da transferência
                  <input
                    maxLength={500}
                    value={transferReason}
                    onChange={e => setTransferReason(e.target.value)}
                  />
                </label>
                <p className="customer-note">
                  O criador e os responsáveis anteriores continuam acompanhando.
                  Somente o novo responsável poderá atender.
                </p>
                <button className="team-text-button" disabled={busy}>
                  Transferir atendimento
                </button>
              </fieldset>
            </form>
          </details>
        )}

        {canUpdate &&
          !data.correction &&
          data.origin === 'portal' &&
          (data.items.length === 0 || (booked && !data.customer_id)) && (
            <details className="service-section">
              <summary>Classificar solicitação do portal</summary>
              <form
                onSubmit={e =>
                  run(e, () => ({
                    kind: 'triage',
                    customer_id: customer?.id ?? null,
                    items: booked ? [] : itemInputs(items, customer),
                    reason: requireReason(triageReason),
                  }))
                }
                noValidate
              >
                <fieldset disabled={busy}>
                  <RequestPicker
                    office={office}
                    kind="customers"
                    label="pessoa"
                    value={customer}
                    busy={busy}
                    onSelect={setCustomer}
                    onFailure={onFailure}
                  />
                  {!booked && (
                    <RequestItems
                      categoryId={data.category_id}
                      office={office}
                      items={items}
                      permissions={permissions}
                      busy={busy}
                      onChange={setItems}
                      onFailure={onFailure}
                    />
                  )}
                  <label className="team-field">
                    Motivo da classificação
                    <input
                      maxLength={500}
                      value={triageReason}
                      onChange={e => setTriageReason(e.target.value)}
                    />
                  </label>
                  <button className="team-text-button" disabled={busy}>
                    Classificar atendimento
                  </button>
                </fieldset>
              </form>
            </details>
          )}
      </div>
    </details>
  );
}
