import type { FormEvent } from 'react';

import { useI18n } from '../i18n/index.js';
import { Button, Select, TextField } from '../ui/index.js';
import { CONTACT_STATUS_FILTER_OPTIONS, contactStatusLabelKey } from './client-labels.js';
import type { ContactFilterValues } from './client-state.js';

export function ContactFilters({
  busy,
  onChange,
  onReset,
  onSubmit,
  showReset,
  values,
}: {
  busy: boolean;
  onChange: (values: ContactFilterValues) => void;
  onReset: () => void;
  onSubmit: () => void;
  showReset: boolean;
  values: ContactFilterValues;
}) {
  const { t } = useI18n();

  function handleSubmit(event: FormEvent<HTMLFormElement>): void {
    event.preventDefault();
    onSubmit();
  }

  return (
    <form
      aria-label={t('clients.contactFilters.region')}
      className="client-filters"
      onSubmit={handleSubmit}
      role="search"
    >
      <div className="client-filters__controls">
        <TextField
          autoComplete="off"
          hint={t('clients.contactFilters.searchHint')}
          label={t('clients.contactFilters.search')}
          maxLength={120}
          name="contactSearch"
          onChange={(event) => onChange({ ...values, search: event.currentTarget.value })}
          type="search"
          value={values.search}
        />
        <Select
          label={t('clients.contactFilters.status')}
          name="contactStatus"
          onChange={(event) =>
            onChange({
              ...values,
              status:
                CONTACT_STATUS_FILTER_OPTIONS.find(
                  (status) => status === event.currentTarget.value,
                ) ?? '',
            })
          }
          value={values.status}
        >
          <option value="">{t('clients.contactFilters.anyStatus')}</option>
          {CONTACT_STATUS_FILTER_OPTIONS.map((status) => (
            <option key={status} value={status}>
              {t(contactStatusLabelKey(status))}
            </option>
          ))}
        </Select>
      </div>
      <div className="client-filters__actions">
        <Button disabled={busy} size="compact" type="submit" variant="primary">
          {t('clients.contactFilters.submit')}
        </Button>
        {showReset ? (
          <Button
            disabled={busy}
            onClick={onReset}
            size="compact"
            type="button"
            variant="secondary"
          >
            {t('clients.contactFilters.reset')}
          </Button>
        ) : null}
      </div>
    </form>
  );
}
