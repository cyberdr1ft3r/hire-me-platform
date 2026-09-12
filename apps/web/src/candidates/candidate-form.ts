import { useState, type FormEvent } from 'react';

import { useI18n } from '../i18n/index.js';
import type { CandidateFailure } from './candidate-errors.js';
import { candidateFieldErrorLabelKey } from './candidate-labels.js';
import type { CandidateFieldError, CandidateFormOutcome } from './candidate-state.js';

/**
 * Contract length limits for the text controls this workspace renders, so a
 * control can never accept more than the API would. They mirror
 * `packages/contracts/src/candidates.ts` and change nothing about validation
 * on the server.
 */
export const CANDIDATE_FIELD_LIMITS = {
  city: 120,
  country: 120,
  currentJobTitle: 160,
  displayName: 180,
  email: 254,
  employer: 180,
  endDate: 40,
  field: 180,
  institution: 180,
  language: 120,
  level: 80,
  name: 120,
  phone: 60,
  professionalSummary: 3000,
  proficiency: 80,
  qualification: 180,
  source: 120,
  startDate: 40,
  title: 180,
} as const;

const EMAIL_SHAPE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export type CandidateFieldErrors = Partial<Record<string, CandidateFieldError>>;

interface CandidateFormSpec<Field extends string> {
  email?: readonly Field[];
  fields: readonly Field[];
  required?: readonly Field[];
}

/**
 * Local validation that runs before any request.
 *
 * Browser validation bubbles are turned off (`noValidate`) because they speak
 * the browser's language rather than the interface's, so required and email
 * checks are repeated here with localized messages placed beside their fields.
 * The server still validates everything; this only saves a round trip.
 */
export function validateCandidateValues<Field extends string>(
  values: Record<Field, string>,
  spec: CandidateFormSpec<Field>,
): CandidateFieldErrors {
  const errors: CandidateFieldErrors = {};
  for (const field of spec.required ?? []) {
    if (values[field].trim().length === 0) {
      errors[field] = 'required';
    }
  }
  for (const field of spec.email ?? []) {
    const value = values[field].trim();
    if (!errors[field] && value.length > 0 && !EMAIL_SHAPE.test(value)) {
      errors[field] = 'email';
    }
  }
  return errors;
}

function readFormValues<Field extends string>(
  form: HTMLFormElement,
  fields: readonly Field[],
): Record<Field, string> {
  const data = new FormData(form);
  const values = {} as Record<Field, string>;
  for (const field of fields) {
    const value = data.get(field);
    values[field] = typeof value === 'string' ? value : '';
  }
  return values;
}

function focusFirstInvalid(form: HTMLFormElement, errors: CandidateFieldErrors): void {
  const first = Object.keys(errors)[0];
  const control = first ? form.elements.namedItem(first) : null;
  if (control instanceof HTMLElement) {
    control.focus();
  }
}

/**
 * Shared submission behaviour for every Candidate form: read the raw control
 * values, validate them locally, hand them to the container, and show whatever
 * comes back beside the relevant field or as one safe form-level message.
 *
 * `blocked` is the workspace's single write lock. While any Candidate write is
 * in flight a form cannot submit, even through implicit submission from a
 * text field, so two writes can never overlap.
 */
export function useCandidateForm<Field extends string>(
  spec: CandidateFormSpec<Field>,
  onSubmit: (values: Record<Field, string>, form: HTMLFormElement) => Promise<CandidateFormOutcome>,
  onSuccess?: () => void,
  blocked = false,
) {
  const { t } = useI18n();
  const [errors, setErrors] = useState<CandidateFieldErrors>({});
  const [failure, setFailure] = useState<CandidateFailure | null>(null);

  async function handleSubmit(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    if (blocked) {
      return;
    }
    const form = event.currentTarget;
    const values = readFormValues(form, spec.fields);
    const found = validateCandidateValues(values, spec);
    setFailure(null);
    if (Object.keys(found).length > 0) {
      setErrors(found);
      focusFirstInvalid(form, found);
      return;
    }
    setErrors({});
    const outcome = await onSubmit(values, form);
    if (outcome.ok) {
      form.reset();
      onSuccess?.();
      return;
    }
    setErrors(outcome.fieldErrors ?? {});
    setFailure(outcome.failure ?? null);
    if (outcome.fieldErrors) {
      focusFirstInvalid(form, outcome.fieldErrors);
    }
  }

  function errorFor(field: Field): string | undefined {
    const error = errors[field];
    return error ? t(candidateFieldErrorLabelKey(error)) : undefined;
  }

  return {
    errorFor,
    failure,
    handleSubmit: (event: FormEvent<HTMLFormElement>) => void handleSubmit(event),
    hasFieldErrors: Object.keys(errors).length > 0,
  };
}
