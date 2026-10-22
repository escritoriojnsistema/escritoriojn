import { useCallback, useEffect, useRef, useState } from "react";
import { Link, Navigate } from "react-router-dom";
import { RefreshCw } from "lucide-react";
import type { AccessContext } from "../../../shared/access";
import {
  chargeAmountToCents,
  validInstallments,
  type ChargeView,
  type ChargeMutation,
  type InstallmentInput,
} from "../../../shared/charges";
import { paths } from "../../app/routes";
import { useAuth } from "../auth/AuthProvider";
import {
  OperationHeading,
  OperationLayout,
} from "../operation/OperationLayout";
import { OperationalFeedback } from "../operation/OperationalAccess";
import { ChargeRequestPicker } from "./ChargeRequestPicker";
import { chargesApi, ChargesError, chargesError } from "./api";
import "../team/team.css";
import "../customers/customers.css";
import "../services/services.css";
import "../requests/requests.css";
import "./charges.css";
const money = (cents: number) =>
  new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(
    cents / 100,
  );
const today = () => new Date().toLocaleDateString("en-CA");
const media =
  "(max-width: 900px), (hover: none) and (pointer: coarse) and (max-width: 1200px)";
export default function ChargesPage() {
  const auth = useAuth();
  const [office, setOffice] = useState("");
  const contexts = auth.contexts.filter(
    (c) =>
      c.role_code !== "client" &&
      c.permissions.includes("requests.read") &&
      c.permissions.includes("charges.read"),
  );
  const context = contexts.find((c) => c.office_id === office) ?? contexts[0];
  if (auth.status === "loading")
    return <OperationalFeedback status="loading" />;
  if (auth.status === "signedOut" || auth.status === "expired")
    return <Navigate replace to={paths.team} />;
  if (auth.status !== "authorized" || !context)
    return (
      <OperationalFeedback
        status={auth.status === "unavailable" ? "unavailable" : "denied"}
      />
    );
  return (
    <Workspace
      key={context.office_id}
      context={context}
      contexts={contexts}
      onOffice={setOffice}
    />
  );
}
function Workspace({
  context,
  contexts,
  onOffice,
}: {
  context: AccessContext;
  contexts: AccessContext[];
  onOffice: (id: string) => void;
}) {
  const [request, setRequest] = useState("");
  const [data, setData] = useState<ChargeView>();
  const [error, setError] = useState<ChargesError>();
  const [feedback, setFeedback] = useState("");
  const [blocked, setBlocked] = useState(false);
  const [busy, setBusy] = useState(false);
  const [revision, setRevision] = useState(0);
  const [page, setPage] = useState(1);
  const [size, setSize] = useState(() => (matchMedia(media).matches ? 3 : 5));
  const generation = useRef(0);
  const alive = useRef(true);
  const pending = useRef<AbortController | null>(null);
  const locked = useRef(false);
  useEffect(() => {
    alive.current = true;
    return () => {
      alive.current = false;
      pending.current?.abort();
    };
  }, []);
  useEffect(() => {
    const m = matchMedia(media);
    const change = () => setSize(m.matches ? 3 : 5);
    m.addEventListener("change", change);
    return () => m.removeEventListener("change", change);
  }, []);
  const fail = useCallback((cause: { status: number; code?: string }) => {
    const e = new ChargesError(cause.status, cause.code);
    setError(e);
    if ([401, 403, 404].includes(e.status)) {
      generation.current++;
      pending.current?.abort();
      setData(undefined);
      setRequest("");
      setFeedback("");
      if (e.status !== 404) setBlocked(true);
    }
  }, []);
  useEffect(() => {
    if (!request || blocked) return;
    const controller = new AbortController();
    const started = generation.current;
    void chargesApi
      .view(context.office_id, request, page, controller.signal)
      .then((v) => {
        if (!controller.signal.aborted && generation.current === started) {
          setData(v);
          setError(undefined);
        }
      })
      .catch((cause) => {
        if (!controller.signal.aborted && generation.current === started)
          fail(chargesError(cause));
      });
    return () => controller.abort();
  }, [request, page, revision, blocked, context.office_id, fail]);
  function select(id: string) {
    if (locked.current) return;
    generation.current++;
    setRequest(id);
    setData(undefined);
    setError(undefined);
    setFeedback("");
    setPage(1);
  }
  async function command(work: (signal: AbortSignal) => Promise<ChargeView>) {
    if (locked.current || blocked) return;
    locked.current = true;
    setBusy(true);
    setError(undefined);
    setFeedback("");
    const controller = new AbortController();
    pending.current = controller;
    const started = ++generation.current;
    try {
      const result = await work(controller.signal);
      if (
        alive.current &&
        !controller.signal.aborted &&
        started === generation.current
      ) {
        setData(result);
        setPage(1);
        setFeedback("Cobrança registrada com histórico preservado.");
      }
    } catch (cause) {
      if (
        alive.current &&
        !controller.signal.aborted &&
        started === generation.current
      )
        fail(chargesError(cause));
    } finally {
      if (alive.current && pending.current === controller) {
        pending.current = null;
        locked.current = false;
        setBusy(false);
      }
    }
  }
  return (
    <OperationLayout busy={busy}>
      <div className="charges-main">
        <OperationHeading
          context={context}
          showRole={false}
          title="Cobranças"
          description="Obrigações e parcelas dos atendimentos."
        />
        {contexts.length > 1 && (
          <label className="team-field">
            Escritório
            <select
              disabled={busy}
              value={context.office_id}
              onChange={(e) => onOffice(e.target.value)}
            >
              {contexts.map((c) => (
                <option key={c.office_id} value={c.office_id}>
                  {c.office_name}
                </option>
              ))}
            </select>
          </label>
        )}
        {feedback && (
          <p role="status" className="form-feedback">
            {feedback}
          </p>
        )}
        {error && (
          <p role="alert" className="form-feedback error">
            {error.message}
          </p>
        )}
        {blocked ? (
          <Link to={paths.team}>Verificar acesso</Link>
        ) : (
          <>
            {!request ? (
              <ChargeRequestPicker
                office={context.office_id}
                size={size}
                busy={busy}
                onSelect={select}
                onFailure={fail}
              />
            ) : (
              <div className="charges-toolbar">
                <strong>{data?.protocol ?? "Atendimento selecionado"}</strong>
                <button
                  className="team-text-button"
                  disabled={busy}
                  onClick={() => select("")}
                >
                  Trocar solicitação
                </button>
                <button
                  className="operation-icon-button charges-refresh"
                  aria-label="Atualizar cobrança"
                  title="Atualizar cobrança"
                  disabled={busy}
                  onClick={() => setRevision((n) => n + 1)}
                >
                  <RefreshCw size={18} aria-hidden="true" />
                </button>
              </div>
            )}
            {data && (
              <>
                <ul className="charges-items" aria-label="Itens da obrigação">
                  {data.items.map((i) => (
                    <li key={i.request_item_id}>
                      <span>
                        {i.name} · {i.quantity} × {money(i.unit_price_cents)}
                        {i.adjustment.kind !== "none" && (
                          <small className="charges-snapshot-adjustment">
                            Ajuste do item:{" "}
                            {
                              {
                                discount: "Desconto",
                                surcharge: "Acréscimo",
                                courtesy: "Cortesia",
                                override: "Preço definido",
                              }[i.adjustment.kind]
                            }{" "}
                            · {i.adjustment.reason}
                          </small>
                        )}
                      </span>
                      <strong>{money(i.total_cents)}</strong>
                    </li>
                  ))}
                </ul>
                {data.following_only && (
                  <p className="customer-note">
                    Acompanhamento: decisões exclusivas do responsável atual.
                  </p>
                )}
                {data.charge ? (
                  <>
                    <dl className="charges-totals">
                      <div>
                        <dt>Obrigação vigente</dt>
                        <dd>{money(data.charge.due_cents)}</dd>
                      </div>
                      <div>
                        <dt>Alocações / recebido</dt>
                        <dd>{money(data.charge.allocated_cents)}</dd>
                      </div>
                      <div>
                        <dt>Saldo em aberto</dt>
                        <dd>{money(data.charge.balance_cents)}</dd>
                      </div>
                    </dl>
                    <p className="customer-note">
                      Estado: {data.charge.status}. Saldo é obrigação, não
                      entrada de dinheiro.
                    </p>
                    <ul
                      className="charges-items"
                      aria-label="Parcelas vigentes"
                    >
                      {data.charge.installments.map((i) => (
                        <li key={i.number}>
                          <span>
                            Parcela {i.number} · {i.due_date}
                          </span>
                          <strong>{money(i.amount_cents)}</strong>
                        </li>
                      ))}
                    </ul>
                  </>
                ) : (
                  <p>
                    Total dos itens:{" "}
                    <strong>
                      {money(
                        data.items.reduce((sum, i) => sum + i.total_cents, 0),
                      )}
                    </strong>
                  </p>
                )}
                <ChargeDecisions
                  key={`${data.request_id}:${data.charge?.version ?? 0}`}
                  data={data}
                  busy={busy}
                  office={context.office_id}
                  command={command}
                />
                {data.charge && (
                  <details className="service-section">
                    <summary>Histórico da cobrança</summary>
                    <ul className="charges-items">
                      {data.charge.history.map((e) => (
                        <li key={e.id}>
                          <span>
                            {e.kind === "created"
                              ? "Criação"
                              : e.kind === "adjusted"
                                ? "Ajuste"
                                : "Cancelamento"}{" "}
                            · {e.actor_name ?? "Equipe"} ·{" "}
                            {new Date(e.created_at).toLocaleString("pt-BR")} ·{" "}
                            {e.reason}
                          </span>
                          <strong>{money(e.delta_cents)}</strong>
                        </li>
                      ))}
                    </ul>
                    {!data.charge.history.length && (
                      <p>Sem eventos nesta página.</p>
                    )}
                    <nav
                      className="team-pagination"
                      aria-label="Histórico da cobrança"
                    >
                      <button
                        className="team-text-button"
                        disabled={busy || page <= 1}
                        onClick={() => setPage((p) => p - 1)}
                      >
                        Anterior
                      </button>
                      <span>
                        {page}/
                        {Math.max(1, Math.ceil(data.charge.history_total / 5))}
                      </span>
                      <button
                        className="team-text-button"
                        disabled={busy || page * 5 >= data.charge.history_total}
                        onClick={() => setPage((p) => p + 1)}
                      >
                        Próxima
                      </button>
                    </nav>
                  </details>
                )}
              </>
            )}
          </>
        )}
      </div>
    </OperationLayout>
  );
}
function ChargeDecisions({
  data,
  busy,
  office,
  command,
}: {
  data: ChargeView;
  busy: boolean;
  office: string;
  command: (
    work: (signal: AbortSignal) => Promise<ChargeView>,
  ) => Promise<void>;
}) {
  const charge = data.charge;
  const total =
    charge?.due_cents ?? data.items.reduce((sum, i) => sum + i.total_cents, 0);
  const [direction, setDirection] = useState(
    charge?.can_discount ? "discount" : "surcharge",
  );
  const [amount, setAmount] = useState("");
  const [reason, setReason] = useState("");
  const [cancelReason, setCancelReason] = useState("");
  const [confirmed, setConfirmed] = useState(false);
  const [rows, setRows] = useState(() => [
    { due_date: today(), amount: (total / 100).toFixed(2) },
  ]);
  const [invalid, setInvalid] = useState("");
  const attempt = useRef<{ signature: string; key: string } | null>(null);
  function edit() {
    attempt.current = null;
    setInvalid("");
  }
  function key(payload: unknown) {
    const signature = JSON.stringify(payload);
    if (attempt.current?.signature !== signature)
      attempt.current = { signature, key: crypto.randomUUID() };
    return attempt.current!.key;
  }
  const delta =
    (chargeAmountToCents(amount) ?? 0) * (direction === "discount" ? -1 : 1);
  function plan(): InstallmentInput[] | null {
    const values = rows.map((r) => ({
      due_date: r.due_date,
      amount_cents: chargeAmountToCents(r.amount) ?? -1,
    }));
    const target = total + (charge ? delta : 0);
    return validInstallments(values) &&
      values.reduce((sum, r) => sum + r.amount_cents, 0) === target &&
      (target === 0 || values.every((r) => r.amount_cents > 0))
      ? values
      : null;
  }
  function submit() {
    const installments = plan();
    if (!installments || (charge && (!delta || reason.trim().length < 5))) {
      setInvalid(
        "Confira parcelas: soma exata, datas crescentes e motivo de 5 a 500 caracteres.",
      );
      return;
    }
    if (charge) {
      const mutation: ChargeMutation = {
        kind: "adjust",
        delta_cents: delta,
        reason: reason.trim(),
        installments,
      };
      const token = key({
        charge_id: charge.id,
        version: charge.version,
        mutation,
      });
      void command((signal) =>
        chargesApi.mutate(
          office,
          charge.id,
          charge.version,
          mutation,
          token,
          signal,
        ),
      );
    } else {
      const token = key({ request_id: data.request_id, installments });
      void command((signal) =>
        chargesApi.create(office, data.request_id, installments, token, signal),
      );
    }
  }
  const form = (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        submit();
      }}
      noValidate
    >
      <fieldset disabled={busy}>
        {charge && (
          <>
            <label className="team-field">
              Direção do ajuste
              <select
                value={direction}
                onChange={(e) => {
                  edit();
                  setDirection(e.target.value);
                }}
              >
                {charge.can_discount && (
                  <option value="discount">Desconto</option>
                )}
                {charge.can_surcharge && (
                  <option value="surcharge">Acréscimo</option>
                )}
              </select>
            </label>
            <label className="team-field">
              Valor do ajuste
              <input
                inputMode="decimal"
                value={amount}
                onChange={(e) => {
                  edit();
                  setAmount(e.target.value);
                }}
              />
            </label>
            <label className="team-field">
              Motivo do ajuste
              <input
                maxLength={500}
                value={reason}
                onChange={(e) => {
                  edit();
                  setReason(e.target.value);
                }}
              />
            </label>
            <p>Novo total: {money(total + delta)}</p>
          </>
        )}
        <label className="team-field">
          Quantidade de parcelas
          <select
            value={rows.length}
            onChange={(e) => {
              edit();
              const count = Number(e.target.value);
              const target = total + (charge ? delta : 0);
              setRows(
                Array.from({ length: count }, (_, i) => {
                  const date = new Date();
                  date.setDate(date.getDate() + i * 30);
                  return {
                    due_date: date.toLocaleDateString("en-CA"),
                    amount: (
                      (Math.floor(target / count) +
                        (i < target % count ? 1 : 0)) /
                      100
                    ).toFixed(2),
                  };
                }),
              );
            }}
          >
            {Array.from({ length: 12 }, (_, i) => (
              <option key={i + 1}>{i + 1}</option>
            ))}
          </select>
        </label>
        {rows.map((r, i) => (
          <div className="charges-plan" key={i}>
            <label className="team-field">
              Vencimento da parcela {i + 1}
              <input
                type="date"
                value={r.due_date}
                onChange={(e) => {
                  edit();
                  setRows((v) =>
                    v.map((row, j) =>
                      j === i ? { ...row, due_date: e.target.value } : row,
                    ),
                  );
                }}
              />
            </label>
            <label className="team-field">
              Valor da parcela {i + 1}
              <input
                inputMode="decimal"
                value={r.amount}
                onChange={(e) => {
                  edit();
                  setRows((v) =>
                    v.map((row, j) =>
                      j === i ? { ...row, amount: e.target.value } : row,
                    ),
                  );
                }}
              />
            </label>
          </div>
        ))}
        {invalid && (
          <p role="alert" className="form-feedback error">
            {invalid}
          </p>
        )}
        <button className="primary-button" disabled={busy}>
          {charge ? "Registrar ajuste" : "Registrar cobrança"}
        </button>
      </fieldset>
    </form>
  );
  return (
    <>
      {!charge && data.can_create && form}
      {charge?.can_adjust && (charge.can_discount || charge.can_surcharge) && (
        <details className="service-section">
          <summary>Ajustar obrigação</summary>
          {form}
        </details>
      )}
      {charge?.can_cancel && (
        <details className="service-section">
          <summary>Cancelar cobrança</summary>
          <form
            onSubmit={(e) => {
              e.preventDefault();
              if (!confirmed || cancelReason.trim().length < 5) {
                setInvalid("Informe o motivo e confirme o cancelamento.");
                return;
              }
              const mutation: ChargeMutation = {
                kind: "cancel",
                reason: cancelReason.trim(),
              };
              const token = key({
                charge_id: charge.id,
                version: charge.version,
                mutation,
              });
              void command((signal) =>
                chargesApi.mutate(
                  office,
                  charge.id,
                  charge.version,
                  mutation,
                  token,
                  signal,
                ),
              );
            }}
          >
            <fieldset disabled={busy}>
              <label className="team-field">
                Motivo do cancelamento
                <input
                  maxLength={500}
                  value={cancelReason}
                  onChange={(e) => {
                    edit();
                    setCancelReason(e.target.value);
                  }}
                />
              </label>
              <label className="charges-confirm">
                <input
                  type="checkbox"
                  checked={confirmed}
                  onChange={(e) => {
                    edit();
                    setConfirmed(e.target.checked);
                  }}
                />
                Confirmo cancelar a obrigação, preservando itens e histórico.
                Não é reembolso.
              </label>
              {invalid && (
                <p role="alert" className="form-feedback error">
                  {invalid}
                </p>
              )}
              <button
                className="secondary-button"
                disabled={busy || !confirmed}
              >
                Confirmar cancelamento
              </button>
            </fieldset>
          </form>
        </details>
      )}
    </>
  );
}
