import type { ConversationDetail, ConversationSummary, MessageView } from '@hire-me/contracts';
import { useCallback, useEffect, useLayoutEffect, useRef, useState, type RefObject } from 'react';

import { useI18n } from '../i18n/index.js';
import { Button, InlineMessage, Skeleton, StatusBadge } from '../ui/index.js';
import {
  editConversationMessage,
  getConversation,
  hideConversation,
  listConversationMessages,
  markConversationRead,
  MessagingRequestError,
  sendConversationMessage,
  withdrawConversationMessage,
} from './messages-api.js';
import { MessageComposer, ReadOnlyComposer } from './MessageComposer.js';
import { MessageLog, type EditingState } from './MessageLog.js';
import {
  composerReadOnlyReason,
  conversationName,
  CONVERSATION_POLL_MS,
  isNotFound,
  isOwnMessage,
  MESSAGE_PAGE_MAX,
  MESSAGE_PAGE_SIZE,
  mergeMessages,
  messageBodyProblem,
  messagingFailureKey,
  newClientMessageId,
  POLL_OVERLAP,
  readOnlyReasonFromError,
  summaryFromDetail,
  type FailureKey,
  type ReadOnlyReason,
} from './messaging-state.js';
import { PaneHeader } from './NewConversation.js';
import { useAliveRef, useDocumentVisible, useVisibleInterval } from './polling.js';

type LoadState = 'loading' | 'ready' | 'notFound' | 'error';

/** Whether the end of the log is on screen. Without IntersectionObserver, assume it is. */
function useEndVisible(
  rootRef: RefObject<HTMLElement | null>,
  targetRef: RefObject<HTMLElement | null>,
  active: boolean,
): boolean {
  const [visible, setVisible] = useState(true);
  useEffect(() => {
    const target = targetRef.current;
    if (!active || !target || typeof IntersectionObserver === 'undefined') {
      setVisible(true);
      return;
    }
    const observer = new IntersectionObserver(
      (entries) => {
        const entry = entries.at(-1);
        if (entry) {
          setVisible(entry.isIntersecting);
        }
      },
      { root: rootRef.current, threshold: 0 },
    );
    observer.observe(target);
    return () => observer.disconnect();
  }, [active, rootRef, targetRef]);
  return visible;
}

/**
 * In the fill layout the log's height follows its neighbours (a growing draft,
 * a notice, a narrower header). A reader who was at the newest message stays
 * there when the log is resized, instead of the end slipping under the composer.
 */
function useKeepEndOnResize(
  logRef: RefObject<HTMLElement | null>,
  stickToEnd: RefObject<boolean>,
  active: boolean,
): void {
  useEffect(() => {
    const log = logRef.current;
    if (!active || !log || typeof ResizeObserver === 'undefined') {
      return;
    }
    const observer = new ResizeObserver(() => {
      if (stickToEnd.current) {
        log.scrollTop = log.scrollHeight;
      }
    });
    observer.observe(log);
    return () => observer.disconnect();
  }, [active, logRef, stickToEnd]);
}

/**
 * One conversation, keyed by its id by the caller: switching conversation or
 * session remounts it, and every late response is dropped through `alive`.
 */
export function ConversationPane({
  accessToken,
  actorUserId,
  canCreate,
  headingRef,
  initial,
  onBack,
  onChanged,
  onHidden,
  onOpenDetails,
  onRead,
  onSent,
  paneVisible,
}: {
  accessToken: string;
  actorUserId: string;
  canCreate: boolean;
  headingRef: RefObject<HTMLHeadingElement | null>;
  initial: ConversationSummary | ConversationDetail;
  onBack: () => void;
  onChanged: (summary: ConversationSummary) => void;
  onHidden: (conversationId: string) => void;
  onOpenDetails: (detail: ConversationDetail) => void;
  onRead: () => void;
  onSent: () => void;
  /** False while the list covers the pane on a stacked layout. */
  paneVisible: boolean;
}) {
  const { t } = useI18n();
  const conversationId = initial.id;
  const alive = useAliveRef();
  const docVisible = useDocumentVisible();
  const logRef = useRef<HTMLDivElement | null>(null);
  const endRef = useRef<HTMLDivElement | null>(null);

  const [detail, setDetail] = useState<ConversationDetail | null>(
    'members' in initial ? initial : null,
  );
  const [loadState, setLoadState] = useState<LoadState>('loading');
  const [messages, setMessages] = useState<MessageView[]>([]);
  const [hasEarlier, setHasEarlier] = useState(false);
  const [loadingEarlier, setLoadingEarlier] = useState(false);
  const [earlierFailure, setEarlierFailure] = useState<FailureKey | null>(null);
  const [announcement, setAnnouncement] = useState('');

  const [draft, setDraft] = useState('');
  const [sending, setSending] = useState(false);
  const [sendFailure, setSendFailure] = useState<FailureKey | null>(null);
  const [readOnlyOverride, setReadOnlyOverride] = useState<ReadOnlyReason | null>(null);
  const clientMessageId = useRef<string | null>(null);

  const [editing, setEditing] = useState<EditingState | null>(null);
  const [pendingMessageId, setPendingMessageId] = useState<string | null>(null);
  const [actionFailure, setActionFailure] = useState<FailureKey | null>(null);
  const [hiding, setHiding] = useState(false);

  const messagesRef = useRef(messages);
  messagesRef.current = messages;
  const detailRef = useRef(detail);
  detailRef.current = detail;
  const requestedRead = useRef(0);
  const polling = useRef(false);
  const scrollIntent = useRef<'bottom' | { previousHeight: number; previousTop: number } | null>(
    null,
  );

  const endVisible = useEndVisible(logRef, endRef, loadState === 'ready');
  const stickToEnd = useRef(true);
  stickToEnd.current = endVisible;
  useKeepEndOnResize(logRef, stickToEnd, loadState === 'ready');

  const applyDetail = useCallback(
    (incoming: ConversationDetail) => {
      // A poll started before a read can answer after it; the cursor never moves back.
      const base = detailRef.current;
      const next =
        base && base.lastReadSequence > incoming.lastReadSequence
          ? {
              ...incoming,
              lastReadSequence: base.lastReadSequence,
              unreadCount:
                incoming.lastMessageSequence <= base.lastReadSequence ? 0 : incoming.unreadCount,
            }
          : incoming;
      detailRef.current = next;
      setDetail(next);
      onChanged(summaryFromDetail(next));
    },
    [onChanged],
  );

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const [detailResponse, page] = await Promise.all([
          getConversation(accessToken, conversationId),
          listConversationMessages(accessToken, conversationId, { limit: MESSAGE_PAGE_SIZE }),
        ]);
        if (cancelled || !alive.current) {
          return;
        }
        applyDetail(detailResponse.conversation);
        scrollIntent.current = 'bottom';
        setMessages(page.messages);
        setHasEarlier(page.hasMore);
        setLoadState('ready');
      } catch (error) {
        if (!cancelled && alive.current) {
          setLoadState(isNotFound(error) ? 'notFound' : 'error');
        }
      }
    })();
    return () => {
      cancelled = true;
    };
    // The first load runs once per mounted conversation; later changes go through polling.
  }, [accessToken, conversationId]);

  useLayoutEffect(() => {
    const log = logRef.current;
    const intent = scrollIntent.current;
    if (!log || !intent) {
      return;
    }
    scrollIntent.current = null;
    if (intent === 'bottom') {
      log.scrollTop = log.scrollHeight;
    } else {
      log.scrollTop = intent.previousTop + (log.scrollHeight - intent.previousHeight);
    }
  }, [messages]);

  const poll = useCallback(async () => {
    if (polling.current || loadState !== 'ready') {
      return;
    }
    polling.current = true;
    const current = messagesRef.current;
    const anchor =
      current.length > POLL_OVERLAP ? current[current.length - 1 - POLL_OVERLAP] : null;
    const after = anchor ? anchor.sequence : Math.max((current[0]?.sequence ?? 1) - 1, 0);
    const lastSeen = current.at(-1)?.sequence ?? 0;
    try {
      const [detailResponse, page] = await Promise.all([
        getConversation(accessToken, conversationId),
        listConversationMessages(accessToken, conversationId, { after, limit: MESSAGE_PAGE_MAX }),
      ]);
      if (!alive.current) {
        return;
      }
      applyDetail(detailResponse.conversation);
      let merged: MessageView[];
      if (page.hasMore) {
        const latest = await listConversationMessages(accessToken, conversationId, {
          limit: MESSAGE_PAGE_SIZE,
        });
        if (!alive.current) {
          return;
        }
        merged = latest.messages;
        setHasEarlier(latest.hasMore);
      } else {
        merged = mergeMessages(messagesRef.current, page.messages);
      }
      const arrivals = merged.filter(
        (message) => message.sequence > lastSeen && !isOwnMessage(message, actorUserId),
      ).length;
      if (arrivals > 0) {
        setAnnouncement(t('messages.conversation.newMessages', { count: arrivals }));
        if (stickToEnd.current) {
          scrollIntent.current = 'bottom';
        }
      }
      setMessages(merged);
    } catch (error) {
      if (alive.current && isNotFound(error)) {
        setLoadState('notFound');
      }
    } finally {
      polling.current = false;
    }
  }, [accessToken, actorUserId, alive, applyDetail, conversationId, loadState, t]);

  useVisibleInterval(() => void poll(), CONVERSATION_POLL_MS, {
    enabled: loadState === 'ready',
    resetKey: conversationId,
  });

  const lastSequence = messages.at(-1)?.sequence ?? 0;
  const lastReadSequence = detail?.lastReadSequence ?? initial.lastReadSequence;
  const canMarkRead =
    loadState === 'ready' && paneVisible && docVisible && endVisible && lastSequence > 0;

  useEffect(() => {
    if (!canMarkRead || lastSequence <= lastReadSequence || lastSequence <= requestedRead.current) {
      return;
    }
    requestedRead.current = lastSequence;
    void (async () => {
      try {
        const cursor = await markConversationRead(accessToken, conversationId, lastSequence);
        const base = detailRef.current;
        if (!alive.current || !base || cursor.lastReadSequence < base.lastReadSequence) {
          return;
        }
        applyDetail({
          ...base,
          lastReadSequence: cursor.lastReadSequence,
          unreadCount: cursor.unreadCount,
        });
        onRead();
      } catch {
        if (alive.current) {
          requestedRead.current = Math.min(requestedRead.current, lastReadSequence);
        }
      }
    })();
  }, [
    accessToken,
    alive,
    applyDetail,
    canMarkRead,
    conversationId,
    lastReadSequence,
    lastSequence,
    onRead,
  ]);

  async function loadEarlier(): Promise<void> {
    const first = messages[0];
    if (!first || loadingEarlier) {
      return;
    }
    setLoadingEarlier(true);
    setEarlierFailure(null);
    try {
      const page = await listConversationMessages(accessToken, conversationId, {
        before: first.sequence,
        limit: MESSAGE_PAGE_SIZE,
      });
      if (!alive.current) {
        return;
      }
      const log = logRef.current;
      scrollIntent.current = log
        ? { previousHeight: log.scrollHeight, previousTop: log.scrollTop }
        : null;
      setMessages((current) => mergeMessages(current, page.messages));
      setHasEarlier(page.hasMore);
    } catch (error) {
      if (alive.current) {
        setEarlierFailure(messagingFailureKey(error));
      }
    } finally {
      if (alive.current) {
        setLoadingEarlier(false);
      }
    }
  }

  async function send(): Promise<void> {
    if (sending || messageBodyProblem(draft)) {
      return;
    }
    // Kept until the send succeeds, so a retry is recognised as the same message.
    clientMessageId.current ??= newClientMessageId();
    setSending(true);
    setSendFailure(null);
    try {
      const response = await sendConversationMessage(accessToken, conversationId, {
        body: draft.trim(),
        clientMessageId: clientMessageId.current,
      });
      if (!alive.current) {
        return;
      }
      clientMessageId.current = null;
      setDraft('');
      scrollIntent.current = 'bottom';
      setMessages((current) => mergeMessages(current, [response.message]));
      requestedRead.current = Math.max(requestedRead.current, response.message.sequence);
      const base = detailRef.current;
      if (base) {
        applyDetail({
          ...base,
          lastMessageAt: response.message.createdAt,
          lastMessageSequence: Math.max(base.lastMessageSequence, response.message.sequence),
          lastReadSequence: Math.max(base.lastReadSequence, response.message.sequence),
          unreadCount: 0,
        });
      }
      onSent();
    } catch (error) {
      if (!alive.current) {
        return;
      }
      const readOnly = readOnlyReasonFromError(error);
      if (readOnly) {
        setReadOnlyOverride(readOnly);
        return;
      }
      if (error instanceof MessagingRequestError && error.code === 'MESSAGE_CLIENT_ID_CONFLICT') {
        clientMessageId.current = null;
      }
      setSendFailure(messagingFailureKey(error));
    } finally {
      if (alive.current) {
        setSending(false);
      }
    }
  }

  async function saveEdit(): Promise<void> {
    if (!editing || editing.saving || messageBodyProblem(editing.draft)) {
      return;
    }
    const { draft: body, messageId } = editing;
    setEditing({ ...editing, error: null, saving: true });
    try {
      const response = await editConversationMessage(
        accessToken,
        conversationId,
        messageId,
        body.trim(),
      );
      if (!alive.current) {
        return;
      }
      setMessages((current) => mergeMessages(current, [response.message]));
      setEditing(null);
    } catch (error) {
      if (alive.current) {
        setEditing((current) =>
          current && current.messageId === messageId
            ? { ...current, error: messagingFailureKey(error), saving: false }
            : current,
        );
      }
    }
  }

  async function withdraw(message: MessageView): Promise<void> {
    if (pendingMessageId || !window.confirm(t('messages.message.withdrawConfirm'))) {
      return;
    }
    setPendingMessageId(message.id);
    setActionFailure(null);
    try {
      const response = await withdrawConversationMessage(accessToken, conversationId, message.id);
      if (alive.current) {
        setMessages((current) => mergeMessages(current, [response.message]));
      }
    } catch (error) {
      if (alive.current) {
        setActionFailure(messagingFailureKey(error));
      }
    } finally {
      if (alive.current) {
        setPendingMessageId(null);
      }
    }
  }

  async function hide(): Promise<void> {
    if (hiding || !window.confirm(t('messages.hide.confirm'))) {
      return;
    }
    setHiding(true);
    setActionFailure(null);
    try {
      await hideConversation(accessToken, conversationId);
      if (alive.current) {
        onHidden(conversationId);
      }
    } catch (error) {
      if (alive.current) {
        setActionFailure(messagingFailureKey(error));
        setHiding(false);
      }
    }
  }

  const summary = detail ?? initial;
  const name = conversationName(summary);
  const isGroup = summary.type === 'GROUP';
  const archived = summary.status === 'ARCHIVED';
  const readOnly = readOnlyOverride ?? composerReadOnlyReason(summary, canCreate);
  const writable = canCreate && !archived;

  const meta = (
    <>
      <span>
        {isGroup
          ? t('messages.list.memberCount', { count: summary.activeMemberCount })
          : t('messages.conversation.directMeta')}
      </span>
      {archived ? <StatusBadge tone="neutral">{t('messages.list.archived')}</StatusBadge> : null}
      {!isGroup && summary.counterpart?.inactive ? (
        <StatusBadge tone="warning">{t('messages.list.inactive')}</StatusBadge>
      ) : null}
    </>
  );

  const actions =
    loadState === 'ready' ? (
      isGroup ? (
        detail ? (
          <Button onClick={() => onOpenDetails(detail)} size="compact" variant="secondary">
            {t('messages.actions.details')}
          </Button>
        ) : null
      ) : (
        <Button
          loading={hiding}
          loadingLabel={t('common.status.working')}
          onClick={() => void hide()}
          size="compact"
          variant="secondary"
        >
          {t('messages.actions.hide')}
        </Button>
      )
    ) : null;

  return (
    <section className="messages-pane messages-conversation">
      <PaneHeader
        actions={actions}
        authored
        headingRef={headingRef}
        meta={loadState === 'notFound' ? undefined : meta}
        onBack={onBack}
        title={loadState === 'notFound' ? t('messages.conversation.errorTitle') : name}
      />
      {loadState === 'loading' ? <Skeleton label={t('messages.conversation.loading')} /> : null}
      {loadState === 'notFound' ? (
        <InlineMessage announce title={t('messages.conversation.errorTitle')} tone="warning">
          <p className="messages-text">{t('messages.conversation.notFound')}</p>
        </InlineMessage>
      ) : null}
      {loadState === 'error' ? (
        <InlineMessage announce title={t('messages.conversation.errorTitle')} tone="danger">
          <p className="messages-text">{t('messages.conversation.error')}</p>
        </InlineMessage>
      ) : null}
      {loadState === 'ready' ? (
        <>
          <MessageLog
            actorUserId={actorUserId}
            conversationActive={!archived}
            editing={editing}
            endRef={endRef}
            hasEarlier={hasEarlier}
            loadingEarlier={loadingEarlier}
            logRef={logRef}
            messages={messages}
            onCancelEdit={() => setEditing(null)}
            onEditDraft={(value) =>
              setEditing((current) => (current ? { ...current, draft: value } : current))
            }
            onLoadEarlier={() => void loadEarlier()}
            onSaveEdit={() => void saveEdit()}
            onStartEdit={(message) =>
              setEditing({
                draft: message.body ?? '',
                error: null,
                messageId: message.id,
                saving: false,
              })
            }
            onWithdraw={(message) => void withdraw(message)}
            pendingMessageId={pendingMessageId}
            writable={writable}
          />
          <p className="sr-only" role="status">
            {announcement}
          </p>
          {earlierFailure || actionFailure ? (
            <InlineMessage announce title={t('messages.feedback.errorTitle')} tone="danger">
              <p className="messages-text">
                {t(earlierFailure ?? actionFailure ?? 'messages.feedback.failure.generic')}
              </p>
            </InlineMessage>
          ) : null}
          <div className="messages-conversation__composer">
            {readOnly ? (
              <ReadOnlyComposer reason={readOnly} />
            ) : (
              <MessageComposer
                draft={draft}
                error={sendFailure}
                onChange={setDraft}
                onSend={() => void send()}
                sending={sending}
              />
            )}
          </div>
        </>
      ) : null}
    </section>
  );
}
