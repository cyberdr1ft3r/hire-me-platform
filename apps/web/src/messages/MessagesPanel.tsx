import type {
  ConversationDetail,
  ConversationListFilter,
  ConversationSummary,
} from '@hire-me/contracts';
import { useCallback, useEffect, useRef, useState, type RefObject } from 'react';

import { useI18n } from '../i18n/index.js';
import {
  isStackedMasterDetailLayout,
  useStackedMasterDetailReveal,
} from '../layout/stacked-master-detail.js';
import {
  Button,
  ContextualActions,
  DirectoryPage,
  EmptyState,
  InlineMessage,
  Skeleton,
  StatusBadge,
  WorkspacePane,
  WorkspaceSurface,
  WorkspaceToolbar,
} from '../ui/index.js';
import { ConversationPane } from './ConversationPane.js';
import { GroupDetails } from './GroupDetails.js';
import { getConversation, listConversations } from './messages-api.js';
import { resolveMessagingAccess } from './messaging-access.js';
import {
  appendPage,
  applyConversationRowToList,
  conversationName,
  formatUnreadBadge,
  isSameLocalDay,
  LIST_POLL_MS,
  MESSAGES_SIDE_BY_SIDE_MIN_REM,
  MESSAGING_UNREAD_COUNT_CAP,
  reconcileConversationListAfterFirstPageRefresh,
  summaryFromDetail,
} from './messaging-state.js';
import { NewDirectPane, NewGroupPane } from './NewConversation.js';
import { useAliveRef, useVisibleInterval } from './polling.js';
import { UnsavedInputScope } from '../navigation/UnsavedInputScope.js';

type PaneMode =
  | { kind: 'empty' }
  | { kind: 'conversation'; conversation: ConversationSummary | ConversationDetail }
  | { kind: 'details'; conversation: ConversationDetail }
  | { kind: 'new-direct' }
  | { kind: 'new-group' };

type ListState =
  | { status: 'loading' }
  | { status: 'error' }
  | { conversations: ConversationSummary[]; nextCursor: string | null; status: 'ready' };

const FILTERS: readonly ConversationListFilter[] = ['all', 'unread', 'archived'];

/** Tracks whether the workspace is narrow enough to show one pane at a time. */
function useStackedLayout(containerRef: RefObject<HTMLElement | null>): boolean {
  const [stacked, setStacked] = useState(true);
  useEffect(() => {
    const measure = () =>
      setStacked(isStackedMasterDetailLayout(containerRef.current, MESSAGES_SIDE_BY_SIDE_MIN_REM));
    measure();
    const container = containerRef.current;
    if (container && typeof ResizeObserver !== 'undefined') {
      const observer = new ResizeObserver(measure);
      observer.observe(container);
      return () => observer.disconnect();
    }
    window.addEventListener('resize', measure);
    return () => window.removeEventListener('resize', measure);
  }, [containerRef]);
  return stacked;
}

/**
 * `/messages`. A new token, actor, or permission set remounts the workspace, so
 * nothing loaded for the previous session can land in the next one.
 */
export function MessagesPanel({
  accessToken,
  actorUserId,
  initialConversationId,
  onUnreadChanged,
  permissions,
}: {
  accessToken: string;
  actorUserId: string;
  initialConversationId?: string | null;
  onUnreadChanged: () => void;
  permissions: readonly string[];
}) {
  const sessionKey = `${actorUserId}\n${[...permissions].sort().join(' ')}\n${accessToken}`;
  return (
    /*
     * An unsent draft, an open message edit or a new-conversation form asks before
     * leaving (Issue #228 B0′). Each clears itself on success (sent, closed, opened),
     * and group details keep their own scope for the forms that stay open.
     */
    <UnsavedInputScope writePending={false}>
      <MessagesWorkspace
        accessToken={accessToken}
        actorUserId={actorUserId}
        initialConversationId={initialConversationId}
        key={sessionKey}
        onUnreadChanged={onUnreadChanged}
        permissions={permissions}
      />
    </UnsavedInputScope>
  );
}

function MessagesWorkspace({
  accessToken,
  actorUserId,
  initialConversationId,
  onUnreadChanged,
  permissions,
}: {
  accessToken: string;
  actorUserId: string;
  initialConversationId?: string | null;
  onUnreadChanged: () => void;
  permissions: readonly string[];
}) {
  const { t } = useI18n();
  const access = resolveMessagingAccess(permissions);
  const alive = useAliveRef();
  const containerRef = useRef<HTMLDivElement | null>(null);
  const headingRef = useRef<HTMLHeadingElement | null>(null);
  const listHeadingRef = useRef<HTMLHeadingElement | null>(null);
  const rowRefs = useRef(new Map<string, HTMLButtonElement>());
  const returnFocusTo = useRef<string | null>(null);
  const stacked = useStackedLayout(containerRef);

  const [filter, setFilter] = useState<ConversationListFilter>('all');
  const [list, setList] = useState<ListState>({ status: 'loading' });
  const [loadingMore, setLoadingMore] = useState(false);
  const [moreFailed, setMoreFailed] = useState(false);
  const [mode, setMode] = useState<PaneMode>({ kind: 'empty' });
  const [mobileView, setMobileView] = useState<'list' | 'detail'>('list');
  const [revealToken, setRevealToken] = useState(0);
  const [notice, setNotice] = useState<'hidden' | 'left' | null>(null);
  const [reloadKey, setReloadKey] = useState(0);
  const listGeneration = useRef(0);
  const pagesLoaded = useRef(0);
  const refreshing = useRef(false);
  const openedIntent = useRef<string | null>(null);

  useStackedMasterDetailReveal({
    containerRef,
    ready: mode.kind !== 'empty',
    revealToken,
    sideBySideMinRem: MESSAGES_SIDE_BY_SIDE_MIN_REM,
    targetRef: headingRef,
  });

  useEffect(() => {
    const generation = ++listGeneration.current;
    pagesLoaded.current = 0;
    setList({ status: 'loading' });
    setMoreFailed(false);
    listConversations(accessToken, { filter }).then(
      (page) => {
        if (alive.current && generation === listGeneration.current) {
          pagesLoaded.current = 1;
          setList({
            conversations: page.conversations,
            nextCursor: page.nextCursor,
            status: 'ready',
          });
        }
      },
      () => {
        if (alive.current && generation === listGeneration.current) {
          setList({ status: 'error' });
        }
      },
    );
  }, [accessToken, alive, filter, reloadKey]);

  /** Re-reads the first page in place; later pages already loaded keep their rows. */
  const refreshList = useCallback(() => {
    if (refreshing.current || pagesLoaded.current === 0) {
      return;
    }
    refreshing.current = true;
    const generation = listGeneration.current;
    listConversations(accessToken, { filter })
      .then((page) => {
        if (!alive.current || generation !== listGeneration.current) {
          return;
        }
        setList((current) =>
          current.status === 'ready'
            ? {
                conversations: reconcileConversationListAfterFirstPageRefresh(
                  current.conversations,
                  page.conversations,
                  filter,
                ),
                nextCursor: pagesLoaded.current === 1 ? page.nextCursor : current.nextCursor,
                status: 'ready',
              }
            : current,
        );
      })
      .catch(() => undefined)
      .finally(() => {
        refreshing.current = false;
      });
  }, [accessToken, alive, filter]);

  useVisibleInterval(refreshList, LIST_POLL_MS, {
    enabled: list.status === 'ready',
    resetKey: filter,
  });

  useEffect(() => {
    if (!initialConversationId || openedIntent.current === initialConversationId) return;
    openedIntent.current = initialConversationId;
    getConversation(accessToken, initialConversationId).then(
      ({ conversation }) => {
        if (!alive.current || openedIntent.current !== initialConversationId) return;
        returnFocusTo.current = conversation.id;
        setNotice(null);
        setMode({ conversation, kind: 'conversation' });
        setMobileView('detail');
        setRevealToken((token) => token + 1);
      },
      () => {
        // The scoped API deliberately gives the same result for missing,
        // removed and foreign conversations. Keep the safe inbox visible.
      },
    );
  }, [accessToken, alive, initialConversationId]);

  async function loadMore(): Promise<void> {
    if (list.status !== 'ready' || !list.nextCursor || loadingMore) {
      return;
    }
    const generation = listGeneration.current;
    setLoadingMore(true);
    setMoreFailed(false);
    try {
      const page = await listConversations(accessToken, { cursor: list.nextCursor, filter });
      if (!alive.current || generation !== listGeneration.current) {
        return;
      }
      pagesLoaded.current += 1;
      setList((current) =>
        current.status === 'ready'
          ? {
              conversations: appendPage(current.conversations, page.conversations),
              nextCursor: page.nextCursor,
              status: 'ready',
            }
          : current,
      );
    } catch {
      if (alive.current && generation === listGeneration.current) {
        setMoreFailed(true);
      }
    } finally {
      if (alive.current) {
        setLoadingMore(false);
      }
    }
  }

  const updateRow = useCallback(
    (summary: ConversationSummary) => {
      setList((current) =>
        current.status === 'ready'
          ? {
              ...current,
              conversations: applyConversationRowToList(current.conversations, summary, filter),
            }
          : current,
      );
    },
    [filter],
  );

  const removeRow = useCallback((conversationId: string) => {
    setList((current) =>
      current.status === 'ready'
        ? {
            ...current,
            conversations: current.conversations.filter(
              (conversation) => conversation.id !== conversationId,
            ),
          }
        : current,
    );
  }, []);

  function openPane(next: PaneMode): void {
    setNotice(null);
    setMode(next);
    setMobileView('detail');
    setRevealToken((token) => token + 1);
  }

  function selectConversation(conversation: ConversationSummary): void {
    returnFocusTo.current = conversation.id;
    openPane({ conversation, kind: 'conversation' });
  }

  function backToList(): void {
    setMode({ kind: 'empty' });
    setMobileView('list');
    const target = returnFocusTo.current;
    requestAnimationFrame(() => {
      const row = target ? rowRefs.current.get(target) : undefined;
      (row ?? listHeadingRef.current)?.focus();
    });
  }

  function opened(detail: ConversationDetail): void {
    returnFocusTo.current = detail.id;
    openPane({ conversation: detail, kind: 'conversation' });
    refreshList();
  }

  const handleRead = useCallback(() => onUnreadChanged(), [onUnreadChanged]);
  const handleSent = useCallback(() => refreshList(), [refreshList]);

  function closeConversation(conversationId: string, reason: 'hidden' | 'left'): void {
    // Only reached after the API confirmed the change.
    removeRow(conversationId);
    returnFocusTo.current = null;
    setMode({ kind: 'empty' });
    setMobileView('list');
    setNotice(reason);
    onUnreadChanged();
    requestAnimationFrame(() => listHeadingRef.current?.focus());
  }

  const paneVisible = mobileView === 'detail' || !stacked;
  const selectedId =
    mode.kind === 'conversation' || mode.kind === 'details' ? mode.conversation.id : null;

  return (
    <DirectoryPage
      aria-label={t('messages.region')}
      className="messages-panel ui-workspace-page"
      compact
      // A phone showing one thread gives its height to the conversation; the
      // description stays on the inbox view and on side-by-side layouts.
      description={
        stacked && mobileView === 'detail' ? undefined : t('messages.header.description')
      }
      eyebrow={t('messages.header.eyebrow')}
      layout="fill"
      notices={
        <>
          {access.create ? null : (
            <InlineMessage title={t('messages.readOnly.title')} tone="info">
              <p className="messages-text">{t('messages.readOnly.body')}</p>
            </InlineMessage>
          )}
          {notice ? (
            <InlineMessage announce title={t('messages.feedback.successTitle')} tone="success">
              <p className="messages-text">
                {notice === 'hidden' ? t('messages.feedback.hidden') : t('messages.feedback.left')}
              </p>
            </InlineMessage>
          ) : null}
        </>
      }
      primaryAction={
        access.create ? (
          <ContextualActions
            primary={
              <Button onClick={() => openPane({ kind: 'new-direct' })}>
                {t('messages.actions.newMessage')}
              </Button>
            }
            secondary={
              <Button onClick={() => openPane({ kind: 'new-group' })} variant="secondary">
                {t('messages.actions.newGroup')}
              </Button>
            }
          />
        ) : undefined
      }
      title={t('messages.header.title')}
    >
      <WorkspaceSurface className="messages-workspace" ref={containerRef} view={mobileView}>
        <WorkspacePane
          aria-labelledby="messages-list-title"
          className="messages-list"
          kind="list"
          toolbar={
            <WorkspaceToolbar
              heading={
                <h2 id="messages-list-title" ref={listHeadingRef} tabIndex={-1}>
                  {t('messages.list.title')}
                </h2>
              }
            >
              <div
                aria-label={t('messages.filters.label')}
                className="messages-filters"
                role="group"
              >
                {FILTERS.map((option) => (
                  <Button
                    aria-pressed={filter === option}
                    key={option}
                    onClick={() => setFilter(option)}
                    size="compact"
                    variant={filter === option ? 'primary' : 'secondary'}
                  >
                    {t(`messages.filters.${option}`)}
                  </Button>
                ))}
              </div>
            </WorkspaceToolbar>
          }
        >
          <ConversationList
            filter={filter}
            list={list}
            loadingMore={loadingMore}
            moreFailed={moreFailed}
            onLoadMore={() => void loadMore()}
            onRetry={() => setReloadKey((key) => key + 1)}
            onSelect={selectConversation}
            rowRefs={rowRefs}
            selectedId={selectedId}
          />
        </WorkspacePane>
        <WorkspacePane as="div" className="messages-detail" kind="detail">
          {mode.kind === 'empty' ? (
            <div className="messages-detail__empty">
              <EmptyState title={t('messages.conversation.selectPromptTitle')}>
                {t('messages.conversation.selectPrompt')}
              </EmptyState>
            </div>
          ) : null}
          {mode.kind === 'conversation' ? (
            <ConversationPane
              accessToken={accessToken}
              actorUserId={actorUserId}
              canCreate={access.create}
              headingRef={headingRef}
              initial={mode.conversation}
              key={mode.conversation.id}
              onBack={backToList}
              onChanged={updateRow}
              onHidden={(id) => closeConversation(id, 'hidden')}
              onOpenDetails={(detail) => setMode({ conversation: detail, kind: 'details' })}
              onRead={handleRead}
              onSent={handleSent}
              paneVisible={paneVisible}
            />
          ) : null}
          {mode.kind === 'details' ? (
            <GroupDetails
              accessToken={accessToken}
              actorUserId={actorUserId}
              canCreate={access.create}
              headingRef={headingRef}
              initial={mode.conversation}
              key={mode.conversation.id}
              onBack={() => setMode({ conversation: mode.conversation, kind: 'conversation' })}
              onChanged={(detail) => {
                updateRow(summaryFromDetail(detail));
                setMode((current) =>
                  current.kind === 'details' && current.conversation.id === detail.id
                    ? { conversation: detail, kind: 'details' }
                    : current,
                );
              }}
              onLeft={(id) => closeConversation(id, 'left')}
            />
          ) : null}
          {mode.kind === 'new-direct' && access.create ? (
            <NewDirectPane
              accessToken={accessToken}
              headingRef={headingRef}
              onBack={backToList}
              onOpened={opened}
            />
          ) : null}
          {mode.kind === 'new-group' && access.create ? (
            <NewGroupPane
              accessToken={accessToken}
              headingRef={headingRef}
              onBack={backToList}
              onCreated={opened}
            />
          ) : null}
        </WorkspacePane>
      </WorkspaceSurface>
    </DirectoryPage>
  );
}

function ConversationList({
  filter,
  list,
  loadingMore,
  moreFailed,
  onLoadMore,
  onRetry,
  onSelect,
  rowRefs,
  selectedId,
}: {
  filter: ConversationListFilter;
  list: ListState;
  loadingMore: boolean;
  moreFailed: boolean;
  onLoadMore: () => void;
  onRetry: () => void;
  onSelect: (conversation: ConversationSummary) => void;
  rowRefs: RefObject<Map<string, HTMLButtonElement>>;
  selectedId: string | null;
}) {
  const { formatDateTime, t } = useI18n();

  if (list.status === 'loading') {
    return <Skeleton label={t('messages.list.loading')} />;
  }
  if (list.status === 'error') {
    return (
      <InlineMessage announce title={t('messages.list.errorTitle')} tone="danger">
        <p className="messages-text">{t('messages.list.error')}</p>
        <Button onClick={onRetry} size="compact" variant="secondary">
          {t('common.actions.retry')}
        </Button>
      </InlineMessage>
    );
  }
  if (list.conversations.length === 0) {
    const [title, body] =
      filter === 'unread'
        ? [t('messages.list.emptyUnreadTitle'), t('messages.list.emptyUnread')]
        : filter === 'archived'
          ? [t('messages.list.emptyArchivedTitle'), t('messages.list.emptyArchived')]
          : [t('messages.list.emptyTitle'), t('messages.list.emptyAll')];
    return <EmptyState title={title}>{body}</EmptyState>;
  }

  const now = new Date();
  return (
    <>
      <ul className="messages-rows">
        {list.conversations.map((conversation) => {
          const unread = conversation.unreadCount;
          const activity = conversation.lastMessageAt;
          return (
            <li key={conversation.id}>
              <button
                aria-current={conversation.id === selectedId ? 'true' : undefined}
                className="messages-row"
                data-unread={unread > 0 ? 'true' : undefined}
                onClick={() => onSelect(conversation)}
                ref={(element) => {
                  if (element) {
                    rowRefs.current.set(conversation.id, element);
                  } else {
                    rowRefs.current.delete(conversation.id);
                  }
                }}
                type="button"
              >
                <span className="messages-row__main">
                  <span className="messages-row__name" translate="no">
                    {conversationName(conversation)}
                  </span>
                  <span className="messages-row__meta">
                    {conversation.type === 'GROUP' ? (
                      <span>
                        {t('messages.list.memberCount', { count: conversation.activeMemberCount })}
                      </span>
                    ) : null}
                    {conversation.type === 'PRIVATE' && conversation.counterpart?.inactive ? (
                      <StatusBadge tone="warning">{t('messages.list.inactive')}</StatusBadge>
                    ) : null}
                    {conversation.status === 'ARCHIVED' ? (
                      <StatusBadge tone="neutral">{t('messages.list.archived')}</StatusBadge>
                    ) : null}
                  </span>
                </span>
                <span className="messages-row__side">
                  {activity ? (
                    <time className="messages-row__time" dateTime={activity}>
                      {isSameLocalDay(new Date(activity), now)
                        ? formatDateTime(activity, { dateStyle: undefined, timeStyle: 'short' })
                        : formatDateTime(activity, { dateStyle: 'medium', timeStyle: undefined })}
                    </time>
                  ) : (
                    <span className="messages-row__time">{t('messages.list.noActivity')}</span>
                  )}
                  {unread > 0 ? (
                    <span className="messages-row__unread">
                      <span aria-hidden="true">{formatUnreadBadge(unread)}</span>
                      <span className="sr-only">
                        {unread >= MESSAGING_UNREAD_COUNT_CAP
                          ? t('messages.list.unreadMany')
                          : t('messages.list.unreadCount', { count: unread })}
                      </span>
                    </span>
                  ) : null}
                </span>
              </button>
            </li>
          );
        })}
      </ul>
      {list.nextCursor ? (
        <div className="messages-rows__more">
          <Button
            loading={loadingMore}
            loadingLabel={t('common.status.working')}
            onClick={onLoadMore}
            size="compact"
            variant="secondary"
          >
            {t('messages.actions.loadMore')}
          </Button>
        </div>
      ) : null}
      {moreFailed ? (
        <InlineMessage announce title={t('messages.list.errorTitle')} tone="danger">
          <p className="messages-text">{t('messages.list.error')}</p>
        </InlineMessage>
      ) : null}
    </>
  );
}
