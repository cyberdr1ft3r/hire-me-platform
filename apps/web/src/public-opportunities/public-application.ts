import type {
  PublicApplicationFileInput,
  PublicApplicationSubmitRequest,
  PublicOpportunity,
} from '@hire-me/contracts';

type UploadRequirements = PublicOpportunity['uploadRequirements'];
type FileCategory = PublicApplicationFileInput['category'];

/**
 * The text controls the application form has always sent, in form order.
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
  'salaryExpectationCents',
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
 * server. The currency limit is the form's long-standing three characters.
 */
export const APPLICATION_FIELD_LIMITS = {
  email: 254,
  experienceYearsMax: 80,
  fullName: 160,
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
  | { code: 'consent' | 'email' | 'experienceYears' | 'required' | 'wholeNumber' }
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

/**
 * The documents the server will insist on. A category that is required but not
 * enabled has no control, exactly as before; the server still decides.
 */
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
 * experience from 0 to 80 and a non-negative whole salary figure; and the file
 * requirements, types, and sizes the opportunity itself publishes. Browser
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

  const salary = wholeNumberOrNull(values.salaryExpectationCents);
  if (
    badNumberInput.has('salaryExpectationCents') ||
    (salary !== null && !(Number.isSafeInteger(salary) && salary >= 0))
  ) {
    fields.salaryExpectationCents = { code: 'wholeNumber' };
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
 * The request body, exactly as the page has always built it: name and email as
 * typed, every optional text trimmed and omitted when empty, the two numeric
 * fields passed through as numbers, consent from the checkbox, no CAPTCHA
 * token, the trap field as-is, and the files in CV, certification, diploma,
 * additional order.
 *
 * The salary figure is sent unchanged as `salaryExpectationCents`, as before.
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
    salaryExpectationCents: numberOrUndefined(values.salaryExpectationCents),
    salaryExpectationCurrency: trimmedOrUndefined(values.salaryExpectationCurrency),
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
