import { readFile, readdir } from 'node:fs/promises';
import path from 'node:path';

const sourceRoot = path.resolve('apps/web/src');
const tokenFile = path.join(sourceRoot, 'styles', 'tokens.css');
const colorLiteral = /#[\da-f]{3,8}\b|\brgba?\([^)]*\)|\bhsla?\([^)]*\)/giu;

async function cssFiles(directory) {
  const entries = await readdir(directory, { withFileTypes: true });
  const nested = await Promise.all(
    entries.map((entry) => {
      const absolute = path.join(directory, entry.name);
      if (entry.isDirectory()) return cssFiles(absolute);
      return entry.isFile() && entry.name.endsWith('.css') ? [absolute] : [];
    }),
  );
  return nested.flat();
}

const violations = [];
for (const file of await cssFiles(sourceRoot)) {
  if (file === tokenFile) continue;
  const contents = await readFile(file, 'utf8');
  for (const match of contents.matchAll(colorLiteral)) {
    const line = contents.slice(0, match.index).split('\n').length;
    violations.push(`${path.relative(process.cwd(), file)}:${line} ${match[0]}`);
  }
}

if (violations.length > 0) {
  console.error('Raw color literals must be defined in apps/web/src/styles/tokens.css only:');
  console.error(violations.join('\n'));
  process.exitCode = 1;
} else {
  console.log('Web CSS color tokens: passed');
}
