import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { once } from 'node:events';
import type { ChildProcess } from 'node:child_process';
import { spawnFixture, stopOwnedChildren } from '../../daemon/tools/__tests__/_proc.js';
import { archiveFixture, node22Fixture } from './_runtime-fixture.js';

test('assemble actual complete foundation payload only after all entrypoints exist', { timeout: 480_000 }, async t => {
  const root = mkdtempSync(join(tmpdir(), 'insrc-foundation-payload-')), children: ChildProcess[] = [];
  const runtime = await node22Fixture();
  try {
    const archive = await archiveFixture();
    const child = spawnFixture(runtime.executable, [fileURLToPath(new URL('./foundation-payload-fixture.mjs', import.meta.url)), fileURLToPath(new URL('../../../', import.meta.url)), root, archive], { stdio: ['ignore', 'pipe', 'pipe'] }); children.push(child);
    let diagnostic = ''; child.stderr!.on('data', chunk => { diagnostic += String(chunk); }); child.stdout!.resume();
    assert.deepEqual(await once(child, 'close'), [0, null], diagnostic);
    const result = JSON.parse(readFileSync(join(root, 'result.json'), 'utf8'));
    t.diagnostic(JSON.stringify(result));
    assert.equal(result.publication, 'fixture'); assert.equal(result.consumerExtraction, 'passed'); assert.equal(result.nativeProbe, 'passed'); assert.equal(result.managerAndTerminalBundled, true);
    assert.equal(result.runtimeOutsidePayload, true); assert.equal(result.descriptorFormat, 2);
    assert.ok(result.files > 1000); assert.ok(result.payloadBytes > 10 * 1024 * 1024);
  } finally { await stopOwnedChildren(children); runtime.cleanup(); rmSync(root, { recursive: true, force: true }); }
});
