import { test } from 'node:test';
import assert from 'node:assert/strict';
import { once } from 'node:events';
import type { ChildProcess } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { completeNode22Fixture } from './_runtime-fixture.js';
import { spawnFixture, stopOwnedChildren } from '../../daemon/tools/__tests__/_proc.js';

/** Preserve production's exact runtime admission when the tracked gate uses host Node. */
export function privateRuntimeTest(file: string, title: string, run: () => Promise<void>): void {
  test(title, async () => {
    if (process.version === 'v22.22.1') return run();
    const runtime = await completeNode22Fixture(), children: ChildProcess[] = [];
    try {
      const child = spawnFixture(runtime.executable, ['--import', 'tsx', '--test', '--test-name-pattern', `^${title}$`, fileURLToPath(file)],
        { env: { ...process.env, NODE_OPTIONS: '', NODE_PATH: '', NODE_TEST_CONTEXT: undefined }, stdio: ['ignore', 'pipe', 'pipe'] });
      children.push(child); let output = '';
      for (const stream of [child.stdout!, child.stderr!]) stream.on('data', bytes => { output = (output + String(bytes)).slice(-32768); });
      assert.deepEqual(await once(child, 'close'), [0, null], output);
      assert.match(output, /^# pass 1$/m);
    } finally { await stopOwnedChildren(children); runtime.cleanup(); }
  });
}
