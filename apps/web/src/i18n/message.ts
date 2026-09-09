/**
 * Shapes shared by the dictionaries and the translator.
 *
 * A message value is always plain text. Translations never carry HTML, JSX, or
 * any markup: interpolated values are inserted as text and React's own escaping
 * remains authoritative for everything rendered from a dictionary.
 */

/**
 * The CLDR plural categories a message may supply. `other` is mandatory because
 * every rule set falls back to it; the rest are supplied per language, so French
 * can add `many` where English needs only `one` and `other`.
 */
export interface PluralForms {
  readonly few?: string;
  readonly many?: string;
  readonly one?: string;
  readonly other: string;
  readonly two?: string;
  readonly zero?: string;
}

/**
 * Type-only brand. It never exists at runtime, so traversal, comparison, and
 * serialization see a plain object, while the type system can tell a
 * count-sensitive entry from an ordinary message group with certainty rather
 * than by guessing from the presence of an `other` key.
 */
declare const PLURAL_MESSAGE: unique symbol;

export type PluralMessage<Forms extends PluralForms = PluralForms> = Forms & {
  readonly [PLURAL_MESSAGE]: 'plural';
};

/**
 * Marks a dictionary entry as count-sensitive.
 *
 * The `const` type parameter keeps each form's literal text, which is what lets
 * the translator derive a key's required arguments at compile time. The brand is
 * added by assertion only; the returned object is exactly the argument.
 */
export function plural<const Forms extends PluralForms>(forms: Forms): PluralMessage<Forms> {
  return forms as PluralMessage<Forms>;
}

/**
 * The structural contract a non-canonical locale must satisfy: the same tree and
 * the same count-sensitive entries as canonical English, but free to carry its
 * own text and its own plural categories.
 */
export type WidenMessages<Tree> = Tree extends string
  ? string
  : Tree extends PluralMessage
    ? PluralMessage
    : { [Key in keyof Tree]: WidenMessages<Tree[Key]> };

/** The loose value shape the runtime translator accepts. */
export type MessageValues = Readonly<Record<string, number | string>>;
