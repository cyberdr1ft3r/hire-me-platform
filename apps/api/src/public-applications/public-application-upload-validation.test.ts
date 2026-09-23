import { describe, expect, it } from 'vitest';

import {
  publicApplicationMaxFileSizeBytes,
  validatePublicApplicationFile,
} from './public-application-upload-validation.js';

const minimalPdf = Buffer.from('%PDF-1.4\n% synthetic test cv\n');
const minimalPng = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==',
  'base64',
);
const minimalJpeg = Buffer.from(
  '/9j/4AAQSkZJRgABAQEASABIAAD/2wBDAP//////////////////////////////////////////////////////////////////////////////////////2wBDAf//////////////////////////////////////////////////////////////////////////////////////wAARCAABAAEDASIAAhEBAxEB/8QAFQABAQAAAAAAAAAAAAAAAAAAAAb/xAAUEAEAAAAAAAAAAAAAAAAAAAAA/8QAFQEBAQAAAAAAAAAAAAAAAAAAAAX/xAAUEQEAAAAAAAAAAAAAAAAAAAAA/9oADAMBAAIRAxEAPwCwAA//2Q==',
  'base64',
);
const plainText = Buffer.from('Synthetic cover letter text.\n');

function fileInput(
  overrides: Partial<{
    filename: string;
    contentType: string;
    base64Content: string;
  }> = {},
) {
  return {
    category: 'CV' as const,
    filename: overrides.filename ?? 'cv.pdf',
    contentType: overrides.contentType ?? 'application/pdf',
    base64Content: overrides.base64Content ?? minimalPdf.toString('base64'),
  };
}

function expectValidationCode(input: ReturnType<typeof fileInput>, code: string): void {
  try {
    validatePublicApplicationFile(input);
    throw new Error('Expected validation to fail.');
  } catch (error) {
    const response = (error as { getResponse: () => { error: { code: string } } }).getResponse();
    expect(response.error.code).toBe(code);
  }
}

describe('validatePublicApplicationFile', () => {
  it('accepts valid PDF, JPEG, PNG, and text/plain payloads', () => {
    expect(
      validatePublicApplicationFile(
        fileInput({
          filename: 'cv.pdf',
          contentType: 'application/pdf',
          base64Content: minimalPdf.toString('base64'),
        }),
      ).contentType,
    ).toBe('application/pdf');
    expect(
      validatePublicApplicationFile(
        fileInput({
          filename: 'photo.JPEG',
          contentType: 'image/jpeg',
          base64Content: minimalJpeg.toString('base64'),
        }),
      ).sanitizedFilename,
    ).toBe('photo.JPEG');
    expect(
      validatePublicApplicationFile(
        fileInput({
          filename: 'badge.PNG',
          contentType: 'image/png',
          base64Content: minimalPng.toString('base64'),
        }),
      ).contentType,
    ).toBe('image/png');
    expect(
      validatePublicApplicationFile(
        fileInput({
          filename: 'notes.txt',
          contentType: 'text/plain',
          base64Content: plainText.toString('base64'),
        }),
      ).sizeBytes,
    ).toBe(plainText.byteLength);
  });

  it('allows extensionless filenames when content signatures match', () => {
    const validated = validatePublicApplicationFile(
      fileInput({
        filename: 'cover-letter',
        contentType: 'text/plain',
        base64Content: plainText.toString('base64'),
      }),
    );
    expect(validated.sanitizedFilename).toBe('cover-letter');
  });

  it('rejects SVG, HTML, and script payloads disguised as images', () => {
    const svg = Buffer.from(
      '<svg xmlns="http://www.w3.org/2000/svg"><script>alert(1)</script></svg>',
    );
    const html = Buffer.from('<html><body>Hello</body></html>');
    expectValidationCode(
      fileInput({
        filename: 'logo.png',
        contentType: 'image/png',
        base64Content: svg.toString('base64'),
      }),
      'PUBLIC_APPLICATION_FILE_SIGNATURE_REJECTED',
    );
    expectValidationCode(
      fileInput({
        filename: 'photo.jpg',
        contentType: 'image/jpeg',
        base64Content: html.toString('base64'),
      }),
      'PUBLIC_APPLICATION_FILE_SIGNATURE_REJECTED',
    );
  });

  it('rejects HTML and SVG declared as text/plain', () => {
    const svgText = Buffer.from('<?xml version="1.0"?><svg></svg>');
    const htmlText = Buffer.from('<!DOCTYPE html><html></html>');
    expectValidationCode(
      fileInput({
        filename: 'notes.txt',
        contentType: 'text/plain',
        base64Content: svgText.toString('base64'),
      }),
      'PUBLIC_APPLICATION_FILE_SIGNATURE_REJECTED',
    );
    expectValidationCode(
      fileInput({
        filename: 'notes.txt',
        contentType: 'text/plain',
        base64Content: htmlText.toString('base64'),
      }),
      'PUBLIC_APPLICATION_FILE_SIGNATURE_REJECTED',
    );
  });

  it('rejects fabricated minimum JPEG and PNG shells without image data', () => {
    const soiEoiOnly = Buffer.from([0xff, 0xd8, 0xff, 0xd9]);
    expectValidationCode(
      fileInput({
        filename: 'photo.jpg',
        contentType: 'image/jpeg',
        base64Content: soiEoiOnly.toString('base64'),
      }),
      'PUBLIC_APPLICATION_FILE_SIGNATURE_REJECTED',
    );

    const pngSignature = Buffer.from('89504e470d0a1a0a', 'hex');
    const ihdrData = Buffer.alloc(13);
    ihdrData.writeUInt32BE(1, 0);
    ihdrData.writeUInt32BE(1, 4);
    ihdrData[8] = 8;
    ihdrData[9] = 2;
    expectValidationCode(
      fileInput({
        filename: 'logo.png',
        contentType: 'image/png',
        base64Content: Buffer.concat([pngSignature, minimalPng.subarray(8, 8 + 25)]).toString(
          'base64',
        ),
      }),
      'PUBLIC_APPLICATION_FILE_SIGNATURE_REJECTED',
    );
  });

  it('rejects JPEG and PNG polyglots with trailing HTML or SVG after terminal markers', () => {
    const trailingHtml = Buffer.from('<html><body>after image</body></html>');
    const trailingSvg = Buffer.from('<svg xmlns="http://www.w3.org/2000/svg"></svg>');
    expectValidationCode(
      fileInput({
        filename: 'photo.jpg',
        contentType: 'image/jpeg',
        base64Content: Buffer.concat([minimalJpeg, trailingHtml]).toString('base64'),
      }),
      'PUBLIC_APPLICATION_FILE_SIGNATURE_REJECTED',
    );
    expectValidationCode(
      fileInput({
        filename: 'logo.png',
        contentType: 'image/png',
        base64Content: Buffer.concat([minimalPng, trailingSvg]).toString('base64'),
      }),
      'PUBLIC_APPLICATION_FILE_SIGNATURE_REJECTED',
    );
  });

  it('rejects truncated signatures, invalid PDFs, executables, and archives', () => {
    expectValidationCode(
      fileInput({
        filename: 'truncated.jpg',
        contentType: 'image/jpeg',
        base64Content: Buffer.from([0xff, 0xd8, 0xff, 0xe0]).toString('base64'),
      }),
      'PUBLIC_APPLICATION_FILE_SIGNATURE_REJECTED',
    );
    expectValidationCode(
      fileInput({
        filename: 'truncated.png',
        contentType: 'image/png',
        base64Content: Buffer.from('89504e470d0a1a0a', 'hex').toString('base64'),
      }),
      'PUBLIC_APPLICATION_FILE_SIGNATURE_REJECTED',
    );
    expectValidationCode(
      fileInput({
        filename: 'broken.pdf',
        contentType: 'application/pdf',
        base64Content: Buffer.from('NOTPDF').toString('base64'),
      }),
      'PUBLIC_APPLICATION_FILE_SIGNATURE_REJECTED',
    );
    expectValidationCode(
      fileInput({
        filename: 'malware.pdf',
        contentType: 'application/pdf',
        base64Content: Buffer.from('MZ executable').toString('base64'),
      }),
      'PUBLIC_APPLICATION_FILE_TYPE_REJECTED',
    );
    expectValidationCode(
      fileInput({
        filename: 'archive.pdf',
        contentType: 'application/pdf',
        base64Content: Buffer.from('PK\x03\x04').toString('base64'),
      }),
      'PUBLIC_APPLICATION_FILE_TYPE_REJECTED',
    );
  });

  it('rejects filename and MIME mismatches, double extensions, and empty files', () => {
    expectValidationCode(
      fileInput({
        filename: 'cv.png',
        contentType: 'application/pdf',
        base64Content: minimalPdf.toString('base64'),
      }),
      'PUBLIC_APPLICATION_FILE_TYPE_REJECTED',
    );
    expectValidationCode(
      fileInput({
        filename: 'cv.pdf.png',
        contentType: 'application/pdf',
        base64Content: minimalPdf.toString('base64'),
      }),
      'PUBLIC_APPLICATION_FILE_TYPE_REJECTED',
    );
    expectValidationCode(
      fileInput({
        filename: 'cv.pdf.exe',
        contentType: 'application/pdf',
        base64Content: minimalPdf.toString('base64'),
      }),
      'PUBLIC_APPLICATION_FILE_TYPE_REJECTED',
    );
    expectValidationCode(
      fileInput({
        filename: 'empty.txt',
        contentType: 'text/plain',
        base64Content: Buffer.from('   \n\t').toString('base64'),
      }),
      'PUBLIC_APPLICATION_FILE_SIGNATURE_REJECTED',
    );
  });

  it('rejects non-strict base64 and oversize encoded payloads', () => {
    expectValidationCode(
      fileInput({
        base64Content: 'not strict base64!',
      }),
      'PUBLIC_APPLICATION_FILE_BASE64_INVALID',
    );
    expectValidationCode(
      fileInput({
        base64Content: Buffer.alloc(publicApplicationMaxFileSizeBytes + 1).toString('base64'),
      }),
      'PUBLIC_APPLICATION_FILE_SIZE_REJECTED',
    );
  });
});
