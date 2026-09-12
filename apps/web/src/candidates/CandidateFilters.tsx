import type { FormEvent } from 'react';

import { useI18n } from '../i18n/index.js';
import { Button, Select, TextField } from '../ui/index.js';
import { CANDIDATE_STATUS_FILTER_OPTIONS, candidateStatusLabelKey } from './candidate-labels.js';
import type { CandidateFilterValues } from './candidate-state.js';

/**
 * The two list filters this workspace has always exposed: free-text search
 * and lifecycle status. The API also accepts source, city, and country, but
 * widening the interface is a product decision rather than a visual one, so
 * they stay unexposed.
 *
 * Option values are the stored lifecycle values; only their labels are
 * localized, so a French label is never sent as a filter.
 */
export function CandidateFilters({
  busy,
  onChange,
  onReset,
  onSubmit,
  showReset,
  values,
}: {
  busy: boolean;
  onChange: (values: CandidateFilterValues) => void;
  onReset: () => void;
  onSubmit: () => void;
  showReset: boolean;
  values: CandidateFilterValues;
}) {
  const { t } = useI18n();

  function handleSubmit(event: FormEvent<HTMLFormElement>): void {
    event.preventDefault();
    onSubmit();
  }

  return (
    <form
      aria-label={t('candidate.filters.region')}
      className="candidate-filters"
      onSubmit={handleSubmit}
      role="search"
    >
      <div className="candidate-filters__controls">
        <TextField
          autoComplete="off"
          hint={t('candidate.filters.searchHint')}
          label={t('candidate.filters.search')}
          maxLength={120}
          name="search"
          onChange={(event) => onChange({ ...values, search: event.currentTarget.value })}
          type="search"
          value={values.search}
        />
        <Select
          label={t('candidate.filters.status')}
          name="status"
          onChange={(event) =>
            onChange({
              ...values,
              status:
                CANDIDATE_STATUS_FILTER_OPTIONS.find(
                  (status) => status === event.currentTarget.value,
                ) ?? '',
            })
          }
          value={values.status}
        >
          <option value="">{t('candidate.filters.anyStatus')}</option>
          {CANDIDATE_STATUS_FILTER_OPTIONS.map((status) => (
            <option key={status} value={status}>
              {t(candidateStatusLabelKey(status))}
            </option>
          ))}
        </Select>
      </div>
      <div className="candidate-filters__actions">
        <Button disabled={busy} type="submit">
          {t('candidate.filters.submit')}
        </Button>
        {showReset ? (
          <Button disabled={busy} onClick={onReset} variant="secondary">
            {t('candidate.filters.reset')}
          </Button>
        ) : null}
      </div>
    </form>
  );
}
