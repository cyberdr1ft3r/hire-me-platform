/**
 * Conversions between stored ISO instants and the browser's local date/time
 * controls.
 *
 * A `datetime-local` value has no zone: the browser reads it as local time. So
 * an instant must be shown with its local components, and a typed value must
 * be converted from local time back to an instant. Slicing the ISO string would
 * show UTC wall-clock time and shift the instant on save outside UTC.
 */

function pad(value: number): string {
  return String(value).padStart(2, '0');
}

/** `2026-09-15T15:00:00Z` in UTC+2 → `2026-09-15T17:00`. */
export function isoToLocalInput(iso: string | null | undefined): string {
  if (!iso) return '';
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return '';
  return (
    `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}` +
    `T${pad(date.getHours())}:${pad(date.getMinutes())}`
  );
}

/** A local `datetime-local` value as an instant, or `null` when empty or invalid. */
export function localInputToIso(value: string): string | null {
  if (!value) return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
}

/** The first instant of a local calendar day (`YYYY-MM-DD`). */
export function dateInputStartIso(value: string): string | undefined {
  const [year, month, day] = value.split('-').map(Number);
  if (!year || !month || !day) return undefined;
  return new Date(year, month - 1, day, 0, 0, 0, 0).toISOString();
}

/** The last instant of a local calendar day (`YYYY-MM-DD`). */
export function dateInputEndIso(value: string): string | undefined {
  const [year, month, day] = value.split('-').map(Number);
  if (!year || !month || !day) return undefined;
  return new Date(year, month - 1, day, 23, 59, 59, 999).toISOString();
}
