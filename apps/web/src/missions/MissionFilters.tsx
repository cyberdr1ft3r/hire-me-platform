import type { FormEvent } from 'react';

import { useI18n } from '../i18n/index.js';
import { Button, Checkbox, Select, TextField } from '../ui/index.js';
import { MissionPicker, type LoadPickerOptions } from './MissionPicker.js';
import {
  MISSION_PRIORITIES,
  MISSION_STATE_FILTER_OPTIONS,
  missionPriorityLabelKey,
  missionStateLabelKey,
} from './mission-labels.js';
import type { MissionFilterValues } from './mission-state.js';

export function MissionFilters({
  busy,
  loadClientOptions,
  onChange,
  onReset,
  onSubmit,
  showReset,
  sourceKey,
  values,
}: {
  busy: boolean;
  /** Absent when the actor cannot read the client directory. */
  loadClientOptions: LoadPickerOptions | null;
  onChange: (values: MissionFilterValues) => void;
  onReset: () => void;
  onSubmit: () => void;
  showReset: boolean;
  sourceKey: string;
  values: MissionFilterValues;
}) {
  const { t } = useI18n();

  function handleSubmit(event: FormEvent<HTMLFormElement>): void {
    event.preventDefault();
    onSubmit();
  }

  return (
    <form
      aria-label={t('missions.filters.region')}
      className="mission-filters"
      onSubmit={handleSubmit}
      role="search"
    >
      <div className="mission-filters__controls">
        <TextField
          autoComplete="off"
          hint={t('missions.filters.searchHint')}
          label={t('missions.filters.search')}
          maxLength={120}
          name="search"
          onChange={(event) => onChange({ ...values, search: event.currentTarget.value })}
          type="search"
          value={values.search}
        />
        <Select
          label={t('missions.filters.state')}
          name="state"
          onChange={(event) =>
            onChange({
              ...values,
              state:
                MISSION_STATE_FILTER_OPTIONS.find((state) => state === event.currentTarget.value) ??
                '',
            })
          }
          value={values.state}
        >
          <option value="">{t('missions.filters.anyState')}</option>
          {MISSION_STATE_FILTER_OPTIONS.map((state) => (
            <option key={state} value={state}>
              {t(missionStateLabelKey(state))}
            </option>
          ))}
        </Select>
        <Select
          label={t('missions.filters.priority')}
          name="priority"
          onChange={(event) =>
            onChange({
              ...values,
              priority:
                MISSION_PRIORITIES.find((priority) => priority === event.currentTarget.value) ?? '',
            })
          }
          value={values.priority}
        >
          <option value="">{t('missions.filters.anyPriority')}</option>
          {MISSION_PRIORITIES.map((priority) => (
            <option key={priority} value={priority}>
              {t(missionPriorityLabelKey(priority))}
            </option>
          ))}
        </Select>
        {loadClientOptions ? (
          <MissionPicker
            emptyLabel={t('missions.filters.anyClient')}
            hint={t('missions.filters.clientHint')}
            label={t('missions.filters.client')}
            loadOptions={loadClientOptions}
            onChange={(client) => onChange({ ...values, client })}
            sourceKey={`${sourceKey}:client-filter`}
            value={values.client}
          />
        ) : null}
        <Checkbox
          checked={values.assignedToMe}
          hint={t('missions.filters.assignedToMeHint')}
          label={t('missions.filters.assignedToMe')}
          name="assignedToMe"
          onChange={(event) => onChange({ ...values, assignedToMe: event.currentTarget.checked })}
        />
      </div>
      <div className="mission-filters__actions">
        <Button disabled={busy} size="compact" type="submit" variant="primary">
          {t('missions.filters.submit')}
        </Button>
        {showReset ? (
          <Button disabled={busy} onClick={onReset} size="compact" variant="secondary">
            {t('missions.filters.reset')}
          </Button>
        ) : null}
      </div>
    </form>
  );
}
