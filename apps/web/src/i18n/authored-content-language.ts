import type { PublicContentLanguage } from '@hire-me/contracts';

/**
 * The `lang` attribute for one element that holds recruiter-authored copy
 * (Issue #88 / D-070).
 *
 * The document language follows the interface locale, but authored job text is
 * written in whatever language staff wrote it in. Staff declare that language
 * explicitly; this states it on each authored element so assistive technology
 * is not told that English copy is French, or the reverse.
 *
 * An undeclared language gives `lang=""`, which HTML defines as "unknown": it
 * claims nothing, where leaving the attribute off would inherit the interface
 * language and claim that. The language is never guessed from the text, the
 * interface, or anyone's locale.
 *
 * It is attribute-only. Spread it onto the element that already holds the
 * authored text, so there is no wrapper box and no change to layout or to an
 * element's accessible name. Interface chrome never uses it: labels, headings,
 * formatted values, and HireMe-owned copy inherit the document language.
 * `LegacyEnglishContent` stays the boundary for untranslated interface regions.
 */
export function authoredContentLanguage(language: PublicContentLanguage | null): {
  lang: PublicContentLanguage | '';
} {
  return { lang: language ?? '' };
}
