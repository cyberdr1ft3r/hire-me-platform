/**
 * Test-only PDF inspection helpers.
 *
 * Generated PDFs embed subsetted TrueType fonts, so the drawn strings are glyph indices
 * rather than readable characters. These helpers parse the produced file with `pdfjs-dist`
 * and read the text back through the `ToUnicode` map the renderer writes, which is what
 * makes an assertion about rendered content real instead of "it did not throw". The module
 * is imported only from tests and is excluded from the production build.
 */

type ExtractedPdf = {
  /** Text of every page, concatenated in reading order. */
  text: string;
  pageCount: number;
  /** Names of the fonts the document actually embedded. */
  fontNames: string[];
};

export async function extractPdf(bytes: Buffer): Promise<ExtractedPdf> {
  const { getDocument } = await import('pdfjs-dist/legacy/build/pdf.mjs');
  const task = getDocument({
    data: new Uint8Array(bytes),
    // No network, no worker process, no system fonts: everything needed is embedded.
    disableFontFace: true,
    useSystemFonts: false,
    isEvalSupported: false,
  });
  const document = await task.promise;
  let text = '';

  for (let pageNumber = 1; pageNumber <= document.numPages; pageNumber += 1) {
    const page = await document.getPage(pageNumber);
    const content = await page.getTextContent();
    for (const item of content.items) {
      if ('str' in item) {
        text += item.str;
        if (item.hasEOL) {
          text += '\n';
        }
      }
    }
    page.cleanup();
  }

  const pageCount = document.numPages;
  await document.destroy();
  return { text, pageCount, fontNames: embeddedFontNames(bytes) };
}

/** Font resource names declared in the raw file, which survive subsetting prefixes. */
export function embeddedFontNames(bytes: Buffer): string[] {
  const raw = bytes.toString('latin1');
  const names = new Set<string>();
  const pattern = /\/BaseFont\s*\/([A-Za-z0-9+\-_]+)/g;
  let match = pattern.exec(raw);
  while (match !== null) {
    if (match[1]) {
      names.add(match[1]);
    }
    match = pattern.exec(raw);
  }
  return [...names];
}
