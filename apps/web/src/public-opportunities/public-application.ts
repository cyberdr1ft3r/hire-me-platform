import {
  normalizePublicSalaryExpectationCurrency,
  type PublicApplicationFileInput,
  type PublicApplicationSubmitRequest,
  type PublicOpportunity,
} from '@hire-me/contracts';

import { parseSalaryAmount } from '../money/index.js';

type UploadRequirements = PublicOpportunity['uploadRequirements'];
type FileCategory = PublicApplicationFileInput['category'];

/**
 * The text controls the application form offers, in form order.
 *
 * `salaryExpectationAmount` is what a person types: a salary expectation in
 * normal major currency units. It is deliberately not named after the
 * `salaryExpectationCents` transport field, which carries exact integer minor
 * units; `buildApplicationRequest` is the only place that converts between the
 * two, and the candidate never sees the word "cents".
 *
 * `website` is the anti-spam trap: it is hidden from people and sent as-is.
 */
export const APPLICATION_TEXT_FIELDS = [
  'fullName',
  'email',
  'phone',
  'city',
  'country',
  'currentPosition',
  'experienceYears',
  'availability',
  'skills',
  'languages',
  'salaryExpectationAmount',
  'salaryExpectationCurrency',
  'professionalLinks',
  'motivation',
  'website',
] as const;

export type ApplicationTextField = (typeof APPLICATION_TEXT_FIELDS)[number];

/**
 * File controls, keyed by the form-control name the page has always used and
 * mapped to the language-neutral category the API expects. The category is the
 * value sent; its label is a presentation mapping and never travels.
 */
export const APPLICATION_FILE_SLOTS = [
  { category: 'CV', name: 'cv' },
  { category: 'CERTIFICATION', name: 'certification' },
  { category: 'DIPLOMA', name: 'diploma' },
  { category: 'ADDITIONAL', name: 'additional' },
] as const satisfies readonly { category: FileCategory; name: string }[];

export type ApplicationFileSlot = (typeof APPLICATION_FILE_SLOTS)[number]['name'];

/**
 * Contract limits for the controls this form renders, so a control never
 * accepts more than the API would. They mirror
 * `packages/contracts/src/public-applications.ts` and change nothing on the
 * server. The currency control holds at most three characters; that length cap
 * is only a typing aid, and `validateApplication` applies the contract's own
 * currency rule to whatever the control actually holds.
 */
export const APPLICATION_FIELD_LIMITS = {
  email: 254,
  experienceYearsMax: 80,
  fullName: 160,
  /**
   * Comfortably longer than the largest acceptable amount
   * (`21474836.47`, eleven characters) so nothing typable is cut off mid-entry,
   * while still bounding the control. The parser decides what is acceptable.
   */
  salaryExpectationAmount: 24,
  salaryExpectationCurrency: 3,
  text: 4000,
} as const;

/** Everything one submission needs, read from the form in a single pass. */
export interface ApplicationSnapshot {
  consentGranted: boolean;
  files: Partial<Record<ApplicationFileSlot, File>>;
  values: Record<ApplicationTextField, string>;
}

export type ApplicationFieldError =
  | {
      code:
        'consent' | 'email' | 'experienceYears' | 'required' | 'salaryAmount' | 'salaryCurrency';
    }
  | { code: 'fileRequired' | 'fileType' }
  | { code: 'fileSize'; limitBytes: number };

export type ApplicationErrorTarget = ApplicationTextField | ApplicationFileSlot | 'consentGranted';

export interface ApplicationValidation {
  /** Field errors in form order, so the first key is the first invalid control. */
  fields: Partial<Record<ApplicationErrorTarget, ApplicationFieldError>>;
  /** Set when every file is individually acceptable but together they exceed the total. */
  totalLimitBytes: number | null;
}

const EMAIL_SHAPE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/**
 * The number the request would carry for a numeric control, or `null` when it
 * is left empty. It is converted exactly as the request converts it, so the
 * check sees the same value the server would.
 */
function wholeNumberOrNull(value: string): number | null {
  const trimmed = value.trim();
  return trimmed.length > 0 ? Number(trimmed) : null;
}

/** The file controls an opportunity shows. The CV control is always offered. */
export function visibleFileSlots(requirements: UploadRequirements): ApplicationFileSlot[] {
  return APPLICATION_FILE_SLOTS.filter(({ name }) => {
    switch (name) {
      case 'certification':
        return requirements.certificationsEnabled;
      case 'diploma':
        return requirements.diplomasEnabled;
      case 'additional':
        return requirements.additionalAttachmentsEnabled;
      default:
        return true;
    }
  }).map(({ name }) => name);
}

/** The documents the server will insist on (enabled categories only). */
export function isFileRequired(slot: ApplicationFileSlot, requirements: UploadRequirements) {
  switch (slot) {
    case 'cv':
      return requirements.cvRequired;
    case 'certification':
      return requirements.certificationsEnabled && requirements.certificationsRequired;
    case 'diploma':
      return requirements.diplomasEnabled && requirements.diplomasRequired;
    default:
      return false;
  }
}

/** A chosen empty file counts as no file, as it always has. */
function chosenFile(control: Element | RadioNodeList | null): File | undefined {
  if (!(control instanceof HTMLInputElement) || control.type !== 'file') {
    return undefined;
  }
  const file = control.files?.[0];
  return file && file.size > 0 ? file : undefined;
}

export function readApplicationForm(form: HTMLFormElement): ApplicationSnapshot {
  const data = new FormData(form);
  const values = {} as Record<ApplicationTextField, string>;
  for (const field of APPLICATION_TEXT_FIELDS) {
    const value = data.get(field);
    values[field] = typeof value === 'string' ? value : '';
  }
  const files: ApplicationSnapshot['files'] = {};
  for (const { name } of APPLICATION_FILE_SLOTS) {
    const file = chosenFile(form.elements.namedItem(name));
    if (file) {
      files[name] = file;
    }
  }
  return { consentGranted: data.get('consentGranted') === 'on', files, values };
}

function fileContentType(file: File): string {
  return file.type || 'application/octet-stream';
}

/**
 * Local validation that runs before any request.
 *
 * Every rule here is one the server already enforces, so a value the API would
 * accept is never refused: required name, email, and consent; whole-number
 * experience from 0 to 80; a salary amount that converts to minor units the
 * contract accepts; an optional currency of exactly three letters, by the
 * contract's own rule; and the file requirements, types, and sizes the
 * opportunity itself publishes. Browser
 * validation bubbles are off because they speak the browser's language rather
 * than the page's. The server still validates everything.
 */
export function validateApplication(
  snapshot: ApplicationSnapshot,
  requirements: UploadRequirements,
  badNumberInput: ReadonlySet<ApplicationTextField> = new Set(),
): ApplicationValidation {
  const fields: ApplicationValidation['fields'] = {};
  const { values } = snapshot;

  if (values.fullName.trim().length === 0) {
    fields.fullName = { code: 'required' };
  }
  const email = values.email.trim();
  if (email.length === 0) {
    fields.email = { code: 'required' };
  } else if (!EMAIL_SHAPE.test(email)) {
    fields.email = { code: 'email' };
  }

  const experience = wholeNumberOrNull(values.experienceYears);
  if (
    badNumberInput.has('experienceYears') ||
    (experience !== null &&
      !(
        Number.isSafeInteger(experience) &&
        experience >= 0 &&
        experience <= APPLICATION_FIELD_LIMITS.experienceYearsMax
      ))
  ) {
    fields.experienceYears = { code: 'experienceYears' };
  }

  // The same conversion the request uses, so a refused amount is exactly an
  // amount the request could not carry, and the maximum is the contract's own.
  if (!parseSalaryAmount(values.salaryExpectationAmount).ok) {
    fields.salaryExpectationAmount = { code: 'salaryAmount' };
  }
  // The contract's rule, not the control's length cap: an empty currency is
  // omitted, anything else must be exactly three letters.
  if (!normalizePublicSalaryExpectationCurrency(values.salaryExpectationCurrency).ok) {
    fields.salaryExpectationCurrency = { code: 'salaryCurrency' };
  }

  let totalBytes = 0;
  for (const slot of visibleFileSlots(requirements)) {
    const file = snapshot.files[slot];
    if (!file) {
      if (isFileRequired(slot, requirements)) {
        fields[slot] = { code: 'fileRequired' };
      }
      continue;
    }
    totalBytes += file.size;
    if (!requirements.allowedMimeTypes.includes(fileContentType(file))) {
      fields[slot] = { code: 'fileType' };
    } else if (file.size > requirements.maxFileSizeBytes) {
      fields[slot] = { code: 'fileSize', limitBytes: requirements.maxFileSizeBytes };
    }
  }

  if (!snapshot.consentGranted) {
    fields.consentGranted = { code: 'consent' };
  }

  const fileErrors = visibleFileSlots(requirements).some((slot) => fields[slot]);
  return {
    fields,
    totalLimitBytes:
      !fileErrors && totalBytes > requirements.maxTotalUploadBytes
        ? requirements.maxTotalUploadBytes
        : null,
  };
}

export function hasValidationErrors(validation: ApplicationValidation): boolean {
  return Object.keys(validation.fields).length > 0 || validation.totalLimitBytes !== null;
}

function trimmedOrUndefined(value: string): string | undefined {
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : undefined;
}

function numberOrUndefined(value: string): number | undefined {
  const trimmed = value.trim();
  return trimmed.length > 0 ? Number(trimmed) : undefined;
}

/**
 * The exact integer minor units the typed major-unit amount stands for, or
 * `undefined` so `salaryExpectationCents` is omitted from the request.
 *
 * An amount this cannot convert never reaches here: `validateApplication` runs
 * the same conversion first and refuses the submission. Omitting rather than
 * guessing keeps that unreachable case from inventing a value.
 */
function salaryExpectationCents(value: string): number | undefined {
  const parsed = parseSalaryAmount(value);
  return parsed.ok ? (parsed.cents ?? undefined) : undefined;
}

/**
 * The canonical currency the contract would store, or `undefined` so the field
 * is omitted. `validateApplication` has already refused any other shape, so the
 * unreachable refusal also omits rather than guessing.
 */
function salaryExpectationCurrency(value: string): string | undefined {
  const normalized = normalizePublicSalaryExpectationCurrency(value);
  return normalized.ok ? normalized.currency : undefined;
}

/**
 * The request body: name and email as typed, every optional text trimmed and
 * omitted when empty, the currency in the contract's uppercase form, experience
 * as a number, consent from the checkbox, no
 * CAPTCHA token, the trap field as-is, and the files in CV, certification,
 * diploma, additional order.
 *
 * `salaryExpectationCents` is the exact integer minor units of the major-unit
 * amount the candidate typed, converted on the digit string. This is the only
 * place the unit boundary is crossed: the form holds major units, and the
 * public API contract keeps meaning cents for every caller.
 */
export function buildApplicationRequest(
  snapshot: ApplicationSnapshot,
  files: PublicApplicationFileInput[],
): PublicApplicationSubmitRequest {
  const { values } = snapshot;
  return {
    fullName: values.fullName,
    email: values.email,
    phone: trimmedOrUndefined(values.phone),
    city: trimmedOrUndefined(values.city),
    country: trimmedOrUndefined(values.country),
    currentPosition: trimmedOrUndefined(values.currentPosition),
    experienceYears: numberOrUndefined(values.experienceYears),
    skills: trimmedOrUndefined(values.skills),
    languages: trimmedOrUndefined(values.languages),
    availability: trimmedOrUndefined(values.availability),
    salaryExpectationCents: salaryExpectationCents(values.salaryExpectationAmount),
    salaryExpectationCurrency: salaryExpectationCurrency(values.salaryExpectationCurrency),
    professionalLinks: trimmedOrUndefined(values.professionalLinks),
    motivation: trimmedOrUndefined(values.motivation),
    consentGranted: snapshot.consentGranted,
    captchaToken: undefined,
    website: trimmedOrUndefined(values.website),
    files,
  };
}

async function encodeFile(category: FileCategory, file: File): Promise<PublicApplicationFileInput> {
  const bytes = new Uint8Array(await file.arrayBuffer());
  let binary = '';
  for (const byte of bytes) {
    binary += String.fromCharCode(byte);
  }
  return {
    category,
    filename: file.name,
    contentType: fileContentType(file),
    base64Content: btoa(binary),
  };
}

/** Base64 file inputs in the fixed category order the API has always received. */
export function encodeApplicationFiles(
  snapshot: ApplicationSnapshot,
): Promise<PublicApplicationFileInput[]> {
  return Promise.all(
    APPLICATION_FILE_SLOTS.flatMap(({ category, name }) => {
      const file = snapshot.files[name];
      return file ? [encodeFile(category, file)] : [];
    }),
  );
}
