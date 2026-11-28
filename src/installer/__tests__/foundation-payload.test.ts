import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { once } from 'node:events';
import { spawnFixture } from '../../daemon/tools/__tests__/_proc.js';
import { archiveFixture, node22Fixture } from './_runtime-fixture.js';
import { ownedRuntimeHome } from './_owned-runtime-home.js';

// This real 55k-file ZIP/extraction/native probe took 425–452s in prior
// concurrent sweeps. Keep finite headroom for durable filesystem work.
test('assemble actual complete foundation payload only after all entrypoints exist', { timeout: 900_000 }, async t => {
  const capture = await ownedRuntimeHome('insrc-foundation-payload-'), root = capture.root;
  const runtimeCapture = await ownedRuntimeHome('ipf-');
  let runtime: Awaited<ReturnType<typeof node22Fixture>> | undefined;
  let complete = false;
  t.diagnostic(`Payload fixture evidence: ${root}`);
  try {
    runtime = await node22Fixture();
    const archive = await archiveFixture();
    const child = capture.trackChild(spawnFixture(runtime.executable, [fileURLToPath(new URL('./foundation-payload-fixture.mjs', import.meta.url)), fileURLToPath(new URL('../../../', import.meta.url)), root, archive, runtimeCapture.root], { stdio: ['ignore', 'pipe', 'pipe'] })); runtimeCapture.trackChild(child);
    let diagnostic = ''; child.stderr!.on('data', chunk => { diagnostic = (diagnostic + String(chunk)).slice(-32_768); }); child.stdout!.resume();
    const outcome = await once(child, 'close'); t.diagnostic(diagnostic);
    assert.deepEqual(outcome, [0, null], diagnostic);
    t.signal.throwIfAborted();
    const result = JSON.parse(readFileSync(join(root, 'result.json'), 'utf8'));
    t.diagnostic(JSON.stringify(result));
    assert.equal(result.publication, 'fixture'); assert.equal(result.consumerExtraction, 'passed'); assert.equal(result.nativeProbe, 'passed'); assert.equal(result.managerAndTerminalBundled, true);
    assert.equal(result.runtimeOutsidePayload, true); assert.equal(result.descriptorFormat, 2);
    assert.equal(result.actorClosure.confirmedClosed, true); assert.equal(result.actorClosure.closureMode, 'owned-groups');
    assert.deepEqual(result.actorClosure.cancellationErrors, []); assert.deepEqual(result.actorClosure.evidenceErrors, []);
    assert.ok(result.files > 1000); assert.ok(result.payloadBytes > 10 * 1024 * 1024);
    complete = true;
  } finally {
    if (complete) { await capture.cleanup(); await runtimeCapture.cleanup(); runtime?.cleanup(); }
    else {
      for (const owned of [capture, runtimeCapture]) {
        owned.retain('Failed payload fixture evidence and actor state require investigation');
        try { await owned.cleanup(); } catch (cause) { t.diagnostic(String(cause)); }
      }
      t.diagnostic(`Failed payload fixture retained at ${root}; runtime home at ${runtimeCapture.root}; runtime executable at ${runtime?.executable ?? 'not allocated'}`);
    }
  }
});
