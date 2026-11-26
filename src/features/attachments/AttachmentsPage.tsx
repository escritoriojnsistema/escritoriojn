import { usePendingNavigation33 } from '../portalIntake/usePendingNavigation33';
import { PrivatePdfPreview } from './PrivatePdfPreview';
import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type UIEvent,
} from 'react';
import { Link, Navigate, useLocation } from 'react-router-dom';
import {
  ArrowLeft,
  ChevronRight,
  Copy,
  Download,
  Eye,
  LogIn,
  Plus,
  RefreshCw,
  Settings2,
  Trash2,
  X,
} from 'lucide-react';
import type { AccessContext } from '../../../shared/access';
import { uuidPattern } from '../../../shared/access';
import {
  attachmentMaxBytes,
  attachmentMimeTypes,
  type AttachmentClassification,
  type AttachmentFile,
  type AttachmentPolicy,
  type AttachmentRequestOption,
} from '../../../shared/attachments';
import { paths } from '../../app/routes';
import { useAuth } from '../auth/AuthProvider';
import { OperationHeading, OperationLayout } from '../operation/OperationLayout';
import { OperationalFeedback } from '../operation/OperationalAccess';
import { AttachmentRequestPicker } from './AttachmentRequestPicker';
import { AttachmentManagement } from './AttachmentManagement';
import {
  attachmentsApi,
  attachmentsError,
  AttachmentsError,
  deleteAttachment,
  previewAttachment,
  downloadAttachment,
  uploadAttachment,
} from './api';
import { RequestsPanelModal } from '../requests/RequestsPanelModal';
import {
  formatEntityTotal,
  formatRequestsResultCount,
  getAttachmentStatusPresentation,
  mergeRequestPages,
  REQUESTS_AUTO_LOAD_CAP,
  REQUESTS_BATCH_SIZE,
  shouldLoadMoreRequestPages,
} from '../requests/requestsListModel';
import '../team/team.css';
import '../customers/customers.css';
import '../services/services.css';
import '../requests/requests.css';
import './attachments.css';

const validationMessages: Record<string, string> = {
  hash_mismatch:
    'O conteúdo recebido difere do arquivo selecionado. Selecione o arquivo novamente.',
  type_mismatch: 'O conteúdo não corresponde ao formato informado.',
  size_mismatch: 'O tamanho recebido não corresponde ao arquivo informado.',
  invalid_content: 'O arquivo possui conteúdo inválido para o formato permitido.',
  object_missing:
    'Objeto ainda não recebido. Repita o envio com o mesmo arquivo.',
  storage_error:
    'Não foi possível conferir o objeto no armazenamento. Tente novamente.',
};

const classificationNames = {
  documento: 'Documento',
  identificacao: 'Identificação',
  comprovante: 'Comprovante',
  medico: 'Médico · restrito',
  estrategico: 'Estratégico · restrito',
};

const defaultPolicy: AttachmentPolicy = {
  version: 0,
  max_bytes: attachmentMaxBytes,
  mime_types: [...attachmentMimeTypes],
};

type AccumulatedAttachments = {
  items: AttachmentFile[];
  total: number;
  loadedPage: number;
  lastBatchSize: number;
  portal: boolean;
};

export default function AttachmentsPage({
  client = false,
}: {
  client?: boolean;
}) {
  const auth = useAuth();
  const location = useLocation();
  const [selected, setSelected] = useState<string>(
    typeof location.state?.office_id === 'string'
      ? location.state.office_id
      : '',
  );
  const contexts = auth.contexts.filter(context =>
    client
      ? context.role_code === 'client'
      : context.role_code !== 'client' &&
        context.permissions.includes('files.read') &&
        context.permissions.includes('requests.read'),
  );
  const context =
    contexts.find(value => value.office_id === selected) ??
    contexts.find(value => value.role_code !== 'client') ??
    contexts[0];
  if (auth.status === 'loading') return <OperationalFeedback status="loading" />;
  if (auth.status === 'signedOut' || auth.status === 'expired') {
    return (
      <Navigate
        replace
        to={client ? paths.client : paths.team}
        state={auth.status === 'expired' ? { sessionExpired: true } : null}
      />
    );
  }
  if (auth.status !== 'authorized' || !context) {
    return (
      <OperationalFeedback
        status={auth.status === 'unavailable' ? 'unavailable' : 'denied'}
      />
    );
  }
  return (
    <AttachmentsWorkspace
      key={`${auth.sessionKey}:${context.office_id}:${context.role_code}:${context.permissions
        .slice()
        .sort()
        .join(',')}`}
      context={context}
      contexts={contexts}
      onOffice={setSelected}
    />
  );
}

function AttachmentsWorkspace({
  context,
  contexts,
  onOffice,
}: {
  context: AccessContext;
  contexts: AccessContext[];
  onOffice: (office: string) => void;
}) {
  const location = useLocation();
  const office = context.office_id;
  const client = context.role_code === 'client';
  const canUpload = client || context.permissions.includes('files.upload');
  const canCopy =
    !client &&
    context.permissions.includes('files.copy') &&
    context.permissions.includes('files.upload');
  const canManage = !client && context.permissions.includes('files.manage');

  const [request, setRequest] = useState<AttachmentRequestOption>();
  const [itemId, setItemId] = useState('');
  const [classification, setClassification] =
    useState<AttachmentClassification>('documento');
  const [file, setFile] = useState<File>();
  const [revision, setRevision] = useState(0);
  const [resource, setResource] = useState<{
    data?: AccumulatedAttachments;
    error?: AttachmentsError;
  }>({});
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<AttachmentsError>();
  const [feedback, setFeedback] = useState('');
  const [blocked, setBlocked] = useState(false);
  const [uploadOpen, setUploadOpen] = useState(false);
  const [manageOpen, setManageOpen] = useState(false);
  const [preview, setPreview] = useState<{
    file: AttachmentFile;
    bytes: Blob;
    url: string;
  }>();
  const [deletion, setDeletion] = useState<{
    file: AttachmentFile;
    key: string;
  }>();
  const [deleteUncertain, setDeleteUncertain] = useState(false);

  usePendingNavigation33(deleteUncertain || (busy && !!deletion));

  useEffect(
    () => () => {
      if (preview) URL.revokeObjectURL(preview.url);
    },
    [preview?.url],
  );

  const [copySource, setCopySource] = useState<AttachmentFile>();
  const [copyTarget, setCopyTarget] = useState<AttachmentRequestOption>();
  const [copyItem, setCopyItem] = useState('');

  const initialContext = useRef<AbortController | null>(null);
  const pending = useRef<AbortController | null>(null);
  const alive = useRef(true);
  const busyRef = useRef(false);
  const loadingMore = useRef(false);
  const idempotency = useRef(crypto.randomUUID());
  const copyKey = useRef(crypto.randomUUID());
  const fileInput = useRef<HTMLInputElement>(null);
  const feedbackElement = useRef<HTMLParagraphElement>(null);

  const filterKey = `${office}:${request?.id ?? 'all'}:${revision}`;
  const activeKeyRef = useRef(filterKey);
  activeKeyRef.current = filterKey;

  const item = request?.items.find(value => value.id === itemId);
  const policy = item?.policy ?? defaultPolicy;

  useEffect(() => {
    alive.current = true;
    return () => {
      alive.current = false;
      pending.current?.abort();
      initialContext.current?.abort();
    };
  }, []);

  const fail = useCallback((failure: AttachmentsError) => {
    setError(failure);
    if (failure.status === 401 || failure.status === 403) {
      setBlocked(true);
      setPreview(undefined);
      setDeletion(undefined);
      setDeleteUncertain(false);
      setResource({});
      setRequest(undefined);
      setFile(undefined);
      setCopySource(undefined);
      setCopyTarget(undefined);
      setUploadOpen(false);
      setManageOpen(false);
      pending.current?.abort();
      initialContext.current?.abort();
    }
  }, []);

  useEffect(() => {
    const target = location.state;
    if (
      target?.office_id !== office ||
      typeof target?.request_id !== 'string' ||
      !uuidPattern.test(target.request_id)
    ) {
      return;
    }
    const ctl = new AbortController();
    initialContext.current = ctl;
    const query =
      typeof target.request_protocol === 'string'
        ? target.request_protocol
        : target.request_id;
    attachmentsApi
      .requests(office, query, 1, REQUESTS_BATCH_SIZE, ctl.signal)
      .then(v => {
        if (ctl.signal.aborted) return;
        const found = v.items.find(x => x.id === target.request_id);
        if (found && !busyRef.current) {
          selectRequest(found, false);
        } else {
          fail(new AttachmentsError(404));
        }
      })
      .catch(e => {
        if (!ctl.signal.aborted) fail(attachmentsError(e));
      });
    return () => ctl.abort();
  }, [location.key, office, fail]);

  const loadMore = useCallback(
    (nextPage: number, expectedKey: string) => {
      if (loadingMore.current || blocked || activeKeyRef.current !== expectedKey) {
        return;
      }
      loadingMore.current = true;
      void attachmentsApi
        .search(office, request?.id ?? null, nextPage, REQUESTS_BATCH_SIZE)
        .then(pageData => {
          if (activeKeyRef.current !== expectedKey) return;
          setResource(old => {
            if (!old.data) return old;
            return {
              data: {
                items: mergeRequestPages(old.data.items, pageData.items),
                total: pageData.total,
                loadedPage: nextPage,
                lastBatchSize: pageData.items.length,
                portal: pageData.portal,
              },
            };
          });
        })
        .catch(() => {
          // Keep currently loaded files visible.
        })
        .finally(() => {
          if (activeKeyRef.current === expectedKey) {
            loadingMore.current = false;
          }
        });
    },
    [office, request?.id, blocked],
  );

  useEffect(() => {
    if (blocked) return;
    loadingMore.current = false;
    const controller = new AbortController();
    const expectedKey = filterKey;
    void attachmentsApi
      .search(
        office,
        request?.id ?? null,
        1,
        REQUESTS_BATCH_SIZE,
        controller.signal,
      )
      .then(data => {
        if (!controller.signal.aborted) {
          setResource({
            data: {
              items: data.items,
              total: data.total,
              loadedPage: 1,
              lastBatchSize: data.items.length,
              portal: data.portal,
            },
          });
        }
      })
      .catch(cause => {
        if (!controller.signal.aborted) {
          const failure = attachmentsError(cause);
          if (failure.status === 401 || failure.status === 403) fail(failure);
          else setResource(old => ({ ...old, error: failure }));
        }
      });
    return () => {
      controller.abort();
      if (activeKeyRef.current === expectedKey) {
        loadingMore.current = false;
      }
    };
  }, [office, request?.id, filterKey, blocked, fail]);

  const data = resource.data;

  useEffect(() => {
    if (blocked || !data || resource.error) return;
    if (
      shouldLoadMoreRequestPages({
        loadedCount: data.items.length,
        total: data.total,
        lastBatchSize: data.lastBatchSize,
        pageSize: REQUESTS_BATCH_SIZE,
        maxItems: REQUESTS_AUTO_LOAD_CAP,
      })
    ) {
      loadMore(data.loadedPage + 1, filterKey);
    }
  }, [blocked, data, resource.error, filterKey, loadMore]);

  function handleListScroll(event: UIEvent<HTMLUListElement>) {
    if (!data) return;
    const el = event.currentTarget;
    if (el.scrollHeight - el.scrollTop - el.clientHeight > 140) return;
    if (
      shouldLoadMoreRequestPages({
        loadedCount: data.items.length,
        total: data.total,
        lastBatchSize: data.lastBatchSize,
        pageSize: REQUESTS_BATCH_SIZE,
      })
    ) {
      loadMore(data.loadedPage + 1, filterKey);
    }
  }

  function run<T>(
    work: (signal: AbortSignal) => Promise<T>,
    accept: (result: T) => void,
  ) {
    if (busyRef.current || blocked) return;
    const controller = new AbortController();
    pending.current = controller;
    busyRef.current = true;
    setBusy(true);
    setError(undefined);
    setFeedback('');
    void (async () => {
      try {
        const result = await work(controller.signal);
        if (alive.current && !controller.signal.aborted) accept(result);
      } catch (cause) {
        if (alive.current && !controller.signal.aborted) {
          fail(attachmentsError(cause));
        }
      } finally {
        if (alive.current && pending.current === controller) {
          pending.current = null;
          busyRef.current = false;
          setBusy(false);
        }
      }
    })();
  }

  function removeFile() {
    if (!deletion) return;
    const attempt = deletion;
    run(
      async signal => {
        try {
          return await deleteAttachment(
            office,
            attempt.file,
            attempt.key,
            signal,
          );
        } catch (cause) {
          const failure = attachmentsError(cause);
          if (failure.status === 503) setDeleteUncertain(true);
          throw failure;
        }
      },
      result => {
        setDeletion(undefined);
        setDeleteUncertain(false);
        setResource(old =>
          old.data
            ? {
                data: {
                  ...old.data,
                  items: old.data.items.filter(f => f.id !== result.file_id),
                  total: Math.max(0, old.data.total - 1),
                },
              }
            : {},
        );
        setRevision(n => n + 1);
        setFeedback(
          'Arquivo excluído do armazenamento e dos registros de anexos.',
        );
      },
    );
  }

  function renewAttempt() {
    idempotency.current = crypto.randomUUID();
    setError(undefined);
    setFeedback('');
  }

  function selectRequest(value: AttachmentRequestOption, openModal = false) {
    if (busyRef.current) return;
    initialContext.current?.abort();
    initialContext.current = null;
    setFile(undefined);
    setClassification('documento');
    if (fileInput.current) fileInput.current.value = '';
    setRequest(value);
    setItemId('');
    setResource({});
    renewAttempt();
    if (openModal && canUpload && !value.closed && value.can_work !== false) {
      setUploadOpen(true);
    }
  }

  function acceptFile(result: AttachmentFile | null) {
    if (!result) return;
    setResource(old => ({
      data: old.data
        ? {
            ...old.data,
            items: [
              result,
              ...old.data.items.filter(value => value.id !== result.id),
            ],
            total:
              old.data.total +
              (old.data.items.some(value => value.id === result.id) ? 0 : 1),
          }
        : {
            items: [result],
            total: 1,
            loadedPage: 1,
            lastBatchSize: 1,
            portal: client,
          },
    }));
    setFeedback(
      result.status === 'aguardando_upload'
        ? 'Envio incompleto. Repita o envio com o mesmo arquivo para retomar.'
        : result.status === 'quarentena'
          ? 'Arquivo validado e mantido em quarentena.'
          : result.status === 'rejeitado'
            ? 'Arquivo rejeitado na validação. Confira o motivo.'
            : 'Operação de arquivo registrada.',
    );
  }

  function upload() {
    if (
      !request ||
      !file ||
      !canUpload ||
      request.closed ||
      request.can_work === false ||
      (request.items.length && !itemId)
    ) {
      return;
    }
    run(
      signal =>
        uploadAttachment(
          office,
          file,
          {
            request_id: request.id,
            request_item_id: itemId || null,
            classification,
            idempotency_key: idempotency.current,
          },
          policy,
          signal,
        ),
      result => {
        acceptFile(result.file);
        if (result.pending > 0 || result.file?.status === 'aguardando_upload') {
          setFeedback(
            'Envio incompleto. Repita o envio com o mesmo arquivo para retomar.',
          );
          return;
        }
        setFile(undefined);
        if (fileInput.current) fileInput.current.value = '';
        idempotency.current = crypto.randomUUID();
        if (result.file?.status === 'quarentena') {
          setUploadOpen(false);
          requestAnimationFrame(() => feedbackElement.current?.focus());
        }
      },
    );
  }

  const officeAction =
    contexts.length > 1 ? (
      <label className="team-field requests-office-select">
        Escritório
        <select
          value={office}
          disabled={busy || deleteUncertain}
          onChange={e => onOffice(e.target.value)}
        >
          {contexts.map(value => (
            <option
              key={`${value.office_id}:${value.role_code}`}
              value={value.office_id}
            >
              {value.office_name}
            </option>
          ))}
        </select>
      </label>
    ) : undefined;

  return (
    <OperationLayout
      office={office}
      client={client}
      viewportLock
      busy={busy || deleteUncertain}
    >
      <div className="requests-main is-viewport-screen is-list-view attachments-main">
        <OperationHeading
          context={context}
          showRole
          action={officeAction}
          title="Anexos privados"
          description={
            client
              ? 'Envie arquivos para seus próprios atendimentos.'
              : 'Arquivos dos atendimentos no seu escopo autorizado.'
          }
        />

        {!blocked && feedback && (
          <p
            ref={feedbackElement}
            tabIndex={-1}
            role="status"
            className="form-feedback requests-inline-feedback"
          >
            {feedback}
          </p>
        )}
        {!blocked && error && (
          <p role="alert" className="form-feedback error requests-inline-feedback">
            {error.message}
          </p>
        )}

        {blocked ? (
          <div className="team-empty">
            <p role="alert" className="form-feedback error">
              {error?.message}
            </p>
            <Link
              className="primary-button"
              to={client ? paths.client : paths.team}
            >
              <LogIn size={18} aria-hidden="true" />
              Verificar acesso
            </Link>
          </div>
        ) : preview ? (
          <section
            className="attachment-preview requests-subview-card"
            aria-label="Visualização do anexo"
          >
            <header className="requests-detail-head">
              <div className="requests-detail-meta">
                <button
                  data-operation-local-return
                  type="button"
                  className="requests-subview-back"
                  onClick={() => setPreview(undefined)}
                >
                  <ArrowLeft size={16} aria-hidden="true" />
                  <span>Voltar aos anexos</span>
                </button>
                <strong className="requests-offer-title">
                  {preview.file.name}
                </strong>
              </div>
              <span className="request-status-pill is-gold">
                Visualização privada
              </span>
            </header>
            <div className="requests-subview-scroll">
              <p className="customer-note">
                Visualização privada. A quarentena não libera cópia ou
                distribuição.
              </p>
              {preview.file.mime_type === 'application/pdf' ? (
                <PrivatePdfPreview
                  bytes={preview.bytes}
                  scope={`${office}:${preview.file.id}:${preview.file.updated_at}`}
                  title={preview.file.name}
                />
              ) : (
                <img src={preview.url} alt={preview.file.name} />
              )}
            </div>
          </section>
        ) : deletion ? (
          <section
            className="attachment-delete requests-subview-card"
            aria-label="Confirmar exclusão"
          >
            <header className="requests-detail-head">
              <div className="requests-detail-meta">
                <strong className="requests-offer-title">Excluir anexo</strong>
                <span className="request-status-pill is-danger">
                  Ação permanente
                </span>
              </div>
            </header>
            <div className="requests-subview-scroll">
              <p>
                <strong>{deletion.file.name}</strong>
              </p>
              <p className="customer-note">
                O arquivo será removido permanentemente do armazenamento e dos
                registros de anexos. Referências protegidas ou em uso impedem a
                exclusão.
              </p>
            </div>
            <div className="requests-subview-footer">
              <div className="account-actions">
                <button
                  className="primary-button"
                  disabled={busy}
                  onClick={removeFile}
                >
                  {deleteUncertain
                    ? 'Repetir exclusão'
                    : 'Excluir definitivamente'}
                </button>
                <button
                  data-operation-local-return
                  className="secondary-button"
                  disabled={busy || deleteUncertain}
                  onClick={() => {
                    setDeletion(undefined);
                    setError(undefined);
                  }}
                >
                  Cancelar exclusão
                </button>
              </div>
            </div>
          </section>
        ) : (
          <>
            {canManage && (
              <section
                className="requests-quick-panels is-single"
                aria-label="Atalhos de anexos"
              >
                <button
                  type="button"
                  className="requests-quick-card"
                  aria-expanded={manageOpen}
                  onClick={() => setManageOpen(true)}
                >
                  <span className="requests-quick-lead">
                    <Settings2 size={16} aria-hidden="true" />
                    <span>Gestão de anexos, políticas e limpeza controlada</span>
                  </span>
                  <ChevronRight size={17} aria-hidden="true" />
                </button>
              </section>
            )}

            <section
              className="requests-toolbar-card attachments-toolbar-card"
              aria-label="Filtro e envio de anexos"
            >
              <div className="attachments-picker-col">
                <span className="requests-field-label">
                  Atendimento vinculado
                </span>
                <AttachmentRequestPicker
                  office={office}
                  value={request}
                  client={client}
                  busy={busy}
                  onSelect={value => selectRequest(value, false)}
                  onFailure={fail}
                />
              </div>

              <div className="requests-actions-col attachments-actions-col">
                {request && (
                  <button
                    data-operation-local-return
                    type="button"
                    className="requests-circle-btn"
                    aria-label="Todos os atendimentos"
                    title="Limpar filtro de atendimento"
                    disabled={busy}
                    onClick={() => {
                      initialContext.current?.abort();
                      setRequest(undefined);
                      setItemId('');
                      setResource({});
                      renewAttempt();
                    }}
                  >
                    <X size={16} aria-hidden="true" />
                  </button>
                )}
                <button
                  type="button"
                  className="requests-circle-btn"
                  aria-label="Atualizar arquivos"
                  title="Atualizar arquivos"
                  disabled={busy}
                  onClick={() => setRevision(value => value + 1)}
                >
                  <RefreshCw size={17} aria-hidden="true" />
                </button>
                {canUpload && request && (
                  <button
                    type="button"
                    className="requests-square-btn is-primary"
                    aria-label="Enviar arquivo"
                    title="Enviar arquivo"
                    disabled={busy}
                    onClick={() => setUploadOpen(true)}
                  >
                    <Plus size={18} aria-hidden="true" />
                  </button>
                )}
              </div>
            </section>

            <p className="attachment-scanner-note" role="note">
              Antivírus não configurado. Arquivos válidos permanecem em
              quarentena. A visualização privada não libera cópia ou
              distribuição.
            </p>

            {resource.error && (
              <div className="requests-inline-error">
                <p role="alert" className="form-feedback error">
                  {resource.error.message}
                </p>
                <button
                  className="team-text-button"
                  onClick={() => setRevision(value => value + 1)}
                >
                  Tentar novamente
                </button>
              </div>
            )}

            <article className="requests-list-card">
              <div className="requests-list-card-head">
                <h2>ARQUIVOS PRIVADOS</h2>
                <span>{data ? formatRequestsResultCount(data.total) : ''}</span>
              </div>

              {data ? (
                data.items.length ? (
                  <ul
                    className="requests-scroll-list attachment-list"
                    aria-label="Arquivos privados"
                    onScroll={handleListScroll}
                  >
                    {data.items.map(value => {
                      const statusView = getAttachmentStatusPresentation(value);
                      return (
                        <li
                          key={value.id}
                          className="requests-list-row attachment-list-row"
                        >
                          <div className="requests-list-row-info">
                            <div className="attachment-file-heading">
                              <strong className="requests-list-row-title">
                                {value.name}
                              </strong>
                              <span
                                className={`request-status-pill is-${statusView.tone}`}
                              >
                                {statusView.label}
                              </span>
                            </div>
                            <div className="requests-list-row-meta">
                              <span className="requests-protocol-code">
                                {classificationNames[value.classification]} ·{' '}
                                {(value.size_bytes / 1024).toLocaleString(
                                  'pt-BR',
                                  { maximumFractionDigits: 1 },
                                )}{' '}
                                KiB ·{' '}
                                {new Date(value.created_at).toLocaleString(
                                  'pt-BR',
                                )}
                              </span>
                            </div>
                            {value.delete_pending && (
                              <p className="customer-note">
                                Há uma exclusão pendente. Após troca de sessão,
                                a retomada fica disponível em até 15 minutos.
                              </p>
                            )}
                            {value.validation_reason && (
                              <p className="form-feedback error">
                                {validationMessages[value.validation_reason] ??
                                  'Não foi possível validar este arquivo. Confira o envio e tente novamente.'}
                              </p>
                            )}
                            <details className="attachment-file-details">
                              <summary>Detalhes do arquivo</summary>
                              <p>Formato: {value.mime_type}</p>
                              <p className="attachment-hash">
                                SHA-256: {value.sha256}
                              </p>
                            </details>
                          </div>
                          <div className="attachment-file-actions">
                            {value.can_validate && value.intent_id && (
                              <button
                                type="button"
                                className="team-text-button"
                                disabled={busy}
                                onClick={() =>
                                  run(
                                    signal =>
                                      attachmentsApi.process(
                                        office,
                                        {
                                          action: 'validate',
                                          args: {
                                            intent_id: value.intent_id!,
                                          },
                                        },
                                        signal,
                                      ),
                                    result => acceptFile(result.file),
                                  )
                                }
                              >
                                Validar envio
                              </button>
                            )}
                            {value.can_preview && (
                              <button
                                type="button"
                                className="requests-circle-btn requests-view-btn"
                                disabled={busy}
                                aria-label={`Visualizar ${value.name}`}
                                title="Visualizar"
                                onClick={() =>
                                  run(
                                    signal =>
                                      previewAttachment(
                                        office,
                                        value.id,
                                        signal,
                                      ),
                                    result =>
                                      setPreview({
                                        file: value,
                                        bytes: result.bytes,
                                        url: URL.createObjectURL(result.bytes),
                                      }),
                                  )
                                }
                              >
                                <Eye size={17} aria-hidden="true" />
                              </button>
                            )}
                            {value.can_download && (
                              <button
                                type="button"
                                className="requests-circle-btn"
                                disabled={busy}
                                aria-label={`Baixar ${value.name}`}
                                title="Baixar"
                                onClick={() =>
                                  run(
                                    signal =>
                                      downloadAttachment(
                                        office,
                                        value.id,
                                        signal,
                                      ),
                                    () => setFeedback('Download preparado.'),
                                  )
                                }
                              >
                                <Download size={16} aria-hidden="true" />
                              </button>
                            )}
                            {value.can_copy && canCopy && (
                              <button
                                type="button"
                                className="requests-circle-btn"
                                disabled={busy}
                                aria-label={`Copiar ${value.name}`}
                                title="Copiar para outro atendimento"
                                onClick={() => {
                                  setCopySource(value);
                                  setCopyTarget(undefined);
                                  setCopyItem('');
                                  copyKey.current = crypto.randomUUID();
                                }}
                              >
                                <Copy size={16} aria-hidden="true" />
                              </button>
                            )}
                            {value.can_delete && (
                              <button
                                type="button"
                                className="requests-circle-btn is-danger-btn"
                                disabled={busy}
                                aria-label={`Excluir ${value.name}`}
                                title="Excluir"
                                onClick={() => {
                                  setError(undefined);
                                  setFeedback('');
                                  setDeletion({
                                    file: value,
                                    key: crypto.randomUUID(),
                                  });
                                }}
                              >
                                <Trash2 size={16} aria-hidden="true" />
                              </button>
                            )}
                          </div>
                        </li>
                      );
                    })}
                  </ul>
                ) : (
                  <div className="requests-list-empty">
                    <p className="team-empty">
                      Nenhum arquivo encontrado neste escopo. Selecione um
                      atendimento existente para enviar um anexo.
                    </p>
                  </div>
                )
              ) : (
                <div className="requests-list-empty" />
              )}

              <div className="requests-list-footer">
                <span>
                  {data
                    ? formatEntityTotal(data.total, 'arquivo', 'arquivos')
                    : 'Total: —'}
                </span>
              </div>
            </article>
          </>
        )}
      </div>

      {request && (
        <RequestsPanelModal
          open={uploadOpen}
          title="Envio de arquivo"
          locked={busy}
          onClose={() => setUploadOpen(false)}
        >
          <section className="attachment-upload" aria-label="Envio de arquivo">
            <p className="customer-note">
              Atendimento: <strong>{request.label}</strong>
            </p>
            {request.items.length > 0 && (
              <label className="team-field">
                Item do atendimento
                <select
                  value={itemId}
                  disabled={busy}
                  onChange={e => {
                    setItemId(e.target.value);
                    renewAttempt();
                  }}
                >
                  <option value="">Selecione o item correspondente</option>
                  {request.items.map(value => (
                    <option key={value.id} value={value.id}>
                      {value.name}
                    </option>
                  ))}
                </select>
              </label>
            )}
            {request.closed ? (
              <p className="customer-note">
                Atendimento encerrado. Consulte seus arquivos; novos envios
                exigem um atendimento aberto.
              </p>
            ) : request.can_work === false ? (
              <p className="customer-note">
                {client
                  ? 'Este atendimento não permite novos envios pelo seu acesso.'
                  : 'Você está acompanhando este atendimento. Somente o responsável atual pode enviar arquivos.'}
              </p>
            ) : (
              canUpload && (
                <form
                  onSubmit={event => {
                    event.preventDefault();
                    upload();
                  }}
                >
                  <p className="customer-note">
                    {policy.mime_types
                      .map(mime =>
                        mime === 'application/pdf'
                          ? 'PDF'
                          : mime === 'image/png'
                            ? 'PNG'
                            : 'JPEG',
                      )
                      .join(', ')}{' '}
                    · até {policy.max_bytes / 1024 / 1024} MiB
                    {policy.version ? ` · política v${policy.version}` : ''}
                  </p>
                  <div className="attachment-grid">
                    <label className="team-field">
                      Classificação
                      <select
                        disabled={busy}
                        value={classification}
                        onChange={e => {
                          setClassification(
                            e.target.value as AttachmentClassification,
                          );
                          renewAttempt();
                        }}
                      >
                        {Object.entries(classificationNames)
                          .filter(
                            ([v]) =>
                              !['medico', 'estrategico'].includes(v) ||
                              (!client &&
                                context.permissions.includes(
                                  'specialized.sensitive',
                                ) &&
                                context.permissions.includes(
                                  'specialized.manage',
                                )),
                          )
                          .map(([value, label]) => (
                            <option key={value} value={value}>
                              {label}
                            </option>
                          ))}
                      </select>
                    </label>
                    <label className="team-field">
                      Arquivo
                      <input
                        ref={fileInput}
                        type="file"
                        accept={policy.mime_types.join(',')}
                        disabled={busy}
                        onChange={e => {
                          setFile(e.target.files?.[0]);
                          renewAttempt();
                        }}
                      />
                    </label>
                  </div>
                  <button
                    className="primary-button attachment-submit"
                    disabled={
                      busy || !file || (!!request.items.length && !itemId)
                    }
                  >
                    Enviar arquivo
                  </button>
                </form>
              )
            )}
          </section>
        </RequestsPanelModal>
      )}

      {copySource && canCopy && (
        <RequestsPanelModal
          open={!!copySource}
          title={`Copiar ${copySource.name}`}
          locked={busy}
          onClose={() => setCopySource(undefined)}
        >
          <section className="attachment-copy" aria-label="Cópia privada">
            <AttachmentRequestPicker
              label="destino"
              office={office}
              value={copyTarget}
              client={false}
              busy={busy}
              inline
              onSelect={value => {
                setCopyTarget(value);
                setCopyItem('');
                copyKey.current = crypto.randomUUID();
              }}
              onFailure={fail}
            />
            {!!copyTarget?.items.length && (
              <label className="team-field">
                Item de destino
                <select
                  value={copyItem}
                  disabled={busy}
                  onChange={e => {
                    setCopyItem(e.target.value);
                    copyKey.current = crypto.randomUUID();
                  }}
                >
                  <option value="">Selecione o item correspondente</option>
                  {copyTarget.items.map(value => (
                    <option key={value.id} value={value.id}>
                      {value.name}
                    </option>
                  ))}
                </select>
              </label>
            )}
            <p className="customer-note">
              A cópia privada será validada e ficará em quarentena enquanto o
              antivírus não estiver configurado.
            </p>
            <div className="account-actions">
              <button
                className="primary-button"
                disabled={
                  busy ||
                  !copyTarget ||
                  copyTarget.closed ||
                  copyTarget.can_work === false ||
                  (!!copyTarget.items.length && !copyItem)
                }
                onClick={() => {
                  if (!copyTarget) return;
                  run(
                    signal =>
                      attachmentsApi.process(
                        office,
                        {
                          action: 'copy',
                          args: {
                            source_file_id: copySource.id,
                            target_request_id: copyTarget.id,
                            target_item_id: copyItem || null,
                            idempotency_key: copyKey.current,
                          },
                        },
                        signal,
                      ),
                    result => {
                      if (
                        result.pending > 0 ||
                        result.file?.status === 'aguardando_upload'
                      ) {
                        setFeedback(
                          'Cópia incompleta. Confirme novamente para retomar com o mesmo destino.',
                        );
                        return;
                      }
                      setCopySource(undefined);
                      setCopyTarget(undefined);
                      setRequest(undefined);
                      setItemId('');
                      setResource({});
                      setRevision(value => value + 1);
                      setFeedback(
                        result.file?.status === 'quarentena'
                          ? 'Cópia validada e mantida em quarentena.'
                          : 'Cópia registrada.',
                      );
                    },
                  );
                }}
              >
                Confirmar cópia
              </button>
              <button
                data-operation-local-return
                className="secondary-button"
                disabled={busy}
                onClick={() => setCopySource(undefined)}
              >
                Cancelar cópia
              </button>
            </div>
          </section>
        </RequestsPanelModal>
      )}

      {canManage && (
        <RequestsPanelModal
          open={manageOpen}
          title="Gestão de anexos"
          locked={busy}
          onClose={() => setManageOpen(false)}
        >
          <AttachmentManagement
            office={office}
            item={item}
            canPolicy={context.permissions.includes('services.manage')}
            busy={busy}
            run={run}
            onPolicy={updated =>
              setRequest(current =>
                current
                  ? {
                      ...current,
                      items: current.items.map(value =>
                        value.id === itemId
                          ? { ...value, policy: updated }
                          : value,
                      ),
                    }
                  : current,
              )
            }
          />
        </RequestsPanelModal>
      )}
    </OperationLayout>
  );
}
