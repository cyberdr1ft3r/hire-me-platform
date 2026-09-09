import type { MessageValues, PluralMessage } from './message.js';
import type { Messages } from './messages/en.js';

type MessageLeaf = PluralMessage | string;

/**
 * Every dot path that resolves to a translatable leaf in the canonical
 * dictionary. Anything else is a compile error at the call site, which is what
 * makes a missing translation a build failure rather than a runtime surprise.
 */
export type MessageKey<Tree = Messages> = {
  [Key in keyof Tree & string]: Tree[Key] extends MessageLeaf
    ? Key
    : `${Key}.${MessageKey<Tree[Key]>}`;
}[keyof Tree & string];

export type Translator = (key: MessageKey, values?: MessageValues) => string;

const PLACEHOLDER = /\{(\w+)\}/g;

function isPluralMessage(node: unknown): node is PluralMessage {
  return (
    typeof node === 'object' && node !== null && typeof (node as PluralMessage).other === 'string'
  );
}

function resolveLeaf(dictionary: Messages, key: string): MessageLeaf {
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
 * A missing key, a missing interpolation value, or a plural entry used without a
 * numeric `count` throws. Both dictionaries share one compile-time structure, so
 * these are unreachable through typed call sites; failing loudly keeps a
 * development mistake from shipping as a silently English string.
 */
export function createTranslator({
  dictionary,
  formatNumber,
  formattingLocale,
}: TranslatorDependencies): Translator {
  const pluralRules = new Intl.PluralRules(formattingLocale);

  return function translate(key: MessageKey, values?: MessageValues): string {
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
  };
}
