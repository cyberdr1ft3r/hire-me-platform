import type { TrainingDeliveryMode } from '@hire-me/contracts';
import type { FormEvent } from 'react';

import { useI18n } from '../i18n/index.js';
import { Button, Select, TextArea, TextField } from '../ui/index.js';
import type { TrainingAccess } from './training-access.js';
import { DELIVERY_MODES } from './training-labels.js';
import {
  scheduleWindowInvalid,
  type LoadTrainingOptions,
  type SessionFormValues,
} from './training-state.js';
import { TrainingOptionPicker } from './TrainingOptionPicker.js';

/**
 * Session scheduling and edit. The trainer comes from the Training trainer
 * option source for this program. After creation the schedule changes only
 * through reschedule, which keeps its history.
 */
export function SessionForm({
  access,
  loadTrainers,
  mode,
  onCancel,
  onChange,
  onSubmit,
  sourceKey,
  values,
  writesLocked,
}: {
  access: TrainingAccess;
  loadTrainers: LoadTrainingOptions;
  mode: 'create' | 'edit';
  onCancel?: () => void;
  onChange: (values: SessionFormValues) => void;
  onSubmit: () => void;
  sourceKey: string;
  values: SessionFormValues;
  writesLocked: boolean;
}) {
  const { t } = useI18n();
  const windowInvalid =
    mode === 'create' &&
    values.scheduledAt !== '' &&
    values.scheduledEndAt !== '' &&
    scheduleWindowInvalid(values.scheduledAt, values.scheduledEndAt);
  const incomplete =
    values.title.trim().length === 0 ||
    (mode === 'create' && (values.scheduledAt === '' || values.scheduledEndAt === ''));

  function handleSubmit(event: FormEvent<HTMLFormElement>): void {
    event.preventDefault();
    if (!incomplete && !windowInvalid) onSubmit();
  }

  return (
    <form className="training-form" noValidate onSubmit={handleSubmit}>
      <div className="training-form__grid">
        <TextField
          label={t('training.sessionForm.title')}
          maxLength={180}
          onChange={(event) => onChange({ ...values, title: event.currentTarget.value })}
          required
          value={values.title}
        />
        <TextField
          hint={t('training.sessionForm.sequenceHint')}
          inputMode="numeric"
          label={t('training.sessionForm.sequence')}
          max={10000}
          min={1}
          onChange={(event) => onChange({ ...values, sequence: event.currentTarget.value })}
          type="number"
          value={values.sequence}
        />
        {mode === 'create' ? (
          <>
            <TextField
              label={t('training.sessionForm.start')}
              onChange={(event) => onChange({ ...values, scheduledAt: event.currentTarget.value })}
              required
              type="datetime-local"
              value={values.scheduledAt}
            />
            <TextField
              error={windowInvalid ? t('training.sessionForm.windowInvalid') : undefined}
              label={t('training.sessionForm.end')}
              onChange={(event) =>
                onChange({ ...values, scheduledEndAt: event.currentTarget.value })
              }
              required
              type="datetime-local"
              value={values.scheduledEndAt}
            />
          </>
        ) : null}
        <Select
          label={t('training.sessionForm.deliveryMode')}
          onChange={(event) =>
            onChange({ ...values, deliveryMode: event.currentTarget.value as TrainingDeliveryMode })
          }
          value={values.deliveryMode}
        >
          {DELIVERY_MODES.map((delivery) => (
            <option key={delivery} value={delivery}>
              {t(`training.deliveryMode.${delivery}`)}
            </option>
          ))}
        </Select>
        {access.pickTrainers ? (
          <TrainingOptionPicker
            emptyLabel={t('training.sessionForm.noTrainer')}
            hint={t('training.sessionForm.trainerHint')}
            label={t('training.sessionForm.trainer')}
            loadOptions={loadTrainers}
            onChange={(trainer) => onChange({ ...values, trainer })}
            sourceKey={`${sourceKey}:trainer-${mode}`}
            value={values.trainer}
          />
        ) : null}
        <TextField
          label={t('training.sessionForm.location')}
          maxLength={240}
          onChange={(event) => onChange({ ...values, location: event.currentTarget.value })}
          value={values.location}
        />
        <TextField
          label={t('training.sessionForm.meetingUrl')}
          maxLength={2048}
          onChange={(event) => onChange({ ...values, meetingUrl: event.currentTarget.value })}
          type="url"
          value={values.meetingUrl}
        />
      </div>
      {mode === 'edit' ? (
        <TextArea
          label={t('training.sessionForm.outcome')}
          maxLength={2000}
          onChange={(event) => onChange({ ...values, outcome: event.currentTarget.value })}
          rows={3}
          value={values.outcome}
        />
      ) : null}
      <div className="training-form__actions">
        <Button disabled={writesLocked || incomplete || windowInvalid} type="submit">
          {mode === 'create' ? t('training.sessionForm.create') : t('training.sessionForm.save')}
        </Button>
        {onCancel ? (
          <Button disabled={writesLocked} onClick={onCancel} variant="secondary">
            {t('training.common.cancel')}
          </Button>
        ) : null}
      </div>
    </form>
  );
}
