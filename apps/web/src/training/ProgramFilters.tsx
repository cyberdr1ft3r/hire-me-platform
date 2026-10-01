import type { FormEvent } from 'react';

import { useI18n } from '../i18n/index.js';
import { Button, Checkbox, Select, TextField } from '../ui/index.js';
import type { TrainingAccess } from './training-access.js';
import { PROGRAM_STATUSES } from './training-labels.js';
import type {
  LoadTrainingOptions,
  PersonScope,
  ProgramFilterValues,
  ProgramSort,
} from './training-state.js';
import { TrainingOptionPicker } from './TrainingOptionPicker.js';

const SORTS: readonly ProgramSort[] = ['recent', 'name', 'reference', 'plannedStart'];

export function ProgramFilters({
  access,
  busy,
  loadClients,
  loadOwners,
  onChange,
  onReset,
  onSubmit,
  sessionKey,
  showReset,
  values,
}: {
  access: TrainingAccess;
  busy: boolean;
  loadClients: LoadTrainingOptions;
  loadOwners: LoadTrainingOptions;
  onChange: (values: ProgramFilterValues) => void;
  onReset: () => void;
  onSubmit: () => void;
  sessionKey: number;
  showReset: boolean;
  values: ProgramFilterValues;
}) {
  const { t } = useI18n();

  function handleSubmit(event: FormEvent<HTMLFormElement>): void {
    event.preventDefault();
    onSubmit();
  }

  return (
    <form
      aria-label={t('training.programs.filters.region')}
      className="training-filters"
      onSubmit={handleSubmit}
      role="search"
    >
      <div className="training-filters__controls">
        <TextField
          label={t('training.programs.filters.search')}
          hint={t('training.programs.filters.searchHint')}
          maxLength={120}
          onChange={(event) => onChange({ ...values, search: event.currentTarget.value })}
          type="search"
          value={values.search}
        />
        <Select
          label={t('training.programs.filters.status')}
          onChange={(event) =>
            onChange({
              ...values,
              status: event.currentTarget.value as ProgramFilterValues['status'],
            })
          }
          value={values.status}
        >
          <option value="">{t('training.filters.anyStatus')}</option>
          {PROGRAM_STATUSES.map((status) => (
            <option key={status} value={status}>
              {t(`training.status.program.${status}`)}
            </option>
          ))}
        </Select>
        <Select
          label={t('training.programs.filters.owner')}
          onChange={(event) => {
            const ownerScope = event.currentTarget.value as PersonScope;
            onChange({
              ...values,
              ownerScope,
              owner: ownerScope === 'selected' ? values.owner : null,
            });
          }}
          value={values.ownerScope}
        >
          <option value="any">{t('training.filters.anyone')}</option>
          <option value="me">{t('training.programs.filters.ownedByMe')}</option>
          {access.pickOwners ? (
            <option value="selected">{t('training.filters.specificPerson')}</option>
          ) : null}
        </Select>
        {access.pickOwners && values.ownerScope === 'selected' ? (
          <TrainingOptionPicker
            hint={t('training.programs.filters.ownerHint')}
            label={t('training.programs.filters.ownerPerson')}
            loadOptions={loadOwners}
            onChange={(owner) => onChange({ ...values, owner })}
            sourceKey={`${sessionKey}:owner-filter`}
            value={values.owner}
          />
        ) : null}
        {access.pickClients ? (
          <TrainingOptionPicker
            emptyLabel={t('training.filters.anyClient')}
            hint={t('training.programs.filters.clientHint')}
            label={t('training.programs.filters.client')}
            loadOptions={loadClients}
            onChange={(client) => onChange({ ...values, client })}
            sourceKey={`${sessionKey}:client-filter`}
            value={values.client}
          />
        ) : null}
        <Select
          label={t('training.programs.filters.sort')}
          onChange={(event) =>
            onChange({ ...values, sort: event.currentTarget.value as ProgramSort })
          }
          value={values.sort}
        >
          {SORTS.map((sort) => (
            <option key={sort} value={sort}>
              {t(`training.programs.sort.${sort}`)}
            </option>
          ))}
        </Select>
        <Checkbox
          checked={values.includeArchived}
          label={t('training.programs.filters.includeArchived')}
          onChange={(event) =>
            onChange({ ...values, includeArchived: event.currentTarget.checked })
          }
        />
      </div>
      <div className="training-filters__actions">
        <Button disabled={busy} size="compact" type="submit">
          {t('training.filters.apply')}
        </Button>
        {showReset ? (
          <Button onClick={onReset} size="compact" variant="secondary">
            {t('training.filters.reset')}
          </Button>
        ) : null}
      </div>
    </form>
  );
}
