const units = [
  'zéro',
  'un',
  'deux',
  'trois',
  'quatre',
  'cinq',
  'six',
  'sept',
  'huit',
  'neuf',
  'dix',
  'onze',
  'douze',
  'treize',
  'quatorze',
  'quinze',
  'seize',
] as const;

function underHundred(value: number): string {
  if (value < 17) return units[value]!;
  if (value < 20) return `dix-${units[value - 10]}`;
  if (value < 70) {
    const tens = ['', '', 'vingt', 'trente', 'quarante', 'cinquante', 'soixante'][
      Math.trunc(value / 10)
    ]!;
    const remainder = value % 10;
    return remainder === 0 ? tens : `${tens}${remainder === 1 ? ' et ' : '-'}${units[remainder]}`;
  }
  if (value < 80) {
    const remainder = value - 60;
    return `soixante${remainder === 11 ? ' et ' : '-'}${underHundred(remainder)}`;
  }
  const remainder = value - 80;
  return remainder === 0 ? 'quatre-vingts' : `quatre-vingt-${underHundred(remainder)}`;
}

function underThousand(value: number): string {
  if (value < 100) return underHundred(value);
  const hundreds = Math.trunc(value / 100);
  const remainder = value % 100;
  const head = hundreds === 1 ? 'cent' : `${units[hundreds]} cent`;
  return remainder === 0
    ? `${head}${hundreds > 1 ? 's' : ''}`
    : `${head} ${underHundred(remainder)}`;
}

function integerWords(value: number): string {
  if (value === 0) return units[0];
  if (value < 1_000) return underThousand(value);
  if (value < 1_000_000) {
    const thousands = Math.trunc(value / 1_000);
    const remainder = value % 1_000;
    const head = thousands === 1 ? 'mille' : `${underThousand(thousands)} mille`;
    return remainder === 0 ? head : `${head} ${underThousand(remainder)}`;
  }
  if (value < 1_000_000_000) {
    const millions = Math.trunc(value / 1_000_000);
    const remainder = value % 1_000_000;
    const head = `${integerWords(millions)} million${millions > 1 ? 's' : ''}`;
    return remainder === 0 ? head : `${head} ${integerWords(remainder)}`;
  }
  throw new RangeError('French amount-in-words supports totals below one billion MAD.');
}

/** Deterministic French wording from the immutable integer-cent total. */
export function frenchMadAmountInWords(totalCents: number): string {
  if (!Number.isSafeInteger(totalCents) || totalCents < 0) {
    throw new RangeError('Amount must be a non-negative safe integer number of cents.');
  }
  const dirhams = Math.trunc(totalCents / 100);
  const centimes = totalCents % 100;
  return `${integerWords(dirhams)} dirham${dirhams > 1 ? 's' : ''} et ${integerWords(centimes)} centime${centimes > 1 ? 's' : ''}`;
}
