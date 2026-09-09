import type { Locale } from '../locale.js';
import { enMessages, type Messages } from './en.js';
import { frMessages } from './fr.js';

/**
 * Static dictionary map.
 *
 * Dictionaries are imported statically and looked up through this frozen record.
 * A locale value never becomes part of an import specifier or a path, so an
 * untrusted stored value cannot reach the module loader.
 */
export const DICTIONARIES: Readonly<Record<Locale, Messages>> = Object.freeze({
  en: enMessages,
  fr: frMessages,
});

export { enMessages, frMessages };
export type { Messages };
