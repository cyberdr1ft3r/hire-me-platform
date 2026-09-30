import type { FormEvent } from 'react';

import { useI18n } from '../i18n/index.js';
import { Button, TextArea, TextField } from '../ui/index.js';
import type { TrainingAccess } from './training-access.js';
import {
  plannedWindowInvalid,
  type LoadTrainingOptions,
  type ProgramFormValues,
} from './training-state.js';
import { TrainingOptionPicker } from './TrainingOptionPicker.js';

/**
 * Program create and edit. The owner comes from the Training owner option
 * source and the client from the Clients list; neither is ever typed. Client
 * context is fixed at creation, as the API only accepts it then.
 */
export function ProgramForm({
  access,
  loadClients,
  loadOwners,
  mode,
  onCancel,
  onChange,
  onSubmit,
  sessionKey,
  values,
  writesLocked,
}: {
  access: TrainingAccess;
  loadClients: LoadTrainingOptions;
  loadOwners: LoadTrainingOptions;
  mode: 'create' | 'edit';
  onCancel?: () => void;
  onChange: (values: ProgramFormValues) => void;
  onSubmit: () => void;
  sessionKey: number;
  values: ProgramFormValues;
  writesLocked: boolean;
}) {
  const { t } = useI18n();
  const windowInvalid = plannedWindowInvalid(values.plannedStart, values.plannedEnd);
  const incomplete =
    values.name.trim().length === 0 || (mode === 'create' && values.reference.trim().length === 0);

  function handleSubmit(event: FormEvent<HTMLFormElement>): void {
    event.preventDefault();
    if (!incomplete && !windowInvalid) onSubmit();
  }

  return (
    <form className="training-form" noValidate onSubmit={handleSubmit}>
      <div className="training-form__grid">
        {mode === 'create' ? (
          <TextField
            hint={t('training.programForm.referenceHint')}
            label={t('training.programForm.reference')}
            maxLength={60}
            onChange={(event) => onChange({ ...values, reference: event.currentTarget.value })}
            required
            value={values.reference}
          />
        ) : null}
        <TextField
          label={t('training.programForm.name')}
          maxLength={180}
          onChange={(event) => onChange({ ...values, name: event.currentTarget.value })}
          required
          value={values.name}
        />
        <TextField
          label={t('training.programForm.targetAudience')}
          maxLength={500}
          onChange={(event) => onChange({ ...values, targetAudience: event.currentTarget.value })}
          value={values.targetAudience}
        />
        {access.pickOwners ? (
          <TrainingOptionPicker
            emptyLabel={t('training.programForm.noOwner')}
            hint={t('training.programForm.ownerHint')}
            label={t('training.programForm.owner')}
            loadOptions={loadOwners}
            onChange={(owner) => onChange({ ...values, owner })}
            sourceKey={`${sessionKey}:owner-${mode}`}
            value={values.owner}
          />
        ) : null}
        {mode === 'create' && access.pickClients ? (
          <TrainingOptionPicker
            emptyLabel={t('training.programForm.noClient')}
            hint={t('training.programForm.clientHint')}
            label={t('training.programForm.client')}
            loadOptions={loadClients}
            onChange={(client) => onChange({ ...values, client })}
            sourceKey={`${sessionKey}:client-${mode}`}
            value={values.client}
          />
        ) : null}
        <TextField
          label={t('training.programForm.plannedStart')}
          onChange={(event) => onChange({ ...values, plannedStart: event.currentTarget.value })}
          type="datetime-local"
          value={values.plannedStart}
        />
        <TextField
          error={windowInvalid ? t('training.programForm.windowInvalid') : undefined}
          label={t('training.programForm.plannedEnd')}
          onChange={(event) => onChange({ ...values, plannedEnd: event.currentTarget.value })}
          type="datetime-local"
          value={values.plannedEnd}
        />
      </div>
      <TextArea
        label={t('training.programForm.description')}
        maxLength={4000}
        onChange={(event) => onChange({ ...values, description: event.currentTarget.value })}
        rows={3}
        value={values.description}
      />
      <div className="training-form__actions">
        <Button disabled={writesLocked || incomplete || windowInvalid} type="submit">
          {mode === 'create' ? t('training.programForm.create') : t('training.programForm.save')}
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
