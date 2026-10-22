import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { Search } from "lucide-react";
import {
  requestStatusLabels,
  requestStatuses,
  type RequestFilterStatus,
  type RequestPage,
} from "../../../shared/requests";
import { paths } from "../../app/routes";
import {
  requestsApi,
  requestsError,
  type RequestsError,
} from "../requests/api";
export function ChargeRequestPicker({
  office,
  size,
  busy,
  onSelect,
  onFailure,
}: {
  office: string;
  size: number;
  busy: boolean;
  onSelect: (id: string) => void;
  onFailure: (error: RequestsError) => void;
}) {
  const [filter, setFilter] = useState<RequestFilterStatus>(""),
    [status, setStatus] = useState<RequestFilterStatus>(""),
    [query, setQuery] = useState(""),
    [input, setInput] = useState(""),
    [page, setPage] = useState(1),
    [revision, setRevision] = useState(0),
    [data, setData] = useState<RequestPage>(),
    [error, setError] = useState<RequestsError>(),
    [pending, setPending] = useState(false);
  useEffect(() => {
    const controller = new AbortController();
    setPending(true);
    setError(undefined);
    void requestsApi
      .search(office, query, "queue", status, page, size, controller.signal)
      .then((v) => {
        if (!controller.signal.aborted) setData(v);
      })
      .catch((cause) => {
        if (!controller.signal.aborted) {
          const e = requestsError(cause);
          setError(e);
          if (e.status === 401 || e.status === 403) onFailure(e);
        }
      })
      .finally(() => {
        if (!controller.signal.aborted) setPending(false);
      });
    return () => controller.abort();
  }, [office, query, status, page, size, revision, onFailure]);
  return (
    <section aria-label="Selecionar atendimento">
      <form
        className="team-filters operation-filters"
        onSubmit={(e) => {
          e.preventDefault();
          setQuery(input.trim());
          setStatus(filter);
          setPage(1);
          setRevision((n) => n + 1);
        }}
      >
        <label className="team-field">
          Buscar solicitação
          <input
            type="search"
            maxLength={120}
            value={input}
            disabled={busy}
            onChange={(e) => setInput(e.target.value)}
          />
        </label>
        <label className="team-field">
          Status da solicitação
          <select
            value={filter}
            disabled={busy}
            onChange={(e) => setFilter(e.target.value as RequestFilterStatus)}
          >
            <option value="">Todos</option>
            {requestStatuses.map((s) => (
              <option key={s} value={s}>
                {requestStatusLabels[s]}
              </option>
            ))}
          </select>
        </label>
        <button className="secondary-button" disabled={busy}>
          <Search size={18} aria-hidden="true" />
          Buscar
        </button>
      </form>
      {error && (
        <p role="alert" className="form-feedback error">
          {error.message}
        </p>
      )}
      {data && (
        <>
          {!data.items.length ? (
            <p className="customer-note">
              Nenhuma solicitação disponível. Abra um atendimento ou ajuste a
              busca. <Link to={paths.requests}>Ir para solicitações</Link>
            </p>
          ) : (
            <ul className="request-option-list">
              {data.items.map((r) => (
                <li key={r.id}>
                  <span>
                    {r.protocol} · {r.title}
                  </span>
                  <button
                    className="team-text-button"
                    disabled={busy || pending}
                    aria-label={`Escolher solicitação ${r.protocol}`}
                    onClick={() => onSelect(r.id)}
                  >
                    Escolher
                  </button>
                </li>
              ))}
            </ul>
          )}
          <nav
            className="team-pagination"
            aria-label="Paginação de solicitações para cobrança"
          >
            <button
              className="team-text-button"
              disabled={busy || pending || page <= 1}
              onClick={() => setPage((p) => p - 1)}
            >
              Anterior
            </button>
            <span>
              {data.page}/{Math.max(1, Math.ceil(data.total / data.page_size))}
            </span>
            <button
              className="team-text-button"
              disabled={busy || pending || page * data.page_size >= data.total}
              onClick={() => setPage((p) => p + 1)}
            >
              Próxima
            </button>
          </nav>
        </>
      )}
    </section>
  );
}
