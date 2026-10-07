/**
 * Prepared-artifact binding: signed PDF must match the approved placeholder-bearing
 * artifact except inside the PDF signature dictionary (/Contents and /ByteRange fields).
 */

const CONTENTS_MARKER = Buffer.from('/Contents <');
const BYTE_RANGE_MARKER = Buffer.from('/ByteRange');

export type PreparedContentsSlot = {
  contentsStart: number;
  contentsEnd: number;
};

function markFlexibleSignatureBytes(pdf: Buffer): boolean[] {
  const flexible = new Array<boolean>(pdf.length).fill(false);

  let searchFrom = 0;
  while (searchFrom < pdf.length) {
    const byteRangeIndex = pdf.indexOf(BYTE_RANGE_MARKER, searchFrom);
    if (byteRangeIndex < 0) {
      break;
    }
    const openBracket = pdf.indexOf(91 /* [ */, byteRangeIndex);
    const closeBracket = pdf.indexOf(93 /* ] */, byteRangeIndex);
    if (openBracket >= 0 && closeBracket > openBracket) {
      for (let index = byteRangeIndex; index <= closeBracket; index += 1) {
        flexible[index] = true;
      }
      searchFrom = closeBracket + 1;
      continue;
    }
    searchFrom = byteRangeIndex + BYTE_RANGE_MARKER.length;
  }

  searchFrom = 0;
  while (searchFrom < pdf.length) {
    const contentsIndex = pdf.indexOf(CONTENTS_MARKER, searchFrom);
    if (contentsIndex < 0) {
      break;
    }
    const hexStart = contentsIndex + CONTENTS_MARKER.length;
    const hexEnd = pdf.indexOf(62 /* > */, hexStart);
    if (hexEnd < 0) {
      break;
    }
    for (let index = contentsIndex; index <= hexEnd; index += 1) {
      flexible[index] = true;
    }
    searchFrom = hexEnd + 1;
  }

  return flexible;
}

export function locatePreparedContentsSlot(preparedPdf: Buffer): PreparedContentsSlot {
  const index = preparedPdf.indexOf(CONTENTS_MARKER);
  if (index < 0) {
    throw new Error('PREPARED_CONTENTS_SLOT_MISSING');
  }
  const hexStart = index + CONTENTS_MARKER.length;
  const hexEnd = preparedPdf.indexOf('>', hexStart);
  if (hexEnd < 0) {
    throw new Error('PREPARED_CONTENTS_SLOT_MALFORMED');
  }
  return { contentsStart: hexStart, contentsEnd: hexEnd };
}

export function assertPreparedArtifactBinding(
  preparedPdf: Buffer,
  signedPdf: Buffer,
): PreparedContentsSlot {
  const preparedFlexible = markFlexibleSignatureBytes(preparedPdf);
  const signedFlexible = markFlexibleSignatureBytes(signedPdf);
  const sharedLength = Math.min(preparedPdf.length, signedPdf.length);
  for (let index = 0; index < sharedLength; index += 1) {
    if (preparedFlexible[index] || signedFlexible[index]) {
      continue;
    }
    if (preparedPdf[index] !== signedPdf[index]) {
      throw new Error('PREPARED_ARTIFACT_BYTE_MISMATCH');
    }
  }
  if (preparedPdf.length !== signedPdf.length) {
    const longer = preparedPdf.length > signedPdf.length ? preparedPdf : signedPdf;
    const longerFlexible =
      preparedPdf.length > signedPdf.length ? preparedFlexible : signedFlexible;
    for (let index = sharedLength; index < longer.length; index += 1) {
      if (!longerFlexible[index]) {
        throw new Error('PREPARED_ARTIFACT_LENGTH_MISMATCH');
      }
    }
  }
  return locatePreparedContentsSlot(preparedPdf);
}
