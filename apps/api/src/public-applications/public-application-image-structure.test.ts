import { describe, expect, it } from 'vitest';

import {
  isStructurallyValidJpeg,
  isStructurallyValidPng,
} from './public-application-image-structure.js';

const minimalPng = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==',
  'base64',
);
const minimalJpeg = Buffer.from(
  '/9j/4AAQSkZJRgABAQEASABIAAD/2wBDAP//////////////////////////////////////////////////////////////////////////////////////2wBDAf//////////////////////////////////////////////////////////////////////////////////////wAARCAABAAEDASIAAhEBAxEB/8QAFQABAQAAAAAAAAAAAAAAAAAAAAb/xAAUEAEAAAAAAAAAAAAAAAAAAAAA/8QAFQEBAQAAAAAAAAAAAAAAAAAAAAX/xAAUEQEAAAAAAAAAAAAAAAAAAAAA/9oADAMBAAIRAxEAPwCwAA//2Q==',
  'base64',
);
const progressiveJpeg = Buffer.from(
  '/9j/4AAQSkZJRgABAQAAAQABAAD/2wBDAAYEBQYFBAYGBQYHBwYIChAKCgkJChQODwwQFxQYGBcUFhYaHSUfGhsjHBYWICwgIyYnKSopGR8tMC0oMCUoKSj/2wBDAQcHBwoIChMKChMoGhYaKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCj/wgARCAAIAAgDASIAAhEBAxEB/8QAFQABAQAAAAAAAAAAAAAAAAAAAAb/xAAVAQEBAAAAAAAAAAAAAAAAAAAFB//aAAwDAQACEAMQAAABnANSP//EABQQAQAAAAAAAAAAAAAAAAAAAAD/2gAIAQEAAQUCf//EABQRAQAAAAAAAAAAAAAAAAAAAAD/2gAIAQMBAT8Bf//EABQRAQAAAAAAAAAAAAAAAAAAAAD/2gAIAQIBAT8Bf//EABQQAQAAAAAAAAAAAAAAAAAAAAD/2gAIAQEABj8Cf//EABQQAQAAAAAAAAAAAAAAAAAAAAD/2gAIAQEAAT8hf//aAAwDAQACAAMAAAAQ/wD/xAAUEQEAAAAAAAAAAAAAAAAAAAAA/9oACAEDAQE/EH//xAAUEQEAAAAAAAAAAAAAAAAAAAAA/9oACAECAQE/EH//xAAUEAEAAAAAAAAAAAAAAAAAAAAA/9oACAEBAAE/EH//2Q==',
  'base64',
);
const soiEoiOnlyJpeg = Buffer.from([0xff, 0xd8, 0xff, 0xd9]);
const appendedHtml = Buffer.from('<html><body>polyglot</body></html>');
const appendedSvg = Buffer.from('<svg xmlns="http://www.w3.org/2000/svg"></svg>');

const pngSignature = Buffer.from('89504e470d0a1a0a', 'hex');

function writePngChunk(type: string, data: Buffer): Buffer {
  const length = Buffer.alloc(4);
  length.writeUInt32BE(data.length);
  const typeBuffer = Buffer.from(type, 'ascii');
  const typeAndData = Buffer.concat([typeBuffer, data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(pngChunkCrc(typeAndData));
  return Buffer.concat([length, typeBuffer, data, crc]);
}

const testCrcTable = createCrcTable();

function pngChunkCrc(typeAndData: Buffer): number {
  let crc = 0xffffffff;
  for (let index = 0; index < typeAndData.length; index += 1) {
    crc = testCrcTable[(crc ^ typeAndData[index]!) & 0xff]! ^ (crc >>> 8);
  }
  return (crc ^ 0xffffffff) >>> 0;
}

function createCrcTable(): Uint32Array {
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

function minimalIhdrChunk(): Buffer {
  const data = Buffer.alloc(13);
  data.writeUInt32BE(1, 0);
  data.writeUInt32BE(1, 4);
  data[8] = 8;
  data[9] = 2;
  data[10] = 0;
  data[11] = 0;
  data[12] = 0;
  return writePngChunk('IHDR', data);
}

describe('isStructurallyValidJpeg', () => {
  it('accepts an ordinary minimal JPEG and rejects trailing payloads', () => {
    expect(isStructurallyValidJpeg(minimalJpeg)).toBe(true);
    expect(isStructurallyValidJpeg(Buffer.concat([minimalJpeg, appendedHtml]))).toBe(false);
    expect(isStructurallyValidJpeg(Buffer.concat([minimalJpeg, appendedSvg]))).toBe(false);
  });

  it('rejects missing EOI and malformed marker lengths', () => {
    expect(isStructurallyValidJpeg(minimalJpeg.subarray(0, minimalJpeg.length - 2))).toBe(false);
    const malformed = Buffer.from(minimalJpeg);
    malformed.writeUInt16BE(0xffff, 4);
    expect(isStructurallyValidJpeg(malformed)).toBe(false);
  });

  it('rejects SOI+EOI with no frame or scan data', () => {
    expect(isStructurallyValidJpeg(soiEoiOnlyJpeg)).toBe(false);
  });

  it('accepts a legitimate progressive JPEG with multiple SOS scans', () => {
    expect(isStructurallyValidJpeg(progressiveJpeg)).toBe(true);
  });
});

describe('isStructurallyValidPng', () => {
  it('accepts an ordinary minimal PNG and rejects trailing payloads', () => {
    expect(isStructurallyValidPng(minimalPng)).toBe(true);
    expect(isStructurallyValidPng(Buffer.concat([minimalPng, appendedHtml]))).toBe(false);
    expect(isStructurallyValidPng(Buffer.concat([minimalPng, appendedSvg]))).toBe(false);
  });

  it('rejects fabricated header-only, truncated, and missing IEND PNGs', () => {
    const headerOnly = Buffer.concat([pngSignature, minimalIhdrChunk()]);
    expect(isStructurallyValidPng(headerOnly)).toBe(false);

    const truncated = Buffer.concat([pngSignature, minimalIhdrChunk().subarray(0, 20)]);
    expect(isStructurallyValidPng(truncated)).toBe(false);

    const withoutIend = Buffer.concat([
      pngSignature,
      minimalIhdrChunk(),
      writePngChunk('IDAT', Buffer.from([0x78, 0x9c, 0x03, 0x00, 0x00, 0x00, 0x00, 0x01])),
    ]);
    expect(isStructurallyValidPng(withoutIend)).toBe(false);
  });

  it('rejects IHDR plus zero-length IDAT plus IEND', () => {
    const emptyIdatPng = Buffer.concat([
      pngSignature,
      minimalIhdrChunk(),
      writePngChunk('IDAT', Buffer.alloc(0)),
      writePngChunk('IEND', Buffer.alloc(0)),
    ]);
    expect(isStructurallyValidPng(emptyIdatPng)).toBe(false);
  });

  it('rejects invalid CRC and out-of-bounds declared chunk lengths', () => {
    const badCrc = Buffer.from(minimalPng);
    badCrc.writeUInt32BE(0, 8 + 4 + 13);
    expect(isStructurallyValidPng(badCrc)).toBe(false);

    const oversizeLength = Buffer.from(minimalPng);
    oversizeLength.writeUInt32BE(2_000_000, 8);
    expect(isStructurallyValidPng(oversizeLength)).toBe(false);
  });
});
