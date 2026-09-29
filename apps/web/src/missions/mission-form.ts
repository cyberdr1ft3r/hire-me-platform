import type {
  MissionCreateRequest,
  MissionUpdateRequest,
  PublicContentLanguage,
} from '@hire-me/contracts';

import type { MissionCreateValues, MissionProfileValues } from './mission-state.js';

function positions(value: string): number {
  return Number(value.trim());
}

export function toMissionCreateRequest(values: MissionCreateValues): MissionCreateRequest | null {
  if (!values.client) {
    return null;
  }
  return {
    clientId: values.client.id,
    title: values.title.trim(),
    description: optionalText(values.description),
    requirements: optionalText(values.requirements),
    priority: values.priority,
    numberOfPositions: positions(values.numberOfPositions),
    location: optionalText(values.location),
    workArrangement: optionalText(values.workArrangement),
    engagementType: optionalText(values.engagementType),
  };
}

export function toMissionUpdateRequest(values: MissionProfileValues): MissionUpdateRequest {
  return {
    title: values.title.trim(),
    priority: values.priority,
    numberOfPositions: positions(values.numberOfPositions),
    location: nullableText(values.location),
    workArrangement: nullableText(values.workArrangement),
    engagementType: nullableText(values.engagementType),
  };
}

export function formValue(formData: FormData, name: string, fallback = ''): string {
  const value = formData.get(name);
  return typeof value === 'string' ? value : fallback;
}

export function optionalFormValue(formData: FormData, name: string): string | undefined {
  const value = formValue(formData, name).trim();
  return value.length > 0 ? value : undefined;
}

export function nullableFormValue(formData: FormData, name: string): string | null {
  const value = formValue(formData, name).trim();
  return value.length > 0 ? value : null;
}

export function optionalText(value: string): string | undefined {
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : undefined;
}

export function nullableText(value: string): string | null {
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

export function optionalNumber(formData: FormData, name: string): number | undefined {
  const value = formValue(formData, name).trim();
  return value.length > 0 ? Number(value) : undefined;
}

export function formValues(formData: FormData, name: string): string[] {
  return formData
    .getAll(name)
    .filter((value): value is string => typeof value === 'string' && value.length > 0);
}

/** A `datetime-local` value is wall-clock time in the browser's zone; the API takes UTC ISO. */
export function dateTimeFormValue(formData: FormData, name: string): string {
  return new Date(formValue(formData, name)).toISOString();
}

export function optionalDateTimeFormValue(formData: FormData, name: string): string | undefined {
  const value = formValue(formData, name).trim();
  return value.length > 0 ? new Date(value).toISOString() : undefined;
}

/** The inverse of `dateTimeFormValue`, so a stored instant round-trips unchanged. */
export function dateTimeInputValue(value: string | null): string {
  if (!value) {
    return '';
  }
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return '';
  }
  const pad = (part: number) => String(part).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(
    date.getHours(),
  )}:${pad(date.getMinutes())}`;
}

/** The staff-selected content language; "Not specified" and anything else is `null`. */
export function contentLanguageValue(value: FormDataEntryValue | null): PublicContentLanguage | null {
  return value === 'en' || value === 'fr' ? value : null;
}
