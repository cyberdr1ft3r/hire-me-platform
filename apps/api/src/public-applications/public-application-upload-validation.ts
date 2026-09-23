import { extname } from 'node:path';

import type { PublicApplicationFileInput } from '@hire-me/contracts';

import {
  isStructurallyValidJpeg,
  isStructurallyValidPng,
} from './public-application-image-structure.js';
import { badRequest } from './public-application.errors.js';

export const publicApplicationMaxFileSizeBytes = 1_500_000;
export const publicApplicationMaxTotalUploadBytes = 5_000_000;
export const publicApplicationAllowedMimeTypes = [
  'application/pdf',
  'image/jpeg',
  'image/png',
  'text/plain',
] as const;

export type PublicApplicationAllowedMimeType = (typeof publicApplicationAllowedMimeTypes)[number];

export type ValidatedPublicApplicationFile = {
  buffer: Buffer;
  sanitizedFilename: string;
  contentType: PublicApplicationAllowedMimeType;
  sizeBytes: number;
};

const dangerousExtensionPattern = /\.(exe|bat|cmd|com|scr|js|jar|zip|rar|7z|tar|gz)$/i;
const maxMarkupProbeBytes = 512;

const extensionsByMime: Record<PublicApplicationAllowedMimeType, readonly string[]> = {
  'application/pdf': ['.pdf'],
  'image/jpeg': ['.jpg', '.jpeg'],
  'image/png': ['.png'],
  'text/plain': ['.txt'],
};

export function validatePublicApplicationFile(
  file: PublicApplicationFileInput,
): ValidatedPublicApplicationFile {
  if (!isStrictBase64(file.base64Content)) {
    throw badRequest(
      'PUBLIC_APPLICATION_FILE_BASE64_INVALID',
      'File content must be strict base64.',
    );
  }
  if (decodedBase64Size(file.base64Content) > publicApplicationMaxFileSizeBytes) {
    throw badRequest('PUBLIC_APPLICATION_FILE_SIZE_REJECTED', 'File size is not allowed.');
  }

  const buffer = Buffer.from(file.base64Content, 'base64');
  const sanitizedFilename = sanitizeFilename(file.filename);
  const contentType = assertAllowedMimeType(file.contentType);
  assertFilenamePolicy(file.filename, contentType);
  assertExecutableOrArchivePayload(buffer);
  assertContentMatchesDeclaredType(contentType, buffer);
  assertNoDisguisedMarkup(buffer, contentType);

  if (buffer.byteLength === 0 || buffer.byteLength > publicApplicationMaxFileSizeBytes) {
    throw badRequest('PUBLIC_APPLICATION_FILE_SIZE_REJECTED', 'File size is not allowed.');
  }

  return {
    buffer,
    sanitizedFilename,
    contentType,
    sizeBytes: buffer.byteLength,
  };
}

function assertAllowedMimeType(contentType: string): PublicApplicationAllowedMimeType {
  if (
    !publicApplicationAllowedMimeTypes.includes(contentType as PublicApplicationAllowedMimeType)
  ) {
    throw badRequest('PUBLIC_APPLICATION_FILE_TYPE_REJECTED', 'File type is not allowed.');
  }
  return contentType as PublicApplicationAllowedMimeType;
}

function assertFilenamePolicy(
  filename: string,
  contentType: PublicApplicationAllowedMimeType,
): void {
  if (dangerousExtensionPattern.test(filename)) {
    throw badRequest('PUBLIC_APPLICATION_FILE_TYPE_REJECTED', 'File type is not allowed.');
  }

  const extension = extname(safeOriginalFilename(filename)).toLowerCase();
  const allowedExtensions = extensionsByMime[contentType];
  if (extension.length === 0) {
    return;
  }
  if (!allowedExtensions.includes(extension)) {
    throw badRequest('PUBLIC_APPLICATION_FILE_TYPE_REJECTED', 'File type is not allowed.');
  }
}

function assertExecutableOrArchivePayload(buffer: Buffer): void {
  if (buffer.length >= 2 && buffer.subarray(0, 2).toString('hex') === '4d5a') {
    throw badRequest('PUBLIC_APPLICATION_FILE_TYPE_REJECTED', 'File type is not allowed.');
  }
  if (buffer.length >= 2 && buffer.subarray(0, 2).toString() === 'PK') {
    throw badRequest('PUBLIC_APPLICATION_FILE_TYPE_REJECTED', 'File type is not allowed.');
  }
}

function assertContentMatchesDeclaredType(
  contentType: PublicApplicationAllowedMimeType,
  buffer: Buffer,
): void {
  const matches = contentSignatures[contentType].some((signature) => signature(buffer));
  if (!matches) {
    throw badRequest(
      'PUBLIC_APPLICATION_FILE_SIGNATURE_REJECTED',
      'File content does not match its type.',
    );
  }
}

function assertNoDisguisedMarkup(
  buffer: Buffer,
  contentType: PublicApplicationAllowedMimeType,
): void {
  if (contentType === 'text/plain') {
    return;
  }
  const probe = buffer.subarray(0, Math.min(buffer.length, maxMarkupProbeBytes)).toString('utf8');
  const normalized = probe.trimStart().toLowerCase();
  if (
    normalized.startsWith('<!doctype') ||
    normalized.startsWith('<html') ||
    normalized.startsWith('<svg') ||
    normalized.startsWith('<?xml') ||
    /<script[\s>]/i.test(probe)
  ) {
    throw badRequest(
      'PUBLIC_APPLICATION_FILE_SIGNATURE_REJECTED',
      'File content does not match its type.',
    );
  }
}

const contentSignatures: Record<
  PublicApplicationAllowedMimeType,
  readonly ((buffer: Buffer) => boolean)[]
> = {
  'application/pdf': [(buffer) => buffer.subarray(0, 4).toString() === '%PDF'],
  'image/jpeg': [isStructurallyValidJpeg],
  'image/png': [isStructurallyValidPng],
  'text/plain': [looksLikeSafePlainText],
};

function looksLikeSafePlainText(buffer: Buffer): boolean {
  if (buffer.length === 0 || buffer.includes(0)) {
    return false;
  }
  let text: string;
  try {
    text = new TextDecoder('utf-8', { fatal: true }).decode(buffer);
  } catch {
    return false;
  }
  if (text.trim().length === 0) {
    return false;
  }
  const normalized = text.trimStart().slice(0, maxMarkupProbeBytes).toLowerCase();
  if (
    normalized.startsWith('<!doctype') ||
    normalized.startsWith('<html') ||
    normalized.startsWith('<svg') ||
    normalized.startsWith('<?xml') ||
    /<script[\s>]/i.test(text.slice(0, maxMarkupProbeBytes))
  ) {
    return false;
  }
  return true;
}

function sanitizeFilename(filename: string): string {
  const sanitized = safeOriginalFilename(filename)
    .trim()
    .replace(/[^A-Za-z0-9._-]/g, '_')
    .replace(/_+/g, '_');
  return sanitized.length > 0 ? sanitized.slice(0, 160) : 'upload';
}

function safeOriginalFilename(filename: string): string {
  const basename = filename.split(/[\\/]/).filter(Boolean).at(-1) ?? 'document';
  const cleaned = basename
    .normalize('NFC')
    .split('')
    .filter((character) => {
      const codePoint = character.codePointAt(0);
      return codePoint !== undefined && codePoint > 31 && codePoint !== 127;
    })
    .join('')
    .replace(/\s+/g, ' ')
    .trim();
  return cleaned.length > 0 ? cleaned.slice(0, 180) : 'document';
}

function isStrictBase64(value: string): boolean {
  if (value.length === 0 || value.length % 4 !== 0) {
    return false;
  }
  let padding = 0;
  for (let index = 0; index < value.length; index += 1) {
    const character = value[index];
    if (character === '=') {
      padding += 1;
      if (index < value.length - 2 || padding > 2) {
        return false;
      }
      continue;
    }
    if (padding > 0 || !isBase64Character(character)) {
      return false;
    }
  }
  return true;
}

function isBase64Character(character: string | undefined): boolean {
  if (!character) {
    return false;
  }
  const code = character.charCodeAt(0);
  return (
    (code >= 65 && code <= 90) ||
    (code >= 97 && code <= 122) ||
    (code >= 48 && code <= 57) ||
    character === '+' ||
    character === '/'
  );
}

function decodedBase64Size(value: string): number {
  let padding = 0;
  if (value.endsWith('==')) {
    padding = 2;
  } else if (value.endsWith('=')) {
    padding = 1;
  }
  return (value.length / 4) * 3 - padding;
}
