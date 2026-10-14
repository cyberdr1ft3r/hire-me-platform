import { useId, useState, type FormEvent } from 'react';

import { useI18n } from '../i18n/index.js';
import { Button, Select, TextField } from '../ui/index.js';
import {
  CANDIDATE_STATUS_FILTER_OPTIONS,
  candidateSourceModeLabelKey,
  candidateStatusLabelKey,
} from './candidate-labels.js';
import {
  CANDIDATE_SOURCE_MODES,
  candidateSourceQuery,
  type CandidateFilterValues,
} from './candidate-state.js';

/** How many of the on-demand filters (status, source) the given values set. */
export function advancedFilterCount(values: CandidateFilterValues): number {
  return (values.status ? 1 : 0) + (candidateSourceQuery(values) !== undefined ? 1 : 0);
}

/**
 * One compact toolbar over the server-side candidate list: free-text search in
 * line, and lifecycle status and source behind an on-demand Filters disclosure.
 * Both live in one form, so applying always sends the same combined query and
 * returns to the first page, exactly as before.
 *
 * Option values are stored values, never labels. The source filter offers the
 * one source the platform records by itself (a public application) and,
 * because every other source is free text an operator entered, a field to
 * match a source exactly as it was recorded. No source category is invented.
 */
export function CandidateFilters({
  appliedValues,
  busy,
  onChange,
  onReset,
  onSubmit,
  showReset,
  values,
}: {
  /** The filters the list on screen was loaded with; the toggle counts these. */
  appliedValues: CandidateFilterValues;
  busy: boolean;
  onChange: (values: CandidateFilterValues) => void;
  onReset: () => void;
  onSubmit: () => void;
  showReset: boolean;
  values: CandidateFilterValues;
}) {
  const { t } = useI18n();
  const advancedId = useId();
  const appliedAdvanced = advancedFilterCount(appliedValues);
  // Applied on-demand filters stay visible, so what narrows the list is never hidden.
  const [expanded, setExpanded] = useState(appliedAdvanced > 0);

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
      <div className="candidate-filters__bar">
        <div className="candidate-filters__search">
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
        </div>
        <div className="candidate-filters__actions">
          <Button disabled={busy} type="submit">
            {t('candidate.filters.submit')}
          </Button>
          <Button
            aria-controls={advancedId}
            aria-expanded={expanded}
            onClick={() => setExpanded((value) => !value)}
            variant="secondary"
          >
            {appliedAdvanced > 0
              ? t('candidate.filters.toggleActive', { count: appliedAdvanced })
              : t('candidate.filters.toggle')}
          </Button>
          {showReset ? (
            <Button disabled={busy} onClick={onReset} variant="quiet">
              {t('candidate.filters.reset')}
            </Button>
          ) : null}
        </div>
      </div>
      <div className="candidate-filters__advanced" hidden={!expanded} id={advancedId}>
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
        <Select
          label={t('candidate.filters.source')}
          name="sourceMode"
          onChange={(event) =>
            onChange({
              ...values,
              sourceMode:
                CANDIDATE_SOURCE_MODES.find((mode) => mode === event.currentTarget.value) ?? '',
            })
          }
          value={values.sourceMode}
        >
          <option value="">{t('candidate.filters.anySource')}</option>
          {CANDIDATE_SOURCE_MODES.map((mode) => (
            <option key={mode} value={mode}>
              {t(candidateSourceModeLabelKey(mode))}
            </option>
          ))}
        </Select>
        {values.sourceMode === 'recorded' ? (
          <TextField
            autoComplete="off"
            hint={t('candidate.filters.sourceTextHint')}
            label={t('candidate.filters.sourceText')}
            maxLength={120}
            name="sourceText"
            onChange={(event) => onChange({ ...values, sourceText: event.currentTarget.value })}
            value={values.sourceText}
          />
        ) : null}
      </div>
    </form>
  );
}
