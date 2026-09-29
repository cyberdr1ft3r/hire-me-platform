import { useEffect, useId, useRef, useState, type KeyboardEvent } from 'react';

import { useI18n } from '../i18n/index.js';
import { Button, Select } from '../ui/index.js';
import type { PickerOption } from './mission-state.js';

type LoadStatus = 'loading' | 'ready' | 'error';

export type LoadPickerOptions = (search: string) => Promise<PickerOption[]>;

function optionText(option: PickerOption): string {
  return option.detail ? `${option.label} · ${option.detail}` : option.label;
}

/**
 * Choose one record by name from a bounded, searchable option source.
 *
 * A native `<select>` holds the choice, so labelling, keyboard use, and focus
 * are the platform's own. The option value is the ID the API expects; an ID is
 * never shown and never typed. `sourceKey` names the source (session, mission,
 * purpose): when it changes the options reload from scratch, and the newest
 * request always wins, so a late page for another mission never appears.
 */
export function MissionPicker({
  disabled,
  emptyLabel,
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
  hint: string;
  label: string;
  loadOptions: LoadPickerOptions;
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

  const shown =
    value && !options.some((option) => option.id === value.id) ? [value, ...options] : options;
  const placeholder =
    emptyLabel ??
    (status === 'loading'
      ? t('missions.picker.loading')
      : status === 'error'
        ? t('missions.picker.error')
        : options.length
          ? t('missions.picker.choose')
          : t('missions.picker.none'));

  return (
    <div className="mission-picker">
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
            {optionText(option)}
          </option>
        ))}
      </Select>
      <div className="mission-picker__search">
        <label className="mission-picker__search-label" htmlFor={searchId}>
          {t('missions.picker.searchFor', { field: label })}
        </label>
        <div className="mission-picker__search-row">
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
            {t('missions.picker.searchAction')}
          </Button>
        </div>
        <span className="ui-field__hint" id={`${searchId}-hint`}>
          {hint}
        </span>
        {status === 'error' && emptyLabel ? (
          <span className="ui-field__error">{t('missions.picker.error')}</span>
        ) : null}
      </div>
    </div>
  );
}
