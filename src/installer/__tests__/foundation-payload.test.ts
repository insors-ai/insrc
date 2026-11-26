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

// This real 55k-file ZIP/extraction/native probe took 425–452s in prior
// concurrent sweeps. Keep finite headroom for durable filesystem work.
test('assemble actual complete foundation payload only after all entrypoints exist', { timeout: 900_000 }, async t => {
  const root = mkdtempSync(join(tmpdir(), 'insrc-foundation-payload-')), children: ChildProcess[] = [];
  const runtime = await node22Fixture();
  let complete = false;
  t.diagnostic(`Payload fixture evidence: ${root}`);
  try {
    const archive = await archiveFixture();
    const child = spawnFixture(runtime.executable, [fileURLToPath(new URL('./foundation-payload-fixture.mjs', import.meta.url)), fileURLToPath(new URL('../../../', import.meta.url)), root, archive], { stdio: ['ignore', 'pipe', 'pipe'] }); children.push(child);
    let diagnostic = ''; child.stderr!.on('data', chunk => { diagnostic = (diagnostic + String(chunk)).slice(-32_768); }); child.stdout!.resume();
    assert.deepEqual(await once(child, 'close'), [0, null], diagnostic);
    t.signal.throwIfAborted();
    t.diagnostic(diagnostic);
    const result = JSON.parse(readFileSync(join(root, 'result.json'), 'utf8'));
    t.diagnostic(JSON.stringify(result));
    assert.equal(result.publication, 'fixture'); assert.equal(result.consumerExtraction, 'passed'); assert.equal(result.nativeProbe, 'passed'); assert.equal(result.managerAndTerminalBundled, true);
    assert.equal(result.runtimeOutsidePayload, true); assert.equal(result.descriptorFormat, 2);
    assert.ok(result.files > 1000); assert.ok(result.payloadBytes > 10 * 1024 * 1024);
    complete = true;
  } finally {
    await stopOwnedChildren(children);
    if (complete) { runtime.cleanup(); rmSync(root, { recursive: true, force: true }); }
    else t.diagnostic(`Failed payload fixture retained at ${root}; runtime executable at ${runtime.executable}`);
  }
});
