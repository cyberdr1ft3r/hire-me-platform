import { useId, useState, type FormEvent } from 'react';

import { useI18n } from '../i18n/index.js';
import { Button, Checkbox, FilterToolbar, Select, TextField } from '../ui/index.js';
import { MissionPicker, type LoadPickerOptions } from './MissionPicker.js';
import {
  MISSION_PRIORITIES,
  MISSION_STATE_FILTER_OPTIONS,
  missionPriorityLabelKey,
  missionStateLabelKey,
} from './mission-labels.js';
import { hasValidDeadlineRange } from './mission-deadline-filter.js';
import type { MissionFilterValues } from './mission-state.js';

/** How many of the on-demand filters the given values set (the deadline range counts once). */
export function advancedMissionFilterCount(values: MissionFilterValues): number {
  return (
    (values.state ? 1 : 0) +
    (values.priority ? 1 : 0) +
    (values.client ? 1 : 0) +
    (values.assignedToMe ? 1 : 0) +
    (values.deadlineFrom || values.deadlineTo ? 1 : 0)
  );
}

/**
 * One compact toolbar over the server-side mission list: free-text search in line,
 * and status, priority, client, "assigned to me" and the deadline range behind an
 * on-demand Filters disclosure. Both live in one form, so applying sends the same
 * combined query and returns to the first page, exactly as before; the deadline
 * range is still validated before any request.
 */
export function MissionFilters({
  appliedValues,
  busy,
  loadClientOptions,
  onChange,
  onReset,
  onSubmit,
  showReset,
  sourceKey,
  values,
}: {
  /** The filters the list on screen was loaded with; the toggle counts these. */
  appliedValues: MissionFilterValues;
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
  const advancedId = useId();
  const [deadlineRangeInvalid, setDeadlineRangeInvalid] = useState(false);
  const appliedAdvanced = advancedMissionFilterCount(appliedValues);
  // Applied on-demand filters stay visible, so what narrows the list is never hidden.
  const [expanded, setExpanded] = useState(appliedAdvanced > 0);

  function handleSubmit(event: FormEvent<HTMLFormElement>): void {
    event.preventDefault();
    if (!hasValidDeadlineRange(values)) {
      setDeadlineRangeInvalid(true);
      setExpanded(true);
      return;
    }
    setDeadlineRangeInvalid(false);
    onSubmit();
  }

  function handleChange(next: MissionFilterValues): void {
    if (hasValidDeadlineRange(next)) {
      setDeadlineRangeInvalid(false);
    }
    onChange(next);
  }

  return (
    <form
      aria-label={t('missions.filters.region')}
      className="mission-filters"
      onSubmit={handleSubmit}
      role="search"
    >
      <FilterToolbar
        actions={
          <>
            <Button disabled={busy} size="compact" type="submit">
              {t('missions.filters.submit')}
            </Button>
            <Button
              aria-controls={advancedId}
              aria-expanded={expanded}
              onClick={() => setExpanded((value) => !value)}
              size="compact"
              type="button"
              variant="secondary"
            >
              {appliedAdvanced > 0
                ? t('missions.filters.toggleActive', { count: appliedAdvanced })
                : t('missions.filters.toggle')}
            </Button>
            {showReset ? (
              <Button
                disabled={busy}
                onClick={() => {
                  setDeadlineRangeInvalid(false);
                  onReset();
                }}
                size="compact"
                type="button"
                variant="quiet"
              >
                {t('missions.filters.reset')}
              </Button>
            ) : null}
          </>
        }
        className="mission-filters__bar"
        search={
          <TextField
            autoComplete="off"
            className="mission-filters__search"
            hint={t('missions.filters.searchHint')}
            label={t('missions.filters.search')}
            maxLength={120}
            name="search"
            onChange={(event) => handleChange({ ...values, search: event.currentTarget.value })}
            // The hint is also the field's accessible description; the toolbar shows it here.
            placeholder={t('missions.filters.searchHint')}
            type="search"
            value={values.search}
          />
        }
      />
      <div className="mission-filters__advanced" hidden={!expanded} id={advancedId}>
        <Select
          label={t('missions.filters.state')}
          name="state"
          onChange={(event) =>
            handleChange({
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
            handleChange({
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
            onChange={(client) => handleChange({ ...values, client })}
            sourceKey={`${sourceKey}:client-filter`}
            value={values.client}
          />
        ) : null}
        <TextField
          error={
            deadlineRangeInvalid && !hasValidDeadlineRange(values)
              ? t('missions.filters.deadlineRangeInvalid')
              : undefined
          }
          label={t('missions.filters.deadlineFrom')}
          name="deadlineFrom"
          onChange={(event) => handleChange({ ...values, deadlineFrom: event.currentTarget.value })}
          type="date"
          value={values.deadlineFrom}
        />
        <TextField
          label={t('missions.filters.deadlineTo')}
          name="deadlineTo"
          onChange={(event) => handleChange({ ...values, deadlineTo: event.currentTarget.value })}
          type="date"
          value={values.deadlineTo}
        />
        <Checkbox
          checked={values.assignedToMe}
          hint={t('missions.filters.assignedToMeHint')}
          label={t('missions.filters.assignedToMe')}
          name="assignedToMe"
          onChange={(event) =>
            handleChange({ ...values, assignedToMe: event.currentTarget.checked })
          }
        />
      </div>
    </form>
  );
}
