/**
 * Bounded structural validation for public-application JPEG and PNG uploads.
 *
 * PNG CRC policy: every chunk's type+data bytes are checked against the stored
 * CRC-32 (ISO 3309 / PNG appendix D). A mismatch rejects the upload.
 *
 * PNG ordering policy: the first chunk must be IHDR with valid IHDR fields; at
 * least one non-empty IDAT must appear before the terminal IEND; no bytes may
 * follow IEND.
 *
 * JPEG policy: markers are walked from SOI; a valid SOF frame header and at
 * least one SOS scan with non-empty entropy-coded data are required before
 * terminal EOI; progressive JPEGs with multiple SOS segments are supported; no
 * bytes may follow EOI.
 */

const pngSignature = Buffer.from('89504e470d0a1a0a', 'hex');
const maxPngDimension = 20_000;
const maxPngChunkCount = 256;
const maxPngChunkDataLength = 1_500_000;
const minPngIdatDataBytes = 1;
const minJpegEntropyBytesPerScan = 1;

const crcTable = createPngCrcTable();

export function isStructurallyValidJpeg(buffer: Buffer): boolean {
  if (buffer.length < 4) {
    return false;
  }
  if (buffer[0] !== 0xff || buffer[1] !== 0xd8) {
    return false;
  }

  let offset = 2;
  let sawSof = false;
  let sawScanData = false;

  while (offset < buffer.length) {
    const markerStart = readMarker(buffer, offset);
    if (markerStart === null) {
      return false;
    }
    offset = markerStart.markerOffset + 1;
    const marker = markerStart.marker;

    if (marker === 0xd9) {
      return markerStart.markerOffset + 1 === buffer.length && sawSof && sawScanData;
    }
    if (marker === 0xd8) {
      return false;
    }
    if (marker === 0x01) {
      continue;
    }
    if (marker >= 0xd0 && marker <= 0xd7) {
      continue;
    }

    if (offset + 2 > buffer.length) {
      return false;
    }
    const segmentLength = buffer.readUInt16BE(offset);
    if (segmentLength < 2 || offset + segmentLength > buffer.length) {
      return false;
    }
    const segmentBodyOffset = offset + 2;
    offset += segmentLength;

    if (isSofMarker(marker)) {
      if (!validateSofSegment(buffer, segmentBodyOffset, segmentLength)) {
        return false;
      }
      sawSof = true;
      continue;
    }

    if (marker === 0xda) {
      const entropyStart = offset;
      const entropyResult = scanEntropyStream(buffer, entropyStart);
      if (entropyResult === null) {
        return false;
      }
      if (entropyResult.entropyBytes < minJpegEntropyBytesPerScan) {
        return false;
      }
      sawScanData = true;

      if (entropyResult.kind === 'eoi') {
        return entropyResult.eoiEnd === buffer.length && sawSof;
      }

      offset = entropyResult.markerOffset;
      continue;
    }
  }

  return false;
}

function readMarker(
  buffer: Buffer,
  offset: number,
): { marker: number; markerOffset: number } | null {
  if (offset >= buffer.length || buffer[offset] !== 0xff) {
    return null;
  }
  let markerOffset = offset;
  markerOffset += 1;
  while (markerOffset < buffer.length && buffer[markerOffset] === 0xff) {
    markerOffset += 1;
  }
  if (markerOffset >= buffer.length) {
    return null;
  }
  const marker = buffer[markerOffset];
  if (marker === undefined) {
    return null;
  }
  return { marker, markerOffset };
}

function isSofMarker(marker: number): boolean {
  return marker >= 0xc0 && marker <= 0xcf && marker !== 0xc4 && marker !== 0xc8 && marker !== 0xcc;
}

function validateSofSegment(buffer: Buffer, bodyOffset: number, segmentLength: number): boolean {
  const bodyLength = segmentLength - 2;
  if (bodyLength < 6 || bodyOffset + bodyLength > buffer.length) {
    return false;
  }
  const height = buffer.readUInt16BE(bodyOffset + 1);
  const width = buffer.readUInt16BE(bodyOffset + 3);
  if (height === 0 || width === 0) {
    return false;
  }
  const componentCount = buffer[bodyOffset + 5];
  if (componentCount === undefined || componentCount === 0) {
    return false;
  }
  if (bodyLength < 6 + componentCount * 3) {
    return false;
  }
  return true;
}

type EntropyScanResult =
  | { kind: 'eoi'; eoiEnd: number; entropyBytes: number }
  | { kind: 'marker'; markerOffset: number; entropyBytes: number };

function scanEntropyStream(buffer: Buffer, start: number): EntropyScanResult | null {
  const entropyStart = start;
  let index = start;
  while (index < buffer.length) {
    if (buffer[index] !== 0xff) {
      index += 1;
      continue;
    }
    let markerIndex = index + 1;
    while (markerIndex < buffer.length && buffer[markerIndex] === 0xff) {
      markerIndex += 1;
    }
    if (markerIndex >= buffer.length) {
      return null;
    }
    const marker = buffer[markerIndex];
    if (marker === undefined) {
      return null;
    }
    if (marker === 0x00) {
      index = markerIndex + 1;
      continue;
    }
    if (marker >= 0xd0 && marker <= 0xd7) {
      index = markerIndex + 1;
      continue;
    }
    const entropyBytes = index - entropyStart;
    if (marker === 0xd9) {
      return { kind: 'eoi', eoiEnd: markerIndex + 1, entropyBytes };
    }
    return { kind: 'marker', markerOffset: index, entropyBytes };
  }
  return null;
}

export function isStructurallyValidPng(buffer: Buffer): boolean {
  if (buffer.length < 8 + 12) {
    return false;
  }
  if (!buffer.subarray(0, 8).equals(pngSignature)) {
    return false;
  }

  let offset = 8;
  let chunkCount = 0;
  let sawIhdr = false;
  let idatDataBytes = 0;
  let sawIend = false;

  while (offset < buffer.length) {
    if (chunkCount >= maxPngChunkCount) {
      return false;
    }
    if (offset + 12 > buffer.length) {
      return false;
    }

    const dataLength = buffer.readUInt32BE(offset);
    if (dataLength > maxPngChunkDataLength) {
      return false;
    }
    const chunkEnd = offset + 12 + dataLength;
    if (chunkEnd > buffer.length) {
      return false;
    }

    const type = buffer.subarray(offset + 4, offset + 8).toString('ascii');
    const data = buffer.subarray(offset + 8, chunkEnd - 4);
    const storedCrc = buffer.readUInt32BE(chunkEnd - 4);
    const typeAndData = buffer.subarray(offset + 4, chunkEnd - 4);
    if (pngCrc32(typeAndData) !== storedCrc) {
      return false;
    }

    chunkCount += 1;
    if (chunkCount === 1) {
      if (type !== 'IHDR' || dataLength !== 13) {
        return false;
      }
      if (!validateIhdrFields(data)) {
        return false;
      }
      sawIhdr = true;
    } else if (type === 'IHDR') {
      return false;
    }

    if (type === 'IDAT') {
      if (dataLength === 0) {
        return false;
      }
      idatDataBytes += dataLength;
    }
    if (type === 'IEND') {
      if (dataLength !== 0) {
        return false;
      }
      if (chunkEnd !== buffer.length) {
        return false;
      }
      sawIend = true;
      break;
    }

    offset = chunkEnd;
  }

  return sawIhdr && idatDataBytes >= minPngIdatDataBytes && sawIend;
}

function validateIhdrFields(data: Buffer): boolean {
  if (data.length !== 13) {
    return false;
  }
  const width = data.readUInt32BE(0);
  const height = data.readUInt32BE(4);
  const bitDepth = data[8];
  const colorType = data[9];
  const compressionMethod = data[10];
  const filterMethod = data[11];
  const interlaceMethod = data[12];

  if (
    bitDepth === undefined ||
    colorType === undefined ||
    compressionMethod === undefined ||
    filterMethod === undefined ||
    interlaceMethod === undefined
  ) {
    return false;
  }

  if (width === 0 || height === 0) {
    return false;
  }
  if (width > maxPngDimension || height > maxPngDimension) {
    return false;
  }
  if (compressionMethod !== 0 || filterMethod !== 0) {
    return false;
  }
  if (interlaceMethod !== 0 && interlaceMethod !== 1) {
    return false;
  }
  if (!isValidPngBitDepthForColorType(bitDepth, colorType)) {
    return false;
  }
  return true;
}

function isValidPngBitDepthForColorType(bitDepth: number, colorType: number): boolean {
  switch (colorType) {
    case 0:
      return (
        bitDepth === 1 || bitDepth === 2 || bitDepth === 4 || bitDepth === 8 || bitDepth === 16
      );
    case 2:
    case 4:
    case 6:
      return bitDepth === 8 || bitDepth === 16;
    case 3:
      return bitDepth === 1 || bitDepth === 2 || bitDepth === 4 || bitDepth === 8;
    default:
      return false;
  }
}

function pngCrc32(buffer: Buffer): number {
  let crc = 0xffffffff;
  for (let index = 0; index < buffer.length; index += 1) {
    crc = crcTable[(crc ^ buffer[index]!) & 0xff]! ^ (crc >>> 8);
  }
  return (crc ^ 0xffffffff) >>> 0;
}

function createPngCrcTable(): Uint32Array {
  const table = new Uint32Array(256);
  for (let entry = 0; entry < 256; entry += 1) {
    let value = entry;
    for (let bit = 0; bit < 8; bit += 1) {
      value = (value & 1) !== 0 ? 0xedb88320 ^ (value >>> 1) : value >>> 1;
    }
    table[entry] = value >>> 0;
  }
  return table;
}
