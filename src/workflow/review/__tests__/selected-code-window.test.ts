import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { PreparedViewReader, PreparedViewWriter } from '../prepared-views.js';
import { ReviewMemoryBudget } from '../preparation-memory.js';
import { ReviewPreparationCapacity } from '../source-session.js';
import { preparationDigest } from '../prepared-context.js';
import { reviewPreparationLimits } from '../../../config/review.js';
import { selectedCodeWindow } from '../selected-code-window.js';
import { selectedCode } from '../../code-review/task-review/packet.js';
import type { SelectedChange } from '../../code-review/task-review/packet.js';
import type { StagedPacketBlob } from '../staged-packet-sources.js';

async function setup(t: { after(fn: () => Promise<void>): void }, bytes: Uint8Array) {
 const project = await mkdtemp('/tmp/selected-code-window-'); t.after(() => rm(project, { recursive: true, force: true }));
 const limits = { ...reviewPreparationLimits(join(project, 'missing.json')), memoryMaxBytes: 16 * 1024 * 1024, batchMaxBytes: 32768 };
 const memory = new ReviewMemoryBudget(limits.memoryMaxBytes), capacity = new ReviewPreparationCapacity(limits.cacheMaxBytes), d = preparationDigest('selected-window');
 const writer = await PreparedViewWriter.create({ key: { project, family: 'design', reviewId: 'selected-window' }, attempt: 1, validatorVersion: 2, inputDigest: d, routeDigest: d, sourceIdentity: d, scopeDigest: d, testDocumentDigest: d }, limits, capacity, memory);
 const content = await writer.add('source', 'file', bytes); await writer.add('blob', 'view', { oid: 'blob', byteLength: bytes.length, commit: 'commit', path: 'source.ts', content });
 const receipt = await writer.seal(), readMemory = new ReviewMemoryBudget(1024 * 1024);
 const reader = await PreparedViewReader.open(receipt, { ...limits, memoryMaxBytes: readMemory.limit }, readMemory, async () => {}, async () => {});
 const metadata = await reader.metadata(await reader.descriptor('blob'));
 const blob = metadata.value as StagedPacketBlob;
 return { reader, blob, metadata, memory: readMemory };
}

test('selected-code windows match the original prompt blocks for Unicode BOM CRLF overlap and final newlines', async t => {
 for (const text of ['\ufefffirst\r\n漢字🙂\r\nlast', 'first\nsecond\n', 'first\nsecond', '', 'a'.repeat(32767) + '🙂\nlast']) {
  const bytes = new TextEncoder().encode(text), f = await setup(t, bytes);
  const segments: SelectedChange['segments'] = text ? [{ after: [1, 2] }, { after: [2, 2] }, { deletionAt: 0 }] : [{ deletionAt: 0 }];
  const metadata = { commit: 'commit', parent: null, path: 'source.ts', previousPath: 'source.ts', segments, limitations: [] };
  const expected = selectedCode({ ...metadata, before: null, after: { oid: 'blob', bytes } });
  const window = await selectedCodeWindow(f.reader, { ...metadata, before: null, after: f.blob });
  assert.deepEqual(window.value, expected);
  assert.throws(() => f.reader.close(), /borrowed/);
  window.release(); f.metadata.release(); f.reader.close(); assert.equal(f.memory.snapshot().bytes, 0);
 }
});

test('selected-code traversal handles a source above memory without hydrating its unselected body', async t => {
 const bytes = new TextEncoder().encode('outside\n'.repeat(250000) + 'SELECTED 🙂\n'), f = await setup(t, bytes);
 const window = await selectedCodeWindow(f.reader, { commit: 'commit', parent: null, path: 'source.ts', previousPath: 'source.ts', segments: [{ after: [250001, 250001] }], limitations: [], before: null, after: f.blob });
 assert.deepEqual(window.value.blocks, [{ lines: [250001, 250001], code: 'SELECTED 🙂\n' }]);
 assert.ok(bytes.byteLength > f.memory.limit); assert.ok(f.memory.snapshot().highWaterBytes <= f.memory.limit);
 const charged = f.memory.snapshot().bytes; f.reader.cancel();
 assert.throws(() => window.value, /fenced/); assert.equal(f.memory.snapshot().bytes, charged);
 window.release(); f.metadata.release(); f.reader.close(); assert.equal(f.memory.snapshot().bytes, 0);
});
