import { useEffect, useState, type ReactNode } from 'react';
import {
  Archive,
  ArrowRight,
  Bell,
  BriefcaseBusiness,
  CircleUserRound,
  FileText,
  History,
  Landmark,
  MessagesSquare,
  Paperclip,
  Settings,
  UserRoundSearch,
  UsersRound,
  Wallet,
} from 'lucide-react';
import { Link, Navigate, useLocation } from 'react-router-dom';
import type { AccessContext } from '../../../shared/access';
import type { CashDashboard } from '../../../shared/cash';
import type { ClientFinance } from '../../../shared/finance';
import type { RequestHomeCounts } from '../../../shared/requests';
import { normalizePathname, paths } from '../../app/routes';
import { useAuth } from './AuthProvider';
import {
  buildRequestStageRows,
  formatHomeMoney,
  resolveSmartHomePlan,
  summarizeCashDashboard,
  summarizeClientFinance,
  type HomeCardKey,
  type HomeFinanceCardMode,
} from './homePanelModel';
import { OperationalAccess, OperationalFeedback } from '../operation/OperationalAccess';
import { OperationHeading } from '../operation/OperationLayout';
import { operationRoleNames } from '../operation/navigation';
import { customersApi } from '../customers/api';
import { cashApi } from '../cash/api';
import { commercialRequest } from '../documentCommercial/api';
import { notificationsApi } from '../notifications/api';

function RequestsChart({ counts, client }: { counts: RequestHomeCounts; client: boolean }) {
  const { total, rows } = buildRequestStageRows(counts, client);
  return (
    <div className="home-request-chart">
      <p>
        <b>{total}</b> {total === 1 ? 'solicitação' : 'solicitações'}
      </p>
      <span className="home-chart-caption">Por etapa</span>
      <ul aria-label="Solicitações por situação">
        {rows.map(row => (
          <li key={row.key} data-empty={row.total === 0 ? 'true' : undefined}>
            <span className="home-chart-label">{row.label}</span>
            <span className="home-chart-track" aria-hidden="true">
              <span
                className={row.tone === 'success' ? 'is-success' : undefined}
                style={{ width: `${row.percent}%` }}
              />
            </span>
            <b>{row.total}</b>
          </li>
        ))}
      </ul>
    </div>
  );
}

function BentoCard({
  path,
  state,
  title,
  description,
  icon,
  variant = 'compact',
  cardKey,
  trailingText,
  statusBadge,
  children,
}: {
  path: string;
  state: Record<string, unknown>;
  title: string;
  description: string;
  icon: ReactNode;
  variant?: 'finance' | 'featured' | 'compact' | 'wide' | 'adaptive' | 'dock';
  cardKey?: string;
  trailingText?: string;
  statusBadge?: { label: string; tone: 'active' | 'success' | 'warning' | 'neutral' };
  children?: ReactNode;
}) {
  return (
    <Link
      className={`operation-card home-bento-card is-${variant}${cardKey ? ` home-card-${cardKey}` : ''}`}
      to={path}
      state={state}
      title={variant === 'dock' ? `${title} — ${description}` : undefined}
    >
      <div className="operation-card-head">
        <span className="operation-card-icon" aria-hidden="true">
          {icon}
        </span>
        <span className="operation-card-copy">
          <strong>{title}</strong>
          <small>{description}</small>
        </span>
        <span className="home-card-trail">
          {statusBadge && (
            <span className={`home-status-pill tone-${statusBadge.tone}`}>{statusBadge.label}</span>
          )}
          {trailingText && <span className="home-card-cta">{trailingText}</span>}
          <ArrowRight
            className="operation-card-arrow"
            size={variant === 'dock' ? 15 : 18}
            aria-hidden="true"
          />
        </span>
      </div>
      {children}
    </Link>
  );
}

function FinanceHomeCard({
  mode,
  office,
  cashData,
  clientFinance,
}: {
  mode: HomeFinanceCardMode;
  office: string;
  cashData: CashDashboard | null | undefined;
  clientFinance: ClientFinance | null | undefined;
}) {
  if (mode.kind === 'client_payments') {
    const summary = clientFinance ? summarizeClientFinance(clientFinance) : undefined;
    return (
      <BentoCard
        variant="finance"
        cardKey="finance"
        path={mode.path}
        state={{ office_id: office }}
        title={mode.title}
        description={mode.description}
        icon={<Wallet size={20} />}
        statusBadge={
          summary ? { label: summary.statusLabel, tone: summary.statusTone } : undefined
        }
      >
        {summary ? (
          <dl className="home-finance-metrics" aria-label="Resumo dos meus pagamentos">
            <div className="home-metric-meta">
              <dt>Cobranças vinculadas</dt>
              <dd>
                {formatHomeMoney(summary.dueCents)}
                <small>
                  {summary.totalCharges}{' '}
                  {summary.totalCharges === 1 ? 'cobrança' : 'cobranças'}
                </small>
              </dd>
            </div>
            <div className="home-metric-primary">
              <dt>Total a pagar</dt>
              <dd className={summary.balanceCents > 0 ? 'is-emphasis-warning' : 'is-emphasis-success'}>
                {formatHomeMoney(summary.balanceCents)}
              </dd>
            </div>
            <div className="home-metric-secondary">
              <dt>Aplicado após estornos</dt>
              <dd>{formatHomeMoney(summary.paidCents)}</dd>
            </div>
          </dl>
        ) : clientFinance === null ? (
          <div className="home-card-strip">
            <span>Resumo financeiro indisponível no momento.</span>
            <strong>Abrir pagamentos</strong>
          </div>
        ) : (
          <div className="home-card-strip">
            <span>Cobranças e comprovantes da sua conta</span>
            <strong>Abrir pagamentos</strong>
          </div>
        )}
      </BentoCard>
    );
  }

  if (mode.kind === 'charges_only') {
    return (
      <BentoCard
        variant="finance"
        cardKey="finance"
        path={mode.path}
        state={{ office_id: office, tab: mode.tab }}
        title={mode.title}
        description={mode.description}
        icon={<Wallet size={20} />}
      >
        <div className="home-card-strip">
          <span>Escopo autorizado de cobranças</span>
          <strong>Abrir cobranças</strong>
        </div>
      </BentoCard>
    );
  }

  const summary = cashData ? summarizeCashDashboard(cashData, mode.scope) : undefined;
  const openSession = cashData?.sessions.find(session => session.status === 'open');
  return (
    <BentoCard
      variant="finance"
      cardKey="finance"
      path={mode.path}
      state={{ office_id: office, tab: mode.tab }}
      title={mode.title}
      description={mode.description}
      icon={<Landmark size={20} />}
      statusBadge={
        summary ? { label: summary.statusLabel, tone: summary.statusTone } : undefined
      }
    >
      {summary ? (
        <dl
          className="home-finance-metrics"
          aria-label={mode.kind === 'cash_all' ? 'Resumo do caixa geral' : 'Resumo do meu caixa'}
        >
          <div className="home-metric-meta">
            <dt>{mode.kind === 'cash_all' ? 'Caixas no escritório' : 'Situação do caixa'}</dt>
            <dd>
              {summary.openCount} {summary.openCount === 1 ? 'aberto' : 'abertos'} ·{' '}
              {summary.closedCount} {summary.closedCount === 1 ? 'fechado' : 'fechados'}
              {mode.kind === 'cash_own' && openSession ? (
                <small>{openSession.unit_name}</small>
              ) : null}
            </dd>
          </div>
          <div className="home-metric-primary">
            <dt>Saldo em espécie</dt>
            <dd>{formatHomeMoney(summary.numerarioCents)}</dd>
          </div>
          <div className="home-metric-secondary">
            <dt>Recebimentos líquidos</dt>
            <dd className="is-emphasis-primary">{formatHomeMoney(summary.receivedCents)}</dd>
          </div>
        </dl>
      ) : cashData === null ? (
        <div className="home-card-strip">
          <span>Resumo do caixa indisponível no momento.</span>
          <strong>{mode.kind === 'cash_all' ? 'Abrir consolidação' : 'Abrir meu caixa'}</strong>
        </div>
      ) : (
        <div className="home-card-strip">
          <span>
            {mode.kind === 'cash_all'
              ? 'Consolidação de caixas e recebimentos'
              : 'Operação individual de caixa'}
          </span>
          <strong>{mode.kind === 'cash_all' ? 'Abrir consolidação' : 'Abrir meu caixa'}</strong>
        </div>
      )}
    </BentoCard>
  );
}

function HomeCards({ context, client }: { context: AccessContext; client: boolean }) {
  const office = context.office_id;
  const plan = resolveSmartHomePlan(context, client);
  const { financeMode, canRequests, canCustomers } = plan;
  const showNotificationsCard =
    plan.sideCards.includes('notifications') ||
    plan.adaptiveGridCards.includes('notifications') ||
    plan.bottomCards.includes('notifications');

  const [counts, setCounts] = useState<RequestHomeCounts | null | undefined>();
  const [totalCustomers, setTotalCustomers] = useState<number | null | undefined>();
  const [cashData, setCashData] = useState<CashDashboard | null | undefined>();
  const [clientFinance, setClientFinance] = useState<ClientFinance | null | undefined>();
  const [unreadNotifications, setUnreadNotifications] = useState<number | null | undefined>();

  const financeKind = financeMode?.kind ?? 'none';

  useEffect(() => {
    if (!canRequests) setCounts(undefined);
    if (!canCustomers) setTotalCustomers(undefined);
    if (financeKind !== 'cash_all' && financeKind !== 'cash_own') setCashData(undefined);
    if (financeKind !== 'client_payments') setClientFinance(undefined);
    if (!showNotificationsCard) setUnreadNotifications(undefined);
  }, [canRequests, canCustomers, financeKind, showNotificationsCard]);

  useEffect(() => {
    let running: AbortController | undefined;
    function refresh() {
      if (document.visibilityState !== 'visible' || running) return;
      const controller = new AbortController();
      running = controller;
      const tasks: Promise<unknown>[] = [];

      if (canRequests) {
        tasks.push(
          commercialRequest<RequestHomeCounts>(
            '/home-counts',
            { office_id: office },
            controller.signal,
            '/api/requests',
          )
            .then(data => {
              if (!controller.signal.aborted) setCounts(data);
            })
            .catch(() => {
              if (!controller.signal.aborted) setCounts(null);
            }),
        );
      }

      if (canCustomers) {
        tasks.push(
          customersApi
            .search({ office_id: office, query: '', page: 1, size: 3 }, controller.signal)
            .then(data => {
              if (!controller.signal.aborted) setTotalCustomers(data.total);
            })
            .catch(() => {
              if (!controller.signal.aborted) setTotalCustomers(null);
            }),
        );
      }

      if (financeKind === 'cash_all' || financeKind === 'cash_own') {
        const scope = financeKind === 'cash_all' ? 'all' : 'own';
        tasks.push(
          cashApi
            .filteredDashboard(
              office,
              scope,
              1,
              3,
              { unit_id: null, status: 'all', query: '' },
              controller.signal,
            )
            .then(data => {
              if (!controller.signal.aborted) setCashData(data);
            })
            .catch(() => {
              if (!controller.signal.aborted) setCashData(null);
            }),
        );
      } else if (financeKind === 'client_payments') {
        tasks.push(
          cashApi
            .clientFinance(office, 1, 1, controller.signal)
            .then(data => {
              if (!controller.signal.aborted) setClientFinance(data);
            })
            .catch(() => {
              if (!controller.signal.aborted) setClientFinance(null);
            }),
        );
      }

      if (showNotificationsCard) {
        tasks.push(
          notificationsApi
            .summary(office, controller.signal)
            .then(data => {
              if (!controller.signal.aborted) setUnreadNotifications(data.unread);
            })
            .catch(() => {
              if (!controller.signal.aborted) setUnreadNotifications(null);
            }),
        );
      }

      void Promise.all(tasks).finally(() => {
        if (running === controller) running = undefined;
      });
    }

    refresh();
    const timer = window.setInterval(refresh, 60_000);
    window.addEventListener('focus', refresh);
    document.addEventListener('visibilitychange', refresh);
    window.addEventListener('jn:notices-changed', refresh);
    return () => {
      running?.abort();
      window.clearInterval(timer);
      window.removeEventListener('focus', refresh);
      document.removeEventListener('visibilitychange', refresh);
      window.removeEventListener('jn:notices-changed', refresh);
    };
  }, [office, canRequests, canCustomers, financeKind, showNotificationsCard]);

  function renderSecondaryCard(key: HomeCardKey, placement: 'side' | 'bottom' | 'adaptive') {
    const isDock = placement === 'bottom' && plan.bottomCards.length >= 2;
    const isDenseDock = isDock && plan.bottomCards.length >= 5;
    const variant =
      placement === 'adaptive'
        ? 'adaptive'
        : isDock
          ? 'dock'
          : placement === 'bottom' && plan.bottomCards.length === 1
            ? 'wide'
            : 'compact';
    const iconSize = isDock ? 17 : 20;
    const showStrip = variant !== 'wide' && variant !== 'dock';

    if (key === 'customers') {
      return (
        <BentoCard
          key="customers"
          cardKey="customers"
          variant={variant}
          path={paths.customers}
          state={{ office_id: office }}
          title="Clientes"
          description={
            plan.hasRural
              ? 'Cadastro, fichas e imóveis rurais'
              : 'Cadastro e busca de fichas do escritório'
          }
          icon={<UserRoundSearch size={iconSize} />}
          trailingText={variant === 'wide' ? 'Abrir fichas' : undefined}
        >
          {showStrip && (
            <div className="home-card-strip">
              <span>{plan.hasRural ? 'Fichas e imóveis' : 'Fichas ativas'}</span>
              {typeof totalCustomers === 'number' ? (
                <strong className="home-customer-count">
                  {totalCustomers === 0
                    ? 'Nenhum cliente disponível'
                    : `${totalCustomers} ${totalCustomers === 1 ? 'cliente disponível' : 'clientes disponíveis'}`}
                </strong>
              ) : totalCustomers === null ? (
                <small>Contagem indisponível no momento.</small>
              ) : (
                <strong>Abrir fichas</strong>
              )}
            </div>
          )}
        </BentoCard>
      );
    }

    if (key === 'files') {
      return (
        <BentoCard
          key="files"
          cardKey="files"
          variant={variant}
          path={client ? paths.clientAttachments : paths.attachments}
          state={{ office_id: office }}
          title={isDenseDock ? 'Anexos' : 'Anexos privados'}
          description="Arquivos dos seus atendimentos"
          icon={<Paperclip size={iconSize} />}
          trailingText={variant === 'wide' ? 'Abrir arquivos' : undefined}
        >
          {showStrip && (
            <div className="home-card-strip">
              <span>Acesso restrito</span>
              <strong className="is-link-accent">Abrir arquivos</strong>
            </div>
          )}
        </BentoCard>
      );
    }

    if (key === 'documents') {
      return (
        <BentoCard
          key="documents"
          cardKey="documents"
          variant={variant}
          path={client ? paths.clientDocuments : paths.documents}
          state={{ office_id: office }}
          title="Documentos"
          description={
            client
              ? 'Modelos disponíveis e entregas do escritório'
              : 'Modelos, elaboração e entregas documentais'
          }
          icon={<FileText size={iconSize} />}
          trailingText={variant === 'wide' ? 'Abrir documentos' : undefined}
        >
          {showStrip && (
            <div className="home-card-strip">
              <span>{client ? 'Portal documental' : 'Biblioteca e entregas'}</span>
              <strong className="is-link-accent">Abrir documentos</strong>
            </div>
          )}
        </BentoCard>
      );
    }

    if (key === 'services') {
      return (
        <BentoCard
          key="services"
          cardKey="services"
          variant={variant}
          path={plan.servicesPath}
          state={{ office_id: office }}
          title={plan.servicesLabel}
          description={plan.servicesDescription}
          icon={<BriefcaseBusiness size={iconSize} />}
          trailingText={variant === 'wide' ? `Abrir ${plan.servicesLabel.toLowerCase()}` : undefined}
        >
          {showStrip && (
            <div className="home-card-strip">
              <span>Escopo autorizado</span>
              <strong className="is-link-accent">Abrir {plan.servicesLabel.toLowerCase()}</strong>
            </div>
          )}
        </BentoCard>
      );
    }

    if (key === 'team') {
      return (
        <BentoCard
          key="team"
          cardKey="team"
          variant={variant}
          path={paths.teamManagement}
          state={{ office_id: office }}
          title={isDenseDock ? 'Equipe' : isDock ? 'Equipe e convites' : 'Gerenciar equipe e convites'}
          description="Pessoas e permissões do escritório"
          icon={<UsersRound size={iconSize} />}
          trailingText={variant === 'wide' ? 'Configurar acessos' : undefined}
        >
          {showStrip && (
            <div className="home-card-strip">
              <span>Equipe do escritório</span>
              <strong className="is-link-accent">Configurar acessos</strong>
            </div>
          )}
        </BentoCard>
      );
    }

    if (key === 'settings') {
      return (
        <BentoCard
          key="settings"
          cardKey="settings"
          variant={variant}
          path={paths.settings}
          state={{ office_id: office }}
          title={isDock ? 'Configurações' : 'Configurações do escritório'}
          description={plan.settingsDescription}
          icon={<Settings size={iconSize} />}
          trailingText={variant === 'wide' ? 'Abrir configurações' : undefined}
        >
          {showStrip && (
            <div className="home-card-strip">
              <span>Administração</span>
              <strong className="is-link-accent">Abrir configurações</strong>
            </div>
          )}
        </BentoCard>
      );
    }

    if (key === 'audit') {
      return (
        <BentoCard
          key="audit"
          cardKey="audit"
          variant={variant}
          path={paths.audit}
          state={{ office_id: office }}
          title="Auditoria"
          description="Histórico oficial de registros do escritório"
          icon={<History size={iconSize} />}
          trailingText={variant === 'wide' ? 'Ver registros' : undefined}
        >
          {showStrip && (
            <div className="home-card-strip">
              <span>Trilha de controle</span>
              <strong className="is-link-accent">Ver registros</strong>
            </div>
          )}
        </BentoCard>
      );
    }

    if (key === 'archives') {
      return (
        <BentoCard
          key="archives"
          cardKey="archives"
          variant={variant}
          path={paths.settingsArchives}
          state={{ office_id: office }}
          title="Arquivados"
          description="Registros arquivados e retenção do escritório"
          icon={<Archive size={iconSize} />}
          trailingText={variant === 'wide' ? 'Abrir arquivados' : undefined}
        >
          {showStrip && (
            <div className="home-card-strip">
              <span>Acervo arquivado</span>
              <strong className="is-link-accent">Abrir arquivados</strong>
            </div>
          )}
        </BentoCard>
      );
    }

    if (key === 'notifications') {
      const unreadBadge =
        typeof unreadNotifications === 'number' && !isDock
          ? unreadNotifications > 0
            ? {
                label: `${unreadNotifications} ${unreadNotifications === 1 ? 'novo' : 'novos'}`,
                tone: 'warning' as const,
              }
            : { label: 'Em dia', tone: 'neutral' as const }
          : undefined;
      return (
        <BentoCard
          key="notifications"
          cardKey="notifications"
          variant={variant}
          path={client ? paths.clientNotifications : paths.notifications}
          state={{ office_id: office }}
          title="Notificações"
          description="Avisos e movimentações recentes da sua conta"
          icon={<Bell size={iconSize} />}
          statusBadge={unreadBadge}
          trailingText={variant === 'wide' ? 'Ver avisos' : undefined}
        >
          {showStrip && (
            <div className="home-card-strip">
              <span>
                {typeof unreadNotifications === 'number'
                  ? unreadNotifications === 0
                    ? 'Nenhum aviso não lido'
                    : `${unreadNotifications} ${unreadNotifications === 1 ? 'aviso não lido' : 'avisos não lidos'}`
                  : 'Central de avisos'}
              </span>
              <strong className="is-link-accent">Ver avisos</strong>
            </div>
          )}
        </BentoCard>
      );
    }

    return (
      <BentoCard
        key="account"
        cardKey="account"
        variant={variant}
        path={client ? paths.clientAccount : paths.account}
        state={{ office_id: office }}
        title={isDock ? 'Minha conta' : 'Ver minha conta'}
        description="Dados de acesso e segurança"
        icon={<CircleUserRound size={iconSize} />}
        trailingText={variant === 'wide' ? 'Gerenciar conta' : undefined}
      >
        {showStrip && (
          <div className="home-card-strip">
            <span>
              {context.display_name || operationRoleNames[context.role_code] || 'Acesso pessoal'}
            </span>
            <strong className="is-link-accent">Abrir conta</strong>
          </div>
        )}
      </BentoCard>
    );
  }

  return (
    <section className="operation-shortcuts" aria-label="Acesso rápido">
      <div
        className={`home-bento-grid${!plan.showFinanceBanner ? ' is-no-finance' : ''}${!plan.showRequestsPrimary ? ' is-adaptive-only' : ''}${plan.bottomCards.length === 0 ? ' is-no-bottom' : ''}${plan.bottomCards.length >= 2 ? ' has-dock' : ''}`}
      >
        {financeMode && (
          <div className="home-bento-finance">
            <FinanceHomeCard
              mode={financeMode}
              office={office}
              cashData={cashData}
              clientFinance={clientFinance}
            />
          </div>
        )}

        {plan.showRequestsPrimary && (
          <div
            className={`home-bento-middle${plan.sideCards.length === 0 ? ' is-single-column' : ''}`}
          >
            <div className="home-bento-primary">
              <BentoCard
                variant="featured"
                cardKey="requests"
                path={client ? paths.clientRequests : paths.requests}
                state={{ office_id: office, ...(!client ? { request_scope: 'queue' } : {}) }}
                title={client ? 'Minhas solicitações' : 'Solicitações'}
                description={
                  client
                    ? 'Enviar e acompanhar seu atendimento'
                    : 'Acompanhar os atendimentos do escritório'
                }
                icon={<MessagesSquare size={20} />}
              >
                {counts ? (
                  <RequestsChart counts={counts} client={client} />
                ) : counts === null ? (
                  <div className="home-card-strip">
                    <span>Contagem indisponível no momento.</span>
                    <strong className="is-link-accent">Abrir atendimentos</strong>
                  </div>
                ) : (
                  <RequestsChart counts={{}} client={client} />
                )}
              </BentoCard>
            </div>

            {plan.sideCards.length > 0 && (
              <div className="home-bento-stack" data-count={plan.sideCards.length}>
                {plan.sideCards.map(key => renderSecondaryCard(key, 'side'))}
              </div>
            )}
          </div>
        )}

        {!plan.showRequestsPrimary && plan.adaptiveGridCards.length > 0 && (
          <div
            className="home-bento-adaptive"
            data-count={plan.adaptiveGridCards.length}
          >
            {plan.adaptiveGridCards.map(key => renderSecondaryCard(key, 'adaptive'))}
          </div>
        )}

        {plan.bottomCards.length > 0 && (
          <div
            className={`home-bento-bottom${plan.bottomCards.length >= 2 ? ' is-dock' : ''}`}
            data-count={plan.bottomCards.length}
          >
            {plan.bottomCards.map(key => renderSecondaryCard(key, 'bottom'))}
          </div>
        )}
      </div>
    </section>
  );
}

function PanelContent({
  contexts,
  client,
  office,
  onOfficeChange,
}: {
  contexts: AccessContext[];
  client: boolean;
  office: string;
  onOfficeChange: (officeId: string) => void;
}) {
  const context = contexts.find(item => item.office_id === office) ?? contexts[0];
  return (
    <>
      <OperationHeading
        context={context}
        title="Área de operação"
        description={
          client
            ? 'Seu atendimento e financeiro em um só lugar.'
            : 'Acesse as funções disponíveis para o seu trabalho.'
        }
        action={
          contexts.length > 1 ? (
            <label className="team-field home-office">
              Escritório
              <select
                value={context.office_id}
                onChange={event => onOfficeChange(event.target.value)}
              >
                {contexts.map(item => (
                  <option key={item.office_id} value={item.office_id}>
                    {item.office_name}
                  </option>
                ))}
              </select>
            </label>
          ) : undefined
        }
      />
      <HomeCards key={context.office_id} context={context} client={client} />
    </>
  );
}

export default function PanelPage() {
  const auth = useAuth();
  const pathname = normalizePathname(useLocation().pathname);
  const [selectedOffice, setSelectedOffice] = useState('');
  const client =
    pathname === paths.clientPanel ||
    (pathname === paths.authenticated && auth.portal === 'client');
  if (pathname === paths.authenticated) {
    if (auth.status === 'loading') return <OperationalFeedback status="loading" />;
    if (auth.status === 'authorized') {
      return (
        <Navigate
          replace
          to={
            auth.contexts.some(context => context.role_code !== 'client')
              ? paths.panel
              : paths.clientPanel
          }
        />
      );
    }
  }
  const activeOffice =
    auth.status === 'authorized'
      ? (auth.contexts.find(context => context.office_id === selectedOffice)?.office_id ??
        auth.contexts[0]?.office_id)
      : undefined;
  return (
    <OperationalAccess client={client} office={activeOffice}>
      {contexts => (
        <PanelContent
          contexts={contexts}
          client={client}
          office={selectedOffice}
          onOfficeChange={setSelectedOffice}
        />
      )}
    </OperationalAccess>
  );
}
