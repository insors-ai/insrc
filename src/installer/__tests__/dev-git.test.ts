import { test } from 'node:test';
import type { TestContext } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, realpathSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { once } from 'node:events';
import type { ChildProcess } from 'node:child_process';
import { node22Fixture } from './_runtime-fixture.js';
import { spawnFixture, stopOwnedChildren } from '../../daemon/tools/__tests__/_proc.js';
async function scenario(name: string, t: TestContext): Promise<void> {
  const root = mkdtempSync(join(realpathSync(tmpdir()), 'insrc-dev-git-')), node = await node22Fixture(), children: ChildProcess[] = [];
  let complete = false;
  t.diagnostic(`Dev Git fixture evidence (${name}): ${root}; runtime executable: ${node.executable}`);
  try {
    const child = spawnFixture(node.executable, [realpathSync('src/installer/__tests__/dev-git-fixture.mjs'), root, name], { env: { ...process.env, NODE_OPTIONS: '', NODE_PATH: '' }, stdio: ['ignore', 'pipe', 'pipe'] });
    children.push(child); let output = '';
    child.stdout!.on('data', value => { output += String(value); }); child.stderr!.on('data', value => { output += String(value); });
    assert.equal((await once(child, 'close'))[0], 0, output);
    t.signal.throwIfAborted();
    complete = true;
  } finally {
    await stopOwnedChildren(children);
    if (complete) { node.cleanup(); rmSync(root, { recursive: true, force: true }); }
    else t.diagnostic(`Failed Dev Git fixture retained at ${root}; runtime executable: ${node.executable}`);
  }
}
test('selected-repo-branch-exact-commit-and-unrelated-branch-never-selected', async t => { await scenario('exact', t); });
test('dirty-conflicting-missing-or-foreign-selected-checkout-preserved', async t => { await scenario('preserve', t); });
test('read-only-dev-check-never-fetches-builds-or-writes-install-state', async t => { await scenario('readonly', t); });
test('offer-moves-before-acceptance-is-stale-after-acceptance-remains-pinned', async t => { await scenario('pinned', t); });
