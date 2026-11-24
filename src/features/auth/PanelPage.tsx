import { useEffect, useState, type ReactNode } from 'react';
import {
  ArrowRight,
  CircleUserRound,
  Landmark,
  MessagesSquare,
  Paperclip,
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
  resolveHomeFinanceCard,
  resolveHomeLayout,
  summarizeCashDashboard,
  summarizeClientFinance,
  type HomeCardKey,
  type HomeFinanceCardMode,
} from './homePanelModel';
import { OperationalAccess, OperationalFeedback } from '../operation/OperationalAccess';
import { OperationHeading } from '../operation/OperationLayout';
import { PresenceControl } from '../documentCommercial/DocumentPresenceProvider';
import { customersApi } from '../customers/api';
import { cashApi } from '../cash/api';
import { commercialRequest } from '../documentCommercial/api';

function RequestsChart({ counts, client }: { counts: RequestHomeCounts; client: boolean }) {
  const { total, rows } = buildRequestStageRows(counts, client);
  return (
    <div className="home-request-chart">
      <p>
        <b>{total}</b> {total === 1 ? 'solicitação' : 'solicitações'}
      </p>
      <span className="home-chart-caption">Por etapa</span>
      {total > 0 ? (
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
      ) : (
        <small className="home-chart-empty">
          {client ? 'Nenhuma solicitação registrada neste escritório.' : 'Nenhuma solicitação neste escritório.'}
        </small>
      )}
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
  trailingText,
  statusBadge,
  children,
}: {
  path: string;
  state: Record<string, unknown>;
  title: string;
  description: string;
  icon: ReactNode;
  variant?: 'finance' | 'featured' | 'compact' | 'wide';
  trailingText?: string;
  statusBadge?: { label: string; tone: 'active' | 'success' | 'warning' | 'neutral' };
  children?: ReactNode;
}) {
  return (
    <Link className={`operation-card home-bento-card is-${variant}`} to={path} state={state}>
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
          <ArrowRight className="operation-card-arrow" size={18} aria-hidden="true" />
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
        path={mode.path}
        state={{ office_id: office }}
        title={mode.title}
        description={mode.description}
        icon={<Wallet size={22} />}
        statusBadge={
          summary ? { label: summary.statusLabel, tone: summary.statusTone } : undefined
        }
      >
        {summary ? (
          <dl className="home-finance-metrics" aria-label="Resumo dos meus pagamentos">
            <div>
              <dt>Total a pagar</dt>
              <dd className={summary.balanceCents > 0 ? 'is-emphasis-warning' : 'is-emphasis-success'}>
                {formatHomeMoney(summary.balanceCents)}
              </dd>
            </div>
            <div>
              <dt>Aplicado após estornos</dt>
              <dd>{formatHomeMoney(summary.paidCents)}</dd>
            </div>
            <div>
              <dt>Cobranças vinculadas</dt>
              <dd>
                {formatHomeMoney(summary.dueCents)}
                <small>
                  {summary.totalCharges}{' '}
                  {summary.totalCharges === 1 ? 'cobrança' : 'cobranças'}
                </small>
              </dd>
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
        path={mode.path}
        state={{ office_id: office, tab: mode.tab }}
        title={mode.title}
        description={mode.description}
        icon={<Wallet size={22} />}
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
      path={mode.path}
      state={{ office_id: office, tab: mode.tab }}
      title={mode.title}
      description={mode.description}
      icon={<Landmark size={22} />}
      statusBadge={
        summary ? { label: summary.statusLabel, tone: summary.statusTone } : undefined
      }
    >
      {summary ? (
        <dl
          className="home-finance-metrics"
          aria-label={mode.kind === 'cash_all' ? 'Resumo do caixa geral' : 'Resumo do meu caixa'}
        >
          <div>
            <dt>{mode.kind === 'cash_all' ? 'Caixas no escritório' : 'Situação do caixa'}</dt>
            <dd>
              {summary.openCount} {summary.openCount === 1 ? 'aberto' : 'abertos'} ·{' '}
              {summary.closedCount} {summary.closedCount === 1 ? 'fechado' : 'fechados'}
              {mode.kind === 'cash_own' && openSession ? (
                <small>{openSession.unit_name}</small>
              ) : null}
            </dd>
          </div>
          <div>
            <dt>Saldo em espécie</dt>
            <dd>{formatHomeMoney(summary.numerarioCents)}</dd>
          </div>
          <div>
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
  const financeMode = resolveHomeFinanceCard(context, client);
  const canRequests = client || context.permissions.includes('requests.read');
  const canCustomers = !client && context.permissions.includes('customers.read');
  const canFiles = client || (canRequests && context.permissions.includes('files.read'));
  const canTeam = !client && context.permissions.includes('users.manage');
  const showAccount = client || !canCustomers || !canTeam;

  const [counts, setCounts] = useState<RequestHomeCounts | null | undefined>();
  const [totalCustomers, setTotalCustomers] = useState<number | null | undefined>();
  const [cashData, setCashData] = useState<CashDashboard | null | undefined>();
  const [clientFinance, setClientFinance] = useState<ClientFinance | null | undefined>();

  const financeKind = financeMode?.kind ?? 'none';

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

      void Promise.all(tasks).finally(() => {
        if (running === controller) running = undefined;
      });
    }

    refresh();
    const timer = window.setInterval(refresh, 60_000);
    window.addEventListener('focus', refresh);
    document.addEventListener('visibilitychange', refresh);
    return () => {
      running?.abort();
      window.clearInterval(timer);
      window.removeEventListener('focus', refresh);
      document.removeEventListener('visibilitychange', refresh);
    };
  }, [office, canRequests, canCustomers, financeKind]);

  const layout = resolveHomeLayout({
    hasFinance: Boolean(financeMode),
    hasRequests: canRequests,
    hasCustomers: canCustomers,
    hasFiles: canFiles,
    hasTeam: canTeam,
    hasAccount: showAccount,
  });

  function renderSecondaryCard(key: HomeCardKey, placement: 'side' | 'bottom') {
    const variant = placement === 'bottom' && layout.bottomCards.length === 1 ? 'wide' : 'compact';
    if (key === 'customers') {
      return (
        <BentoCard
          key="customers"
          variant={variant}
          path={paths.customers}
          state={{ office_id: office }}
          title="Clientes"
          description="Cadastro e busca de fichas do escritório"
          icon={<UserRoundSearch size={22} />}
        >
          <div className="home-card-strip">
            <span>Fichas ativas</span>
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
        </BentoCard>
      );
    }

    if (key === 'files') {
      return (
        <BentoCard
          key="files"
          variant={variant}
          path={client ? paths.clientAttachments : paths.attachments}
          state={{ office_id: office }}
          title="Anexos privados"
          description="Arquivos dos seus atendimentos"
          icon={<Paperclip size={22} />}
        >
          <div className="home-card-strip">
            <span>Acesso restrito</span>
            <strong className="is-link-accent">Abrir arquivos</strong>
          </div>
        </BentoCard>
      );
    }

    if (key === 'team') {
      return (
        <BentoCard
          key="team"
          variant={variant}
          path={paths.teamManagement}
          state={{ office_id: office }}
          title="Gerenciar equipe e convites"
          description="Pessoas e permissões do escritório"
          icon={<UsersRound size={22} />}
          trailingText={variant === 'wide' ? 'Configurar acessos' : undefined}
        >
          {variant !== 'wide' && (
            <div className="home-card-strip">
              <span>Equipe do escritório</span>
              <strong className="is-link-accent">Configurar acessos</strong>
            </div>
          )}
        </BentoCard>
      );
    }

    return (
      <BentoCard
        key="account"
        variant={variant}
        path={client ? paths.clientAccount : paths.account}
        state={{ office_id: office }}
        title="Ver minha conta"
        description="Dados de acesso e segurança"
        icon={<CircleUserRound size={22} />}
        trailingText={variant === 'wide' ? 'Gerenciar conta' : undefined}
      >
        {variant !== 'wide' && (
          <div className="home-card-strip">
            <span>Acesso pessoal</span>
            <strong className="is-link-accent">Abrir conta</strong>
          </div>
        )}
      </BentoCard>
    );
  }

  return (
    <section className="operation-shortcuts" aria-label="Acesso rápido">
      {!client && canRequests && (
        <div className="home-mobile-presence-wrap">
          <PresenceControl className="home-mobile-presence" />
        </div>
      )}
      <div className="home-bento-grid">
        {financeMode && (
          <div className="home-bento-full">
            <FinanceHomeCard
              mode={financeMode}
              office={office}
              cashData={cashData}
              clientFinance={clientFinance}
            />
          </div>
        )}

        {layout.showRequestsPrimary && (
          <div className={layout.sideCards.length > 0 ? 'home-bento-primary' : 'home-bento-full'}>
            <BentoCard
              variant="featured"
              path={client ? paths.clientRequests : paths.requests}
              state={{ office_id: office, ...(!client ? { request_scope: 'queue' } : {}) }}
              title={client ? 'Minhas solicitações' : 'Solicitações'}
              description={
                client
                  ? 'Enviar e acompanhar seu atendimento'
                  : 'Acompanhar os atendimentos do escritório'
              }
              icon={<MessagesSquare size={22} />}
            >
              {counts ? (
                <RequestsChart counts={counts} client={client} />
              ) : counts === null ? (
                <div className="home-card-strip">
                  <span>Contagem indisponível no momento.</span>
                  <strong className="is-link-accent">Abrir atendimentos</strong>
                </div>
              ) : null}
            </BentoCard>
          </div>
        )}

        {layout.sideCards.length > 0 && (
          <div className="home-bento-stack">
            {layout.sideCards.map(key => renderSecondaryCard(key, 'side'))}
          </div>
        )}

        {layout.bottomCards.length > 0 && (
          <div
            className={
              layout.bottomCards.length === 1 ? 'home-bento-full' : 'home-bento-bottom-grid'
            }
          >
            {layout.bottomCards.map(key => renderSecondaryCard(key, 'bottom'))}
          </div>
        )}
      </div>
    </section>
  );
}

function PanelContent({ contexts, client }: { contexts: AccessContext[]; client: boolean }) {
  const [office, setOffice] = useState('');
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
              <select value={context.office_id} onChange={event => setOffice(event.target.value)}>
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
  const client =
    pathname === paths.clientPanel ||
    (pathname === paths.authenticated && auth.portal === 'client');
  if (pathname === paths.authenticated) {
    if (auth.status === 'loading') return <OperationalFeedback status="loading" />;
    if (auth.status === 'authorized') {
      return (
        <Navigate
          replace
          to={auth.contexts.some(context => context.role_code !== 'client') ? paths.panel : paths.clientPanel}
        />
      );
    }
  }
  return (
    <OperationalAccess client={client}>
      {contexts => <PanelContent contexts={contexts} client={client} />}
    </OperationalAccess>
  );
}
