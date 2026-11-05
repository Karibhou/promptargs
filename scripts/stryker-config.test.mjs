import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { chmodSync, mkdirSync, mkdtempSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';

// `npm run test:mutation` runs the suite inside a Stryker sandbox copy of the
// tree, and two things about that copy differ from a git checkout in ways the
// suite notices. Stryker rewrites every .js/.ts file it copies (prepending
// `// @ts-nocheck`), so a copied .test-scratch/ui-inline/ file no longer
// matches what ui-harness.test.ts expects to have written; and the rewrite
// creates files with default modes, so dist/cli.js loses the exec bit git
// tracks and package.test.ts finds the packed bin non-executable. Either one
// fails the initial dry run and Stryker aborts before testing a single mutant.
// Pin the sandbox settings that keep the suite green.

const root = new URL('../', import.meta.url);
const config = JSON.parse(readFileSync(new URL('stryker.config.json', root), 'utf8'));

test('stryker never copies the test harness scratch files into the sandbox', () => {
  assert.ok(
    (config.ignorePatterns ?? []).includes('.test-scratch'),
    'ignorePatterns must list .test-scratch: Stryker rewrites copied .js files and the harness self-test then reads back altered content',
  );
});

test('stryker restores bin modes after building and before running the suite', () => {
  assert.match(config.commandRunner?.command ?? '', /npm run build\s*&&\s*node scripts\/restore-bin-mode\.mjs\s*&&\s*npm test/);
});

test('the restoration script makes every bin target executable without changing other permissions', { skip: process.platform === 'win32' }, () => {
  const dir = mkdtempSync(join(tmpdir(), 'promptargs-bin-mode-'));
  try {
    const pkg = JSON.parse(readFileSync(new URL('package.json', root), 'utf8'));
    const targets = typeof pkg.bin === 'string' ? [pkg.bin] : Object.values(pkg.bin);
    const bins = Object.fromEntries([...targets, 'dist/another-bin.js'].map((target, index) => [`bin${index}`, target]));
    writeFileSync(join(dir, 'package.json'), JSON.stringify({ bin: bins }));
    for (const target of Object.values(bins)) {
      const file = join(dir, target);
      mkdirSync(dirname(file), { recursive: true });
      writeFileSync(file, '');
      chmodSync(file, 0o640);
    }

    const result = spawnSync(process.execPath, [fileURLToPath(new URL('scripts/restore-bin-mode.mjs', root))], {
      cwd: dir, encoding: 'utf8', timeout: 30_000,
    });
    assert.equal(result.status, 0, String(result.error ?? result.stderr));
    for (const target of Object.values(bins)) {
      assert.equal(statSync(join(dir, target)).mode & 0o777, 0o751, target);
    }
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('stryker runs the suite without the coverage gate so only assertions kill mutants', () => {
  assert.match(config.commandRunner?.command ?? '', /npm test -- --no-coverage/);
});
