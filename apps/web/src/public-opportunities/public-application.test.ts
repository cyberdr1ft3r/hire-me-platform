import { beforeAll, describe, expect, it } from 'vitest';

import {
  APPLICATION_TEXT_FIELDS,
  buildApplicationRequest,
  encodeApplicationFiles,
  isFileRequired,
  readApplicationForm,
  validateApplication,
  visibleFileSlots,
  type ApplicationSnapshot,
  type ApplicationTextField,
} from './public-application.js';
import {
  installBlobArrayBuffer,
  syntheticFile,
  syntheticOpportunity,
} from './public-opportunity-test-data.js';

beforeAll(installBlobArrayBuffer);

const requirements = syntheticOpportunity().uploadRequirements;

function snapshot(
  values: Partial<Record<ApplicationTextField, string>> = {},
  extra: Partial<Omit<ApplicationSnapshot, 'values'>> = {},
): ApplicationSnapshot {
  const empty = Object.fromEntries(APPLICATION_TEXT_FIELDS.map((field) => [field, ''])) as Record<
    ApplicationTextField,
    string
  >;
  return {
    consentGranted: true,
    files: { cv: syntheticFile('%PDF-1.4 synthetic', 'cv.pdf', 'application/pdf') },
    ...extra,
    values: { ...empty, fullName: 'Ada Example', email: 'ada@example.test', ...values },
  };
}

describe('application request body', () => {
  it('builds exactly the body the page has always sent', () => {
    const body = buildApplicationRequest(
      snapshot({
        availability: ' Two weeks ',
        city: '  Example City ',
        country: '',
        currentPosition: 'Synthetic analyst',
        email: ' ada@example.test ',
        experienceYears: ' 7 ',
        fullName: '  Ada Example  ',
        languages: 'French, English',
        motivation: '   ',
        phone: ' +000 000 ',
        professionalLinks: 'https://portfolio.example.test',
        salaryExpectationCents: '15000',
        salaryExpectationCurrency: 'EUR',
        skills: 'Synthetic skill',
        website: '',
      }),
      [],
    );

    // Name and email are sent as typed; optional text is trimmed and omitted when
    // empty; numbers pass through unchanged, including the salary figure.
    const sent = JSON.parse(JSON.stringify(body)) as Record<string, unknown>;
    expect(sent).toEqual({
      availability: 'Two weeks',
      city: 'Example City',
      consentGranted: true,
      currentPosition: 'Synthetic analyst',
      email: ' ada@example.test ',
      experienceYears: 7,
      files: [],
      fullName: '  Ada Example  ',
      languages: 'French, English',
      phone: '+000 000',
      professionalLinks: 'https://portfolio.example.test',
      salaryExpectationCents: 15000,
      salaryExpectationCurrency: 'EUR',
      skills: 'Synthetic skill',
    });
    expect(Object.keys(sent)).toEqual([
      'fullName',
      'email',
      'phone',
      'city',
      'currentPosition',
      'experienceYears',
      'skills',
      'languages',
      'availability',
      'salaryExpectationCents',
      'salaryExpectationCurrency',
      'professionalLinks',
      'consentGranted',
      'files',
    ]);
    expect(body.captchaToken).toBeUndefined();
  });

  it('passes the anti-spam field through unchanged when it is filled', () => {
    expect(buildApplicationRequest(snapshot({ website: ' bot ' }), []).website).toBe('bot');
  });

  it('encodes files as base64 in CV, certification, diploma, additional order', async () => {
    const files = await encodeApplicationFiles(
      snapshot(
        {},
        {
          files: {
            additional: syntheticFile('extra', 'extra.txt', 'text/plain'),
            cv: syntheticFile('%PDF-1.4 synthetic', 'cv.pdf', 'application/pdf'),
            diploma: syntheticFile('diploma', 'diploma.txt', ''),
          },
        },
      ),
    );
    expect(files).toEqual([
      {
        base64Content: btoa('%PDF-1.4 synthetic'),
        category: 'CV',
        contentType: 'application/pdf',
        filename: 'cv.pdf',
      },
      {
        base64Content: btoa('diploma'),
        category: 'DIPLOMA',
        contentType: 'application/octet-stream',
        filename: 'diploma.txt',
      },
      {
        base64Content: btoa('extra'),
        category: 'ADDITIONAL',
        contentType: 'text/plain',
        filename: 'extra.txt',
      },
    ]);
  });
});

describe('reading the form', () => {
  it('reads text values, consent, and chosen non-empty files only', () => {
    const form = document.createElement('form');
    form.innerHTML = `
      <input name="fullName" value="Ada Example" />
      <input name="email" value="ada@example.test" />
      <input name="consentGranted" type="checkbox" checked />
      <input name="cv" type="file" />
      <input name="certification" type="file" />
    `;
    const [cv, certification] = form.querySelectorAll('input[type="file"]');
    Object.defineProperty(cv, 'files', {
      value: [syntheticFile('%PDF', 'cv.pdf', 'application/pdf')],
    });
    Object.defineProperty(certification, 'files', {
      value: [syntheticFile('', 'empty.pdf', 'application/pdf')],
    });

    const read = readApplicationForm(form);
    expect(read.values.fullName).toBe('Ada Example');
    expect(read.values.phone).toBe('');
    expect(read.consentGranted).toBe(true);
    expect(read.files.cv?.name).toBe('cv.pdf');
    // A chosen empty file has always counted as no file.
    expect(read.files.certification).toBeUndefined();
  });
});

describe('local validation mirrors server rules only', () => {
  it('accepts a complete application', () => {
    const result = validateApplication(snapshot(), requirements);
    expect(result).toEqual({ fields: {}, totalLimitBytes: null });
  });

  it('requires name, email, consent, and a CV when the opportunity requires one', () => {
    const result = validateApplication(
      snapshot({ email: '', fullName: '   ' }, { consentGranted: false, files: {} }),
      requirements,
    );
    expect(result.fields).toEqual({
      consentGranted: { code: 'consent' },
      cv: { code: 'fileRequired' },
      email: { code: 'required' },
      fullName: { code: 'required' },
    });
    // Form order, so focus can go to the first invalid control.
    expect(Object.keys(result.fields)).toEqual(['fullName', 'email', 'cv', 'consentGranted']);
  });

  it('does not require a CV when the opportunity does not', () => {
    const result = validateApplication(snapshot({}, { files: {} }), {
      ...requirements,
      cvRequired: false,
    });
    expect(result.fields).toEqual({});
  });

  it('rejects an email the server would reject', () => {
    expect(validateApplication(snapshot({ email: 'not-an-email' }), requirements).fields).toEqual({
      email: { code: 'email' },
    });
  });

  it('accepts experience from 0 to 80 as a whole number and nothing else', () => {
    for (const value of ['0', '80', ' 12 ', '1e1']) {
      expect(
        validateApplication(snapshot({ experienceYears: value }), requirements).fields,
      ).toEqual({});
    }
    for (const value of ['-1', '81', '2.5', 'abc']) {
      expect(
        validateApplication(snapshot({ experienceYears: value }), requirements).fields,
      ).toEqual({ experienceYears: { code: 'experienceYears' } });
    }
  });

  it('accepts a non-negative whole salary figure and nothing else', () => {
    expect(
      validateApplication(snapshot({ salaryExpectationCents: '0' }), requirements).fields,
    ).toEqual({});
    for (const value of ['-5', '10.5', 'ten']) {
      expect(
        validateApplication(snapshot({ salaryExpectationCents: value }), requirements).fields,
      ).toEqual({ salaryExpectationCents: { code: 'wholeNumber' } });
    }
  });

  it('flags a number control the browser could not read', () => {
    expect(
      validateApplication(snapshot(), requirements, new Set(['experienceYears'])).fields,
    ).toEqual({ experienceYears: { code: 'experienceYears' } });
  });

  it('applies the published file types and per-file size limit', () => {
    const typeResult = validateApplication(
      snapshot({}, { files: { cv: syntheticFile('gif', 'cv.gif', 'image/gif') } }),
      requirements,
    );
    expect(typeResult.fields).toEqual({ cv: { code: 'fileType' } });

    const sizeResult = validateApplication(
      snapshot({}, { files: { cv: syntheticFile('0123456789A', 'cv.pdf', 'application/pdf') } }),
      { ...requirements, maxFileSizeBytes: 10 },
    );
    expect(sizeResult.fields).toEqual({ cv: { code: 'fileSize', limitBytes: 10 } });
  });

  it('applies the published total upload limit', () => {
    const result = validateApplication(
      snapshot(
        {},
        {
          files: {
            additional: syntheticFile('0123456789', 'b.txt', 'text/plain'),
            cv: syntheticFile('0123456789', 'a.pdf', 'application/pdf'),
          },
        },
      ),
      { ...requirements, additionalAttachmentsEnabled: true, maxTotalUploadBytes: 15 },
    );
    expect(result).toEqual({ fields: {}, totalLimitBytes: 15 });
  });
});

describe('file controls', () => {
  it('shows only enabled categories and requires only enabled required ones', () => {
    const configured = {
      ...requirements,
      additionalAttachmentsEnabled: true,
      certificationsEnabled: true,
      certificationsRequired: true,
      diplomasEnabled: false,
      diplomasRequired: true,
    };
    expect(visibleFileSlots(configured)).toEqual(['cv', 'certification', 'additional']);
    expect(isFileRequired('certification', configured)).toBe(true);
    // Required but not enabled has no control, exactly as before.
    expect(isFileRequired('diploma', configured)).toBe(false);
    expect(isFileRequired('additional', configured)).toBe(false);
  });
});
