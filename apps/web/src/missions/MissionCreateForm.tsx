import { useId, useState, type FormEvent, type ReactNode } from 'react';

import { useI18n } from '../i18n/index.js';
import { CreationDrawer, InlineMessage, TextArea } from '../ui/index.js';
import { MissionPicker, type LoadPickerOptions } from './MissionPicker.js';
import { MissionProfileFields } from './MissionProfile.js';
import { EMPTY_MISSION_CREATE, type MissionCreateValues } from './mission-state.js';

function hasInput(values: MissionCreateValues): boolean {
  return (Object.keys(EMPTY_MISSION_CREATE) as (keyof MissionCreateValues)[]).some(
    (key) => values[key] !== EMPTY_MISSION_CREATE[key],
  );
}

/**
 * The mission creation flow in a right-side drawer, opened from the page header.
 * A new mission is always attached to a client chosen by name. Without the
 * client directory permission there is nothing to choose from, so the form is
 * replaced by an explanation instead of asking for an ID. Fields, validation and
 * the create request are the existing ones; success closes the drawer.
 */
export function MissionCreateDrawer({
  failure,
  loadClientOptions,
  onClose,
  onCreate,
  sourceKey,
  writesLocked,
}: {
  /** The page's latest failure, shown in the drawer once a submit was attempted. */
  failure: ReactNode;
  loadClientOptions: LoadPickerOptions | null;
  onClose: () => void;
  onCreate: (values: MissionCreateValues) => Promise<boolean>;
  sourceKey: string;
  writesLocked: boolean;
}) {
  const { t } = useI18n();
  const formId = useId();
  const [values, setValues] = useState<MissionCreateValues>(EMPTY_MISSION_CREATE);
  const [submitting, setSubmitting] = useState(false);
  const [attempted, setAttempted] = useState(false);

  async function handleSubmit(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    if (!values.client || submitting || writesLocked) {
      return;
    }
    setAttempted(true);
    setSubmitting(true);
    const created = await onCreate(values);
    setSubmitting(false);
    if (created) {
      onClose();
    }
  }

  return (
    <CreationDrawer
      dirty={hasInput(values)}
      error={attempted && !submitting ? failure : null}
      formId={formId}
      // The client picker opens suggestions on focus; start on the title instead.
      initialFocus="title"
      onClose={onClose}
      submitDisabled={!loadClientOptions || writesLocked || !values.client}
      submitLabel={t('missions.create.submit')}
      submitting={submitting}
      title={t('missions.create.title')}
    >
      {loadClientOptions ? (
        <form
          aria-label={t('missions.create.title')}
          className="mission-form"
          id={formId}
          onSubmit={(event) => void handleSubmit(event)}
        >
          <MissionPicker
            hint={t('missions.create.clientHint')}
            label={t('missions.create.client')}
            loadOptions={loadClientOptions}
            onChange={(client) => setValues({ ...values, client })}
            required
            sourceKey={`${sourceKey}:create-client`}
            value={values.client}
          />
          <MissionProfileFields onChange={setValues} values={values} />
          <TextArea
            label={t('missions.profile.fields.description')}
            maxLength={4000}
            name="description"
            onChange={(event) => setValues({ ...values, description: event.currentTarget.value })}
            rows={4}
            value={values.description}
          />
          <TextArea
            label={t('missions.profile.fields.requirements')}
            maxLength={4000}
            name="requirements"
            onChange={(event) => setValues({ ...values, requirements: event.currentTarget.value })}
            rows={4}
            value={values.requirements}
          />
        </form>
      ) : (
        <InlineMessage title={t('missions.create.title')} tone="info">
          <p className="mission-message__text">{t('missions.create.clientsUnavailable')}</p>
        </InlineMessage>
      )}
    </CreationDrawer>
  );
}
