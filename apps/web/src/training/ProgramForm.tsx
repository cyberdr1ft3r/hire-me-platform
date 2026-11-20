import { useRef, useState, type ChangeEvent, type FormEvent } from 'react';

import { useI18n } from '../i18n/index.js';
import { Button, TextArea, TextField } from '../ui/index.js';
import type { TrainingAccess } from './training-access.js';
import {
  plannedWindowInvalid,
  type LoadTrainingOptions,
  type ProgramFormValues,
} from './training-state.js';
import { TrainingOptionPicker } from './TrainingOptionPicker.js';

/** Keeps the first keypress when React reports an empty controlled value (Issue #277). */
function resolveTextInputValue(
  event: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>,
  previous: string,
): string {
  const fromTarget = event.currentTarget.value;
  if (fromTarget.length > 0) {
    return fromTarget;
  }
  const data = event.nativeEvent instanceof InputEvent ? event.nativeEvent.data : null;
  return data ? `${previous}${data}` : fromTarget;
}

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
  onSubmit: (values: ProgramFormValues) => void;
  sessionKey: number;
  values: ProgramFormValues;
  writesLocked: boolean;
}) {
  const { t } = useI18n();
  const [localValues, setLocalValues] = useState(values);
  const latest = useRef(values);
  const windowInvalid = plannedWindowInvalid(localValues.plannedStart, localValues.plannedEnd);
  const incomplete =
    localValues.name.trim().length === 0 ||
    (mode === 'create' && localValues.reference.trim().length === 0);

  function patch(partial: Partial<ProgramFormValues>): void {
    const next = { ...latest.current, ...partial };
    latest.current = next;
    setLocalValues(next);
    onChange(next);
  }

  function patchTextField<K extends keyof ProgramFormValues>(
    key: K,
    event: ChangeEvent<HTMLInputElement | HTMLTextAreaElement>,
  ): void {
    const previousRaw = latest.current[key];
    const previous = typeof previousRaw === 'string' ? previousRaw : '';
    const nextValue = resolveTextInputValue(event, previous);
    const next = { ...latest.current, [key]: nextValue };
    latest.current = next;
    setLocalValues(next);
    onChange(next);
  }

  function handleSubmit(event: FormEvent<HTMLFormElement>): void {
    event.preventDefault();
    const current = latest.current;
    const submitWindowInvalid = plannedWindowInvalid(current.plannedStart, current.plannedEnd);
    const submitIncomplete =
      current.name.trim().length === 0 ||
      (mode === 'create' && current.reference.trim().length === 0);
    if (!submitIncomplete && !submitWindowInvalid) onSubmit(current);
  }

  return (
    <form className="training-form" noValidate onSubmit={handleSubmit}>
      <div className="training-form__grid">
        {mode === 'create' ? (
          <TextField
            hint={t('training.programForm.referenceHint')}
            label={t('training.programForm.reference')}
            maxLength={60}
            onChange={(event) => patchTextField('reference', event)}
            required
            value={localValues.reference}
          />
        ) : null}
        <TextField
          label={t('training.programForm.name')}
          maxLength={180}
          onChange={(event) => patchTextField('name', event)}
          required
          value={localValues.name}
        />
        <TextField
          label={t('training.programForm.targetAudience')}
          maxLength={500}
          onChange={(event) => patchTextField('targetAudience', event)}
          value={localValues.targetAudience}
        />
        {access.pickOwners ? (
          <TrainingOptionPicker
            emptyLabel={t('training.programForm.noOwner')}
            hint={t('training.programForm.ownerHint')}
            label={t('training.programForm.owner')}
            loadOptions={loadOwners}
            onChange={(owner) => patch({ owner })}
            sourceKey={`${sessionKey}:owner-${mode}`}
            value={localValues.owner}
          />
        ) : null}
        {mode === 'create' && access.pickClients ? (
          <TrainingOptionPicker
            emptyLabel={t('training.programForm.noClient')}
            hint={t('training.programForm.clientHint')}
            label={t('training.programForm.client')}
            loadOptions={loadClients}
            onChange={(client) => patch({ client })}
            sourceKey={`${sessionKey}:client-${mode}`}
            value={localValues.client}
          />
        ) : null}
        <TextField
          label={t('training.programForm.plannedStart')}
          onChange={(event) => patchTextField('plannedStart', event)}
          type="datetime-local"
          value={localValues.plannedStart}
        />
        <TextField
          error={windowInvalid ? t('training.programForm.windowInvalid') : undefined}
          label={t('training.programForm.plannedEnd')}
          onChange={(event) => patchTextField('plannedEnd', event)}
          type="datetime-local"
          value={localValues.plannedEnd}
        />
      </div>
      <TextArea
        label={t('training.programForm.description')}
        maxLength={4000}
        onChange={(event) => patchTextField('description', event)}
        rows={3}
        value={localValues.description}
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