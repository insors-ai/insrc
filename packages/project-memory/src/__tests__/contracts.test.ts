import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { readFileSync, readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
const root = fileURLToPath(new URL('../../', import.meta.url));
test('public-v1-types-and-emitted-boundary', () => {
  execFileSync(process.execPath, [fileURLToPath(new URL('../../../../node_modules/typescript/bin/tsc', import.meta.url)), '-p', root + 'tsconfig.json'], { stdio: 'pipe' });
  execFileSync(process.execPath, [fileURLToPath(new URL('../../../../node_modules/typescript/bin/tsc', import.meta.url)), '--noEmit', '--strict', '--exactOptionalPropertyTypes', '--module', 'nodenext', '--target', 'es2022', '--skipLibCheck', root + 'src/__tests__/fixtures/public-consumer.mts'], { stdio: 'pipe' });
  for (const name of readdirSync(root + 'dist').filter(n => n.endsWith('.js') || n.endsWith('.d.ts'))) {
    const source = readFileSync(root + 'dist/' + name, 'utf8');
    assert.doesNotMatch(source, /(?:from|import\()\s*['"](?:@insrc\/backend|\.\.\/)/);
  }
  const source = readFileSync(root + 'dist/types.d.ts', 'utf8');
  assert.match(source, /sessionId\?: string \| undefined/);
});
test('pure-public-import-without-native-or-daemon', () => {
  const entry = new URL('../../dist/index.js', import.meta.url).href;
  const script = `const before = process.eventNames().map(String).sort(); const m = await import(${JSON.stringify(entry)}); if(typeof m.MemoryFactory.open !== 'function') throw Error('missing factory'); if(JSON.stringify(before)!==JSON.stringify(process.eventNames().map(String).sort())) throw Error('global handler installed');`;
  execFileSync(process.execPath, ['--input-type=module', '-e', script], { timeout: 10_000, env: { ...process.env, INSRC_HOME: '/must-not-read-insrc' }, stdio: 'pipe' });
});
