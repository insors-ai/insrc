import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { reviewPreparationLimits } from '../../../config/review.js';
import { ReviewMemoryBudget } from '../preparation-memory.js';
import { contextRoot, preparationDigest } from '../prepared-context.js';
import type { PreparedSourceIdentity, ReadyContextReceipt } from '../prepared-context.js';
import { PreparedViewWriter } from '../prepared-views.js';
import { ReviewPreparationCapacity } from '../source-session.js';
import { stageLifecycleRecord, StagedLifecycleView } from '../staged-lifecycle.js';
import type { StagedLifecycleAuthority } from '../staged-lifecycle.js';

async function fixture(t: { after(f: () => Promise<void>): void }) {
 const project = await mkdtemp('/tmp/staged-lifecycle-'); t.after(() => rm(project, { recursive: true, force: true }));
 const limits = { ...reviewPreparationLimits(join(project, 'missing.json')), memoryMaxBytes: 8 * 1024 * 1024, cacheMaxBytes: 96 * 1024 * 1024, batchMaxBytes: 65536 };
 const key = { project, family: 'design' as const, reviewId: 'lifecycle-test' }, digest = preparationDigest('lifecycle');
 const identity: PreparedSourceIdentity = { key, attempt: 4, inputDigest: digest, validatorVersion: 2, routeDigest: digest, sourceIdentity: digest, scopeDigest: digest, testDocumentDigest: digest };
 const memory = new ReviewMemoryBudget(limits.memoryMaxBytes), capacity = new ReviewPreparationCapacity(limits.cacheMaxBytes);
 const writer = await PreparedViewWriter.create(identity, limits, capacity, memory);
 const attempts = Array.from({ length: 14 }, (_, at) => ({
  header: { attempt: at + 1, status: at === 13 ? 'passed' : 'changes_requested', reviewer: at % 2 ? 'controller' : 'daemon' },
  submitted: { artifactPath: `docs/story-${at}.md`, packet: `${at}-🙂\r\n`.repeat(140000), pinned: { null: null, order: [3, 1, 2] } },
  actions: [{ actionId: `action-${at}`, kind: 'correct', validation: 'verified' }],
  'review-response': { summary: `summary-${at}`, feedback: `${at}-漢字`.repeat(180000), origins: [{ commit: `${at}`.padStart(40, '0'), path: `src/file-${at}.ts`, lines: [1, 9] }], failures: at % 3 ? [] : [{ code: 'technical', message: `failure-${at}` }] },
 }));
 const record = { schemaVersion: 3, project, reviewId: key.reviewId, submitted: { attempt: 1, artifactPath: 'docs/story.md' }, attempts,
  runtime: { runtimeId: 'runtime-fixture', state: 'terminal' }, context: { generationId: digest, manifestDigest: digest, historyBindingDigest: digest } };
 await stageLifecycleRecord(writer, 'history', record); const receipt = await writer.seal();
 assert.ok(Buffer.byteLength(JSON.stringify(record)) > limits.memoryMaxBytes, 'decoded fixture must exceed the working-memory budget');
 assert.equal(memory.snapshot().bytes, 0);
 return { project, limits, key, record, receipt, memory };
}

function authority(receipt: ReadyContextReceipt, options: { warm: boolean } = { warm: true }) {
 let borrows = 0, qualifications = 0, authorizations = 0, invalidations = 0, sourceCalls = 0, modelCalls = 0, revoked = false;
 const access: StagedLifecycleAuthority = {
  borrow: async () => { borrows++; return options.warm ? receipt : undefined; },
  qualify: async () => { qualifications++; sourceCalls++; return receipt; },
  authorize: async current => { authorizations++; assert.deepEqual(current, receipt); if (revoked) throw Error('authority revoked'); },
  invalidate: async (current, _error) => { invalidations++; assert.deepEqual(current, receipt); },
 };
 return { access, revoke: () => { revoked = true; }, counts: () => ({ borrows, qualifications, authorizations, invalidations, sourceCalls, modelCalls }) };
}

test('warm staged publication preserves every submitted feedback action failure and origin without source or model reconstruction', async t => {
 const f = await fixture(t), auth = authority(f.receipt), opened = await StagedLifecycleView.open(f.limits, f.memory, auth.access);
 assert.equal(opened.mode, 'warm'); const fragments: string[] = []; let persisted = false, progress = false;
 const result = await opened.view.publish('history', async emit => {
  await emit(fragment => { fragments.push(fragment); }); persisted = true; return { id: 'permanent-review' };
 }, async value => { assert.ok(persisted, 'result must be durable before progress'); assert.equal(value.id, 'permanent-review'); progress = true; });
 assert.equal(result.id, 'permanent-review'); assert.ok(progress); assert.deepEqual(JSON.parse(fragments.join('')), f.record);
 const counts = auth.counts(); assert.equal(counts.qualifications, 0); assert.equal(counts.sourceCalls, 0); assert.equal(counts.modelCalls, 0);
 assert.ok(f.memory.snapshot().highWaterBytes <= f.limits.memoryMaxBytes); opened.view.close(); assert.equal(f.memory.snapshot().bytes, 0);
});

test('cold staged recovery qualifies exactly once then traverses the complete history in bounded windows', async t => {
 const f = await fixture(t), auth = authority(f.receipt, { warm: false }), opened = await StagedLifecycleView.open(f.limits, f.memory, auth.access);
 assert.equal(opened.mode, 'cold'); let bytes = 0; await opened.view.writeJson('history', fragment => { bytes += Buffer.byteLength(fragment); });
 assert.ok(bytes > f.limits.memoryMaxBytes); const counts = auth.counts(); assert.equal(counts.borrows, 1); assert.equal(counts.qualifications, 1); assert.equal(counts.sourceCalls, 1); assert.equal(counts.modelCalls, 0);
 opened.view.close(); assert.equal(f.memory.snapshot().bytes, 0);
});

test('publication failure never advances progress and retry reuses the same authorized staged generation', async t => {
 const f = await fixture(t), auth = authority(f.receipt), { view } = await StagedLifecycleView.open(f.limits, f.memory, auth.access); let progress = 0;
 await assert.rejects(view.publish('history', async emit => { await emit(() => {}); throw Error('permanent store failed'); }, async () => { progress++; }), /permanent store failed/);
 assert.equal(progress, 0); let bytes = 0;
 await view.publish('history', emit => emit(fragment => { bytes += Buffer.byteLength(fragment); }).then(() => 'saved'), async () => { progress++; });
 assert.ok(bytes > f.limits.memoryMaxBytes); assert.equal(progress, 1); assert.equal(auth.counts().qualifications, 0); view.close();
});

test('cleanup traverses exact staged history then requires current authority and a durable claim before deletion', async t => {
 const f = await fixture(t), auth = authority(f.receipt), { view } = await StagedLifecycleView.open(f.limits, f.memory, auth.access), order: string[] = [];
 await assert.rejects(view.cleanup('history', {
  authorize: async digest => { assert.match(digest, /^[a-f0-9]{64}$/); order.push('authorize'); },
  claim: async () => { order.push('claim'); throw Error('claim fsync failed'); }, remove: async () => { order.push('remove'); },
 }), /claim fsync failed/);
 assert.deepEqual(order, ['authorize', 'claim']); order.length = 0;
 const result = await view.cleanup('history', {
  authorize: async () => { order.push('authorize'); }, claim: async digest => { order.push('claim'); return { digest }; },
  remove: async claim => { order.push('remove'); assert.match(claim.digest, /^[a-f0-9]{64}$/); return 'deleted'; },
 });
 assert.equal(result, 'deleted'); assert.deepEqual(order, ['authorize', 'claim', 'remove']); assert.equal(auth.counts().qualifications, 0); view.close();
});

test('cancellation during a publication fragment fences authority but retains the active window until its consumer settles', async t => {
 const f = await fixture(t), auth = authority(f.receipt), { view } = await StagedLifecycleView.open(f.limits, f.memory, auth.access);
 let entered!: () => void, release!: () => void;
 const waiting = new Promise<void>(resolve => { entered = resolve; }), barrier = new Promise<void>(resolve => { release = resolve; });
 const pending = view.writeJson('history', async fragment => { if (fragment.length > 10000) { entered(); await barrier; } });
 await waiting; const held = f.memory.snapshot().bytes; assert.ok(held > 0); view.cancel(); assert.throws(() => view.close(), /borrowed/); assert.equal(f.memory.snapshot().bytes, held);
 release(); await assert.rejects(pending, /fenced/); view.close(); assert.equal(f.memory.snapshot().bytes, 0);
});

test('old derived encoding and tampered reopen never gain authority or invoke cleanup deletion', async t => {
 const f = await fixture(t), path = join(contextRoot(f.key), f.receipt.generationId, 'manifest.json'), manifest = JSON.parse(await readFile(path, 'utf8'));
 await writeFile(path, JSON.stringify({ ...manifest, schemaVersion: 1, encoding: 'aggregate-json-v1' }));
 const auth = authority(f.receipt); await assert.rejects(StagedLifecycleView.open(f.limits, f.memory, auth.access), /Invalid|manifest|encoding/);
 const counts = auth.counts(); assert.equal(counts.qualifications, 0); assert.equal(counts.invalidations, 1); assert.equal(counts.sourceCalls, 0); assert.equal(counts.modelCalls, 0); assert.equal(f.memory.snapshot().bytes, 0);
});

test('revoked warm authority fences traversal without falling back to cold qualification', async t => {
 const f = await fixture(t), auth = authority(f.receipt), { view } = await StagedLifecycleView.open(f.limits, f.memory, auth.access);
 auth.revoke(); await assert.rejects(view.writeJson('history', () => {}), /authority revoked/);
 const counts = auth.counts(); assert.equal(counts.qualifications, 0); assert.equal(counts.invalidations, 1); assert.equal(counts.sourceCalls, 0); assert.equal(counts.modelCalls, 0);
 view.close(); assert.equal(f.memory.snapshot().bytes, 0);
});
