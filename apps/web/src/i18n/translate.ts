import type { MessageValues, PluralForms, PluralMessage } from './message.js';
import type { CanonicalMessages, Messages } from './messages/en.js';

type MessageLeaf = PluralMessage | string;

/**
 * Every dot path that resolves to a translatable leaf in the canonical
 * dictionary. Anything else is a compile error at the call site, which is what
 * makes a missing translation a build failure rather than a runtime surprise.
 */
export type MessageKey<Tree = CanonicalMessages> = {
  [Key in keyof Tree & string]: Tree[Key] extends MessageLeaf
    ? Key
    : `${Key}.${MessageKey<Tree[Key]>}`;
}[keyof Tree & string];

/** The canonical leaf a key points at, carrying its literal text. */
type LeafAt<Tree, Key extends string> = Key extends `${infer Head}.${infer Rest}`
  ? Head extends keyof Tree
    ? LeafAt<Tree[Head], Rest>
    : never
  : Key extends keyof Tree
    ? Tree[Key]
    : never;

/** The `{name}` placeholders in one template. */
type PlaceholderNames<Template extends string> =
  Template extends `${string}{${infer Name}}${infer Rest}` ? Name | PlaceholderNames<Rest> : never;

/**
 * The placeholders a leaf needs. A count-sensitive entry contributes every
 * placeholder any of its forms uses, because which form renders is only known
 * at run time.
 */
type LeafPlaceholders<Leaf> = Leaf extends string
  ? PlaceholderNames<Leaf>
  : Leaf extends PluralForms
    ? {
        [Form in keyof Leaf]: Leaf[Form] extends string ? PlaceholderNames<Leaf[Form]> : never;
      }[keyof Leaf]
    : never;

/**
 * Everything a key must be given. `count` is required for a count-sensitive
 * entry even when the selected form happens not to print it, because it is what
 * selects the form.
 */
type RequiredValueNames<Key extends MessageKey> =
  | LeafPlaceholders<LeafAt<CanonicalMessages, Key>>
  | (LeafAt<CanonicalMessages, Key> extends PluralMessage ? 'count' : never);

type PlaceholderValues<Names extends string> = { [Name in Names]: number | string };

/** The values object one key requires, with `count` typed as a real number. */
export type MessageArguments<Key extends MessageKey> =
  LeafAt<CanonicalMessages, Key> extends PluralMessage
    ? { count: number } & PlaceholderValues<Exclude<RequiredValueNames<Key>, 'count'>>
    : PlaceholderValues<RequiredValueNames<Key>>;

/** No trailing argument for a key that needs none; a required one otherwise. */
export type TranslatorArguments<Key extends MessageKey> = [RequiredValueNames<Key>] extends [never]
  ? []
  : [values: MessageArguments<Key>];

/**
 * A key that needs no values, so it is safe to store as data and translate
 * later — navigation labels, for example.
 */
export type PlainMessageKey = {
  [Key in MessageKey]: [RequiredValueNames<Key>] extends [never] ? Key : never;
}[MessageKey];

export type Translator = <Key extends MessageKey>(
  ...args: [key: Key, ...TranslatorArguments<Key>]
) => string;

const PLACEHOLDER = /\{(\w+)\}/g;

function isPluralMessage(node: unknown): node is PluralForms {
  return (
    typeof node === 'object' && node !== null && typeof (node as PluralForms).other === 'string'
  );
}

function resolveLeaf(dictionary: Messages, key: string): PluralForms | string {
  let current: unknown = dictionary;
  for (const segment of key.split('.')) {
    // `hasOwnProperty` rather than `in`, so no key can walk the prototype chain.
    if (
      typeof current !== 'object' ||
      current === null ||
      !Object.prototype.hasOwnProperty.call(current, segment)
    ) {
      throw new Error(`Missing translation key "${key}".`);
    }
    current = (current as Record<string, unknown>)[segment];
  }
  if (typeof current === 'string' || isPluralMessage(current)) {
    return current;
  }
  throw new Error(`Translation key "${key}" does not resolve to a message.`);
}

export interface TranslatorDependencies {
  readonly dictionary: Messages;
  readonly formatNumber: (value: number) => string;
  readonly formattingLocale: string;
}

/**
 * Builds the `t` function for one locale.
 *
 * The public signature derives each key's required arguments from the canonical
 * English dictionary, so a missing key, a missing or misnamed interpolation
 * value, and a count-sensitive key used without a numeric count are all compile
 * errors. The runtime guards below stay as defence in depth for the boundary
 * where a key arrives untyped.
 */
export function createTranslator({
  dictionary,
  formatNumber,
  formattingLocale,
}: TranslatorDependencies): Translator {
  const pluralRules = new Intl.PluralRules(formattingLocale);

  function translate(key: string, values?: MessageValues): string {
    const leaf = resolveLeaf(dictionary, key);
    let template: string;

    if (typeof leaf === 'string') {
      template = leaf;
    } else {
      const count = values?.count;
      if (typeof count !== 'number') {
        throw new Error(`Translation key "${key}" is count-sensitive and needs a numeric count.`);
      }
      template = leaf[pluralRules.select(count)] ?? leaf.other;
    }

    return template.replace(PLACEHOLDER, (_placeholder, name: string) => {
      if (!values || !Object.prototype.hasOwnProperty.call(values, name)) {
        throw new Error(`Translation key "${key}" needs an interpolation value for "${name}".`);
      }
      const value = values[name];
      // Values stay text. React escaping remains authoritative for the result.
      return typeof value === 'number' ? formatNumber(value) : String(value);
    });
  }

  // The implementation works on the widened runtime shape; the declared return
  // type is the key-aware surface derived from canonical English.
  return translate;
}
