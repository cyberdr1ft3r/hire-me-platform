/**
 * Bounded structural validation for public-application JPEG and PNG uploads.
 *
 * PNG CRC policy: every chunk's type+data bytes are checked against the stored
 * CRC-32 (ISO 3309 / PNG appendix D). A mismatch rejects the upload.
 *
 * PNG ordering policy: the first chunk must be IHDR; at least one IDAT must
 * appear before the terminal IEND; no bytes may follow IEND.
 *
 * JPEG policy: markers are walked from SOI through SOS entropy-coded data until
 * a terminal EOI; no bytes may follow EOI.
 */

const pngSignature = Buffer.from('89504e470d0a1a0a', 'hex');
const maxPngDimension = 20_000;
const maxPngChunkCount = 256;
const maxPngChunkDataLength = 1_500_000;

const crcTable = createPngCrcTable();

export function isStructurallyValidJpeg(buffer: Buffer): boolean {
  if (buffer.length < 4) {
    return false;
  }
  if (buffer[0] !== 0xff || buffer[1] !== 0xd8) {
    return false;
  }

  let offset = 2;
  while (offset < buffer.length) {
    if (buffer[offset] !== 0xff) {
      return false;
    }
    offset += 1;
    while (offset < buffer.length && buffer[offset] === 0xff) {
      offset += 1;
    }
    if (offset >= buffer.length) {
      return false;
    }

    const marker = buffer[offset];
    if (marker === undefined) {
      return false;
    }
    offset += 1;

    if (marker === 0xd9) {
      return offset === buffer.length;
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

    if (marker === 0xda) {
      if (offset + 2 > buffer.length) {
        return false;
      }
      const segmentLength = buffer.readUInt16BE(offset);
      if (segmentLength < 2 || offset + segmentLength > buffer.length) {
        return false;
      }
      offset += segmentLength;
      offset = findJpegEndOfImage(buffer, offset);
      if (offset === -1) {
        return false;
      }
      return offset === buffer.length;
    }

    if (offset + 2 > buffer.length) {
      return false;
    }
    const segmentLength = buffer.readUInt16BE(offset);
    if (segmentLength < 2 || offset + segmentLength > buffer.length) {
      return false;
    }
    offset += segmentLength;
  }

  return false;
}

function findJpegEndOfImage(buffer: Buffer, offset: number): number {
  let index = offset;
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
      return -1;
    }
    const marker = buffer[markerIndex];
    if (marker === undefined) {
      return -1;
    }
    if (marker === 0x00) {
      index = markerIndex + 1;
      continue;
    }
    if (marker === 0xd9) {
      return markerIndex + 1;
    }
    if (marker >= 0xd0 && marker <= 0xd7) {
      index = markerIndex + 1;
      continue;
    }
    return -1;
  }
  return -1;
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
  let sawIdat = false;
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
      const width = data.readUInt32BE(0);
      const height = data.readUInt32BE(4);
      if (width === 0 || height === 0) {
        return false;
      }
      if (width > maxPngDimension || height > maxPngDimension) {
        return false;
      }
      sawIhdr = true;
    } else if (type === 'IHDR') {
      return false;
    }

    if (type === 'IDAT') {
      sawIdat = true;
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

  return sawIhdr && sawIdat && sawIend;
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
