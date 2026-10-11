import type { MissionFilterValues } from './mission-state.js';

/**
 * Mission deadline filters are business dates, not browser-local instants.
 * Build their UTC boundaries directly so the selected calendar day never
 * shifts with the browser timezone.
 */
export function deadlineFromDate(date: string): string | undefined {
  return date ? `${date}T00:00:00.000Z` : undefined;
}

/** The API applies deadlineTo with `lte`, so this includes the whole UTC date. */
export function deadlineToDate(date: string): string | undefined {
  return date ? `${date}T23:59:59.999Z` : undefined;
}

export function hasValidDeadlineRange(
  filters: Pick<MissionFilterValues, 'deadlineFrom' | 'deadlineTo'>,
): boolean {
  return (
    filters.deadlineFrom === '' ||
    filters.deadlineTo === '' ||
    filters.deadlineFrom <= filters.deadlineTo
  );
}
