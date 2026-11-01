import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { readFileSync, readdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
const root = fileURLToPath(new URL('../../', import.meta.url));
test('public-v1-types-and-emitted-boundary', () => {
  const output = mkdtempSync(join(tmpdir(), 'memory-contract-'));
  try {
  execFileSync(process.execPath, [fileURLToPath(new URL('../../../../node_modules/typescript/bin/tsc', import.meta.url)), '-p', root + 'tsconfig.json', '--outDir', output], { stdio: 'pipe' });
  writeFileSync(join(output, 'consumer.mts'), readFileSync(root + 'src/__tests__/fixtures/public-consumer.mts', 'utf8').replaceAll('@insrc/project-memory', './index.js'));
  execFileSync(process.execPath, [fileURLToPath(new URL('../../../../node_modules/typescript/bin/tsc', import.meta.url)), '--noEmit', '--strict', '--exactOptionalPropertyTypes', '--module', 'nodenext', '--target', 'es2022', '--skipLibCheck', join(output, 'consumer.mts')], { stdio: 'pipe' });
  for (const name of readdirSync(output).filter(n => n.endsWith('.js') || n.endsWith('.d.ts'))) {
    const source = readFileSync(output + '/' + name, 'utf8');
    assert.doesNotMatch(source, /(?:from|import\()\s*['"](?:@insrc\/backend|\.\.\/)/);
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
