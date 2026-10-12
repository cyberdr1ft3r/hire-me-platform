import { plainAddPlaceholder } from '@signpdf/placeholder-plain';

/** Minimal synthetic PDF for lab signing (not a business document). */
export async function createMinimalLabSourcePdf(text = 'issue-183-pkcs11-lab'): Promise<Buffer> {
  const PDFDocument = (await import('pdfkit')).default;
  const chunks: Buffer[] = [];
  const doc = new PDFDocument({ size: 'A4' });
  doc.on('data', (chunk: Buffer) => chunks.push(chunk));
  doc.text(text);
  doc.end();
  await new Promise<void>((resolve) => doc.on('end', resolve));
  return Buffer.concat(chunks);
}

export async function createAlternateLabSourcePdf(): Promise<Buffer> {
  return createMinimalLabSourcePdf('issue-183-pkcs11-lab-alternate-source');
}

export function createWrongPreparedPdf(sourcePdf: Buffer): Buffer {
  return plainAddPlaceholder({
    pdfBuffer: sourcePdf,
    reason: 'wrong-placeholder',
    contactInfo: 'wrong@hireme.local',
    name: 'Wrong',
    location: 'Wrong',
  });
}
