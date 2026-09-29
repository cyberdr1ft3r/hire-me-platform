import { useState, type FormEvent } from 'react';

import { useI18n } from '../i18n/index.js';
import { Button, InlineMessage, TextArea } from '../ui/index.js';
import { MissionPicker, type LoadPickerOptions } from './MissionPicker.js';
import { MissionProfileFields } from './MissionProfile.js';
import { EMPTY_MISSION_CREATE, type MissionCreateValues } from './mission-state.js';

/**
 * A new mission is always attached to a client chosen by name. Without the
 * client directory permission there is nothing to choose from, so the form is
 * replaced by an explanation instead of asking for an ID.
 */
export function MissionCreateForm({
  loadClientOptions,
  onCreate,
  sourceKey,
  writesLocked,
}: {
  loadClientOptions: LoadPickerOptions | null;
  onCreate: (values: MissionCreateValues) => Promise<boolean>;
  sourceKey: string;
  writesLocked: boolean;
}) {
  const { t } = useI18n();
  const [values, setValues] = useState<MissionCreateValues>(EMPTY_MISSION_CREATE);

  async function handleSubmit(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    if (!values.client) {
      return;
    }
    if (await onCreate(values)) {
      setValues(EMPTY_MISSION_CREATE);
    }
  }

  return (
    <details className="mission-disclosure">
      <summary className="mission-disclosure__summary">{t('missions.create.title')}</summary>
      {loadClientOptions ? (
        <form
          aria-label={t('missions.create.title')}
          className="mission-form"
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
          <div className="mission-actions">
            <Button disabled={writesLocked || !values.client} type="submit" variant="primary">
              {t('missions.create.submit')}
            </Button>
          </div>
        </form>
      ) : (
        <InlineMessage title={t('missions.create.title')} tone="info">
          <p className="mission-message__text">{t('missions.create.clientsUnavailable')}</p>
        </InlineMessage>
      )}
    </details>
  );
}
