import type { MessageView } from '@hire-me/contracts';
import { useState, type FormEvent, type RefObject } from 'react';

import { authoredContentLanguage, useI18n } from '../i18n/index.js';
import { Button, InlineMessage, TextArea } from '../ui/index.js';
import {
  canEditMessage,
  canWithdrawMessage,
  groupMessagesByDay,
  isOwnMessage,
  MESSAGE_BODY_MAX_LENGTH,
  messageBodyProblem,
  relativeDay,
  type FailureKey,
} from './messaging-state.js';

const UNKNOWN_LANGUAGE = authoredContentLanguage(null);

export interface EditingState {
  draft: string;
  error: FailureKey | null;
  messageId: string;
  saving: boolean;
}

export function MessageLog({
  actorUserId,
  conversationActive,
  editing,
  endRef,
  hasEarlier,
  loadingEarlier,
  logRef,
  messages,
  onCancelEdit,
  onEditDraft,
  onLoadEarlier,
  onSaveEdit,
  onStartEdit,
  onWithdraw,
  pendingMessageId,
  writable,
}: {
  actorUserId: string;
  conversationActive: boolean;
  editing: EditingState | null;
  endRef: RefObject<HTMLDivElement | null>;
  hasEarlier: boolean;
  loadingEarlier: boolean;
  logRef: RefObject<HTMLDivElement | null>;
  messages: readonly MessageView[];
  onCancelEdit: () => void;
  onEditDraft: (draft: string) => void;
  onLoadEarlier: () => void;
  onSaveEdit: () => void;
  onStartEdit: (message: MessageView) => void;
  onWithdraw: (message: MessageView) => void;
  pendingMessageId: string | null;
  writable: boolean;
}) {
  const { formatDate, formatDateTime, t } = useI18n();
  const now = new Date();
  const days = groupMessagesByDay(messages);

  function dayLabel(date: Date): string {
    const relative = relativeDay(date, now);
    if (relative === 'today') {
      return t('messages.conversation.today');
    }
    if (relative === 'yesterday') {
      return t('messages.conversation.yesterday');
    }
    return formatDate(date, { dateStyle: 'full' });
  }

  return (
    // `role="log"` carries an implicit polite live region; history is not
    // announced, so it is switched off here and new arrivals use their own status.
    <div
      aria-label={t('messages.conversation.logLabel')}
      aria-live="off"
      className="messages-log"
      ref={logRef}
      role="log"
      tabIndex={0}
    >
      {hasEarlier ? (
        <div className="messages-log__earlier">
          <Button
            loading={loadingEarlier}
            loadingLabel={t('common.status.working')}
            onClick={onLoadEarlier}
            size="compact"
            variant="secondary"
          >
            {t('messages.actions.loadEarlier')}
          </Button>
        </div>
      ) : null}
      {messages.length === 0 ? (
        <div className="messages-log__empty">
          <strong>{t('messages.conversation.emptyTitle')}</strong>
          <p>{t('messages.conversation.emptyBody')}</p>
        </div>
      ) : null}
      {days.map((day) => (
        <section aria-label={dayLabel(day.date)} className="messages-day" key={day.key}>
          <h3 className="messages-day__label">{dayLabel(day.date)}</h3>
          <ol className="messages-day__list">
            {day.messages.map((message) => {
              const own = isOwnMessage(message, actorUserId);
              const isEditing = editing?.messageId === message.id;
              const editable =
                writable &&
                canEditMessage(message, { actorUserId, conversationActive, now: now.getTime() });
              const withdrawable =
                writable && canWithdrawMessage(message, { actorUserId, conversationActive });
              return (
                <li
                  className="messages-message"
                  data-own={own ? 'true' : undefined}
                  key={message.id}
                >
                  <div className="messages-message__meta">
                    <span className="messages-message__author" translate="no">
                      {own ? t('messages.conversation.you') : message.author.displayName}
                    </span>
                    {message.author.inactive ? (
                      <span className="messages-marker">
                        {t('messages.conversation.inactiveMarker')}
                      </span>
                    ) : null}
                    <time dateTime={message.createdAt}>
                      {formatDateTime(message.createdAt, {
                        dateStyle: undefined,
                        timeStyle: 'short',
                      })}
                    </time>
                    {!message.withdrawn && message.editCount > 0 ? (
                      <span className="messages-marker">{t('messages.conversation.edited')}</span>
                    ) : null}
                  </div>
                  {message.withdrawn ? (
                    <p className="messages-message__tombstone">
                      {t('messages.conversation.withdrawn')}
                    </p>
                  ) : isEditing && editing ? (
                    <EditForm
                      editing={editing}
                      onCancel={onCancelEdit}
                      onChange={onEditDraft}
                      onSave={onSaveEdit}
                    />
                  ) : (
                    <p className="messages-message__body" translate="no" {...UNKNOWN_LANGUAGE}>
                      {message.body}
                    </p>
                  )}
                  {!isEditing && (editable || withdrawable) ? (
                    <div className="messages-message__actions">
                      {editable ? (
                        <Button
                          disabled={pendingMessageId !== null || editing !== null}
                          onClick={() => onStartEdit(message)}
                          size="compact"
                          variant="quiet"
                        >
                          {t('messages.message.edit')}
                        </Button>
                      ) : null}
                      {withdrawable ? (
                        <Button
                          disabled={pendingMessageId !== null || editing !== null}
                          loading={pendingMessageId === message.id}
                          loadingLabel={t('common.status.working')}
                          onClick={() => onWithdraw(message)}
                          size="compact"
                          variant="quiet"
                        >
                          {t('messages.message.withdraw')}
                        </Button>
                      ) : null}
                    </div>
                  ) : null}
                </li>
              );
            })}
          </ol>
        </section>
      ))}
      <div aria-hidden="true" className="messages-log__end" ref={endRef} />
    </div>
  );
}

function EditForm({
  editing,
  onCancel,
  onChange,
  onSave,
}: {
  editing: EditingState;
  onCancel: () => void;
  onChange: (draft: string) => void;
  onSave: () => void;
}) {
  const { t } = useI18n();
  const [touched, setTouched] = useState(false);
  const problem = messageBodyProblem(editing.draft);

  function submit(event: FormEvent<HTMLFormElement>): void {
    event.preventDefault();
    setTouched(true);
    if (!problem) {
      onSave();
    }
  }

  return (
    <form className="messages-edit" onSubmit={submit}>
      <TextArea
        autoFocus
        error={
          touched && problem === 'tooLong'
            ? t('messages.composer.tooLong', { max: MESSAGE_BODY_MAX_LENGTH })
            : undefined
        }
        label={t('messages.message.editLabel')}
        onChange={(event) => onChange(event.currentTarget.value)}
        rows={3}
        translate="no"
        value={editing.draft}
      />
      {editing.error ? (
        <InlineMessage announce title={t('messages.feedback.errorTitle')} tone="danger">
          <p className="messages-text">{t(editing.error)}</p>
        </InlineMessage>
      ) : null}
      <div className="messages-edit__actions">
        <Button
          disabled={problem !== null}
          loading={editing.saving}
          loadingLabel={t('common.status.working')}
          size="compact"
          type="submit"
        >
          {t('messages.message.saveEdit')}
        </Button>
        <Button disabled={editing.saving} onClick={onCancel} size="compact" variant="secondary">
          {t('messages.message.cancelEdit')}
        </Button>
      </div>
    </form>
  );
}
