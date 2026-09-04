import type { ReportingDrilldownRow } from '@hire-me/contracts';

// Column order is deterministic and stable. No candidate salary/compensation,
// client/placement commercial values, evaluation bodies, internal notes, document
// storage metadata, secrets, or tokens are included.
const CSV_COLUMNS: { header: string; value: (row: ReportingDrilldownRow) => string }[] = [
  { header: 'processId', value: (row) => row.processId },
  { header: 'missionId', value: (row) => row.missionId },
  { header: 'missionTitle', value: (row) => row.missionTitle },
  { header: 'clientId', value: (row) => row.clientId },
  { header: 'clientName', value: (row) => row.clientName },
  { header: 'candidateId', value: (row) => row.candidateId },
  { header: 'candidateDisplayName', value: (row) => row.candidateDisplayName },
  { header: 'pipelineState', value: (row) => row.pipelineState },
  { header: 'responsibleRecruiterUserId', value: (row) => row.responsibleRecruiterUserId },
  {
    header: 'responsibleRecruiterDisplayName',
    value: (row) => row.responsibleRecruiterDisplayName,
  },
  { header: 'source', value: (row) => row.source ?? '' },
  { header: 'clientVisible', value: (row) => (row.clientVisible ? 'true' : 'false') },
  { header: 'presentedAt', value: (row) => row.presentedAt ?? '' },
  { header: 'createdAt', value: (row) => row.createdAt },
  { header: 'updatedAt', value: (row) => row.updatedAt },
];

// Dangerous leading symbols that can start a spreadsheet formula.
const FORMULA_PREFIX_SYMBOLS = new Set(['=', '+', '-', '@']);
// Dangerous leading control-character code points: TAB (9) and CR (13). These are
// matched by code point to avoid any ambiguity between real control characters and
// their escape-sequence text.
const FORMULA_PREFIX_CODES = new Set([9, 13]);

function startsWithFormulaPrefix(value: string): boolean {
  if (value.length === 0) {
    return false;
  }
  const first = value[0]!;
  return FORMULA_PREFIX_SYMBOLS.has(first) || FORMULA_PREFIX_CODES.has(value.charCodeAt(0));
}

// Neutralizes spreadsheet formula injection by prefixing dangerous leading
// characters with a single quote, then applies RFC 4180 quoting.
export function encodeCsvCell(value: string): string {
  let safe = value;
  if (startsWithFormulaPrefix(safe)) {
    safe = `'${safe}`;
  }
  if (/[",\r\n]/.test(safe)) {
    safe = `"${safe.replace(/"/g, '""')}"`;
  }
  return safe;
}

export function buildReportingCsv(rows: ReportingDrilldownRow[]): string {
  const lines: string[] = [];
  lines.push(CSV_COLUMNS.map((column) => encodeCsvCell(column.header)).join(','));
  for (const row of rows) {
    lines.push(CSV_COLUMNS.map((column) => encodeCsvCell(column.value(row))).join(','));
  }
  // CRLF line endings per RFC 4180.
  return lines.join('\r\n');
}

export function buildReportingCsvFilename(now: Date): string {
  const year = now.getUTCFullYear();
  const month = String(now.getUTCMonth() + 1).padStart(2, '0');
  const day = String(now.getUTCDate()).padStart(2, '0');
  return `recruitment-report-${year}${month}${day}.csv`;
}
