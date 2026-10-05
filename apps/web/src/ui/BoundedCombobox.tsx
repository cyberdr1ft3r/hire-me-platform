import { useEffect, useId, useLayoutEffect, useRef, useState, type KeyboardEvent } from 'react';

import { useI18n } from '../i18n/index.js';
import { FieldFrame } from './Field.js';

export type BoundedPickerOption = {
  id: string;
  label: string;
  detail?: string | null;
};

export type LoadBoundedOptions = (search: string) => Promise<BoundedPickerOption[]>;

type LoadStatus = 'idle' | 'loading' | 'ready' | 'error';

const SEARCH_DEBOUNCE_MS = 280;
const INPUT_MAX_LENGTH = 120;

function defaultFormat(option: BoundedPickerOption): string {
  return option.detail ? `${option.label} · ${option.detail}` : option.label;
}

function displayValue(
  value: BoundedPickerOption | null,
  formatOption: (option: BoundedPickerOption) => string,
): string {
  return value ? formatOption(value) : '';
}

/**
 * UI-DNA v1.1 permission-safe type-ahead combobox (Issue #117).
 *
 * One text control + popup listbox; no separate Search button or native `<select>`.
 * Option IDs are never shown to operators.
 */
export function BoundedCombobox({
  disabled,
  error,
  formatOption,
  hint,
  label,
  loadOptions,
  onChange,
  readOnly,
  required,
  sourceKey,
  value,
}: {
  disabled?: boolean;
  error?: string;
  formatOption?: (option: BoundedPickerOption) => string;
  hint: string;
  label: string;
  loadOptions: LoadBoundedOptions;
  onChange: (option: BoundedPickerOption | null) => void;
  readOnly?: boolean;
  required?: boolean;
  sourceKey: string;
  value: BoundedPickerOption | null;
}) {
  const { t } = useI18n();
  const listboxId = useId();
  const format = formatOption ?? defaultFormat;
  const inactive = disabled || readOnly;

  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [options, setOptions] = useState<BoundedPickerOption[]>([]);
  const [status, setStatus] = useState<LoadStatus>('idle');
  const [activeIndex, setActiveIndex] = useState(-1);

  const request = useRef(0);
  const debounce = useRef<ReturnType<typeof setTimeout> | null>(null);
  const latestLoad = useRef(loadOptions);
  const inputRef = useRef<HTMLInputElement>(null);
  const rootRef = useRef<HTMLDivElement>(null);

  latestLoad.current = loadOptions;

  function mergeOptions(next: BoundedPickerOption[]): BoundedPickerOption[] {
    if (!value) return next;
    if (next.some((option) => option.id === value.id)) return next;
    return [value, ...next];
  }

  function runSearch(term: string): void {
    const current = ++request.current;
    setStatus('loading');
    latestLoad
      .current(term.trim())
      .then((next) => {
        if (current !== request.current) return;
        setOptions(mergeOptions(next));
        setStatus('ready');
        setActiveIndex(-1);
      })
      .catch(() => {
        if (current === request.current) {
          setStatus('error');
          setOptions(value ? [value] : []);
          setActiveIndex(-1);
        }
      });
  }

  function scheduleSearch(term: string): void {
    if (debounce.current) clearTimeout(debounce.current);
    debounce.current = setTimeout(() => runSearch(term), SEARCH_DEBOUNCE_MS);
  }

  function closeListbox(restoreDisplay: boolean): void {
    setOpen(false);
    setActiveIndex(-1);
    if (restoreDisplay) {
      setQuery(displayValue(value, format));
    }
  }

  function openListbox(initialQuery: string): void {
    if (inactive) return;
    setOpen(true);
    setQuery(initialQuery);
    runSearch(initialQuery);
  }

  function selectOption(option: BoundedPickerOption | null): void {
    onChange(option);
    setQuery(option ? format(option) : '');
    closeListbox(false);
    inputRef.current?.focus();
  }

  useEffect(() => {
    setOpen(false);
    setActiveIndex(-1);
    setOptions(value ? [value] : []);
    setStatus('idle');
    request.current += 1;
    if (debounce.current) clearTimeout(debounce.current);
  }, [sourceKey, value?.id]);

  useEffect(() => {
    if (!open) {
      setQuery(displayValue(value, format));
    }
  }, [value, formatOption, open]);

  useLayoutEffect(() => {
    if (!open) return;
    function onPointerDown(event: MouseEvent): void {
      if (!rootRef.current?.contains(event.target as Node)) {
        closeListbox(true);
      }
    }
    document.addEventListener('mousedown', onPointerDown);
    return () => document.removeEventListener('mousedown', onPointerDown);
  }, [open, value, format]);

  function handleInputChange(next: string): void {
    if (inactive) return;
    setQuery(next);
    if (!open) setOpen(true);
    scheduleSearch(next);
  }

  function handleKeyDown(event: KeyboardEvent<HTMLInputElement>): void {
    if (inactive) return;

    if (event.key === 'ArrowDown') {
      event.preventDefault();
      if (!open) {
        openListbox(query);
        return;
      }
      if (options.length === 0) return;
      setActiveIndex((index) => (index < 0 ? 0 : index < options.length - 1 ? index + 1 : 0));
      return;
    }

    if (event.key === 'ArrowUp') {
      event.preventDefault();
      if (!open) {
        openListbox(query);
        return;
      }
      if (options.length === 0) return;
      setActiveIndex((index) => (index > 0 ? index - 1 : options.length - 1));
      return;
    }

    if (event.key === 'Enter') {
      if (!open) return;
      event.preventDefault();
      if (activeIndex >= 0 && options[activeIndex]) {
        selectOption(options[activeIndex] ?? null);
      }
      return;
    }

    if (event.key === 'Escape') {
      if (!open) return;
      event.preventDefault();
      closeListbox(true);
      return;
    }
  }

  const activeOptionId =
    open && activeIndex >= 0 && options[activeIndex]
      ? `${listboxId}-option-${activeIndex}`
      : undefined;

  const listLabel =
    status === 'loading'
      ? t('ui.combobox.loading')
      : status === 'error'
        ? t('ui.combobox.error')
        : options.length === 0
          ? t('ui.combobox.empty')
          : t('ui.combobox.listLabel', { field: label });

  return (
    <div className="ui-bounded-combobox" ref={rootRef}>
      <FieldFrame error={error} hint={hint} label={label} required={required}>
        {({ controlId, describedBy }) => (
          <>
            <input
              ref={inputRef}
              aria-activedescendant={activeOptionId}
              aria-autocomplete="list"
              aria-controls={open ? listboxId : undefined}
              aria-describedby={describedBy}
              aria-expanded={open}
              aria-invalid={error ? 'true' : undefined}
              autoComplete="off"
              className="ui-field__control"
              disabled={disabled}
              id={controlId}
              maxLength={INPUT_MAX_LENGTH}
              onChange={(event) => handleInputChange(event.currentTarget.value)}
              onFocus={() => {
                if (!inactive && !open) {
                  openListbox(query === displayValue(value, format) ? '' : query);
                }
              }}
              onKeyDown={handleKeyDown}
              readOnly={readOnly}
              role="combobox"
              type="text"
              value={query}
            />
            {open ? (
              <ul
                aria-busy={status === 'loading' ? 'true' : undefined}
                aria-label={listLabel}
                className="ui-bounded-combobox__listbox"
                id={listboxId}
                role="listbox"
              >
                {status === 'loading' ? (
                  <li className="ui-bounded-combobox__status" role="presentation">
                    {t('ui.combobox.loading')}
                  </li>
                ) : null}
                {status === 'error' ? (
                  <li
                    className="ui-bounded-combobox__status ui-bounded-combobox__status--error"
                    role="presentation"
                  >
                    {t('ui.combobox.error')}
                  </li>
                ) : null}
                {status === 'ready' && options.length === 0 ? (
                  <li className="ui-bounded-combobox__status" role="presentation">
                    {t('ui.combobox.empty')}
                  </li>
                ) : null}
                {options.map((option, index) => (
                  <li
                    aria-selected={value?.id === option.id}
                    className="ui-bounded-combobox__option"
                    data-active={index === activeIndex ? 'true' : undefined}
                    id={`${listboxId}-option-${index}`}
                    key={option.id}
                    onMouseDown={(event) => event.preventDefault()}
                    onMouseEnter={() => setActiveIndex(index)}
                    onClick={() => selectOption(option)}
                    role="option"
                  >
                    {format(option)}
                  </li>
                ))}
              </ul>
            ) : null}
          </>
        )}
      </FieldFrame>
    </div>
  );
}
