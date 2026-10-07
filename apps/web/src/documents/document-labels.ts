import type {
  DocumentStatus,
  DocumentType,
  DocumentVersionSource,
  DocumentVisibility,
} from '@hire-me/contracts';

import type { StatusTone } from '../ui/index.js';

/** Types an operator may register. `LEGACY_CONTRACT` is read-only history. */
export const CREATABLE_DOCUMENT_TYPES = [
  'CONTRAT_RECRUTEMENT',
  'CONTRAT_FORMATION',
  'JOB_DESCRIPTION',
  'INTERVIEW_REPORT',
  'CANDIDATE_SUMMARY',
  'TECHNICAL_TEST_REPORT',
  'HR_DOCUMENT',
  'CLIENT_FILE',
  'QUOTATION',
  'PURCHASE_ORDER',
  'INVOICE',
  'TRAINING_MATERIAL',
  'TRAINING_CERTIFICATE',
  'MESSAGE_ATTACHMENT',
  'OTHER',
] as const satisfies readonly Exclude<DocumentType, 'LEGACY_CONTRACT'>[];

export type CreatableDocumentType = (typeof CREATABLE_DOCUMENT_TYPES)[number];

/** Every type, for filtering existing records including legacy history. */
export const FILTER_DOCUMENT_TYPES: readonly DocumentType[] = [
  ...CREATABLE_DOCUMENT_TYPES,
  'LEGACY_CONTRACT',
];

export const DOCUMENT_STATUSES: readonly DocumentStatus[] = [
  'DRAFT',
  'ACTIVE',
  'SUPERSEDED',
  'ARCHIVED',
];

export const DOCUMENT_VISIBILITIES: readonly DocumentVisibility[] = [
  'INTERNAL_ONLY',
  'ASSIGNED_ONLY',
  'CLIENT_SHARED',
  'PRIVATE',
];

export const DOCUMENT_SOURCES: readonly DocumentVersionSource[] = [
  'UPLOADED',
  'GENERATED',
  'IMPORTED',
  'SIGNED',
];

export function documentStatusTone(status: DocumentStatus): StatusTone {
  switch (status) {
    case 'ACTIVE':
      return 'success';
    case 'DRAFT':
      return 'info';
    case 'SUPERSEDED':
      return 'warning';
    case 'ARCHIVED':
      return 'neutral';
  }
}

export function documentSourceTone(source: DocumentVersionSource): StatusTone {
  if (source === 'GENERATED') {
    return 'info';
  }
  if (source === 'SIGNED') {
    return 'success';
  }
  return 'neutral';
}

export type SizeUnit = 'bytes' | 'kilobytes' | 'megabytes';

/** Decimal units, matching the 4 MB upload limit the API states. */
export function fileSizeParts(sizeBytes: number): { unit: SizeUnit; value: number } {
  if (sizeBytes < 1000) {
    return { unit: 'bytes', value: sizeBytes };
  }
  if (sizeBytes < 1_000_000) {
    return { unit: 'kilobytes', value: Math.round(sizeBytes / 100) / 10 };
  }
  return { unit: 'megabytes', value: Math.round(sizeBytes / 100_000) / 10 };
}

const FRIENDLY_FORMATS: Readonly<Record<string, string>> = {
  'application/msword': 'Word (.doc)',
  'application/pdf': 'PDF',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': 'Excel (.xlsx)',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document': 'Word (.docx)',
  'image/jpeg': 'JPEG',
  'image/png': 'PNG',
  'text/plain': 'TXT',
};

/** Format names are product names, identical in every locale. */
export function friendlyFormat(mimeType: string): string {
  return FRIENDLY_FORMATS[mimeType] ?? mimeType;
}
