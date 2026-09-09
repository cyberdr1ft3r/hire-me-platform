import { readFile } from 'node:fs/promises';

const css = await readFile('apps/web/src/styles/tokens.css', 'utf8');
const declarations = new Map(
  [...css.matchAll(/--([\w-]+):\s*([^;]+);/g)].map((match) => [match[1], match[2].trim()]),
);

function resolveToken(name, seen = new Set()) {
  if (seen.has(name)) throw new Error(`Circular token reference: ${name}`);
  const value = declarations.get(name);
  if (!value) throw new Error(`Missing token: ${name}`);
  const reference = value.match(/^var\(--([\w-]+)\)$/);
  if (!reference) return value;
  return resolveToken(reference[1], new Set([...seen, name]));
}

function luminance(hex) {
  const channels = hex
    .slice(1)
    .match(/.{2}/g)
    .map((value) => Number.parseInt(value, 16) / 255)
    .map((value) => (value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4));
  return 0.2126 * channels[0] + 0.7152 * channels[1] + 0.0722 * channels[2];
}

function contrast(foreground, background) {
  const lighter = Math.max(luminance(foreground), luminance(background));
  const darker = Math.min(luminance(foreground), luminance(background));
  return (lighter + 0.05) / (darker + 0.05);
}

const checks = [
  ['primary text / canvas', 'color-text', 'color-canvas', 4.5],
  ['secondary text / canvas', 'color-text-secondary', 'color-canvas', 4.5],
  ['muted text / canvas', 'color-text-muted', 'color-canvas', 4.5],
  ['primary text / surface', 'color-text', 'color-surface', 4.5],
  ['muted text / surface', 'color-text-muted', 'color-surface', 4.5],
  ['brand link text / canvas', 'color-brand', 'color-canvas', 4.5],
  ['brand link text / surface', 'color-brand', 'color-surface', 4.5],
  ['brand button text / brand', 'color-text-inverse', 'color-brand', 4.5],
  ['inverse text / danger', 'color-text-inverse', 'color-danger', 4.5],
  ['inverse text / danger hover', 'color-text-inverse', 'color-danger-hover', 4.5],
  ['inverse text / danger pressed', 'color-text-inverse', 'color-danger-pressed', 4.5],
  ['danger / danger subtle', 'color-danger', 'color-danger-subtle', 4.5],
  ['success / success subtle', 'color-success', 'color-success-subtle', 4.5],
  ['warning / warning subtle', 'color-warning', 'color-warning-subtle', 4.5],
  ['info / info subtle', 'color-info', 'color-info-subtle', 4.5],
  ['focus / surface', 'color-focus', 'color-surface', 3],
  ['focus / canvas', 'color-focus', 'color-canvas', 3],
  ['disabled foreground / disabled background', 'color-disabled-fg', 'color-disabled-bg', 3],
];

let failed = false;
for (const [label, foregroundName, backgroundName, minimum] of checks) {
  const ratio = contrast(resolveToken(foregroundName), resolveToken(backgroundName));
  console.log(`${label}: ${ratio.toFixed(2)}:1 (minimum ${minimum}:1)`);
  if (ratio < minimum) failed = true;
}

if (failed) process.exitCode = 1;
