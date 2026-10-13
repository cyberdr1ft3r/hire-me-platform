import type { ConversationDetail, ConversationMemberView } from '@hire-me/contracts';
import { useEffect, useState, type FormEvent, type RefObject } from 'react';

import { useI18n, type MessageKey } from '../i18n/index.js';
import {
  BoundedCombobox,
  Button,
  InlineMessage,
  StatusBadge,
  TextField,
  type BoundedPickerOption,
} from '../ui/index.js';
import {
  addGroupMembers,
  archiveGroup,
  getConversation,
  leaveGroup,
  promoteGroupMember,
  removeGroupMember,
  renameGroup,
} from './messages-api.js';
import {
  GROUP_MAX_ACTIVE_MEMBERS,
  GROUP_TITLE_MAX_LENGTH,
  groupTitleProblem,
  isNotFound,
  messagingFailureKey,
  type FailureKey,
} from './messaging-state.js';
import { PaneHeader, SelectedPeople } from './NewConversation.js';
import { participantOptions } from './participant-options.js';
import { useAliveRef } from './polling.js';

type Feedback =
  | { key: Extract<MessageKey, `messages.feedback.${string}`>; tone: 'success' }
  | { key: FailureKey; tone: 'danger' };

function sameUser(left: string, right: string): boolean {
  return left.toLowerCase() === right.toLowerCase();
}

/**
 * Members and management of one group. What a member may do follows the API:
 * owners add, remove members, promote, rename, and archive; anyone may leave.
 * Owners are never demoted or removed here, and ownership is never transferred
 * automatically.
 */
export function GroupDetails({
  accessToken,
  actorUserId,
  canCreate,
  headingRef,
  initial,
  onBack,
  onChanged,
  onLeft,
}: {
  accessToken: string;
  actorUserId: string;
  canCreate: boolean;
  headingRef: RefObject<HTMLHeadingElement | null>;
  initial: ConversationDetail;
  onBack: () => void;
  onChanged: (detail: ConversationDetail) => void;
  onLeft: (conversationId: string) => void;
}) {
  const { t } = useI18n();
  const alive = useAliveRef();
  const [detail, setDetail] = useState(initial);
  const [missing, setMissing] = useState(false);
  const [title, setTitle] = useState(initial.title ?? '');
  const [adding, setAdding] = useState<BoundedPickerOption[]>([]);
  const [pending, setPending] = useState<string | null>(null);
  const [feedback, setFeedback] = useState<Feedback | null>(null);

  const conversationId = initial.id;

  useEffect(() => {
    let cancelled = false;
    void getConversation(accessToken, conversationId).then(
      (response) => {
        if (!cancelled && alive.current) {
          setDetail(response.conversation);
          setTitle(response.conversation.title ?? '');
          onChanged(response.conversation);
        }
      },
      (error: unknown) => {
        if (!cancelled && alive.current && isNotFound(error)) {
          setMissing(true);
        }
      },
    );
    return () => {
      cancelled = true;
    };
    // Refreshed once on open; each mutation returns the next detail.
  }, [accessToken, conversationId]);

  const active = detail.status === 'ACTIVE';
  const owner = detail.myRole === 'OWNER';
  const manage = canCreate && active && owner;
  const full = detail.activeMemberCount + adding.length >= GROUP_MAX_ACTIVE_MEMBERS;
  const titleProblem = groupTitleProblem(title);

  async function run(
    action: string,
    request: () => Promise<ConversationDetail | null>,
    success: Extract<Feedback, { tone: 'success' }>['key'],
  ): Promise<boolean> {
    if (pending) {
      return false;
    }
    setPending(action);
    setFeedback(null);
    try {
      const next = await request();
      if (!alive.current) {
        return false;
      }
      if (next) {
        setDetail(next);
        onChanged(next);
      }
      setFeedback({ key: success, tone: 'success' });
      return true;
    } catch (error) {
      if (alive.current) {
        if (isNotFound(error)) {
          setMissing(true);
        }
        setFeedback({ key: messagingFailureKey(error), tone: 'danger' });
      }
      return false;
    } finally {
      if (alive.current) {
        setPending(null);
      }
    }
  }

  function rename(event: FormEvent<HTMLFormElement>): void {
    event.preventDefault();
    if (titleProblem || title.trim() === detail.title) {
      return;
    }
    void run(
      'rename',
      async () => (await renameGroup(accessToken, conversationId, title.trim())).conversation,
      'messages.feedback.renamed',
    );
  }

  function add(event: FormEvent<HTMLFormElement>): void {
    event.preventDefault();
    if (adding.length === 0) {
      return;
    }
    const userIds = adding.map((person) => person.id);
    void run(
      'add',
      async () => (await addGroupMembers(accessToken, conversationId, userIds)).conversation,
      'messages.feedback.added',
    ).then((ok) => {
      if (ok && alive.current) {
        setAdding([]);
      }
    });
  }

  function remove(member: ConversationMemberView): void {
    if (!window.confirm(t('messages.details.removeConfirm', { name: member.user.displayName }))) {
      return;
    }
    void run(
      'remove',
      async () =>
        (await removeGroupMember(accessToken, conversationId, member.user.id)).conversation,
      'messages.feedback.removed',
    );
  }

  function promote(member: ConversationMemberView): void {
    if (!window.confirm(t('messages.details.promoteConfirm', { name: member.user.displayName }))) {
      return;
    }
    void run(
      'promote',
      async () =>
        (await promoteGroupMember(accessToken, conversationId, member.user.id)).conversation,
      'messages.feedback.promoted',
    );
  }

  function archive(): void {
    if (!window.confirm(t('messages.details.archiveConfirm'))) {
      return;
    }
    void run(
      'archive',
      async () => (await archiveGroup(accessToken, conversationId)).conversation,
      'messages.feedback.archived',
    );
  }

  function leave(): void {
    if (!window.confirm(t('messages.details.leaveConfirm'))) {
      return;
    }
    void run(
      'leave',
      async () => {
        await leaveGroup(accessToken, conversationId);
        return null;
      },
      'messages.feedback.left',
    ).then((ok) => {
      if (ok && alive.current) {
        onLeft(conversationId);
      }
    });
  }

  if (missing) {
    return (
      <section className="messages-pane">
        <PaneHeader
          backLabel={t('messages.details.back')}
          headingRef={headingRef}
          onBack={onBack}
          title={t('messages.conversation.errorTitle')}
        />
        <InlineMessage announce title={t('messages.conversation.errorTitle')} tone="warning">
          <p className="messages-text">{t('messages.conversation.notFound')}</p>
        </InlineMessage>
      </section>
    );
  }

  return (
    <section className="messages-pane messages-details">
      <PaneHeader
        authored
        backLabel={t('messages.details.back')}
        headingRef={headingRef}
        meta={
          <>
            <span>{t('messages.details.title')}</span>
            <span>{t('messages.list.memberCount', { count: detail.activeMemberCount })}</span>
            {active ? null : (
              <StatusBadge tone="neutral">{t('messages.list.archived')}</StatusBadge>
            )}
          </>
        }
        onBack={onBack}
        title={detail.title ?? ''}
      />
      {feedback ? (
        <InlineMessage
          announce
          title={
            feedback.tone === 'success'
              ? t('messages.feedback.successTitle')
              : t('messages.feedback.errorTitle')
          }
          tone={feedback.tone}
        >
          <p className="messages-text">{t(feedback.key)}</p>
        </InlineMessage>
      ) : null}
      {active ? null : (
        <InlineMessage title={t('messages.composer.readOnlyArchivedTitle')} tone="info">
          <p className="messages-text">{t('messages.details.archivedNotice')}</p>
        </InlineMessage>
      )}
      {manage ? (
        <form className="messages-form messages-form--inline" onSubmit={rename}>
          <TextField
            error={titleProblem === 'required' ? t('messages.newGroup.nameRequired') : undefined}
            hint={t('messages.newGroup.nameHint')}
            label={t('messages.details.rename')}
            maxLength={GROUP_TITLE_MAX_LENGTH}
            onChange={(event) => setTitle(event.currentTarget.value)}
            required
            translate="no"
            value={title}
          />
          <div className="messages-form__actions">
            <Button
              disabled={titleProblem !== null || title.trim() === detail.title}
              loading={pending === 'rename'}
              loadingLabel={t('common.status.working')}
              size="compact"
              type="submit"
              variant="secondary"
            >
              {t('messages.details.renameSubmit')}
            </Button>
          </div>
        </form>
      ) : null}
      <section aria-labelledby="messages-details-members" className="messages-details__members">
        <h3 id="messages-details-members">{t('messages.details.members')}</h3>
        {owner ? null : <p className="messages-muted">{t('messages.details.ownerNote')}</p>}
        <ul className="messages-members">
          {detail.members.map((member) => {
            const you = sameUser(member.user.id, actorUserId);
            const memberRole = member.role === 'OWNER';
            return (
              <li className="messages-member" key={member.user.id}>
                <div className="messages-member__identity">
                  <span className="messages-member__name" translate="no">
                    {member.user.displayName}
                  </span>
                  <span className="messages-member__detail" translate="no">
                    {member.user.email}
                  </span>
                </div>
                <div className="messages-member__markers">
                  <StatusBadge tone={memberRole ? 'info' : 'neutral'}>
                    {memberRole ? t('messages.details.owner') : t('messages.details.member')}
                  </StatusBadge>
                  {you ? (
                    <span className="messages-marker">{t('messages.details.you')}</span>
                  ) : null}
                  {member.user.inactive ? (
                    <StatusBadge tone="warning">{t('messages.details.inactive')}</StatusBadge>
                  ) : null}
                </div>
                {manage && !you && !memberRole ? (
                  <div className="messages-member__actions">
                    <Button
                      disabled={pending !== null}
                      onClick={() => promote(member)}
                      size="compact"
                      variant="quiet"
                    >
                      {t('messages.details.promote')}
                    </Button>
                    <Button
                      disabled={pending !== null}
                      onClick={() => remove(member)}
                      size="compact"
                      variant="quiet"
                    >
                      {t('messages.details.remove')}
                    </Button>
                  </div>
                ) : null}
              </li>
            );
          })}
        </ul>
      </section>
      {manage ? (
        <form aria-labelledby="messages-details-add" className="messages-form" onSubmit={add}>
          <h3 id="messages-details-add">{t('messages.details.addTitle')}</h3>
          <BoundedCombobox
            disabled={full}
            hint={
              full
                ? t('messages.newGroup.maxMembers', { max: GROUP_MAX_ACTIVE_MEMBERS })
                : t('messages.newGroup.memberHint')
            }
            label={t('messages.newGroup.memberPicker')}
            loadOptions={participantOptions({
              accessToken,
              conversationId,
              exclude: [
                ...detail.members.map((member) => member.user.id),
                ...adding.map((person) => person.id),
              ],
              purpose: 'group-add',
            })}
            onChange={(option) => {
              if (option && !full) {
                setAdding((current) =>
                  current.some((person) => person.id === option.id)
                    ? current
                    : [...current, option],
                );
              }
            }}
            sourceKey={`group-add:${adding.length}:${detail.activeMemberCount}`}
            value={null}
          />
          <SelectedPeople
            onRemove={(id) => setAdding((current) => current.filter((person) => person.id !== id))}
            people={adding}
          />
          <p className="messages-muted">{t('messages.newGroup.historyNotice')}</p>
          <div className="messages-form__actions">
            <Button
              disabled={adding.length === 0}
              loading={pending === 'add'}
              loadingLabel={t('common.status.working')}
              size="compact"
              type="submit"
            >
              {t('messages.details.addSubmit')}
            </Button>
          </div>
        </form>
      ) : null}
      {canCreate && active ? (
        <div className="messages-details__danger">
          <Button
            disabled={pending !== null && pending !== 'leave'}
            loading={pending === 'leave'}
            loadingLabel={t('common.status.working')}
            onClick={leave}
            size="compact"
            variant="secondary"
          >
            {t('messages.details.leave')}
          </Button>
          {manage ? (
            <Button
              disabled={pending !== null && pending !== 'archive'}
              loading={pending === 'archive'}
              loadingLabel={t('common.status.working')}
              onClick={archive}
              size="compact"
              variant="danger"
            >
              {t('messages.details.archive')}
            </Button>
          ) : null}
        </div>
      ) : null}
    </section>
  );
}
