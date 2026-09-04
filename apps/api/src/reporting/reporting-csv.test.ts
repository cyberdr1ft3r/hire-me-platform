import { describe, expect, it } from 'vitest';

import { buildReportingCsv, encodeCsvCell } from './reporting-csv.js';
import type { ReportingDrilldownRow } from '@hire-me/contracts';

const TAB = String.fromCharCode(9);
const CR = String.fromCharCode(13);

describe('encodeCsvCell', () => {
  it('neutralizes every dangerous leading formula character', () => {
    for (const prefix of ['=', '+', '-', '@', TAB, CR]) {
      const encoded = encodeCsvCell(`${prefix}payload`);
      // The neutralized value starts with a single quote before the dangerous prefix.
      // CR additionally triggers RFC 4180 quoting, so unwrap quotes before checking.
      const unwrapped = encoded.startsWith('"')
        ? encoded.slice(1, -1).replace(/""/g, '"')
        : encoded;
      expect(unwrapped.startsWith(`'${prefix}`)).toBe(true);
    }
  });

  it('does not alter safe leading characters', () => {
    expect(encodeCsvCell('Alice')).toBe('Alice');
    expect(encodeCsvCell('normal value')).toBe('normal value');
  });

  it('quotes commas, quotes, and newlines per RFC 4180', () => {
    expect(encodeCsvCell('a,b')).toBe('"a,b"');
    expect(encodeCsvCell('say "hi"')).toBe('"say ""hi"""');
    expect(encodeCsvCell('line1\nline2')).toBe('"line1\nline2"');
    expect(encodeCsvCell(`carriage${CR}return`)).toBe(`"carriage${CR}return"`);
  });
});

describe('buildReportingCsv', () => {
  it('emits a header and CRLF-delimited rows with neutralized cells', () => {
    const row: ReportingDrilldownRow = {
      processId: 'p1',
      missionId: 'm1',
      missionTitle: 'Mission',
      clientId: 'c1',
      clientName: 'Client, Inc',
      candidateId: 'cand1',
      candidateDisplayName: '=cmd()',
      pipelineState: 'NEW',
      responsibleRecruiterUserId: 'u1',
      responsibleRecruiterDisplayName: 'Recruiter',
      source: `${TAB}sourced`,
      clientVisible: false,
      presentedAt: null,
      createdAt: '2026-09-01T00:00:00.000Z',
      updatedAt: '2026-09-01T00:00:00.000Z',
    };
    const csv = buildReportingCsv([row]);
    const lines = csv.split('\r\n');
    expect(lines).toHaveLength(2);
    expect(lines[0]).toContain('candidateDisplayName');
    expect(csv).toContain("'=cmd()");
    expect(csv).toContain('"Client, Inc"');
    expect(csv).toContain(`'${TAB}sourced`);
  });
});
