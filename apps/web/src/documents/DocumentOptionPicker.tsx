import { useEffect, useId, useRef, useState, type KeyboardEvent } from 'react';

import { useI18n } from '../i18n/index.js';
import { Button, Select } from '../ui/index.js';
import type { PickerOption } from './document-state.js';

type LoadStatus = 'loading' | 'ready' | 'error';

export type LoadDocumentOptions = (search: string) => Promise<PickerOption[]>;

/**
 * Choose one record by name from the bounded Documents option source.
 *
 * A native `<select>` holds the choice; its option value is the ID the API
 * expects, which is never shown and never typed. `sourceKey` identifies the
 * source (session, kind, purpose, parent): when it changes the options reload,
 * and the newest request always wins.
 */
export function DocumentOptionPicker({
  disabled,
  emptyLabel,
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
  /** Text for the empty choice when choosing nothing is meaningful (filters). */
  emptyLabel?: string;
  formatOption?: (option: PickerOption) => string;
  hint: string;
  label: string;
  loadOptions: LoadDocumentOptions;
  onChange: (option: PickerOption | null) => void;
  required?: boolean;
  sourceKey: string;
  value: PickerOption | null;
}) {
  const { t } = useI18n();
  const searchId = useId();
  const [options, setOptions] = useState<PickerOption[]>([]);
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
    ((option: PickerOption) =>
      option.detail ? `${option.label} · ${option.detail}` : option.label);
  const shown =
    value && !options.some((option) => option.id === value.id) ? [value, ...options] : options;
  const placeholder =
    emptyLabel ??
    (status === 'loading'
      ? t('documents.picker.loading')
      : status === 'error'
        ? t('documents.picker.error')
        : options.length
          ? t('documents.picker.choose')
          : t('documents.picker.none'));

  return (
    <div className="document-picker">
      <Select
        aria-busy={status === 'loading' ? 'true' : undefined}
        disabled={disabled}
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
      <div className="document-picker__search">
        <label className="document-picker__search-label" htmlFor={searchId}>
          {t('documents.picker.searchFor', { field: label })}
        </label>
        <div className="document-picker__search-row">
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
            {t('documents.picker.searchAction')}
          </Button>
        </div>
        <span className="ui-field__hint" id={`${searchId}-hint`}>
          {hint}
        </span>
        {status === 'error' && emptyLabel ? (
          <span className="ui-field__error">{t('documents.picker.error')}</span>
        ) : null}
      </div>
    </div>
  );
}
