import { useEffect, useState, type FormEvent, type KeyboardEvent } from 'react';

import { useI18n } from '../i18n/index.js';
import { Button, InlineMessage, TextArea } from '../ui/index.js';
import {
  COMPOSER_WARNING_LENGTH,
  MESSAGE_BODY_MAX_LENGTH,
  messageBodyProblem,
  type FailureKey,
  type ReadOnlyReason,
} from './messaging-state.js';

const COARSE_POINTER = '(pointer: coarse)';

function coarsePointer(): boolean {
  return typeof window.matchMedia === 'function' && window.matchMedia(COARSE_POINTER).matches;
}

/** Touch-first devices keep Enter as a newline; the Send button sends. */
export function useCoarsePointer(): boolean {
  const [coarse, setCoarse] = useState(coarsePointer);
  useEffect(() => {
    if (typeof window.matchMedia !== 'function') {
      return;
    }
    const media = window.matchMedia(COARSE_POINTER);
    const sync = () => setCoarse(media.matches);
    sync();
    media.addEventListener?.('change', sync);
    return () => media.removeEventListener?.('change', sync);
  }, []);
  return coarse;
}

export function ReadOnlyComposer({ reason }: { reason: ReadOnlyReason }) {
  const { t } = useI18n();
  if (reason === 'archived') {
    return (
      <InlineMessage title={t('messages.composer.readOnlyArchivedTitle')} tone="info">
        <p className="messages-text">{t('messages.composer.readOnlyArchived')}</p>
      </InlineMessage>
    );
  }
  if (reason === 'inactive') {
    return (
      <InlineMessage title={t('messages.composer.readOnlyInactiveTitle')} tone="info">
        <p className="messages-text">{t('messages.composer.readOnlyInactive')}</p>
      </InlineMessage>
    );
  }
  return (
    <InlineMessage title={t('messages.readOnly.title')} tone="info">
      <p className="messages-text">{t('messages.composer.readOnlyPermission')}</p>
    </InlineMessage>
  );
}

export function MessageComposer({
  draft,
  error,
  onChange,
  onSend,
  sending,
}: {
  draft: string;
  error: FailureKey | null;
  onChange: (draft: string) => void;
  onSend: () => void;
  sending: boolean;
}) {
  const { t } = useI18n();
  const coarse = useCoarsePointer();
  const problem = messageBodyProblem(draft);
  const length = draft.trim().length;
  const baseHint = coarse ? t('messages.composer.hintTouch') : t('messages.composer.hintDesktop');
  const hint =
    length > COMPOSER_WARNING_LENGTH
      ? `${baseHint} ${t('messages.composer.counter', { max: MESSAGE_BODY_MAX_LENGTH, used: length })}`
      : baseHint;

  function submit(event: FormEvent<HTMLFormElement>): void {
    event.preventDefault();
    if (!problem && !sending) {
      onSend();
    }
  }

  function handleKeyDown(event: KeyboardEvent<HTMLTextAreaElement>): void {
    if (event.key !== 'Enter' || event.shiftKey || coarse || event.nativeEvent.isComposing) {
      return;
    }
    event.preventDefault();
    if (!problem && !sending) {
      onSend();
    }
  }

  return (
    <form className="messages-composer" onSubmit={submit}>
      <TextArea
        error={
          problem === 'tooLong'
            ? t('messages.composer.tooLong', { max: MESSAGE_BODY_MAX_LENGTH })
            : undefined
        }
        hint={hint}
        label={t('messages.composer.label')}
        onChange={(event) => onChange(event.currentTarget.value)}
        onFocus={(event) => event.currentTarget.scrollIntoView?.({ block: 'nearest' })}
        onKeyDown={handleKeyDown}
        rows={2}
        translate="no"
        value={draft}
      />
      {error ? (
        <InlineMessage announce title={t('messages.feedback.errorTitle')} tone="danger">
          <p className="messages-text">{t(error)}</p>
        </InlineMessage>
      ) : null}
      <div className="messages-composer__actions">
        <Button
          disabled={problem !== null}
          loading={sending}
          loadingLabel={t('messages.composer.sending')}
          type="submit"
        >
          {t('messages.composer.send')}
        </Button>
      </div>
    </form>
  );
}
