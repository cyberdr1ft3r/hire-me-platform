import type { ConversationDetail } from '@hire-me/contracts';
import { useState, type FormEvent, type ReactNode, type RefObject } from 'react';

import { useI18n } from '../i18n/index.js';
import {
  BoundedCombobox,
  Button,
  InlineMessage,
  TextField,
  type BoundedPickerOption,
} from '../ui/index.js';
import { createGroupConversation, openDirectConversation } from './messages-api.js';
import {
  GROUP_MAX_ACTIVE_MEMBERS,
  GROUP_MAX_OTHER_MEMBERS,
  GROUP_MIN_OTHER_MEMBERS,
  GROUP_TITLE_MAX_LENGTH,
  groupTitleProblem,
  messagingFailureKey,
  type FailureKey,
} from './messaging-state.js';
import { participantOptions } from './participant-options.js';
import { useAliveRef } from './polling.js';

/**
 * Detail-pane heading. The back control is only shown on the stacked layout;
 * `authored` marks a user-authored title (a group name, a person) that must not
 * be translated.
 */
export function PaneHeader({
  actions,
  authored = false,
  backLabel,
  headingRef,
  meta,
  onBack,
  title,
}: {
  actions?: ReactNode;
  authored?: boolean;
  backLabel?: string;
  headingRef: RefObject<HTMLHeadingElement | null>;
  meta?: ReactNode;
  onBack: () => void;
  title: string;
}) {
  const { t } = useI18n();
  return (
    <header className="messages-pane__header">
      <Button className="messages-pane__back" onClick={onBack} size="compact" variant="quiet">
        {backLabel ?? t('messages.actions.back')}
      </Button>
      <div className="messages-pane__heading">
        <h2 ref={headingRef} tabIndex={-1} translate={authored ? 'no' : undefined}>
          {title}
        </h2>
        {meta ? <div className="messages-pane__meta">{meta}</div> : null}
      </div>
      {actions ? <div className="messages-pane__actions">{actions}</div> : null}
    </header>
  );
}

export function NewDirectPane({
  accessToken,
  headingRef,
  onBack,
  onOpened,
}: {
  accessToken: string;
  headingRef: RefObject<HTMLHeadingElement | null>;
  onBack: () => void;
  onOpened: (conversation: ConversationDetail) => void;
}) {
  const { t } = useI18n();
  const [person, setPerson] = useState<BoundedPickerOption | null>(null);
  const [pending, setPending] = useState(false);
  const [failure, setFailure] = useState<FailureKey | null>(null);
  const alive = useAliveRef();

  async function submit(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    if (!person || pending) {
      return;
    }
    setPending(true);
    setFailure(null);
    try {
      const response = await openDirectConversation(accessToken, person.id);
      if (alive.current) {
        onOpened(response.conversation);
      }
    } catch (error) {
      if (alive.current) {
        setFailure(messagingFailureKey(error));
      }
    } finally {
      if (alive.current) {
        setPending(false);
      }
    }
  }

  return (
    <section aria-labelledby="messages-new-direct-title" className="messages-pane">
      <PaneHeader headingRef={headingRef} onBack={onBack} title={t('messages.newDirect.title')} />
      <form
        aria-labelledby="messages-new-direct-title"
        className="messages-form"
        id="messages-new-direct"
        onSubmit={(event) => void submit(event)}
      >
        <span hidden id="messages-new-direct-title">
          {t('messages.newDirect.title')}
        </span>
        <BoundedCombobox
          hint={t('messages.newDirect.hint')}
          label={t('messages.newDirect.person')}
          loadOptions={participantOptions({ accessToken, purpose: 'direct' })}
          onChange={setPerson}
          required
          sourceKey="direct"
          value={person}
        />
        {failure ? (
          <InlineMessage announce title={t('messages.feedback.errorTitle')} tone="danger">
            <p className="messages-text">{t(failure)}</p>
          </InlineMessage>
        ) : null}
        <div className="messages-form__actions">
          <Button
            disabled={!person}
            loading={pending}
            loadingLabel={t('common.status.working')}
            type="submit"
          >
            {t('messages.newDirect.submit')}
          </Button>
          <Button onClick={onBack} variant="secondary">
            {t('common.actions.cancel')}
          </Button>
        </div>
      </form>
    </section>
  );
}

/** Colleagues chosen so far, each removable; names are data and never translated. */
export function SelectedPeople({
  onRemove,
  people,
}: {
  onRemove: (id: string) => void;
  people: readonly BoundedPickerOption[];
}) {
  const { t } = useI18n();
  if (people.length === 0) {
    return null;
  }
  return (
    <ul className="messages-chips">
      {people.map((person) => (
        <li className="messages-chip" key={person.id}>
          <span translate="no">{person.label}</span>
          {person.detail ? <span className="messages-chip__detail">{person.detail}</span> : null}
          <Button
            aria-label={t('messages.newGroup.removeMember', { name: person.label })}
            onClick={() => onRemove(person.id)}
            size="compact"
            variant="quiet"
          >
            ×
          </Button>
        </li>
      ))}
    </ul>
  );
}

export function NewGroupPane({
  accessToken,
  headingRef,
  onBack,
  onCreated,
}: {
  accessToken: string;
  headingRef: RefObject<HTMLHeadingElement | null>;
  onBack: () => void;
  onCreated: (conversation: ConversationDetail) => void;
}) {
  const { t } = useI18n();
  const [title, setTitle] = useState('');
  const [people, setPeople] = useState<BoundedPickerOption[]>([]);
  const [touched, setTouched] = useState(false);
  const [pending, setPending] = useState(false);
  const [failure, setFailure] = useState<FailureKey | null>(null);
  const alive = useAliveRef();

  const titleProblem = groupTitleProblem(title);
  const tooFew = people.length < GROUP_MIN_OTHER_MEMBERS;
  const full = people.length >= GROUP_MAX_OTHER_MEMBERS;

  function addPerson(option: BoundedPickerOption | null): void {
    if (!option || full) {
      return;
    }
    setPeople((current) =>
      current.some((person) => person.id === option.id) ? current : [...current, option],
    );
  }

  async function submit(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    setTouched(true);
    if (titleProblem || tooFew || pending) {
      return;
    }
    setPending(true);
    setFailure(null);
    try {
      const response = await createGroupConversation(accessToken, {
        memberUserIds: people.map((person) => person.id),
        title: title.trim(),
      });
      if (alive.current) {
        onCreated(response.conversation);
      }
    } catch (error) {
      if (alive.current) {
        setFailure(messagingFailureKey(error));
      }
    } finally {
      if (alive.current) {
        setPending(false);
      }
    }
  }

  return (
    <section className="messages-pane">
      <PaneHeader headingRef={headingRef} onBack={onBack} title={t('messages.newGroup.title')} />
      <form
        aria-label={t('messages.newGroup.title')}
        className="messages-form"
        noValidate
        onSubmit={(event) => void submit(event)}
      >
        <TextField
          error={
            touched && titleProblem === 'required' ? t('messages.newGroup.nameRequired') : undefined
          }
          hint={t('messages.newGroup.nameHint')}
          label={t('messages.newGroup.name')}
          maxLength={GROUP_TITLE_MAX_LENGTH}
          onChange={(event) => setTitle(event.currentTarget.value)}
          required
          translate="no"
          value={title}
        />
        <fieldset className="messages-form__members">
          <legend>{t('messages.newGroup.members')}</legend>
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
              exclude: people.map((person) => person.id),
              purpose: 'group-create',
            })}
            onChange={addPerson}
            sourceKey={`group-create:${people.length}`}
            value={null}
          />
          <p className="messages-muted">
            {t('messages.newGroup.selected', { count: people.length })}
          </p>
          <SelectedPeople
            onRemove={(id) => setPeople((current) => current.filter((person) => person.id !== id))}
            people={people}
          />
          {touched && tooFew ? (
            <p className="messages-form__error" role="alert">
              {t('messages.newGroup.minMembers')}
            </p>
          ) : null}
        </fieldset>
        <InlineMessage title={t('messages.newGroup.title')} tone="info">
          <p className="messages-text">{t('messages.newGroup.historyNotice')}</p>
        </InlineMessage>
        {failure ? (
          <InlineMessage announce title={t('messages.feedback.errorTitle')} tone="danger">
            <p className="messages-text">{t(failure)}</p>
          </InlineMessage>
        ) : null}
        <div className="messages-form__actions">
          <Button loading={pending} loadingLabel={t('common.status.working')} type="submit">
            {t('messages.newGroup.submit')}
          </Button>
          <Button onClick={onBack} variant="secondary">
            {t('common.actions.cancel')}
          </Button>
        </div>
      </form>
    </section>
  );
}
