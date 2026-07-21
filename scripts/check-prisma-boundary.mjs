import { execFileSync } from 'node:child_process';
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

const repoRoot = join(fileURLToPath(new URL('.', import.meta.url)), '..');
const failures = [];

const prismaPackages = new Set(['prisma', '@prisma/client']);
const forbiddenImportPattern =
  /(?:from\s+['"]|import\s*\(\s*['"]|require\(\s*['"])([^'"]*(?:@prisma\/client|apps\/api|apps\\api|@hire-me\/api|api\/prisma\/generated|api\\prisma\\generated|api\/src\/persistence|api\\src\\persistence|prisma\/generated\/client|prisma\\generated\\client)[^'"]*)['"]/;

function repoPath(path) {
  return relative(repoRoot, path).split(sep).join('/');
}

function readJson(path) {
  return JSON.parse(readFileSync(path, 'utf8'));
}

function walk(dir, files = []) {
  for (const entry of readdirSync(dir)) {
    if (
      ['.git', 'node_modules', 'dist', '.turbo', 'coverage', '.tmp-runtime', 'generated'].includes(
        entry,
      )
    ) {
      continue;
    }

    const path = join(dir, entry);
    const stats = statSync(path);

    if (stats.isDirectory()) {
      walk(path, files);
    } else {
      files.push(path);
    }
  }

  return files;
}

function assert(condition, message) {
  if (!condition) {
    failures.push(message);
  }
}

const apiPackage = readJson(join(repoRoot, 'apps/api/package.json'));
const packageManifests = walk(repoRoot)
  .filter((file) => file.endsWith('package.json'))
  .map((file) => [repoPath(file), readJson(file)]);

for (const [name, manifest] of packageManifests) {
  if (name === 'apps/api/package.json') {
    continue;
  }

  for (const section of [
    'dependencies',
    'devDependencies',
    'peerDependencies',
    'optionalDependencies',
  ]) {
    const dependencies = manifest[section] ?? {};
    for (const packageName of prismaPackages) {
      assert(
        !Object.prototype.hasOwnProperty.call(dependencies, packageName),
        `${name} must not declare ${packageName} in ${section}.`,
      );
    }
  }
}

assert(
  Object.prototype.hasOwnProperty.call(apiPackage.dependencies ?? {}, '@prisma/client'),
  'apps/api/package.json must own @prisma/client as an API dependency.',
);
assert(
  Object.prototype.hasOwnProperty.call(apiPackage.devDependencies ?? {}, 'prisma'),
  'apps/api/package.json must own prisma as an API devDependency.',
);

const schemaFiles = walk(repoRoot).filter((file) => file.endsWith('schema.prisma'));
assert(
  schemaFiles.length === 1 && repoPath(schemaFiles[0]) === 'apps/api/prisma/schema.prisma',
  `Expected exactly one Prisma schema at apps/api/prisma/schema.prisma; found ${schemaFiles.map(repoPath).join(', ') || 'none'}.`,
);

const schema = readFileSync(join(repoRoot, 'apps/api/prisma/schema.prisma'), 'utf8');
assert(
  /generator\s+client\s*{[\s\S]*provider\s*=\s*"prisma-client-js"[\s\S]*output\s*=\s*"\.\/generated\/client"[\s\S]*}/.test(
    schema,
  ),
  'Prisma generator must use provider prisma-client-js with explicit output "./generated/client".',
);
assert(
  (schema.match(/generator\s+client\s*{/g) ?? []).length === 1,
  'Expected exactly one Prisma client generator.',
);

const boundaryPath = join(repoRoot, 'apps/api/src/persistence/prisma/generated-client.ts');
assert(
  existsSync(boundaryPath),
  'API Prisma generated-client boundary is missing at apps/api/src/persistence/prisma/generated-client.ts.',
);

for (const root of ['apps/web', 'packages/contracts']) {
  for (const file of walk(join(repoRoot, root))) {
    if (!/\.(?:ts|tsx|js|jsx|mjs|cjs|json)$/.test(file)) {
      continue;
    }

    const content = readFileSync(file, 'utf8');
    const match = content.match(forbiddenImportPattern);
    assert(
      !match,
      `${repoPath(file)} must not import API persistence or Prisma (${match?.[1] ?? ''}).`,
    );
  }
}

for (const root of ['apps/api/src', 'apps/api/test', 'apps/api/prisma']) {
  for (const file of walk(join(repoRoot, root))) {
    if (!/\.(?:ts|tsx|js|jsx|mjs|cjs)$/.test(file)) {
      continue;
    }

    const relativeFile = repoPath(file);
    const content = readFileSync(file, 'utf8');

    if (relativeFile === 'apps/api/src/persistence/prisma/generated-client.ts') {
      assert(
        content.includes('../../../prisma/generated/client/index.js'),
        'API generated-client boundary must import the explicit generated client output.',
      );
      continue;
    }

    assert(
      !content.includes('@prisma/client') && !content.includes('prisma/generated/client'),
      `${relativeFile} must import Prisma through apps/api/src/persistence/prisma/generated-client.ts.`,
    );

    if (
      relativeFile.startsWith('apps/api/src/') &&
      ![
        'apps/api/src/persistence/prisma/prisma.service.ts',
        'apps/api/src/auth/bootstrap-admin.ts',
      ].includes(relativeFile)
    ) {
      assert(
        !content.includes('new PrismaClient('),
        `${relativeFile} must use the Nest-managed PrismaService instead of instantiating PrismaClient.`,
      );
    }
  }
}

const committedGeneratedFiles = execFileSync('git', ['ls-files', 'apps/api/prisma/generated'], {
  cwd: repoRoot,
  encoding: 'utf8',
})
  .split(/\r?\n/)
  .filter(Boolean);

assert(
  committedGeneratedFiles.length === 0,
  `Generated Prisma client must not be committed; found ${committedGeneratedFiles.join(', ')}.`,
);

if (failures.length > 0) {
  console.error('Prisma boundary check failed:');
  for (const failure of failures) {
    console.error(`- ${failure}`);
  }
  process.exitCode = 1;
} else {
  console.log('Prisma boundary check passed.');
}
