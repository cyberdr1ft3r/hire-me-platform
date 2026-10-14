import { useId, useState, type FormEvent } from 'react';

import { useI18n } from '../i18n/index.js';
import { Button, Select, TextField } from '../ui/index.js';
import { CLIENT_STATUS_FILTER_OPTIONS, clientStatusLabelKey } from './client-labels.js';
import type { ClientFilterValues } from './client-state.js';

function advancedFilterCount(values: ClientFilterValues): number {
  return (values.status ? 1 : 0) + (values.industry.trim() ? 1 : 0);
}

export function ClientFilters({
  appliedValues,
  busy,
  onChange,
  onReset,
  onSubmit,
  showReset,
  values,
}: {
  appliedValues: ClientFilterValues;
  busy: boolean;
  onChange: (values: ClientFilterValues) => void;
  onReset: () => void;
  onSubmit: () => void;
  showReset: boolean;
  values: ClientFilterValues;
}) {
  const { t } = useI18n();
  const filtersId = useId();
  const advancedCount = advancedFilterCount(appliedValues);
  const [advancedOpen, setAdvancedOpen] = useState(advancedCount > 0);

  function handleSubmit(event: FormEvent<HTMLFormElement>): void {
    event.preventDefault();
    onSubmit();
  }

  return (
    <form
      aria-label={t('clients.filters.region')}
      className="client-filters"
      onSubmit={handleSubmit}
      role="search"
    >
      <div className="client-filters__bar">
        <TextField
          autoComplete="off"
          className="client-filters__search"
          hint={t('clients.filters.searchHint')}
          label={t('clients.filters.search')}
          maxLength={120}
          name="search"
          onChange={(event) => onChange({ ...values, search: event.currentTarget.value })}
          type="search"
          value={values.search}
        />
        <div className="client-filters__actions">
          <Button disabled={busy} size="compact" type="submit" variant="primary">
            {t('clients.filters.submit')}
          </Button>
          {showReset ? (
            <Button
              disabled={busy}
              onClick={onReset}
              size="compact"
              type="button"
              variant="secondary"
            >
              {t('clients.filters.reset')}
            </Button>
          ) : null}
          <Button
            aria-controls={filtersId}
            aria-expanded={advancedOpen}
            disabled={busy}
            onClick={() => setAdvancedOpen((open) => !open)}
            size="compact"
            type="button"
            variant="secondary"
          >
            {advancedCount > 0
              ? t('clients.filters.filtersActive', { count: advancedCount })
              : t('clients.filters.filtersToggle')}
          </Button>
        </div>
      </div>
      <div className="client-filters__advanced" hidden={!advancedOpen} id={filtersId}>
        <Select
          label={t('clients.filters.status')}
          name="status"
          onChange={(event) =>
            onChange({
              ...values,
              status:
                CLIENT_STATUS_FILTER_OPTIONS.find(
                  (status) => status === event.currentTarget.value,
                ) ?? '',
            })
          }
          value={values.status}
        >
          <option value="">{t('clients.filters.anyStatus')}</option>
          {CLIENT_STATUS_FILTER_OPTIONS.map((status) => (
            <option key={status} value={status}>
              {t(clientStatusLabelKey(status))}
            </option>
          ))}
        </Select>
        <TextField
          autoComplete="off"
          hint={t('clients.filters.industryHint')}
          label={t('clients.filters.industry')}
          maxLength={120}
          name="industry"
          onChange={(event) => onChange({ ...values, industry: event.currentTarget.value })}
          value={values.industry}
        />
      </div>
    </form>
  );
}
