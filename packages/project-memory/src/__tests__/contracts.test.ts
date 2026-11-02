import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { readFileSync, readdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
const root = fileURLToPath(new URL('../../', import.meta.url));
test('public-v1-types-and-emitted-boundary', () => {
  const output = mkdtempSync(join(tmpdir(), 'memory-contract-'));
  try {
  execFileSync(process.execPath, [createRequire(import.meta.url).resolve('typescript/bin/tsc'), '-p', root + 'tsconfig.json', '--outDir', output], { stdio: 'pipe' });
  writeFileSync(join(output, 'consumer.mts'), readFileSync(root + 'src/__tests__/fixtures/public-consumer.mts', 'utf8').replaceAll('@insrc/project-memory', './index.js'));
  execFileSync(process.execPath, [createRequire(import.meta.url).resolve('typescript/bin/tsc'), '--noEmit', '--strict', '--exactOptionalPropertyTypes', '--module', 'nodenext', '--target', 'es2022', '--skipLibCheck', join(output, 'consumer.mts')], { stdio: 'pipe' });
  function emitted(directory: string): string[] {
    return readdirSync(directory, { withFileTypes: true }).flatMap(entry => entry.isDirectory() ? emitted(join(directory, entry.name)) : [join(directory, entry.name)]);
  }
  const sources = emitted(output).filter(n => !n.endsWith('/consumer.mjs') && (n.endsWith('.js') || n.endsWith('.d.ts')));
  assert.ok(sources.some(n => relative(output, n) === 'queue/file-queue.js'));
  for (const name of sources) {
    const source = readFileSync(name, 'utf8');
    for (const match of source.matchAll(/(?:from\s*|import\(\s*|require\(\s*)['"]([^'"]+)['"]/g)) {
      const specifier = match[1]!;
      assert.doesNotMatch(specifier, /@insrc\/backend|(?:^|\/)daemon\//);
      if (specifier.startsWith('.')) {
        const target = relative(output, resolve(dirname(name), specifier));
        assert.ok(target && !target.startsWith('..') && !target.startsWith('/'), name + ' escapes the package');
      } else assert.ok(specifier.startsWith('node:') || specifier === 'fs-ext', specifier);
    }
  }
  const source = readFileSync(output + '/types.d.ts', 'utf8');
  assert.match(source, /sessionId\?: string \| undefined/);
  } finally { rmSync(output, { recursive: true, force: true }); }
});
test('pure-public-import-without-native-or-daemon', () => {
  const entry = new URL('../../dist/index.js', import.meta.url).href;
  const script = `const before = process.eventNames().map(String).sort(); const m = await import(${JSON.stringify(entry)}); if(typeof m.MemoryFactory.open !== 'function') throw Error('missing factory'); if(JSON.stringify(before)!==JSON.stringify(process.eventNames().map(String).sort())) throw Error('global handler installed');`;
  execFileSync(process.execPath, ['--input-type=module', '-e', script], { timeout: 10_000, env: { ...process.env, INSRC_HOME: '/must-not-read-insrc' }, stdio: 'pipe' });
});
