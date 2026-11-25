import assert from 'node:assert/strict';
import childProcess from 'node:child_process';
import { syncBuiltinESMExports } from 'node:module';

/** Detection and terminal advice have no subprocess authority. This covers the
 * exported process entrypoints, including named ESM imports after synchronization. */
export function forbidProcesses() {
  const methods = ['spawn', 'spawnSync', 'exec', 'execSync', 'execFile', 'execFileSync', 'fork'] as const;
  const originals = methods.map(name => childProcess[name]);
  const calls: string[] = [];
  for (const name of methods) Object.assign(childProcess, { [name]: () => { calls.push(name); throw new Error(`Unexpected subprocess: ${name}`); } });
  syncBuiltinESMExports();
  return { calls, restore() { methods.forEach((name, i) => Object.assign(childProcess, { [name]: originals[i] })); syncBuiltinESMExports(); },
    assertUnused() { assert.deepEqual(calls, [], 'no installer, authentication, model or coding CLI subprocess is permitted'); } };
}
