import { useEffect, useRef, useState } from 'react';
import { Check, Copy, CreditCard, ExternalLink, QrCode, RefreshCw } from 'lucide-react';
import {
  buildManualWhatsAppPixShare,
  clientPaymentStateLabels,
  settlementStageLabels,
  terminalOperationStateLabels,
  terminalSaleModeLabels,
  type CheckoutIntent,
  type PaymentTerminal,
  type TerminalSaleMode,
} from '../../../shared/paymentCheckout';
import { cashMoney } from './CashSessions';
import { paymentCheckoutApi, PaymentCheckoutError } from '../payments/checkoutApi';
import { PixQrVisual } from '../payments/PixQrVisual';
import { paymentProvidersApi } from '../settings/paymentProvidersApi';

type Props = {
  office: string;
  officeName: string;
  chargeId: string;
  chargeVersion: number;
  protocol: string;
  serviceSummary: string;
  balanceCents: number;
  disabled?: boolean;
  onPaymentConfirmed?: () => void;
};

export function TeamCollectionPanel({
  office,
  officeName,
  chargeId,
  chargeVersion,
  protocol,
  serviceSummary,
  balanceCents,
  disabled = false,
  onPaymentConfirmed,
}: Props) {
  const [mode, setMode] = useState<'pix' | 'terminal'>('pix');
  const [terminals, setTerminals] = useState<PaymentTerminal[]>([]);
  const [pixAvailable, setPixAvailable] = useState<boolean | null>(null);
  const [terminalId, setTerminalId] = useState('');
  const [saleMode, setSaleMode] = useState<TerminalSaleMode>('credit_cash');
  const [installments, setInstallments] = useState(1);
  const [clientPhone, setClientPhone] = useState('');
  const [intent, setIntent] = useState<CheckoutIntent | null>(null);
  const [busy, setBusy] = useState(false);
  const [copied, setCopied] = useState<'pix' | 'wa' | null>(null);
  const [error, setError] = useState('');
  const [feedback, setFeedback] = useState('');
  const attemptRef = useRef<{ sig: string; key: string } | null>(null);

  useEffect(() => {
    const controller = new AbortController();
    void paymentProvidersApi
      .state(office, controller.signal)
      .then((res) => {
        if (controller.signal.aborted) return;
        const active = res.terminals.filter((t) => t.status === 'active');
        setTerminals(active);
        setPixAvailable(res.backend_ready && res.pix.enabled && res.pix.dynamic_qr_enabled && res.providers.some(provider =>
          provider.id === res.pix.provider_id && provider.connection_ready === true && provider.enabled_methods.includes('pix_qr'),
        ));
        if (active.length === 1) setTerminalId(active[0].id);
      })
      .catch(() => {
        // Non-admin staff might not have provider settings read access; backend enforces fail-closed
        if (!controller.signal.aborted) {
          setTerminals([]);
          setPixAvailable(null);
        }
      });
    return () => controller.abort();
  }, [office]);

  async function generatePix() {
    if (busy || disabled || balanceCents <= 0) return;
    const sig = `pix:${chargeId}:${chargeVersion}:${balanceCents}`;
    if (attemptRef.current?.sig !== sig) {
      attemptRef.current = { sig, key: `spix-${crypto.randomUUID()}` };
    }
    setBusy(true);
    setError('');
    setFeedback('');
    try {
      const created = await paymentCheckoutApi.staffGeneratePix({
        office_id: office,
        charge_id: chargeId,
        expected_charge_version: chargeVersion,
        amount_cents: balanceCents,
        idempotency_key: attemptRef.current.key,
      });
      setIntent(created);
      setFeedback(created.pix_copy_paste
        ? 'Código Pix disponível. Compartilhe e acompanhe a confirmação do pagamento.'
        : 'Solicitação Pix registrada. Aguarde o código do provedor.');
    } catch (cause) {
      const err = cause instanceof PaymentCheckoutError ? cause : new PaymentCheckoutError(503);
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  async function startTerminalSale() {
    if (busy || disabled || balanceCents <= 0) return;
    if (!terminalId) {
      setError('Selecione uma maquininha ativa vinculada ao escritório.');
      return;
    }
    const count = saleMode === 'credit_installment' ? installments : 1;
    const sig = `term:${chargeId}:${chargeVersion}:${terminalId}:${saleMode}:${count}:${balanceCents}`;
    if (attemptRef.current?.sig !== sig) {
      attemptRef.current = { sig, key: `sterm-${crypto.randomUUID()}` };
    }
    setBusy(true);
    setError('');
    setFeedback('');
    try {
      const created = await paymentCheckoutApi.staffStartTerminal({
        office_id: office,
        charge_id: chargeId,
        expected_charge_version: chargeVersion,
        terminal_id: terminalId,
        sale_mode: saleMode,
        installments_count: count,
        amount_cents: balanceCents,
        idempotency_key: attemptRef.current.key,
      });
      setIntent(created);
      setFeedback('Solicitação registrada. Acompanhe o retorno da maquininha.');
    } catch (cause) {
      const err = cause instanceof PaymentCheckoutError ? cause : new PaymentCheckoutError(503);
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  async function checkConfirmation() {
    if (busy || !intent?.id) return;
    setBusy(true);
    setError('');
    try {
      const updated = await paymentCheckoutApi.intentStatus(office, intent.id);
      setIntent(updated);
      setFeedback(`Situação atualizada: ${clientPaymentStateLabels[updated.state]}.`);
      if (updated.state === 'confirmed') {
        onPaymentConfirmed?.();
      }
    } catch (cause) {
      const err = cause instanceof PaymentCheckoutError ? cause : new PaymentCheckoutError(503);
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  async function copyText(kind: 'pix' | 'wa', text: string) {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(kind);
      setTimeout(() => setCopied(null), 2500);
    } catch {
      setFeedback('Selecione e copie o texto manualmente.');
    }
  }

  const share =
    intent?.pix_copy_paste
      ? buildManualWhatsAppPixShare({
          officeName,
          protocol,
          serviceSummary,
          amountCents: intent.amount_cents || balanceCents,
          pixCopyPaste: intent.pix_copy_paste,
          expiresAt: intent.expires_at,
          phoneDigits: clientPhone,
        })
      : null;

  return (
    <details className="service-section">
      <summary>Cobrar presencialmente ou via WhatsApp (Pix / Maquininha)</summary>
      <div className="jn-checkout-card">
        <p className="customer-note">
          Utiliza a mesma cobrança oficial ({protocol}) sem duplicar obrigação financeira. O envio por WhatsApp é
          manual (texto/link copiável) e independe de API oficial do WhatsApp.
        </p>

        <div role="tablist" aria-label="Meio de cobrança da equipe" className="team-tabs">
          <button
            type="button"
            role="tab"
            aria-selected={mode === 'pix'}
            onClick={() => {
              setMode('pix');
              setError('');
            }}
          >
            Pix dinâmico e WhatsApp
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={mode === 'terminal'}
            onClick={() => {
              setMode('terminal');
              setError('');
            }}
          >
            Cartão / Maquininha
          </button>
        </div>

        {error && (
          <p role="alert" className="form-feedback error">
            {error}
          </p>
        )}
        {feedback && (
          <p role="status" className="form-feedback">
            {feedback}
          </p>
        )}

        {mode === 'pix' ? (
          <div className="jn-pix-box">
            <dl className="jn-breakdown-grid">
              <div>
                <dt>Protocolo</dt>
                <dd>{protocol}</dd>
              </div>
              <div>
                <dt>Saldo em aberto</dt>
                <dd><strong>{cashMoney(balanceCents)}</strong></dd>
              </div>
            </dl>
            <label className="team-field">
              WhatsApp do cliente (opcional, somente números para abrir conversa)
              <input
                inputMode="tel"
                maxLength={20}
                placeholder="Ex.: 5561999999999"
                value={clientPhone}
                onChange={(e) => setClientPhone(e.target.value)}
              />
            </label>
            {pixAvailable === false && (
              <p role="note" className="customer-note">
                Provedor Pix não configurado ou inativo em Configurações → Bancos e Pagamentos. Ative um provedor
                homologado para gerar cobranças Pix dinâmicas.
              </p>
            )}
            <div className="account-actions">
              <button
                type="button"
                className="primary-button"
                disabled={busy || disabled || balanceCents <= 0 || pixAvailable === false}
                onClick={() => void generatePix()}
              >
                <QrCode size={18} aria-hidden="true" />
                <span>Gerar cobrança Pix dinâmica</span>
              </button>
            </div>
          </div>
        ) : (
          <div className="jn-pix-box">
            <div className="request-grid">
              <label className="team-field">
                Modalidade no cartão
                <select
                  value={saleMode}
                  disabled={busy || disabled}
                  onChange={(e) => {
                    const next = e.target.value as TerminalSaleMode;
                    setSaleMode(next);
                    if (next !== 'credit_installment') setInstallments(1);
                  }}
                >
                  {(Object.keys(terminalSaleModeLabels) as TerminalSaleMode[]).map((k) => (
                    <option key={k} value={k}>
                      {terminalSaleModeLabels[k]}
                    </option>
                  ))}
                </select>
              </label>

              {saleMode === 'credit_installment' && (
                <label className="team-field">
                  Parcelas
                  <select
                    value={installments}
                    disabled={busy || disabled}
                    onChange={(e) => setInstallments(Number(e.target.value))}
                  >
                    {Array.from({ length: 12 }, (_, idx) => idx + 1).map((n) => (
                      <option key={n} value={n}>
                        {n}x
                      </option>
                    ))}
                  </select>
                </label>
              )}

              <label className="team-field">
                Maquininha integrada
                <select
                  value={terminalId}
                  disabled={busy || disabled}
                  onChange={(e) => setTerminalId(e.target.value)}
                >
                  <option value="">
                    {terminals.length
                      ? 'Selecione uma maquininha ativa'
                      : 'Nenhuma maquininha integrada ativa'}
                  </option>
                  {terminals.map((t) => (
                    <option key={t.id} value={t.id}>
                      {t.label} · {t.manufacturer} {t.model} ({t.unit_name ?? 'Escritório'})
                    </option>
                  ))}
                </select>
              </label>
            </div>

            {!terminals.length && (
              <p className="customer-note">
                Nenhuma maquininha integrada está configurada ou ativa em Configurações → Bancos e Pagamentos. Para
                vendas em maquininha avulsa, use o registro no Caixa.
              </p>
            )}

            <div className="account-actions">
              <button
                type="button"
                className="primary-button"
                disabled={busy || disabled || !terminals.length || !terminalId || balanceCents <= 0}
                onClick={() => void startTerminalSale()}
              >
                <CreditCard size={18} aria-hidden="true" />
                <span>Enviar cobrança para a maquininha</span>
              </button>
            </div>
          </div>
        )}

        {intent && (
          <div className="jn-active-intent" aria-live="polite">
            <div className="jn-intent-head">
              <strong>
                Situação: {clientPaymentStateLabels[intent.state]}
              </strong>
              <span>{settlementStageLabels[intent.settlement_stage]}</span>
            </div>
            {intent.terminal_state && (
              <p className="customer-note">
                Estado da maquininha: <strong>{terminalOperationStateLabels[intent.terminal_state]}</strong>
                {intent.authorization_code ? ` · Autorização ${intent.authorization_code}` : ''}
              </p>
            )}
            {(intent.pix_qr_payload || intent.pix_copy_paste) && (
              <>
                <PixQrVisual
                  qrPayload={intent.pix_qr_payload ?? intent.pix_copy_paste}
                  expiresAt={intent.expires_at}
                  protocol={protocol}
                />
                {intent.pix_copy_paste && (
                  <>
                    <label className="team-field">
                      Pix Copia e Cola
                      <textarea readOnly rows={2} value={intent.pix_copy_paste} />
                    </label>
                    <div className="account-actions">
                      <button
                        type="button"
                        className="secondary-button"
                        onClick={() => void copyText('pix', intent.pix_copy_paste!)}
                      >
                        {copied === 'pix' ? <Check size={16} aria-hidden="true" /> : <Copy size={16} aria-hidden="true" />}
                        <span>{copied === 'pix' ? 'Pix copiado' : 'Copiar código Pix'}</span>
                      </button>
                      {share && (
                        <>
                          <button
                            type="button"
                            className="secondary-button"
                            onClick={() => void copyText('wa', share.text)}
                          >
                            {copied === 'wa' ? <Check size={16} aria-hidden="true" /> : <Copy size={16} aria-hidden="true" />}
                            <span>{copied === 'wa' ? 'Mensagem copiada' : 'Copiar mensagem para WhatsApp'}</span>
                          </button>
                          <a
                            className="team-text-button"
                            href={share.waUrl}
                            target="_blank"
                            rel="noopener noreferrer"
                          >
                            <ExternalLink size={16} aria-hidden="true" />
                            <span>Abrir WhatsApp (envio manual)</span>
                          </a>
                        </>
                      )}
                    </div>
                  </>
                )}
              </>
            )}
            <div className="account-actions">
              <button
                type="button"
                className="team-text-button"
                disabled={busy}
                onClick={() => void checkConfirmation()}
              >
                <RefreshCw size={16} aria-hidden="true" />
                <span>Atualizar confirmação real</span>
              </button>
            </div>
          </div>
        )}
      </div>
    </details>
  );
}
