import type { Notification } from '@hire-me/contracts';
import { useId } from 'react';

import { useI18n } from '../i18n/index.js';
import { Button, Select, StatusBadge } from '../ui/index.js';
import { notificationCopyKeys, notificationStatusLabelKey } from './task-labels.js';
import type { TaskAccess } from './task-state.js';

export type NotificationFilter = '' | 'UNREAD' | 'READ';

/**
 * The current user's own notifications. Known task notification types are
 * worded in the interface language from their stable `type`; the status is a
 * localized label for the stored value, never the raw enum.
 */
export function TaskNotifications({
  access,
  busy,
  filter,
  notifications,
  onArchive,
  onFilter,
  onRead,
  onReadAll,
  pending,
  total,
}: {
  access: TaskAccess;
  busy: boolean;
  filter: NotificationFilter;
  notifications: Notification[];
  onArchive: (id: string) => void;
  onFilter: (status: NotificationFilter) => void;
  onRead: (id: string) => void;
  onReadAll: () => void;
  pending: string | null;
  total: number;
}) {
  const { formatDateTime, t } = useI18n();
  const headingId = useId();

  return (
    <section aria-labelledby={headingId} className="tasks__notifications">
      <div className="tasks__section-heading">
        <h2 id={headingId}>{t('task.notifications.title')}</h2>
        <span>{total}</span>
      </div>
      <div className="tasks__filter-actions">
        <Select
          label={t('task.notifications.status')}
          onChange={(event) => onFilter(event.target.value as NotificationFilter)}
          value={filter}
        >
          <option value="">{t('task.notifications.anyStatus')}</option>
          <option value="UNREAD">{t(notificationStatusLabelKey('UNREAD'))}</option>
          <option value="READ">{t(notificationStatusLabelKey('READ'))}</option>
        </Select>
        {access.canManageNotifications ? (
          <Button
            disabled={busy}
            loading={pending === 'notifications'}
            loadingLabel={t('task.actions.markAllRead')}
            onClick={onReadAll}
            size="compact"
            variant="secondary"
          >
            {t('task.actions.markAllRead')}
          </Button>
        ) : null}
      </div>
      {notifications.length ? (
        <ul className="tasks__notification-list">
          {notifications.map((notification) => {
            const copy = notificationCopyKeys(notification.type);
            return (
              <li key={notification.id}>
                <div>
                  <strong>{copy ? t(copy.title) : notification.title}</strong>
                  <span>{copy ? t(copy.body) : notification.bodySummary}</span>
                  <time dateTime={notification.createdAt}>
                    {formatDateTime(notification.createdAt)}
                  </time>
                </div>
                <StatusBadge tone={notification.status === 'UNREAD' ? 'info' : 'neutral'}>
                  {t(notificationStatusLabelKey(notification.status))}
                </StatusBadge>
                {notification.status === 'UNREAD' && access.canManageNotifications ? (
                  <Button
                    disabled={busy}
                    onClick={() => onRead(notification.id)}
                    size="compact"
                    variant="quiet"
                  >
                    {t('task.actions.markRead')}
                  </Button>
                ) : null}
                {access.canManageNotifications ? (
                  <Button
                    disabled={busy}
                    onClick={() => onArchive(notification.id)}
                    size="compact"
                    variant="quiet"
                  >
                    {t('task.actions.archiveNotification')}
                  </Button>
                ) : null}
              </li>
            );
          })}
        </ul>
      ) : (
        <p>{t('task.notifications.empty')}</p>
      )}
    </section>
  );
}

/**
 * Manual reminder delivery, kept out of the everyday action hierarchy.
 *
 * Delivery is a worker responsibility, but no background scheduler exists yet,
 * so the existing processor endpoint remains the only trigger. It is shown only
 * to managers who both manage reminders and oversee all tasks, collapsed, and
 * described as the diagnostic it is.
 */
export function ReminderDiagnostics({
  busy,
  onProcess,
  pending,
}: {
  busy: boolean;
  onProcess: () => void;
  pending: boolean;
}) {
  const { t } = useI18n();
  return (
    <details className="task-diagnostics">
      <summary>{t('task.diagnostics.title')}</summary>
      <p>{t('task.diagnostics.description')}</p>
      <Button
        disabled={busy}
        loading={pending}
        loadingLabel={t('task.actions.processReminders')}
        onClick={onProcess}
        size="compact"
        variant="secondary"
      >
        {t('task.actions.processReminders')}
      </Button>
    </details>
  );
}
