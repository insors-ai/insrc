import { createRun } from '../../../scripts/test-harness/context.mjs';
import { withRun } from '../../../scripts/test-harness/process.mjs';
import { bundleControlEntrypoint } from '../../../scripts/package-installer.mjs';
import { readFileSync } from 'node:fs';
import assert from 'node:assert/strict';
const [root, entry, output] = process.argv.slice(2);
const run = createRun(root, { mode: 'build' });
await withRun(run, async scope => {
  const meta = await bundleControlEntrypoint(run, scope, entry, output);
  assert.ok(Object.keys(meta.inputs).some(path => path.includes('yauzl')));
  const result = await scope.start(run.runtime.executable, [output]);
  assert.equal(result.code, 0, readFileSync(result.log, 'utf8'));
  assert.deepEqual(JSON.parse(readFileSync(result.log, 'utf8')), { version: '22.22.1', zip: 'function' });
});
process.stdout.write('bundle fixture passed\n');
