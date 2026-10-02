import { useEffect, useId, useRef, useState, type KeyboardEvent } from 'react';

import { useI18n } from '../i18n/index.js';
import { Button, Select } from '../ui/index.js';
import type { CommercialPickerOption, LoadCommercialOptions } from './commercial-state.js';

type LoadStatus = 'loading' | 'ready' | 'error';

/**
 * Choose one record by its human label from a bounded, permission-checked
 * option source (D-079). A native `<select>` holds the choice; its option value
 * is the ID the API expects, which is never rendered or typed. When `sourceKey`
 * changes (session, client, linked source) the options reload, and only the
 * newest request may commit.
 */
export function CommercialOptionPicker({
  disabled,
  emptyLabel,
  error,
  formatOption,
  hint,
  label,
  loadOptions,
  onChange,
  required,
  sourceKey,
  value,
}: {
  disabled?: boolean;
  /** Text for the empty choice when choosing nothing is meaningful. */
  emptyLabel?: string;
  error?: string;
  formatOption?: (option: CommercialPickerOption) => string;
  hint: string;
  label: string;
  loadOptions: LoadCommercialOptions;
  onChange: (option: CommercialPickerOption | null) => void;
  required?: boolean;
  sourceKey: string;
  value: CommercialPickerOption | null;
}) {
  const { t } = useI18n();
  const searchId = useId();
  const [options, setOptions] = useState<CommercialPickerOption[]>([]);
  const [status, setStatus] = useState<LoadStatus>('loading');
  const [search, setSearch] = useState('');
  const request = useRef(0);
  const latestLoad = useRef(loadOptions);
  latestLoad.current = loadOptions;

  function run(term: string): void {
    const current = ++request.current;
    setStatus('loading');
    latestLoad
      .current(term.trim())
      .then((next) => {
        if (current !== request.current) return;
        setOptions(next);
        setStatus('ready');
      })
      .catch(() => {
        if (current === request.current) setStatus('error');
      });
  }

  useEffect(() => {
    setSearch('');
    run('');
    return () => {
      request.current += 1;
    };
    // `sourceKey` identifies the source; the latest loader is read through a ref.
  }, [sourceKey]);

  function handleKeyDown(event: KeyboardEvent<HTMLInputElement>): void {
    // Enter searches here instead of submitting the surrounding form.
    if (event.key === 'Enter') {
      event.preventDefault();
      run(search);
    }
  }

  const text =
    formatOption ??
    ((option: CommercialPickerOption) =>
      option.detail ? `${option.label} · ${option.detail}` : option.label);
  const shown =
    value && !options.some((option) => option.id === value.id) ? [value, ...options] : options;
  const placeholder =
    emptyLabel ??
    (status === 'loading'
      ? t('commercial.picker.loading')
      : status === 'error'
        ? t('commercial.picker.error')
        : options.length
          ? t('commercial.picker.choose')
          : t('commercial.picker.none'));

  return (
    <div className="commercial-picker">
      <Select
        aria-busy={status === 'loading' ? 'true' : undefined}
        disabled={disabled}
        error={error}
        label={label}
        onChange={(event) => {
          onChange(shown.find((option) => option.id === event.currentTarget.value) ?? null);
        }}
        required={required}
        value={value?.id ?? ''}
      >
        <option value="">{placeholder}</option>
        {shown.map((option) => (
          <option key={option.id} value={option.id}>
            {text(option)}
          </option>
        ))}
      </Select>
      <div className="commercial-picker__search">
        <label className="commercial-picker__search-label" htmlFor={searchId}>
          {t('commercial.picker.searchFor', { field: label })}
        </label>
        <div className="commercial-picker__search-row">
          <input
            aria-describedby={`${searchId}-hint`}
            autoComplete="off"
            className="ui-field__control"
            disabled={disabled}
            id={searchId}
            maxLength={120}
            onChange={(event) => setSearch(event.currentTarget.value)}
            onKeyDown={handleKeyDown}
            type="search"
            value={search}
          />
          <Button
            disabled={disabled}
            onClick={() => run(search)}
            size="compact"
            type="button"
            variant="secondary"
          >
            {t('commercial.picker.searchAction')}
          </Button>
        </div>
        <span className="ui-field__hint" id={`${searchId}-hint`}>
          {hint}
        </span>
        {status === 'error' && emptyLabel ? (
          <span className="ui-field__error">{t('commercial.picker.error')}</span>
        ) : null}
      </div>
    </div>
  );
}
