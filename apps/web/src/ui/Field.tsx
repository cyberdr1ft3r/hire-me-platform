import {
  useId,
  type InputHTMLAttributes,
  type ReactNode,
  type SelectHTMLAttributes,
  type TextareaHTMLAttributes,
} from 'react';

interface FieldFrameProps {
  children: (ids: { controlId: string; describedBy: string | undefined }) => ReactNode;
  error?: string;
  hint?: string;
  id?: string;
  label: string;
  required?: boolean;
}

export function FieldFrame({ children, error, hint, id, label, required }: FieldFrameProps) {
  const generatedId = useId();
  const controlId = id ?? generatedId;
  const hintId = hint ? `${controlId}-hint` : undefined;
  const errorId = error ? `${controlId}-error` : undefined;
  const describedBy = [hintId, errorId].filter(Boolean).join(' ') || undefined;

  return (
    <div className="ui-field" data-invalid={error ? 'true' : undefined}>
      <label className="ui-field__label" htmlFor={controlId}>
        {label}
        {required ? <span aria-hidden="true"> *</span> : null}
      </label>
      {children({ controlId, describedBy })}
      {hint ? (
        <span className="ui-field__hint" id={hintId}>
          {hint}
        </span>
      ) : null}
      {error ? (
        <span className="ui-field__error" id={errorId} role="alert">
          {error}
        </span>
      ) : null}
    </div>
  );
}

export interface TextFieldProps extends Omit<InputHTMLAttributes<HTMLInputElement>, 'id'> {
  error?: string;
  hint?: string;
  id?: string;
  label: string;
}

export function TextField({ error, hint, id, label, required, ...props }: TextFieldProps) {
  return (
    <FieldFrame error={error} hint={hint} id={id} label={label} required={required}>
      {({ controlId, describedBy }) => (
        <input
          {...props}
          aria-describedby={describedBy}
          aria-invalid={error ? 'true' : undefined}
          className="ui-field__control"
          id={controlId}
          required={required}
        />
      )}
    </FieldFrame>
  );
}

export interface TextAreaProps extends Omit<TextareaHTMLAttributes<HTMLTextAreaElement>, 'id'> {
  error?: string;
  hint?: string;
  id?: string;
  label: string;
}

export function TextArea({ error, hint, id, label, required, ...props }: TextAreaProps) {
  return (
    <FieldFrame error={error} hint={hint} id={id} label={label} required={required}>
      {({ controlId, describedBy }) => (
        <textarea
          {...props}
          aria-describedby={describedBy}
          aria-invalid={error ? 'true' : undefined}
          className="ui-field__control"
          id={controlId}
          required={required}
        />
      )}
    </FieldFrame>
  );
}

export interface SelectProps extends Omit<SelectHTMLAttributes<HTMLSelectElement>, 'id'> {
  error?: string;
  hint?: string;
  id?: string;
  label: string;
}

export function Select({ children, error, hint, id, label, required, ...props }: SelectProps) {
  return (
    <FieldFrame error={error} hint={hint} id={id} label={label} required={required}>
      {({ controlId, describedBy }) => (
        <select
          {...props}
          aria-describedby={describedBy}
          aria-invalid={error ? 'true' : undefined}
          className="ui-field__control"
          id={controlId}
          required={required}
        >
          {children}
        </select>
      )}
    </FieldFrame>
  );
}

export interface CheckboxProps extends Omit<InputHTMLAttributes<HTMLInputElement>, 'id' | 'type'> {
  hint?: string;
  id?: string;
  label: string;
}

export function Checkbox({ hint, id, label, ...props }: CheckboxProps) {
  const generatedId = useId();
  const controlId = id ?? generatedId;
  const hintId = hint ? `${controlId}-hint` : undefined;

  return (
    <div className="ui-checkbox">
      <label className="ui-checkbox__label" htmlFor={controlId}>
        <input {...props} aria-describedby={hintId} id={controlId} type="checkbox" />
        <span>{label}</span>
      </label>
      {hint ? (
        <span className="ui-field__hint" id={hintId}>
          {hint}
        </span>
      ) : null}
    </div>
  );
}
