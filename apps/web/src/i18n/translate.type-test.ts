/**
 * Compile-time coverage for the translator's argument contract.
 *
 * `pnpm typecheck` is the assertion runner for this file. Every
 * `@ts-expect-error` below fails the build if the call it guards ever stops
 * being an error, so the compile-time guarantees cannot quietly regress.
 *
 * The filename deliberately avoids the `*.test.ts` pattern: these are type
 * assertions, not runtime tests. The runtime fail-closed behaviour is covered
 * separately in `translate.test.ts`.
 */

import { createFormatters } from './format.js';
import { LOCALE_METADATA } from './locale.js';
import { DICTIONARIES } from './messages/index.js';
import { createTranslator, type PlainMessageKey } from './translate.js';

const t = createTranslator({
  dictionary: DICTIONARIES.en,
  formatNumber: createFormatters(LOCALE_METADATA.en.formattingLocale).formatNumber,
  formattingLocale: LOCALE_METADATA.en.formattingLocale,
});

// A message with no placeholders takes no values.
export const noValues: string = t('common.actions.save');

// A message with a placeholder takes exactly that placeholder.
export const interpolated: string = t('overview.signedInAs', {
  email: 'operator@example.test',
});

// A count-sensitive message takes a numeric count.
export const pluralized: string = t('common.counts.candidates', { count: 12 });

// A message may take several placeholders at once.
export const multiplePlaceholders: string = t('preview.formatting', { values: '1,234.5' });

// @ts-expect-error a message with a placeholder cannot be called without values
export const missingInterpolation: string = t('overview.signedInAs');

// @ts-expect-error the placeholder is `email`, so `name` is neither required nor allowed
export const misnamedInterpolation: string = t('overview.signedInAs', { name: 'operator' });

// @ts-expect-error a count-sensitive message cannot be called without a count
export const missingCount: string = t('common.counts.candidates');

// @ts-expect-error count selects the plural category, so it must be a number
export const stringCount: string = t('common.counts.candidates', { count: '12' });

// @ts-expect-error a key outside the canonical dictionary is rejected
export const unknownKey: string = t('shell.session.missing');

// @ts-expect-error an English sentence is not a key
export const sentenceKey: string = t('Sign out');

// A key that needs values is not a `PlainMessageKey`, so it cannot be stored as
// navigation-style data and translated later without its values.
export const plainKey: PlainMessageKey = 'navigation.destinations.overview';

// @ts-expect-error `overview.signedInAs` needs an interpolation value
export const notAPlainKey: PlainMessageKey = 'overview.signedInAs';

// @ts-expect-error `common.counts.candidates` needs a count
export const pluralIsNotAPlainKey: PlainMessageKey = 'common.counts.candidates';
