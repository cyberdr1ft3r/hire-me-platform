import { useEffect, useId, useRef, useState, type KeyboardEvent } from 'react';

import { useI18n } from '../i18n/index.js';
import { Button } from './Button.js';
import { Select } from './Field.js';

export type BoundedPickerOption = {
  id: string;
  label: string;
  detail?: string | null;
};

export type LoadBoundedOptions = (search: string) => Promise<BoundedPickerOption[]>;

type LoadStatus = 'loading' | 'ready' | 'error';

function defaultFormat(option: BoundedPickerOption): string {
  return option.detail ? `${option.label} · ${option.detail}` : option.label;
}

/**
 * Permission-safe async record picker (UI-DNA v1.1).
 *
 * Native `<select>` holds the choice; search narrows a bounded option source.
 * IDs are never shown. Stale async responses are dropped via a request counter.
 */
export function BoundedAsyncPicker({
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
  emptyLabel?: string;
  error?: string;
  formatOption?: (option: BoundedPickerOption) => string;
  hint: string;
  label: string;
  loadOptions: LoadBoundedOptions;
  onChange: (option: BoundedPickerOption | null) => void;
  required?: boolean;
  sourceKey: string;
  value: BoundedPickerOption | null;
}) {
  const { t } = useI18n();
  const searchId = useId();
  const [options, setOptions] = useState<BoundedPickerOption[]>([]);
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
  }, [sourceKey]);

  function handleKeyDown(event: KeyboardEvent<HTMLInputElement>): void {
    if (event.key === 'Enter') {
      event.preventDefault();
      run(search);
    }
  }

  const text = formatOption ?? defaultFormat;
  const shown =
    value && !options.some((option) => option.id === value.id) ? [value, ...options] : options;
  const placeholder =
    emptyLabel ??
    (status === 'loading'
      ? t('ui.picker.loading')
      : status === 'error'
        ? t('ui.picker.error')
        : options.length
          ? t('ui.picker.choose')
          : t('ui.picker.none'));

  return (
    <div className="ui-bounded-picker">
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
      <div className="ui-bounded-picker__search">
        <label className="ui-bounded-picker__search-label" htmlFor={searchId}>
          {t('ui.picker.searchFor', { field: label })}
        </label>
        <div className="ui-bounded-picker__search-row">
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
            {t('ui.picker.searchAction')}
          </Button>
        </div>
        <span className="ui-field__hint" id={`${searchId}-hint`}>
          {hint}
        </span>
        {status === 'error' ? (
          <span className="ui-field__error">{t('ui.picker.error')}</span>
        ) : null}
      </div>
    </div>
  );
}
