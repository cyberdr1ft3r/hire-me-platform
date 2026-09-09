/**
 * Shapes shared by the dictionaries and the translator.
 *
 * A message value is always plain text. Translations never carry HTML, JSX, or
 * any markup: interpolated values are inserted as text and React's own escaping
 * remains authoritative for everything rendered from a dictionary.
 */

/**
 * A count-sensitive entry. `other` is mandatory because every CLDR plural rule
 * set falls back to it; the remaining categories are supplied per language, so
 * French can add `many` where English needs only `one` and `other`.
 */
export interface PluralMessage {
  readonly few?: string;
  readonly many?: string;
  readonly one?: string;
  readonly other: string;
  readonly two?: string;
  readonly zero?: string;
}

/**
 * Marks a dictionary entry as count-sensitive. Wrapping the English entry widens
 * its inferred type to `PluralMessage`, which is what lets French supply a
 * different set of plural categories while satisfying the same structure.
 */
export function plural(forms: PluralMessage): PluralMessage {
  return forms;
}

export type MessageValues = Readonly<Record<string, number | string>>;
