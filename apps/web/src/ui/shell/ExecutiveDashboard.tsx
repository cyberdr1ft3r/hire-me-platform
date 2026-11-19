import { useEffect, useState, type ReactNode } from 'react';

import { getReportingDrilldown, getReportingSummary, listAgenda, listTasks } from '../../api.js';
import { useI18n } from '../../i18n/index.js';
import { canAccessInternalRoute } from '../../navigation/internal-navigation.js';
import { missionDeepLink } from '../../navigation/record-deep-links.js';
import { isPipelineState, pipelineStateLabelKey } from '../../reporting/reporting-labels.js';
import { Button } from '../Button.js';
import { PageHeader } from '../PageHeader.js';
import { PageShell, PageState } from '../PageSystem.js';
import './executive-dashboard.css';

type Resource<T> =
  { token: string; data: T; error?: never } | { token: string; error: true; data?: never };

interface DashboardProps {
  accessToken: string;
  permissions: readonly string[];
  onNavigate: (path: string) => void;
}

const week = 7 * 86_400_000;
const loadSummary = (token: string) => getReportingSummary(token).then(({ summary }) => summary);
const loadActivity = (token: string) =>
  getReportingDrilldown(token, {
    start: new Date(Date.now() - week).toISOString(),
    pageSize: 5,
  }).then(({ rows }) => rows);
const loadInterviews = (token: string) => {
  const now = Date.now();
  return listAgenda(token, {
    from: new Date(now).toISOString(),
    to: new Date(now + week).toISOString(),
    sources: 'interview',
    view: 'upcoming',
  }).then(({ items }) => items.filter((item) => item.status === 'SCHEDULED').slice(0, 5));
};
const loadTasks = (token: string) =>
  Promise.all([
    listTasks(token, { overdue: true, pageSize: 5 }),
    listTasks(token, { dueSoon: true, pageSize: 5 }),
  ]).then(([overdue, dueSoon]) => ({ overdue: overdue.tasks, dueSoon: dueSoon.tasks }));

function DashboardWidget<T>({
  token,
  load,
  title,
  children,
}: {
  token: string;
  load: (token: string) => Promise<T>;
  title: string;
  children: (value: T) => ReactNode;
}) {
  const { t } = useI18n();
  const [resource, setResource] = useState<Resource<T> | null>(null);
  const [attempt, setAttempt] = useState(0);
  useEffect(() => {
    let current = true;
    void load(token).then(
      (data) => {
        if (current) setResource({ token, data });
      },
      () => {
        if (current) setResource({ token, error: true });
      },
    );
    return () => {
      current = false;
    };
  }, [attempt, load, token]);

  const visible = resource?.token === token ? resource : null;
  return (
    <section aria-label={title} className="executive-dashboard__widget">
      <h2>{title}</h2>
      {visible === null ? (
        <PageState kind="loading" title={t('executiveDashboard.loading')} />
      ) : visible.error ? (
        <PageState
          kind="error"
          title={t('executiveDashboard.error')}
          action={
            <Button
              variant="secondary"
              onClick={() => {
                setResource(null);
                setAttempt((value) => value + 1);
              }}
            >
              {t('common.actions.retry')}
            </Button>
          }
        />
      ) : (
        children(visible.data)
      )}
    </section>
  );
}

export function ExecutiveDashboard({ accessToken, permissions, onNavigate }: DashboardProps) {
  const { t, formatDate, formatNumber } = useI18n();
  const date = (value: string) => formatDate(value, { dateStyle: 'medium' });
  const link = (path: string, label: string) => (
    <a
      href={path}
      onClick={(event) => {
        if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
        event.preventDefault();
        onNavigate(path);
      }}
    >
      {label}
    </a>
  );
  const empty = <p>{t('executiveDashboard.empty')}</p>;
  const metric = (label: string, value: number) => (
    <div key={label}>
      <dt>{label}</dt>
      <dd>{formatNumber(value)}</dd>
    </div>
  );
  const stage = (key: string) => (isPipelineState(key) ? t(pipelineStateLabelKey(key)) : key);
  const canOpenMissions = canAccessInternalRoute('missions', permissions);
  return (
    <PageShell className="executive-dashboard">
      <PageHeader
        title={t('executiveDashboard.title')}
        description={t('executiveDashboard.description')}
      />
      <div className="executive-dashboard__grid">
        <DashboardWidget
          token={accessToken}
          load={loadSummary}
          title={t('executiveDashboard.pulse')}
        >
          {(summary) => (
            <>
              <p>
                {t(
                  summary.scope.kind === 'assigned'
                    ? 'executiveDashboard.assigned'
                    : 'executiveDashboard.broad',
                )}
              </p>
              <dl className="executive-dashboard__metrics">
                {metric(t('executiveDashboard.active'), summary.missions.open)}
                {metric(t('executiveDashboard.totalProcesses'), summary.pipeline.totalProcesses)}
                {metric(t('executiveDashboard.placements'), summary.placements.confirmed)}
              </dl>
              <h3>{t('executiveDashboard.progress')}</h3>
              <dl className="executive-dashboard__metrics">
                {metric(t('executiveDashboard.presented'), summary.pipeline.presentedToClient)}
                {metric(t('executiveDashboard.completed'), summary.interviews.completed)}
              </dl>
              <h3>{t('executiveDashboard.pipeline')}</h3>
              {summary.pipeline.byState.length ? (
                <dl className="executive-dashboard__metrics">
                  {summary.pipeline.byState.map((entry) => metric(stage(entry.key), entry.count))}
                </dl>
              ) : (
                empty
              )}
              <h3>{t('executiveDashboard.bottlenecks')}</h3>
              <dl className="executive-dashboard__metrics">
                {metric(t('executiveDashboard.overdueMissions'), summary.aging.overdueMissions)}
                {metric(t('executiveDashboard.stale'), summary.aging.stalePipelineProcesses)}
              </dl>
              <h3>{t('executiveDashboard.deadlines')}</h3>
              <p>{t('executiveDashboard.deadlineHint')}</p>
              {summary.upcomingDeadlines?.length ? (
                <ul className="executive-dashboard__list">
                  {summary.upcomingDeadlines.map((item) => (
                    <li key={item.missionId}>
                      {canOpenMissions
                        ? link(missionDeepLink(item.missionId), item.missionTitle)
                        : item.missionTitle}
                      <time dateTime={item.deadline}>{date(item.deadline)}</time>
                    </li>
                  ))}
                </ul>
              ) : (
                empty
              )}
              {canAccessInternalRoute('reporting', permissions)
                ? link('/reporting', t('executiveDashboard.report'))
                : null}
            </>
          )}
        </DashboardWidget>

        <div className="executive-dashboard__secondary">
          {permissions.includes('interviews:view') &&
          canAccessInternalRoute('agenda', permissions) ? (
            <DashboardWidget
              token={accessToken}
              load={loadInterviews}
              title={t('executiveDashboard.interviews')}
            >
              {(items) => (
                <>
                  <p>{t('executiveDashboard.interviewHint')}</p>
                  {items.length ? (
                    <ul className="executive-dashboard__list">
                      {items.map((item) => (
                        <li key={item.id}>
                          {canOpenMissions && item.deepLink.startsWith('/missions?')
                            ? link(item.deepLink, t('executiveDashboard.interview'))
                            : t('executiveDashboard.interview')}
                          {item.startAt ? (
                            <time dateTime={item.startAt}>
                              {formatDate(item.startAt, {
                                dateStyle: 'medium',
                                timeStyle: 'short',
                                timeZone: item.timezone,
                              })}
                            </time>
                          ) : null}
                        </li>
                      ))}
                    </ul>
                  ) : (
                    empty
                  )}
                  {link('/agenda', t('executiveDashboard.agenda'))}
                </>
              )}
            </DashboardWidget>
          ) : null}
          {canAccessInternalRoute('tasks', permissions) ? (
            <DashboardWidget
              token={accessToken}
              load={loadTasks}
              title={t('executiveDashboard.attention')}
            >
              {({ overdue, dueSoon }) => (
                <>
                  {(
                    [
                      ['overdueTasks', overdue],
                      ['dueSoonTasks', dueSoon],
                    ] as const
                  ).map(([key, rows]) => (
                    <div key={key}>
                      <h3>{t(`executiveDashboard.${key}`)}</h3>
                      {rows.length ? (
                        <ul className="executive-dashboard__list">
                          {rows.map((row) => (
                            <li key={row.id}>
                              {link(`/tasks?task=${row.id}`, row.title)}
                              {row.dueAt ? (
                                <time dateTime={row.dueAt}>{date(row.dueAt)}</time>
                              ) : null}
                            </li>
                          ))}
                        </ul>
                      ) : (
                        empty
                      )}
                    </div>
                  ))}
                  {link('/tasks', t('executiveDashboard.tasks'))}
                </>
              )}
            </DashboardWidget>
          ) : null}
          <DashboardWidget
            token={accessToken}
            load={loadActivity}
            title={t('executiveDashboard.activity')}
          >
            {(rows) => (
              <>
                <p>{t('executiveDashboard.newProcesses')}</p>
                {rows.length ? (
                  <ul className="executive-dashboard__list">
                    {rows.map((row) => {
                      const label = t('executiveDashboard.processLabel', {
                        mission: row.missionTitle,
                        stage: stage(row.pipelineState),
                      });
                      return (
                        <li key={row.processId}>
                          {canOpenMissions
                            ? link(
                                `${missionDeepLink(row.missionId)}&process=${row.processId}`,
                                label,
                              )
                            : label}
                          <time dateTime={row.createdAt}>{date(row.createdAt)}</time>
                        </li>
                      );
                    })}
                  </ul>
                ) : (
                  empty
                )}
              </>
            )}
          </DashboardWidget>
        </div>
      </div>
    </PageShell>
  );
}
