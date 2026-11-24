import { createRun } from '../../../scripts/test-harness/context.mjs';
import { withRun } from '../../../scripts/test-harness/process.mjs';
import { bundleControlEntrypoint, assertCommittedSource } from '../../../scripts/package-installer.mjs';
import { copyFileSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import assert from 'node:assert/strict';
import { devNull } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
const [root, entry, output, mode] = process.argv.slice(2);
// Packaging resolves dev tools from its accepted root. Give this controlled
// fixture its own real esbuild binary, just as npm ci supplies in production.
if (mode !== 'source') {
  const relative = `node_modules/@esbuild/${process.platform}-${process.arch}/${process.platform === 'win32' ? 'esbuild.exe' : 'bin/esbuild'}`;
  const binary = join(root, relative); mkdirSync(dirname(binary), { recursive: true });
  copyFileSync(fileURLToPath(new URL(`../../../${relative}`, import.meta.url)), binary);
}
const run = createRun(root, { mode: 'build' });
await withRun(run, async scope => {
  if (mode === 'source') {
    const original = run.environment;
    run.environment = () => ({ ...original(), GIT_CONFIG_GLOBAL: devNull, GIT_CONFIG_NOSYSTEM: '1', GIT_AUTHOR_NAME: 'Fixture', GIT_AUTHOR_EMAIL: 'fixture@example.invalid', GIT_COMMITTER_NAME: 'Fixture', GIT_COMMITTER_EMAIL: 'fixture@example.invalid' });
    writeFileSync(join(root, 'tsconfig.json'), '{"compilerOptions":{}}');
    for (const args of [['init', '--quiet'], ['add', 'tsconfig.json'], ['-c', 'commit.gpgsign=false', 'commit', '-qm', 'fixture']]) {
      const result = await scope.start('git', args); assert.equal(result.code, 0, readFileSync(result.log, 'utf8'));
    }
    const head = await scope.start('git', ['rev-parse', 'HEAD']);
    const revision = readFileSync(head.log, 'utf8').trim();
    await assertCommittedSource(run, scope, revision);
    writeFileSync(join(root, 'tsconfig.json'), '{"compilerOptions":{"strict":false}}');
    await assert.rejects(assertCommittedSource(run, scope, revision), /source inputs are uncommitted/);
    return;
  }
  const meta = await bundleControlEntrypoint(run, scope, entry, output);
  assert.ok(Object.keys(meta.inputs).some(path => path.includes('yauzl')));
  const result = await scope.start(run.runtime.executable, [output]);
  assert.equal(result.code, 0, readFileSync(result.log, 'utf8'));
  assert.deepEqual(JSON.parse(readFileSync(result.log, 'utf8')), { version: '22.22.1', zip: 'function' });
});
process.stdout.write('bundle fixture passed\n');
