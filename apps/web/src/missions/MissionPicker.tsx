import { useI18n } from '../i18n/index.js';
import { BoundedCombobox } from '../ui/BoundedCombobox.js';
import { Button } from '../ui/index.js';
import type { PickerOption } from './mission-state.js';

export type LoadPickerOptions = (search: string) => Promise<PickerOption[]>;

/** Presentation-only adapter; workflow-authorized loaders and source keys stay with callers. */
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
  return (
    <div className="mission-picker">
      <BoundedCombobox
        disabled={disabled}
        hint={emptyLabel ? `${hint} ${emptyLabel}` : hint}
        label={label}
        loadOptions={loadOptions}
        onChange={onChange}
        required={required}
        sourceKey={sourceKey}
        value={value}
      />
      {!required && value ? (
        <Button disabled={disabled} onClick={() => onChange(null)} size="compact" variant="quiet">
          {emptyLabel ?? t('missions.picker.clear')}
        </Button>
      ) : null}
    </div>
  );
}
