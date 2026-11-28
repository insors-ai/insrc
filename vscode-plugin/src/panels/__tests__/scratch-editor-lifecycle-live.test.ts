import { test } from 'node:test';
import assert from 'node:assert/strict';
import { writeFile } from 'node:fs/promises';
import { nativeScratchRun } from './fixtures/scratch-native-runner.js';

test('scratch real VS Code lifecycle multipane second-window conflicts and delayed-close restart recovery', { skip: process.env['INSRC_NATIVE_LIFECYCLE_TESTS'] !== '1', timeout: 420000 }, async () => {
  assert.equal(process.env['INSRC_NATIVE_PRIVATE_DISPLAY'], '1', 'Use a private display for automated native input');
  assert.ok(process.env['DISPLAY'] || process.platform !== 'linux', 'Native qualification needs a display');
  const h = await nativeScratchRun('./scratch-editor-lifecycle-host.ts');
  const results: unknown[] = [];
  try {
    // Native child processes have separate user-data dirs and document models.
    const peer = h.launch('peer'); const main = await h.launch('main'); results.push(main);
    await writeFile(`${h.root}/peer-done`, 'done'); results.push(await peer);
    if (main.passed) results.push(await h.launch('reload'));
    if (process.env['INSRC_NATIVE_EVIDENCE']) await writeFile(process.env['INSRC_NATIVE_EVIDENCE'], JSON.stringify(results, null, 2));
    for (const result of results as {passed:boolean;exitCode:number;timedOut:boolean;role:string;intentionalRestartCrash?:boolean}[]) { assert.equal(result.passed, true, JSON.stringify(result)); assert.ok(result.exitCode === 0 || result.role === 'main' && result.exitCode === -1 && result.intentionalRestartCrash === true, JSON.stringify(result)); assert.equal(result.timedOut, false); }
    assert.equal(results.length, 3, 'Actual native process restart is mandatory');
  } finally { await h.dispose(); }
});
