import { useEffect, useId, useRef, useState, type KeyboardEvent } from 'react';

import { useI18n } from '../i18n/index.js';
import { Button, Select } from '../ui/index.js';
import type { LoadOptions, OptionSource, PickerOption } from './task-state.js';

type LoadStatus = 'loading' | 'ready' | 'error';

/**
 * Loads options for one source, newest request wins. Changing `sourceKey`
 * (another task, another purpose, another session) reloads from scratch.
 */
function useOptions(source: OptionSource, sourceKey: string, loadOptions: LoadOptions) {
  const [options, setOptions] = useState<PickerOption[]>([]);
  const [status, setStatus] = useState<LoadStatus>('loading');
  const request = useRef(0);
  const latestLoad = useRef(loadOptions);
  const latestSource = useRef(source);
  latestLoad.current = loadOptions;
  latestSource.current = source;

  function run(search: string): void {
    const current = ++request.current;
    setStatus('loading');
    latestLoad
      .current(latestSource.current, search.trim())
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
    run('');
    return () => {
      request.current += 1;
    };
    // `sourceKey` identifies the source; the latest loader is read through a ref.
  }, [sourceKey]);

  return { options, run, status };
}

function useOptionText() {
  const { t } = useI18n();
  return (option: PickerOption): string => {
    const name = option.self ? t('task.picker.you', { name: option.label }) : option.label;
    return option.detail ? `${name} · ${option.detail}` : name;
  };
}

function SearchRow({
  disabled,
  field,
  hint,
  onSearch,
}: {
  disabled?: boolean;
  field: string;
  hint: string;
  onSearch: (search: string) => void;
}) {
  const { t } = useI18n();
  const id = useId();
  const [search, setSearch] = useState('');

  function handleKeyDown(event: KeyboardEvent<HTMLInputElement>): void {
    // Enter searches here instead of submitting the surrounding form.
    if (event.key === 'Enter') {
      event.preventDefault();
      onSearch(search);
    }
  }

  return (
    <div className="task-picker__search">
      <label className="task-picker__search-label" htmlFor={id}>
        {t('task.picker.searchFor', { field })}
      </label>
      <div className="task-picker__search-row">
        <input
          aria-describedby={`${id}-hint`}
          className="ui-field__control"
          disabled={disabled}
          id={id}
          onChange={(event) => setSearch(event.target.value)}
          onKeyDown={handleKeyDown}
          type="search"
          value={search}
        />
        <Button
          disabled={disabled}
          onClick={() => onSearch(search)}
          size="compact"
          variant="secondary"
        >
          {t('task.picker.searchAction')}
        </Button>
      </div>
      <span className="ui-field__hint" id={`${id}-hint`}>
        {hint}
      </span>
    </div>
  );
}

export interface SearchPickerProps {
  disabled?: boolean;
  /** Text for the empty choice when choosing nobody is meaningful (filters). */
  emptyLabel?: string;
  hint: string;
  label: string;
  loadOptions: LoadOptions;
  /** Form control name; the submitted value is the chosen option's ID. */
  name?: string;
  onChange?: (option: PickerOption | null) => void;
  required?: boolean;
  source: OptionSource;
  sourceKey: string;
  /** Controlled selection, for filters. Forms leave it uncontrolled. */
  value?: PickerOption | null;
}

/**
 * Choose one person or record by name.
 *
 * A native `<select>` holds the choice, so its label, keyboard behaviour, and
 * form submission are the platform's own. The options are a bounded page of
 * results; the search field narrows them. The option text is the name and a
 * disambiguating detail; the option value is the ID the API expects. An ID is
 * never shown and never typed.
 */
export function SearchPicker(props: SearchPickerProps) {
  const { t } = useI18n();
  const optionText = useOptionText();
  const { options, run, status } = useOptions(props.source, props.sourceKey, props.loadOptions);
  const [internal, setInternal] = useState<PickerOption | null>(null);
  const selected = props.value !== undefined ? props.value : internal;
  const shown =
    selected && !options.some((option) => option.id === selected.id)
      ? [selected, ...options]
      : options;

  const placeholder =
    props.emptyLabel ??
    (status === 'loading'
      ? t('task.picker.loading')
      : status === 'error'
        ? t('task.picker.error')
        : options.length
          ? t('task.picker.choose')
          : t('task.picker.none'));

  return (
    <div className="task-picker">
      <Select
        disabled={props.disabled}
        label={props.label}
        name={props.name}
        onChange={(event) => {
          const next = shown.find((option) => option.id === event.target.value) ?? null;
          setInternal(next);
          props.onChange?.(next);
        }}
        required={props.required}
        value={selected?.id ?? ''}
      >
        <option value="">{placeholder}</option>
        {shown.map((option) => (
          <option key={option.id} value={option.id}>
            {optionText(option)}
          </option>
        ))}
      </Select>
      <SearchRow disabled={props.disabled} field={props.label} hint={props.hint} onSearch={run} />
      {status === 'error' && props.emptyLabel ? (
        <span className="ui-field__error">{t('task.picker.error')}</span>
      ) : null}
    </div>
  );
}

/**
 * Choose any number of people to mention. Checkboxes submit one
 * `mentionedUserIds` value per chosen person; a choice survives a new search.
 */
export function MentionPicker({
  disabled,
  loadOptions,
  source,
  sourceKey,
}: {
  disabled?: boolean;
  loadOptions: LoadOptions;
  source: OptionSource;
  sourceKey: string;
}) {
  const { t } = useI18n();
  const optionText = useOptionText();
  const hintId = useId();
  const { options, run, status } = useOptions(source, sourceKey, loadOptions);
  const [chosen, setChosen] = useState<PickerOption[]>([]);
  const shown = [
    ...chosen,
    ...options.filter((option) => !chosen.some((entry) => entry.id === option.id)),
  ];

  function toggle(option: PickerOption, checked: boolean): void {
    setChosen((current) =>
      checked ? [...current, option] : current.filter((entry) => entry.id !== option.id),
    );
  }

  return (
    <fieldset aria-describedby={hintId} className="task-picker task-picker--multi">
      <legend className="ui-field__label">{t('task.comments.mentions')}</legend>
      <span className="ui-field__hint" id={hintId}>
        {t('task.comments.mentionsHint')}
      </span>
      <SearchRow
        disabled={disabled}
        field={t('task.comments.mentions')}
        hint={t('task.picker.searchPeopleHint')}
        onSearch={run}
      />
      {shown.length ? (
        <ul className="task-picker__choices">
          {shown.map((option) => (
            <li key={option.id}>
              <label className="ui-checkbox__label">
                <input
                  checked={chosen.some((entry) => entry.id === option.id)}
                  disabled={disabled}
                  name="mentionedUserIds"
                  onChange={(event) => toggle(option, event.target.checked)}
                  type="checkbox"
                  value={option.id}
                />
                <span>{optionText(option)}</span>
              </label>
            </li>
          ))}
        </ul>
      ) : (
        <p className="task-picker__empty">
          {status === 'loading'
            ? t('task.picker.loading')
            : status === 'error'
              ? t('task.picker.error')
              : t('task.picker.none')}
        </p>
      )}
    </fieldset>
  );
}
