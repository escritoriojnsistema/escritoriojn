import { useEffect, useState, type FormEvent } from 'react';
import { Link } from 'react-router-dom';
import {
  Building2,
  Banknote,
  CheckCircle2,
  CreditCard,
  Plus,
  QrCode,
  RefreshCw,
  ShieldAlert,
  Smartphone,
  Activity,
} from 'lucide-react';
import {
  capabilityLabels,
  checkoutMethodLabels,
  isCapabilitySupported,
  providerCatalog,
  UNSUPPORTED_CAPABILITY_LABEL,
  type CheckoutMethod,
  type PaymentProvidersState,
  type ProviderCapabilityKey,
  type ProviderEnvironment,
  type ProviderReceivingOptions,
} from '../../../shared/paymentCheckout';
import type { CashNavigationState } from '../../../shared/manualPaymentFlow';
import { paths } from '../../app/routes';
import { useAuth } from '../auth/AuthProvider';
import { paymentProvidersApi, PaymentProvidersError } from './paymentProvidersApi';
import './paymentProviders.css';

type Tab = 'manual' | 'providers' | 'pix' | 'cards' | 'terminals' | 'diagnostics';

const ENV_LABELS: Record<ProviderEnvironment, string> = {
  sandbox: 'Sandbox / Testes',
  homologation: 'Homologação',
  production: 'Produção',
};

const ALL_CAPABILITIES: ProviderCapabilityKey[] = [
  'pix_dynamic_qr',
  'pix_copy_paste',
  'pix_query_status',
  'pix_reconciliation',
  'pix_refund',
  'card_credit_cash',
  'card_credit_installments',
  'card_debit_online',
  'card_refund',
  'card_dispute_tracking',
  'terminal_integrated',
  'terminal_local_agent',
  'webhook_signed',
];

export function PaymentProvidersSettings({
  office,
  onPendingChange,
}: {
  office: string;
  onPendingChange?: (pending: boolean) => void;
}) {
  const [tab, setTab] = useState<Tab>('providers');
  const [state, setState] = useState<PaymentProvidersState | null>(null);
  const [busy, setBusy] = useState(false);
  const [revision, setRevision] = useState(0);
  const [error, setError] = useState('');
  const [feedback, setFeedback] = useState('');

  const auth = useAuth();
  const officeContext = auth.contexts.find((c) => c.office_id === office && c.role_code !== 'client');
  const canManageCash = Boolean(officeContext?.permissions.includes('cash.manage'));

  const [cashConfig, setCashConfig] = useState<ProviderReceivingOptions | null>(null);
  const [cashConfigStatus, setCashConfigStatus] = useState<'loading' | 'ready' | 'forbidden' | 'error'>('loading');
  const [cashConfigError, setCashConfigError] = useState('');
  const [cashRevision, setCashRevision] = useState(0);

  // Tab A — Provider form
  const [providerCode, setProviderCode] = useState(providerCatalog[0].provider_code);
  const [institutionLabel, setInstitutionLabel] = useState('');
  const [environment, setEnvironment] = useState<ProviderEnvironment>('sandbox');
  const [credentialRef, setCredentialRef] = useState('');
  const [receivingAccountId, setReceivingAccountId] = useState('');
  const [financialUnitId, setFinancialUnitId] = useState('');
  const [enabledMethods, setEnabledMethods] = useState<CheckoutMethod[]>(['pix_qr', 'pix_copy_paste']);

  // Tab B — Pix form
  const [pixProviderId, setPixProviderId] = useState('');
  const [pixEnabled, setPixEnabled] = useState(false);
  const [pixDynamicQr, setPixDynamicQr] = useState(true);
  const [pixCopyPaste, setPixCopyPaste] = useState(true);
  const [pixExpiration, setPixExpiration] = useState(30);
  const [pixReconcile, setPixReconcile] = useState(true);
  const [pixRefund, setPixRefund] = useState(false);

  // Tab C — Online Cards form
  const [cardProviderId, setCardProviderId] = useState('');
  const [cardsEnabled, setCardsEnabled] = useState(false);
  const [creditEnabled, setCreditEnabled] = useState(true);
  const [debitEnabled, setDebitEnabled] = useState(false);
  const [installmentsEnabled, setInstallmentsEnabled] = useState(true);
  const [maxInstallments, setMaxInstallments] = useState(6);
  const [minInstallmentReais, setMinInstallmentReais] = useState('20,00');
  const [feePolicyNote, setFeePolicyNote] = useState('');

  // Tab D — Terminals form
  const [termProviderId, setTermProviderId] = useState('');
  const [termUnitId, setTermUnitId] = useState('');
  const [termLabel, setTermLabel] = useState('');
  const [termManufacturer, setTermManufacturer] = useState('');
  const [termModel, setTermModel] = useState('');
  const [termProviderName, setTermProviderName] = useState('');
  const [termConnectionMode, setTermConnectionMode] = useState<'cloud_api' | 'local_agent_connector'>('cloud_api');

  useEffect(() => {
    const refreshAccounts = () => {
      if (document.visibilityState === 'visible') setCashRevision(n => n + 1);
    };
    window.addEventListener('focus', refreshAccounts);
    return () => window.removeEventListener('focus', refreshAccounts);
  }, []);

  useEffect(() => {
    const controller = new AbortController();
    setCashConfigStatus('loading');
    setCashConfigError('');
    void paymentProvidersApi.receivingOptions(office, controller.signal)
      .then((cfg) => {
        if (controller.signal.aborted) return;
        setCashConfig(cfg);
        setCashConfigStatus('ready');
      })
      .catch((cause) => {
        if (controller.signal.aborted) return;
        const err = cause instanceof PaymentProvidersError ? cause : new PaymentProvidersError(503);
        setCashConfig(null);
        setCashConfigError(err.message);
        setCashConfigStatus(err.status === 401 || err.status === 403 ? 'forbidden' : 'error');
      });
    return () => controller.abort();
  }, [office, cashRevision, revision]);

  useEffect(() => {
    const controller = new AbortController();
    setError('');
    void paymentProvidersApi
      .state(office, controller.signal)
      .then((res) => {
        if (controller.signal.aborted) return;
        setState(res);
        setPixProviderId(res.pix.provider_id ?? '');
        setPixEnabled(res.pix.enabled);
        setPixDynamicQr(res.pix.dynamic_qr_enabled);
        setPixCopyPaste(res.pix.copy_paste_enabled);
        setPixExpiration(res.pix.expiration_minutes || 30);
        setPixReconcile(res.pix.reconciliation_enabled);
        setPixRefund(res.pix.refund_enabled);

        setCardProviderId(res.online_cards.provider_id ?? '');
        setCardsEnabled(res.online_cards.enabled);
        setCreditEnabled(res.online_cards.credit_enabled);
        setDebitEnabled(res.online_cards.debit_enabled);
        setInstallmentsEnabled(res.online_cards.installments_enabled);
        setMaxInstallments(res.online_cards.max_installments || 6);
        setMinInstallmentReais(((res.online_cards.min_installment_cents || 2000) / 100).toFixed(2).replace('.', ','));
        setFeePolicyNote(res.online_cards.fee_policy_note ?? '');
      })
      .catch((cause) => {
        if (controller.signal.aborted) return;
        const err = cause instanceof PaymentProvidersError ? cause : new PaymentProvidersError(503);
        setError(err.message);
      });
    return () => controller.abort();
  }, [office, revision]);

  async function runAction(work: () => Promise<PaymentProvidersState>, successMessage: string) {
    if (busy) return;
    setBusy(true);
    onPendingChange?.(true);
    setError('');
    setFeedback('');
    try {
      const next = await work();
      setState(next);
      setFeedback(successMessage);
    } catch (cause) {
      const err = cause instanceof PaymentProvidersError ? cause : new PaymentProvidersError(503);
      setError(err.message);
    } finally {
      setBusy(false);
      onPendingChange?.(false);
    }
  }

  const catalog = state?.catalog ?? providerCatalog;
  const selectedCatalog = catalog.find((c) => c.provider_code === providerCode) ?? catalog[0];
  const selectedPixProvider = state?.providers.find((p) => p.id === pixProviderId) ?? null;
  const selectedCardProvider = state?.providers.find((p) => p.id === cardProviderId) ?? null;
  const backendReady = state?.backend_ready ?? false;
  const receivingAccounts = (cashConfig?.accounts ?? []).filter(account => !financialUnitId || account.unit_id === financialUnitId);
  const cashConfigLinkState: CashNavigationState = {
    office_id: office,
    tab: 'configuration',
    configuration_unit_id: financialUnitId || undefined,
  };

  function handleUnitChange(nextUnitId: string) {
    setFinancialUnitId(nextUnitId);
    if (receivingAccountId && nextUnitId) {
      const stillValid = (cashConfig?.accounts ?? []).some(
        (a) => a.id === receivingAccountId && a.unit_id === nextUnitId,
      );
      if (!stillValid) setReceivingAccountId('');
    }
  }

  function toggleMethod(method: CheckoutMethod) {
    setEnabledMethods((old) =>
      old.includes(method) ? old.filter((m) => m !== method) : [...old, method],
    );
  }

  function handleSaveProvider(event: FormEvent) {
    event.preventDefault();
    if (institutionLabel.trim().length < 2) {
      setError('Informe o nome da instituição financeira ou provedor.');
      return;
    }
    void runAction(
      () =>
        paymentProvidersApi.saveProvider({
          office_id: office,
          provider_id: null,
          provider_code: providerCode,
          institution_label: institutionLabel.trim(),
          environment,
          enabled_methods: enabledMethods,
          receiving_account_id: receivingAccountId || null,
          financial_unit_id: financialUnitId || null,
          credential_ref: credentialRef.trim() || null,
          idempotency_key: `prov-${crypto.randomUUID()}`,
        }),
      'Integração de banco/provedor registrada. Valide a conexão antes de ativar em produção.',
    );
  }

  function handleSavePix(event: FormEvent) {
    event.preventDefault();
    void runAction(
      () =>
        paymentProvidersApi.savePix({
          office_id: office,
          provider_id: pixProviderId || null,
          enabled: pixEnabled,
          dynamic_qr_enabled: pixDynamicQr,
          copy_paste_enabled: pixCopyPaste,
          expiration_minutes: Math.max(5, Math.min(10080, Number(pixExpiration) || 30)),
          reconciliation_enabled: pixReconcile,
          refund_enabled: pixRefund,
          idempotency_key: `pixcfg-${crypto.randomUUID()}`,
        }),
      'Configurações de Pix salvas.',
    );
  }

  function handleSaveCards(event: FormEvent) {
    event.preventDefault();
    const minCents = Math.max(100, Math.round(Number(minInstallmentReais.replace(',', '.')) * 100) || 2000);
    void runAction(
      () =>
        paymentProvidersApi.saveCards({
          office_id: office,
          provider_id: cardProviderId || null,
          enabled: cardsEnabled,
          credit_enabled: creditEnabled,
          debit_enabled: debitEnabled,
          installments_enabled: installmentsEnabled,
          max_installments: Math.max(1, Math.min(12, Number(maxInstallments) || 1)),
          min_installment_cents: minCents,
          fee_policy_note: feePolicyNote.trim() || null,
          idempotency_key: `cardcfg-${crypto.randomUUID()}`,
        }),
      'Configurações de cartões online salvas.',
    );
  }

  function handleSaveTerminal(event: FormEvent) {
    event.preventDefault();
    if (!termLabel.trim() || !termManufacturer.trim() || !termModel.trim() || !termProviderName.trim()) {
      setError('Preencha identificação, fabricante, modelo e adquirente/provedor da maquininha.');
      return;
    }
    void runAction(
      () =>
        paymentProvidersApi.saveTerminal({
          office_id: office,
          terminal_id: null,
          provider_id: termProviderId || null,
          label: termLabel.trim(),
          manufacturer: termManufacturer.trim(),
          model: termModel.trim(),
          provider_name: termProviderName.trim(),
          connection_mode: termConnectionMode,
          unit_id: termUnitId || null,
          idempotency_key: `termcfg-${crypto.randomUUID()}`,
        }),
      'Cadastro da maquininha salvo. Ainda é necessário integrar o modelo com a operadora.',
    );
  }

  return (
    <section className="jn-providers-shell" aria-label="Configuração de Bancos e Pagamentos">
      <div className="jn-providers-banner" role="note">
        <ShieldAlert size={20} className="jn-banner-icon" aria-hidden="true" />
        <div>
          <strong>Segurança de credenciais bancárias</strong>
          <p>
            O Escritório JN não armazena senhas de conta bancária nem solicita segredos sensíveis no navegador. Utilize
            apenas credenciais oficiais de API/certificados configuradas no servidor e referenciadas por identificador.
          </p>
        </div>
      </div>

      {!backendReady && (
        <p role="note" className="form-feedback">
          Estado atual: interface preparada com contratos oficiais; persistência e validação real de credenciais
          aguardam ativação no servidor.
        </p>
      )}
      {feedback && (
        <p role="status" className="form-feedback">
          {feedback}
        </p>
      )}
      {error && (
        <p role="alert" className="form-feedback error">
          {error}
        </p>
      )}

      <div className="team-toolbar">
        <div role="tablist" aria-label="Abas de Bancos e Pagamentos" className="team-tabs">
          <button type="button" role="tab" aria-selected={tab === 'manual'} onClick={() => setTab('manual')}>
            <Banknote size={16} aria-hidden="true" />
            <span>Pagamentos manuais</span>
          </button>
          <button type="button" role="tab" aria-selected={tab === 'providers'} onClick={() => setTab('providers')}>
            <Building2 size={16} aria-hidden="true" />
            <span>Bancos e provedores</span>
          </button>
          <button type="button" role="tab" aria-selected={tab === 'pix'} onClick={() => setTab('pix')}>
            <QrCode size={16} aria-hidden="true" />
            <span>Pix</span>
          </button>
          <button type="button" role="tab" aria-selected={tab === 'cards'} onClick={() => setTab('cards')}>
            <CreditCard size={16} aria-hidden="true" />
            <span>Cartões online</span>
          </button>
          <button type="button" role="tab" aria-selected={tab === 'terminals'} onClick={() => setTab('terminals')}>
            <Smartphone size={16} aria-hidden="true" />
            <span>Maquininhas</span>
          </button>
          <button type="button" role="tab" aria-selected={tab === 'diagnostics'} onClick={() => setTab('diagnostics')}>
            <Activity size={16} aria-hidden="true" />
            <span>Histórico e diagnósticos</span>
          </button>
        </div>
        <button
          type="button"
          className="operation-icon-button"
          aria-label="Atualizar configurações de pagamento"
          disabled={busy}
          onClick={() => setRevision((n) => n + 1)}
        >
          <RefreshCw size={18} aria-hidden="true" />
        </button>
      </div>

      {tab === 'manual' && (
        <section className="jn-provider-card" aria-label="Pagamentos manuais no Caixa">
          <h3>Pix, boleto e cartão</h3>
          <ul className="finance-ledger">
            <li><strong>Pix manual</strong><p>Confira o crédito no extrato e informe o pagamento no Caixa.</p></li>
            <li><strong>Boleto manual</strong><p>Vincule a forma Boleto a uma conta bancária. Registre o recebimento depois de conferir o crédito.</p></li>
            <li><strong>Cartão na maquininha</strong><p>Realize a venda no terminal e informe o valor, a taxa e a referência do comprovante no Caixa.</p></li>
          </ul>
          <div className="account-actions">
            {canManageCash && <Link className="secondary-button" to={paths.cash} state={{ office_id: office, tab: 'configuration' }}>Configurar formas no Caixa</Link>}
            {officeContext?.permissions.includes('cash.read') && <Link className="primary-button" to={paths.cash} state={{ office_id: office, tab: 'own' }}>Abrir meu Caixa</Link>}
          </div>
        </section>
      )}

      {/* TAB A — BANCOS E PROVEDORES */}
      {tab === 'providers' && (
        <div className="jn-providers-grid">
          <div className="jn-provider-card">
            <h3>Bancos e provedores cadastrados</h3>
            <p className="customer-note">A ativação automática depende da integração oficial com a instituição.</p>
            {!state?.providers.length ? (
              <p className="team-empty">Nenhum banco ou provedor configurado neste escritório.</p>
            ) : (
              <ul className="finance-ledger" aria-label="Bancos e provedores configurados">
                {state.providers.map((p) => (
                  <li key={p.id}>
                    <div className="cash-session-heading">
                      <strong>
                        {p.institution_label} · {p.display_name}
                      </strong>
                      <span className="jn-payment-state">
                        {ENV_LABELS[p.environment]} · {p.status}
                      </span>
                    </div>
                    <p className="customer-note">
                      Conta destino: {p.receiving_account_name ?? 'Não vinculada'} · Unidade:{' '}
                      {p.financial_unit_name ?? 'Geral'} · Ref. credencial: {p.credential_ref ?? 'Não vinculada'}
                    </p>
                    <p className="customer-note">
                      Última validação:{' '}
                      {p.last_validated_at ? new Date(p.last_validated_at).toLocaleString('pt-BR') : 'Nunca validada'} ·
                      Homologado: {p.homologated ? 'Sim' : 'Não'}
                    </p>
                    {p.last_error_safe && (
                      <p role="alert" className="form-feedback error">
                        {p.last_error_safe}
                      </p>
                    )}
                    <div className="account-actions">
                      <button
                        type="button"
                        className="secondary-button"
                        disabled={busy || !backendReady}
                        onClick={() =>
                          void runAction(
                            () => paymentProvidersApi.validateProvider(office, p.id),
                            `Disponibilidade atualizada para ${p.institution_label}.`,
                          )
                        }
                      >
                        <CheckCircle2 size={16} aria-hidden="true" />
                        <span>Consultar situação do cadastro</span>
                      </button>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </div>

          <form className="jn-provider-card" onSubmit={handleSaveProvider} noValidate>
            <h3>Adicionar ou atualizar provedor</h3>
            <fieldset disabled={busy || !backendReady}>
              <label className="team-field">
                Perfil de adaptador / provedor
                <select value={providerCode} onChange={(e) => setProviderCode(e.target.value)}>
                  {catalog.map((c) => (
                    <option key={c.provider_code} value={c.provider_code}>
                      {c.display_name}
                    </option>
                  ))}
                </select>
              </label>
              <p className="customer-note">{selectedCatalog.notes}</p>

              <label className="team-field">
                Instituição financeira / identificação interna
                <input
                  maxLength={120}
                  placeholder="Ex.: Banco Cooperativo — Conta Principal"
                  value={institutionLabel}
                  onChange={(e) => setInstitutionLabel(e.target.value)}
                />
              </label>

              <div className="request-grid">
                <label className="team-field">
                  Ambiente
                  <select
                    value={environment}
                    onChange={(e) => setEnvironment(e.target.value as ProviderEnvironment)}
                  >
                    <option value="sandbox">Sandbox / Testes</option>
                    <option value="homologation">Homologação</option>
                    <option value="production">Produção</option>
                  </select>
                </label>

                <label className="team-field">
                  Referência de credencial no servidor (sem segredo)
                  <input
                    maxLength={120}
                    placeholder="Ex.: vault://escritorio/pix"
                    value={credentialRef}
                    onChange={(e) => setCredentialRef(e.target.value)}
                  />
                </label>
              </div>

              <div className="request-grid">
                <label className="team-field">
                  Unidade / destino financeiro
                  <select
                    value={financialUnitId}
                    disabled={cashConfigStatus === 'loading'}
                    onChange={(e) => handleUnitChange(e.target.value)}
                  >
                    <option value="">Geral do escritório</option>
                    {(cashConfig?.units ?? []).map((u) => (
                      <option key={u.id} value={u.id}>
                        {u.name}
                      </option>
                    ))}
                  </select>
                </label>

                <label className="team-field">
                  Conta recebedora vinculada (bancária ou digital ativa)
                  <select
                    value={receivingAccountId}
                    disabled={cashConfigStatus !== 'ready'}
                    onChange={(e) => setReceivingAccountId(e.target.value)}
                  >
                    <option value="">
                      {cashConfigStatus === 'loading'
                        ? 'Carregando contas financeiras...'
                        : cashConfigStatus === 'error'
                          ? 'Falha ao carregar contas financeiras'
                          : cashConfigStatus === 'forbidden'
                            ? 'Sem permissão para consultar contas'
                            : receivingAccounts.length > 0
                              ? 'Definir na conciliação / padrão do caixa'
                              : 'Nenhuma conta bancária ou digital ativa disponível'}
                    </option>
                    {receivingAccounts.map((a) => {
                      const unitName = cashConfig?.units.find((u) => u.id === a.unit_id)?.name;
                      return (
                        <option key={a.id} value={a.id}>
                          {a.name}
                          {!financialUnitId && unitName ? ` · ${unitName}` : ''}
                        </option>
                      );
                    })}
                  </select>
                </label>
              </div>

              <div className="jn-inline-alert" role={cashConfigStatus === 'error' || cashConfigStatus === 'forbidden' ? 'alert' : 'note'}>
                {cashConfigStatus === 'loading' && (
                  <p className="customer-note">Consultando unidades e contas financeiras ativas deste escritório...</p>
                )}
                {cashConfigStatus === 'error' && (
                  <>
                    <p className="form-feedback error">
                      Não foi possível carregar as contas financeiras do escritório: {cashConfigError}
                    </p>
                    <button
                      type="button"
                      className="secondary-button"
                      onClick={() => setCashRevision((n) => n + 1)}
                    >
                      Tentar novamente
                    </button>
                  </>
                )}
                {cashConfigStatus === 'forbidden' && (
                  <p className="form-feedback error">
                    Seu acesso não permite consultar contas recebedoras neste escritório.
                  </p>
                )}
                {cashConfigStatus === 'ready' && receivingAccounts.length === 0 && (
                  <p className="customer-note">
                    Nenhuma conta bancária ou digital ativa cadastrada
                    {financialUnitId ? ' para a unidade selecionada' : ' neste escritório'}.
                  </p>
                )}
                <div className="account-actions">
                  <button
                    type="button"
                    className="team-text-button"
                    disabled={cashConfigStatus === 'loading'}
                    onClick={() => setCashRevision((n) => n + 1)}
                  >
                    <RefreshCw size={15} aria-hidden="true" />
                    <span>Atualizar contas financeiras</span>
                  </button>
                  {canManageCash && (
                    <Link className="team-text-button" to={paths.cash} state={cashConfigLinkState}>
                      <Plus size={15} aria-hidden="true" />
                      <span>Criar ou gerenciar contas no Caixa</span>
                    </Link>
                  )}
                </div>
              </div>

              <div className="jn-capability-matrix">
                <h4>Recursos previstos no perfil do provedor</h4>
                <ul>
                  {ALL_CAPABILITIES.map((cap) => {
                    const supported = isCapabilitySupported(selectedCatalog.supported_capabilities, cap);
                    return (
                      <li key={cap} className={supported ? 'cap-yes' : 'cap-no'}>
                        <span>{capabilityLabels[cap]}</span>
                        <strong>{supported ? 'Requer integração oficial' : UNSUPPORTED_CAPABILITY_LABEL}</strong>
                      </li>
                    );
                  })}
                </ul>
              </div>

              <fieldset className="jn-method-checks">
                <legend>Meios habilitados para esta integração</legend>
                {(['pix_qr', 'pix_copy_paste', 'credit_card', 'installments', 'debit_card'] as CheckoutMethod[]).map(
                  (m) => {
                    const capKey: ProviderCapabilityKey =
                      m === 'pix_qr'
                        ? 'pix_dynamic_qr'
                        : m === 'pix_copy_paste'
                          ? 'pix_copy_paste'
                          : m === 'credit_card'
                            ? 'card_credit_cash'
                            : m === 'installments'
                              ? 'card_credit_installments'
                              : 'card_debit_online';
                    const supported = isCapabilitySupported(selectedCatalog.supported_capabilities, capKey);
                    return (
                      <label key={m} className="jn-check-row">
                        <input
                          type="checkbox"
                          disabled={!supported}
                          checked={supported && enabledMethods.includes(m)}
                          onChange={() => toggleMethod(m)}
                        />
                        <span>
                          {checkoutMethodLabels[m]}
                          {!supported ? ` (${UNSUPPORTED_CAPABILITY_LABEL})` : ''}
                        </span>
                      </label>
                    );
                  },
                )}
              </fieldset>
            </fieldset>

            <button type="submit" className="primary-button" disabled={busy || !backendReady}>
              Salvar integração bancária
            </button>
          </form>
        </div>
      )}

      {/* TAB B — PIX */}
      {tab === 'pix' && (
        <form className="jn-provider-card" onSubmit={handleSavePix} noValidate>
          <h3>Configuração de Pix</h3>
          <p className="customer-note">
            Cobrança Pix dinâmica com QR Code, Copia e Cola, consulta de transação, conciliação e política de expiração.
          </p>
          <fieldset disabled={busy || !backendReady}>
            <label className="team-field">
              Provedor Pix vinculado
              <select value={pixProviderId} onChange={(e) => setPixProviderId(e.target.value)}>
                <option value="">Nenhum provedor selecionado</option>
                {(state?.providers ?? []).map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.institution_label} ({ENV_LABELS[p.environment]})
                  </option>
                ))}
              </select>
            </label>

            {state?.pix.pix_key_masked && (
              <p className="customer-note">Chave Pix vinculada no servidor: {state.pix.pix_key_masked}</p>
            )}

            <label className="jn-check-row">
              <input type="checkbox" checked={pixEnabled} onChange={(e) => setPixEnabled(e.target.checked)} />
              <span>Habilitar cobrança Pix eletrônica para este escritório</span>
            </label>
            <label className="jn-check-row">
              <input
                type="checkbox"
                checked={pixDynamicQr}
                disabled={selectedPixProvider ? !selectedPixProvider.capabilities.pix_dynamic_qr : false}
                onChange={(e) => setPixDynamicQr(e.target.checked)}
              />
              <span>
                QR Code dinâmico vinculado à cobrança oficial
                {selectedPixProvider && !selectedPixProvider.capabilities.pix_dynamic_qr
                  ? ` — ${UNSUPPORTED_CAPABILITY_LABEL}`
                  : ''}
              </span>
            </label>
            <label className="jn-check-row">
              <input
                type="checkbox"
                checked={pixCopyPaste}
                disabled={selectedPixProvider ? !selectedPixProvider.capabilities.pix_copy_paste : false}
                onChange={(e) => setPixCopyPaste(e.target.checked)}
              />
              <span>Código Pix Copia e Cola</span>
            </label>
            <label className="jn-check-row">
              <input
                type="checkbox"
                checked={pixReconcile}
                disabled={selectedPixProvider ? !selectedPixProvider.capabilities.pix_reconciliation : false}
                onChange={(e) => setPixReconcile(e.target.checked)}
              />
              <span>Conciliação e consulta automática de liquidação Pix</span>
            </label>
            <label className="jn-check-row">
              <input
                type="checkbox"
                checked={pixRefund}
                disabled={selectedPixProvider ? !selectedPixProvider.capabilities.pix_refund : false}
                onChange={(e) => setPixRefund(e.target.checked)}
              />
              <span>
                Devolução Pix pelo provedor
                {selectedPixProvider && !selectedPixProvider.capabilities.pix_refund
                  ? ` — ${UNSUPPORTED_CAPABILITY_LABEL}`
                  : ''}
              </span>
            </label>

            <label className="team-field">
              Expiração padrão da cobrança Pix (minutos)
              <input
                type="number"
                min={5}
                max={10080}
                value={pixExpiration}
                onChange={(e) => setPixExpiration(Number(e.target.value))}
              />
            </label>
          </fieldset>
          <button type="submit" className="primary-button" disabled={busy || !backendReady}>
            Salvar configuração de Pix
          </button>
        </form>
      )}

      {/* TAB C — CARTÕES ONLINE */}
      {tab === 'cards' && (
        <form className="jn-provider-card" onSubmit={handleSaveCards} noValidate>
          <h3>Configuração de Cartões Online</h3>
          <p className="customer-note">
            Regras para pagamento no Portal do Cliente. Taxas de adquirente permanecem separadas de descontos
            comerciais.
          </p>
          <fieldset disabled={busy || !backendReady}>
            <label className="team-field">
              Provedor de cartões online
              <select value={cardProviderId} onChange={(e) => setCardProviderId(e.target.value)}>
                <option value="">Nenhum provedor selecionado</option>
                {(state?.providers ?? []).map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.institution_label} ({ENV_LABELS[p.environment]})
                  </option>
                ))}
              </select>
            </label>

            <label className="jn-check-row">
              <input type="checkbox" checked={cardsEnabled} onChange={(e) => setCardsEnabled(e.target.checked)} />
              <span>Habilitar pagamento com cartão online no Portal do Cliente</span>
            </label>
            <label className="jn-check-row">
              <input
                type="checkbox"
                checked={creditEnabled}
                disabled={selectedCardProvider ? !selectedCardProvider.capabilities.card_credit_cash : false}
                onChange={(e) => setCreditEnabled(e.target.checked)}
              />
              <span>
                Cartão de crédito à vista
                {selectedCardProvider && !selectedCardProvider.capabilities.card_credit_cash
                  ? ` — ${UNSUPPORTED_CAPABILITY_LABEL}`
                  : ''}
              </span>
            </label>
            <label className="jn-check-row">
              <input
                type="checkbox"
                checked={installmentsEnabled}
                disabled={selectedCardProvider ? !selectedCardProvider.capabilities.card_credit_installments : false}
                onChange={(e) => setInstallmentsEnabled(e.target.checked)}
              />
              <span>
                Parcelamento no cartão de crédito
                {selectedCardProvider && !selectedCardProvider.capabilities.card_credit_installments
                  ? ` — ${UNSUPPORTED_CAPABILITY_LABEL}`
                  : ''}
              </span>
            </label>
            <label className="jn-check-row">
              <input
                type="checkbox"
                checked={debitEnabled}
                disabled={selectedCardProvider ? !selectedCardProvider.capabilities.card_debit_online : false}
                onChange={(e) => setDebitEnabled(e.target.checked)}
              />
              <span>
                Cartão de débito online
                {selectedCardProvider && !selectedCardProvider.capabilities.card_debit_online
                  ? ` — ${UNSUPPORTED_CAPABILITY_LABEL}`
                  : ''}
              </span>
            </label>

            <div className="request-grid">
              <label className="team-field">
                Máximo de parcelas
                <select value={maxInstallments} onChange={(e) => setMaxInstallments(Number(e.target.value))}>
                  {Array.from({ length: 12 }, (_, idx) => idx + 1).map((n) => (
                    <option key={n} value={n}>
                      Até {n}x
                    </option>
                  ))}
                </select>
              </label>
              <label className="team-field">
                Valor mínimo por parcela (R$)
                <input
                  inputMode="decimal"
                  maxLength={12}
                  value={minInstallmentReais}
                  onChange={(e) => setMinInstallmentReais(e.target.value)}
                />
              </label>
            </div>

            <label className="team-field">
              Política de taxas, prazos de liquidação e contestações (nota interna)
              <textarea
                rows={2}
                maxLength={240}
                value={feePolicyNote}
                placeholder="Ex.: Liquidação D+30 crédito / D+1 débito; contestações acompanhadas via painel do adquirente"
                onChange={(e) => setFeePolicyNote(e.target.value)}
              />
            </label>
          </fieldset>
          <button type="submit" className="primary-button" disabled={busy || !backendReady}>
            Salvar configuração de cartões online
          </button>
        </form>
      )}

      {/* TAB D — MAQUININHAS */}
      {tab === 'terminals' && (
        <div className="jn-providers-grid">
          <div className="jn-provider-card">
            <h3>Maquininhas cadastradas</h3>
            {!state?.terminals.length ? (
              <p className="team-empty">Nenhuma maquininha cadastrada neste escritório.</p>
            ) : (
              <ul className="finance-ledger" aria-label="Lista de maquininhas">
                {state.terminals.map((t) => (
                  <li key={t.id}>
                    <div className="cash-session-heading">
                      <strong>
                        {t.label} · {t.manufacturer} {t.model}
                      </strong>
                      <span className="jn-payment-state">{t.status}</span>
                    </div>
                    <p className="customer-note">
                      Provedor: {t.provider_name} · Modo:{' '}
                      {t.connection_mode === 'cloud_api' ? 'API em nuvem autorizada' : 'Conector / agente local autorizado'} ·
                      Unidade: {t.unit_name ?? 'Geral'}
                    </p>
                    {t.last_error_safe && (
                      <p role="alert" className="form-feedback error">
                        {t.last_error_safe}
                      </p>
                    )}
                    <div className="account-actions">
                      <button
                        type="button"
                        className="secondary-button"
                        disabled={busy || !backendReady}
                        onClick={() =>
                          void runAction(
                            () => paymentProvidersApi.testTerminal(office, t.id),
                            `Disponibilidade atualizada para ${t.label}.`,
                          )
                        }
                      >
                        Verificar disponibilidade
                      </button>
                      {t.status !== 'inactive' && (
                        <button
                          type="button"
                          className="team-text-button"
                          disabled={busy || !backendReady}
                          onClick={() =>
                            void runAction(
                              () => paymentProvidersApi.deactivateTerminal(office, t.id, `deact-${crypto.randomUUID()}`),
                              `Maquininha ${t.label} desativada.`,
                            )
                          }
                        >
                          Desativar maquininha
                        </button>
                      )}
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </div>

          <form className="jn-provider-card" onSubmit={handleSaveTerminal} noValidate>
            <h3>Cadastrar maquininha</h3>
            <p className="customer-note">
              Para cobrar, parcelar ou pedir um QR Code Pix por Bluetooth ou Wi-Fi, o Escritório JN precisa de
              um conector compatível com o modelo e a operadora. Enquanto isso, registre no Caixa as vendas
              concluídas em qualquer maquininha.
            </p>
            <fieldset disabled={busy || !backendReady}>
              <label className="team-field">
                Identificação no balcão / unidade
                <input
                  maxLength={80}
                  placeholder="Ex.: Maquininha Balcão 01"
                  value={termLabel}
                  onChange={(e) => setTermLabel(e.target.value)}
                />
              </label>
              <div className="request-grid">
                <label className="team-field">
                  Fabricante
                  <input
                    maxLength={80}
                    placeholder="Ex.: PAX / Ingenico / Gertec"
                    value={termManufacturer}
                    onChange={(e) => setTermManufacturer(e.target.value)}
                  />
                </label>
                <label className="team-field">
                  Modelo
                  <input
                    maxLength={80}
                    placeholder="Ex.: A910 / Move 5000"
                    value={termModel}
                    onChange={(e) => setTermModel(e.target.value)}
                  />
                </label>
              </div>
              <div className="request-grid">
                <label className="team-field">
                  Adquirente / Provedor
                  <input
                    maxLength={80}
                    placeholder="Nome do adquirente contratado"
                    value={termProviderName}
                    onChange={(e) => setTermProviderName(e.target.value)}
                  />
                </label>
                <label className="team-field">
                  Modo de conexão autorizado
                  <select
                    value={termConnectionMode}
                    onChange={(e) =>
                      setTermConnectionMode(e.target.value as 'cloud_api' | 'local_agent_connector')
                    }
                  >
                    <option value="cloud_api">API em nuvem do provedor</option>
                    <option value="local_agent_connector">Conector / agente local autorizado</option>
                  </select>
                </label>
              </div>
              <div className="request-grid">
                <label className="team-field">
                  Vincular a provedor configurado (opcional)
                  <select value={termProviderId} onChange={(e) => setTermProviderId(e.target.value)}>
                    <option value="">Sem vínculo direto</option>
                    {(state?.providers ?? []).map((p) => (
                      <option key={p.id} value={p.id}>
                        {p.institution_label}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="team-field">
                  Unidade financeira / caixa
                  <select value={termUnitId} onChange={(e) => setTermUnitId(e.target.value)}>
                    <option value="">Geral do escritório</option>
                    {(cashConfig?.units ?? [])
                      .map((u) => (
                        <option key={u.id} value={u.id}>
                          {u.name}
                        </option>
                      ))}
                  </select>
                </label>
              </div>
              <p className="customer-note">
                O cadastro identifica o equipamento para uma integração futura.
              </p>
            </fieldset>
            <button type="submit" className="primary-button" disabled={busy || !backendReady}>
              Registrar maquininha
            </button>
          </form>
        </div>
      )}

      {/* TAB E — HISTÓRICO E DIAGNÓSTICOS */}
      {tab === 'diagnostics' && (
        <div className="jn-provider-card">
          <h3>Histórico, disponibilidade e conciliação</h3>
          <dl className="jn-breakdown-grid">
            <div>
              <dt>Provedores configurados</dt>
              <dd>{state?.providers.length ?? 0}</dd>
            </div>
            <div>
              <dt>Maquininhas cadastradas</dt>
              <dd>{state?.terminals.length ?? 0}</dd>
            </div>
            <div>
              <dt>Pendências de conciliação</dt>
              <dd><strong>{state?.pending_reconciliations_count ?? 0}</strong></dd>
            </div>
            <div>
              <dt>Persistência ativa</dt>
              <dd>{backendReady ? 'Ativa' : 'Aguardando ativação no servidor'}</dd>
            </div>
          </dl>

          <ul className="finance-ledger" aria-label="Diagnósticos de integrações de pagamento">
            {(state?.diagnostics ?? []).map((d) => (
              <li key={d.id}>
                <div className="cash-session-heading">
                  <strong>{d.label}</strong>
                  <span className="jn-payment-state">{d.status}</span>
                </div>
                <p className="customer-note">{d.message}</p>
                {d.checked_at && (
                  <p className="customer-note">
                    Última verificação: {new Date(d.checked_at).toLocaleString('pt-BR')}
                  </p>
                )}
              </li>
            ))}
          </ul>
        </div>
      )}
    </section>
  );
}
