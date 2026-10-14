import type { ConversationSummary, Notification } from '@hire-me/contracts';
import { useCallback, useEffect, useMemo, useRef, useState, type MouseEvent } from 'react';

import { listNotifications, markAllNotificationsRead, markNotificationRead } from '../../api.js';
import { useI18n } from '../../i18n/index.js';
import { canAccessInternalRoute } from '../../navigation/internal-navigation.js';
import { conversationDeepLink } from '../../navigation/record-deep-links.js';
import { listConversations } from '../../messages/messages-api.js';
import { conversationName, formatUnreadBadge } from '../../messages/messaging-state.js';
import { useVisibleInterval } from '../../messages/polling.js';
import { notificationCopyKeys } from '../../tasks/task-labels.js';
import { Button } from '../Button.js';
import { ShellIcon } from './ShellIcon.js';

type Filter = 'all' | 'unread';
type LoadState<T> =
  { status: 'idle' | 'loading' } | { status: 'error' } | { status: 'ready'; data: T };

export interface NotificationCenterProps {
  accessToken: string;
  messageUnreadCount: number | null;
  onMessageUnreadChanged: () => void;
  onNavigatePath: (path: string) => void;
  permissions: readonly string[];
}

const NOTIFICATION_POLL_MS = 60_000;

function plainClick(event: MouseEvent<HTMLAnchorElement>): boolean {
  return !(
    event.defaultPrevented ||
    event.button !== 0 ||
    event.metaKey ||
    event.ctrlKey ||
    event.shiftKey ||
    event.altKey
  );
}

function notificationDestination(
  notification: Notification,
  permissions: readonly string[],
): string | null {
  if (notification.taskId && canAccessInternalRoute('tasks', permissions)) {
    return `/tasks?task=${encodeURIComponent(notification.taskId)}`;
  }
  if (canAccessInternalRoute('missions', permissions)) {
    if (notification.interviewId)
      return `/missions?interview=${encodeURIComponent(notification.interviewId)}`;
    if (notification.missionCandidateId)
      return `/missions?process=${encodeURIComponent(notification.missionCandidateId)}`;
    if (notification.recruitmentMissionId)
      return `/missions?mission=${encodeURIComponent(notification.recruitmentMissionId)}`;
  }
  return null;
}

/** Compact AppShell aggregation. Each source retains its own authorization and read model. */
export function NotificationCenter(props: NotificationCenterProps) {
  const { formatDateTime, locale, t } = useI18n();
  const canViewNotifications = props.permissions.includes('notifications:view_own');
  const canUpdateNotifications = props.permissions.includes('notifications:update_own');
  const canViewMessages = props.permissions.includes('messages:view');
  const [open, setOpen] = useState(false);
  const [filter, setFilter] = useState<Filter>('all');
  const [notifications, setNotifications] = useState<LoadState<Notification[]>>({ status: 'idle' });
  const [conversations, setConversations] = useState<LoadState<ConversationSummary[]>>({
    status: 'idle',
  });
  const [notificationUnread, setNotificationUnread] = useState<number | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [actionFailed, setActionFailed] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const headingRef = useRef<HTMLHeadingElement>(null);
  const request = useRef(0);

  const refreshUnread = useCallback(() => {
    if (!canViewNotifications) {
      setNotificationUnread(0);
      return;
    }
    void listNotifications(props.accessToken, { pageSize: 1, status: 'UNREAD' }).then(
      (page) => setNotificationUnread(page.pageInfo.total),
      () => undefined,
    );
  }, [canViewNotifications, props.accessToken]);

  const refresh = useCallback(() => {
    const current = ++request.current;
    if (canViewNotifications) {
      setNotifications({ status: 'loading' });
      void listNotifications(props.accessToken, {
        pageSize: 25,
        status: filter === 'unread' ? 'UNREAD' : undefined,
      }).then(
        (page) => {
          if (request.current !== current) return;
          setNotifications({ data: page.notifications, status: 'ready' });
          if (filter === 'unread') setNotificationUnread(page.pageInfo.total);
        },
        () => request.current === current && setNotifications({ status: 'error' }),
      );
    } else {
      setNotifications({ data: [], status: 'ready' });
    }
    if (canViewMessages) {
      setConversations({ status: 'loading' });
      void listConversations(props.accessToken, { filter: 'unread' }).then(
        (page) =>
          request.current === current &&
          setConversations({ data: page.conversations, status: 'ready' }),
        () => request.current === current && setConversations({ status: 'error' }),
      );
    } else {
      setConversations({ data: [], status: 'ready' });
    }
  }, [canViewMessages, canViewNotifications, filter, props.accessToken]);

  useVisibleInterval(refreshUnread, NOTIFICATION_POLL_MS, {
    enabled: canViewNotifications,
    resetKey: props.accessToken,
    runOnStart: true,
  });

  useEffect(() => {
    if (open) refresh();
  }, [open, refresh]);

  useEffect(() => {
    if (!open) return;
    const closeOutside = (event: PointerEvent) => {
      if (!rootRef.current?.contains(event.target as Node)) close(true);
    };
    document.addEventListener('pointerdown', closeOutside);
    requestAnimationFrame(() => headingRef.current?.focus());
    return () => document.removeEventListener('pointerdown', closeOutside);
  }, [open]);

  function close(restoreFocus: boolean): void {
    setOpen(false);
    if (restoreFocus) requestAnimationFrame(() => triggerRef.current?.focus());
  }

  async function readNotification(id: string): Promise<void> {
    if (!canUpdateNotifications || busy) return;
    setBusy(id);
    setActionFailed(false);
    try {
      const response = await markNotificationRead(props.accessToken, id);
      setNotifications((current) =>
        current.status === 'ready'
          ? {
              ...current,
              data: current.data.map((item) => (item.id === id ? response.notification : item)),
            }
          : current,
      );
      setNotificationUnread((count) => (count === null ? count : Math.max(0, count - 1)));
    } catch {
      setActionFailed(true);
    } finally {
      setBusy(null);
    }
  }

  async function readAll(): Promise<void> {
    if (!canUpdateNotifications || busy || !notificationUnread) return;
    setBusy('all');
    setActionFailed(false);
    try {
      await markAllNotificationsRead(props.accessToken, { status: 'UNREAD' });
      setNotificationUnread(0);
      setNotifications((current) =>
        current.status === 'ready'
          ? {
              ...current,
              data:
                filter === 'unread'
                  ? []
                  : current.data.map((item) => ({ ...item, status: 'READ', readAt: item.readAt })),
            }
          : current,
      );
    } catch {
      setActionFailed(true);
    } finally {
      setBusy(null);
    }
  }

  const combinedUnread = (notificationUnread ?? 0) + (props.messageUnreadCount ?? 0);
  const allItems = useMemo(() => {
    const notificationItems =
      notifications.status === 'ready'
        ? notifications.data.map((item) => ({
            createdAt: item.createdAt,
            item,
            source: 'notification' as const,
          }))
        : [];
    const messageItems =
      conversations.status === 'ready'
        ? conversations.data.map((item) => ({
            createdAt: item.lastMessageAt ?? item.createdAt,
            item,
            source: 'message' as const,
          }))
        : [];
    return [...notificationItems, ...messageItems].sort(
      (left, right) => Date.parse(right.createdAt) - Date.parse(left.createdAt),
    );
  }, [conversations, notifications]);
  const loading = notifications.status === 'loading' || conversations.status === 'loading';
  const failed = notifications.status === 'error' || conversations.status === 'error';

  if (!canViewNotifications && !canViewMessages) return null;

  return (
    <div
      className="notification-center"
      onBlur={(event) => {
        // Focus may move from the popover to a control behind it (for example a
        // creation-drawer trigger). Treat that as leaving the interaction
        // boundary, but keep focus on the new target instead of stealing it
        // back to the bell. Blurs between descendants remain inside the panel.
        const nextTarget = event.relatedTarget;
        if (!nextTarget || !rootRef.current?.contains(nextTarget)) close(false);
      }}
      ref={rootRef}
    >
      <button
        aria-controls="notification-center-panel"
        aria-expanded={open}
        aria-label={
          combinedUnread
            ? t('notificationCenter.bellUnread', { count: combinedUnread })
            : t('notificationCenter.bell')
        }
        className="notification-center__trigger"
        onClick={() => setOpen((value) => !value)}
        ref={triggerRef}
        title={t('notificationCenter.bell')}
        type="button"
      >
        <ShellIcon name="bell" />
        {combinedUnread ? (
          <span aria-hidden="true" className="notification-center__badge">
            {formatUnreadBadge(combinedUnread)}
          </span>
        ) : null}
      </button>
      {open ? (
        <section
          aria-labelledby="notification-center-title"
          className="notification-center__panel"
          id="notification-center-panel"
          onKeyDown={(event) => {
            if (event.key === 'Escape') {
              event.preventDefault();
              close(true);
            }
          }}
        >
          <header className="notification-center__header">
            <div>
              <h2 id="notification-center-title" ref={headingRef} tabIndex={-1}>
                {t('notificationCenter.title')}
              </h2>
              <p>{t('notificationCenter.summary', { count: combinedUnread })}</p>
            </div>
            {canUpdateNotifications && notificationUnread ? (
              <Button
                loading={busy === 'all'}
                onClick={() => void readAll()}
                size="compact"
                variant="quiet"
              >
                {t('notificationCenter.markAllNotificationsRead')}
              </Button>
            ) : null}
          </header>
          <div
            aria-label={t('notificationCenter.filters.label')}
            className="notification-center__filters"
            role="group"
          >
            {(['all', 'unread'] as const).map((value) => (
              <Button
                aria-pressed={filter === value}
                key={value}
                onClick={() => setFilter(value)}
                size="compact"
                variant={filter === value ? 'primary' : 'secondary'}
              >
                {t(`notificationCenter.filters.${value}`)}
              </Button>
            ))}
          </div>
          <div aria-live="polite" className="notification-center__body">
            {actionFailed ? (
              <p className="notification-center__action-error" role="alert">
                {t('notificationCenter.actionError')}
              </p>
            ) : null}
            {loading ? (
              <p className="notification-center__state">{t('notificationCenter.loading')}</p>
            ) : null}
            {failed ? (
              <div className="notification-center__state" role="alert">
                <p>{t('notificationCenter.error')}</p>
                <Button onClick={refresh} size="compact" variant="secondary">
                  {t('common.actions.retry')}
                </Button>
              </div>
            ) : null}
            {!loading && !failed && allItems.length === 0 ? (
              <p className="notification-center__state">{t('notificationCenter.empty')}</p>
            ) : null}
            {allItems.length ? (
              <ul className="notification-center__list">
                {allItems.map((entry) => {
                  if (entry.source === 'message') {
                    const conversation = entry.item;
                    const path = conversationDeepLink(conversation.id);
                    return (
                      <li data-unread="true" key={`message:${conversation.id}`}>
                        <a
                          href={path}
                          onClick={(event) => {
                            if (!plainClick(event)) return;
                            event.preventDefault();
                            close(false);
                            props.onNavigatePath(path);
                            props.onMessageUnreadChanged();
                          }}
                        >
                          <span className="notification-center__source">
                            {t('notificationCenter.sources.messages')}
                          </span>
                          <strong translate="no">{conversationName(conversation)}</strong>
                          <span>
                            {t('notificationCenter.messageSummary', {
                              count: conversation.unreadCount,
                            })}
                          </span>
                          <time dateTime={entry.createdAt}>
                            {relativeTime(entry.createdAt, locale, formatDateTime)}
                          </time>
                        </a>
                      </li>
                    );
                  }
                  const notification = entry.item;
                  const copy = notificationCopyKeys(notification.type);
                  const destination = notificationDestination(notification, props.permissions);
                  const content = (
                    <>
                      <span className="notification-center__source">
                        {t('notificationCenter.sources.notifications')}
                      </span>
                      <strong>{copy ? t(copy.title) : notification.title}</strong>
                      <span>{copy ? t(copy.body) : notification.bodySummary}</span>
                      <time dateTime={entry.createdAt}>
                        {relativeTime(entry.createdAt, locale, formatDateTime)}
                      </time>
                    </>
                  );
                  return (
                    <li
                      data-unread={notification.status === 'UNREAD' ? 'true' : undefined}
                      key={`notification:${notification.id}`}
                    >
                      {destination ? (
                        <a
                          href={destination}
                          onClick={(event) => {
                            if (!plainClick(event)) return;
                            event.preventDefault();
                            close(false);
                            props.onNavigatePath(destination);
                          }}
                        >
                          {content}
                        </a>
                      ) : (
                        <div>{content}</div>
                      )}
                      {notification.status === 'UNREAD' && canUpdateNotifications ? (
                        <Button
                          disabled={busy !== null}
                          onClick={() => void readNotification(notification.id)}
                          size="compact"
                          variant="quiet"
                        >
                          {t('notificationCenter.markRead')}
                        </Button>
                      ) : null}
                    </li>
                  );
                })}
              </ul>
            ) : null}
          </div>
        </section>
      ) : null}
    </div>
  );
}

function relativeTime(value: string, locale: string, fallback: (value: string) => string): string {
  const seconds = Math.round((Date.parse(value) - Date.now()) / 1000);
  const absolute = Math.abs(seconds);
  const [amount, unit]: [number, Intl.RelativeTimeFormatUnit] =
    absolute < 60
      ? [seconds, 'second']
      : absolute < 3600
        ? [Math.round(seconds / 60), 'minute']
        : absolute < 86_400
          ? [Math.round(seconds / 3600), 'hour']
          : absolute < 604_800
            ? [Math.round(seconds / 86_400), 'day']
            : [0, 'second'];
  return absolute < 604_800
    ? new Intl.RelativeTimeFormat(locale, { numeric: 'auto' }).format(amount, unit)
    : fallback(value);
}
