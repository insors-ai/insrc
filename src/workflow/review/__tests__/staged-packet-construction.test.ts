import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readdir, stat } from 'node:fs/promises';
import { join } from 'node:path';
import { fixture } from '../../code-review/task-review/__tests__/publication-fixture.js';
import { ReviewSourceSession, ReviewPreparationCapacity } from '../source-session.js';
import { reviewPreparationLimits, reviewJsonLimit } from '../../../config/review.js';
import { PreparedViewWriter } from '../prepared-views.js';
import { preparationDigest } from '../prepared-context.js';
import { StagedPacketSources } from '../staged-packet-sources.js';
import { StagedPacketConstruction } from '../staged-packet-construction.js';
import { prepareReviewPacket } from '../../code-review/task-review/packet.js';
import type { ReviewPacket } from '../../code-review/task-review/contracts.js';
import { prepareReviewAdmission } from '../../code-review/task-review/admission.js';
import { bindTaskFinalIdentities } from '../../code-review/task-review/attribution-binding.js';

test('maximum byte-bounded repeated history stages one packet window at a time', async t => {
 const f = await fixture(); t.after(() => f.cleanup());
 const packet = { ...f.packet, functionalSummary: 'scope '.repeat(10922) }, limit = reviewJsonLimit();
 const history = f.checkpoint('maximum-staged-history'); history.attempts = [];
 let size = Buffer.byteLength(JSON.stringify(history)), count = 0;
 // The protocol bounds bytes, not attempt count. Use maximum-sized summaries
 // so testing the actual configured byte boundary does not invent an ordinal cap.
 for (;;) {
  const entry = { ...f.checkpoint().attempts[0]!, header: { ...f.checkpoint().attempts[0]!.header, attempt: count + 1 }, submitted: packet };
  const bytes = Buffer.byteLength(JSON.stringify(entry)) + (count ? 1 : 0);
  if (size + bytes > limit) break;
  history.attempts.push(entry); size += bytes; count++;
 }
 assert.ok(count >= 4); assert.ok(size <= limit);
 assert.ok(size + Buffer.byteLength(JSON.stringify({ ...history.attempts[0], header: { ...history.attempts[0]!.header, attempt: count + 1 } })) + 1 > limit);
 const limits = reviewPreparationLimits('/tmp/absent-review-fixture-config'), capacity = new ReviewPreparationCapacity(limits.cacheMaxBytes);
 const session = await ReviewSourceSession.create({ project: f.repo, family: 'code', reviewId: history.reviewId }, f.deps.sources, limits, capacity), d = preparationDigest('maximum-staged-history');
 const writer = await PreparedViewWriter.create({ key: session.key, attempt: count, inputDigest: d, validatorVersion: 2, routeDigest: d, sourceIdentity: d, scopeDigest: d, testDocumentDigest: d }, limits, capacity, session.workingMemory, session);
 const sources = new StagedPacketSources(session, writer), construction = new StagedPacketConstruction(sources, writer);
 try {
  let physical: number | undefined;
  for (const entry of history.attempts) {
   const prepared = await construction.preparePacket(entry.submitted, sources, true);
   assert.equal(prepared.packet.functionalSummary, packet.functionalSummary);
   await construction.release(prepared);
   physical ??= session.snapshot().physicalQueries;
   assert.equal(session.snapshot().physicalQueries, physical);
  }
  assert.ok(session.workingMemory.snapshot().highWaterBytes <= limits.memoryMaxBytes);
 } finally { construction.close(); await writer.discard(); await session.close(); }
 assert.equal(session.workingMemory.snapshot().bytes, 0); assert.equal(capacity.bytes, 0);
});

test('one and four history windows retain complete feedback and reject invalid origins through shared admission', async t => {
 const f = await fixture(); t.after(() => f.cleanup());
 for (const count of [1, 4]) {
  const limits = reviewPreparationLimits('/tmp/absent-review-fixture-config'), capacity = new ReviewPreparationCapacity(limits.cacheMaxBytes);
  const id = `staged-admission-${count}`, history = f.checkpoint(id), first = history.attempts[0]!;
  history.attempts = Array.from({ length: count }, (_, index) => {
   const entry = structuredClone(first);
   entry.header.attempt = index + 1; entry.header.status = 'failed'; entry['review-response'].error = 'Fixture technical failure';
   if (index) entry['review-response'].origins = [{ taskId: 't1', sourceAttempt: 1, reason: 'Retained exact assessment' }];
   return entry;
  });
  const oracle = await prepareReviewPacket(f.packet, f.deps.sources, true);
  for (const entry of history.attempts.slice(1)) {
   entry.header.attributionState = 'pending'; delete entry.header.acceptedAttribution; delete entry.header.taskScopeIdentities; delete entry.header.attributionIdentity;
   await bindTaskFinalIdentities({ path: '', checkpoint: history, attempt: entry, prepared: oracle }, [{ taskId: 't1', changeIndexes: [0], testIndexes: [0], decision: { action: 'reassess', reason: 'New attempt after technical failure' } }]);
  }
  const session = await ReviewSourceSession.create({ project: f.repo, family: 'code', reviewId: id }, f.deps.sources, limits, capacity), d = preparationDigest(id);
  const writer = await PreparedViewWriter.create({ key: session.key, attempt: count + 1, inputDigest: d, validatorVersion: 2, routeDigest: d, sourceIdentity: d, scopeDigest: d, testDocumentDigest: d }, limits, capacity, session.workingMemory, session);
  const sources = new StagedPacketSources(session, writer), construction = new StagedPacketConstruction(sources, writer);
  try {
   const review = await prepareReviewAdmission(f.repo, id, count + 1, f.packet, 'daemon', sources, construction.context({ qualifiedHistory: history }));
   assert.deepEqual(review.checkpoint.attempts.slice(0, count), history.attempts);
   assert.equal(review.priorTaskInputs?.size, count);
   await construction.release(review.prepared);
   if (count > 1) {
    history.attempts.at(-1)!['review-response'].origins![0]!.sourceAttempt = 99;
    await assert.rejects(prepareReviewAdmission(f.repo, id, count + 1, f.packet, 'daemon', sources, construction.context({ qualifiedHistory: history })), /Origin must reference an earlier attempt/);
   }
  } finally { construction.close(); await writer.discard(); await session.close(); }
  assert.equal(session.workingMemory.snapshot().bytes, 0); assert.equal(capacity.bytes, 0);
 }
});

test('a packet larger than memory stages selected source bodies under one shared cap without binary JSON', async t => {
 const f = await fixture(); t.after(() => f.cleanup());
 const files: { path: string; segments: { after: [number, number] }[] }[] = [];
 for (let i = 0; i < 16; i++) {
  const path = `large-${i}.txt`, lines: string[] = [];
  for (let row = 0; row < 12288; row++) lines.push(createHash('sha256').update(`${i}:${row}`).digest('hex').slice(0, 63));
  f.put(path, `before ${i}\n${lines.join('\n')}\n`); files.push({ path, segments: [{ after: [1, 1] }] });
 }
 f.git('add', '.'); f.git('commit', '-qm', 'large base'); const parent = f.git('rev-parse', 'HEAD');
 for (const [i, file] of files.entries()) {
  // Preserve all unchanged lines so the unchanged-gap validator must inspect
  // them, while the selected review interval remains one exact after line.
  const { readFile } = await import('node:fs/promises');
  const content = await readFile(join(f.repo, file.path), 'utf8');
  f.put(file.path, content.replace(`before ${i}\n`, `after ${i}\n`));
 }
 f.git('add', '.'); f.git('commit', '-qm', 'large selected'); const commit = f.git('rev-parse', 'HEAD');
 const packet: ReviewPacket = { ...f.packet, reviewRevision: commit, reviewSet: [{ commit, parent, files }] };
 const limits = { ...reviewPreparationLimits('/tmp/absent-review-fixture-config'), memoryMaxBytes: 40 * 1024 * 1024, cacheMaxBytes: 192 * 1024 * 1024 };
 const capacity = new ReviewPreparationCapacity(limits.cacheMaxBytes);
 const session = await ReviewSourceSession.create({ project: f.repo, family: 'code', reviewId: 'large-staged-packet' }, f.deps.sources, limits, capacity);
 const d = preparationDigest('large-staged-packet');
 const writer = await PreparedViewWriter.create({ key: session.key, attempt: 1, inputDigest: d, validatorVersion: 2, routeDigest: d, sourceIdentity: d, scopeDigest: d, testDocumentDigest: d }, limits, capacity, session.workingMemory, session);
 const adapter = new StagedPacketSources(session, writer), construction = new StagedPacketConstruction(adapter, writer);
 let projection: string | undefined;
 const stringify = JSON.stringify;
 JSON.stringify = ((value: unknown, ...args: unknown[]) => {
  const reject = (v: unknown): void => {
   if (v instanceof Uint8Array) throw new Error('Binary JSON materialization');
   if (v && typeof v === 'object') for (const key of Object.keys(v)) reject(Reflect.get(v, key));
  };
  reject(value); return (stringify as (...a: unknown[]) => string | undefined)(value, ...args);
 }) as typeof JSON.stringify;
 try {
  const prepared = await construction.preparePacket(packet, adapter, true);
  projection = prepared.projection?.identity;
  assert.equal(prepared.changes.length, files.length);
  assert.ok(prepared.changes.every(change => change.after === null || !('bytes' in change.after)));
  await construction.release(prepared);
  const physical = session.snapshot().physicalQueries;
  for (let round = 0; round < 4; round++) {
   const repeated = await construction.preparePacket(packet, adapter, true);
   assert.equal(repeated.projection?.identity, projection); await construction.release(repeated);
  }
  assert.equal(session.snapshot().physicalQueries, physical);
  const evidence = await session.evidence();
  let sourceBytes = 0; try { for (const entry of evidence) sourceBytes += entry.bytes; } finally { session.releaseResult(evidence); }
  let viewBytes = 0; for (const name of await readdir(writer.directory)) viewBytes += (await stat(join(writer.directory, name))).size;
  assert.ok(sourceBytes + viewBytes > limits.memoryMaxBytes, `staged content ${sourceBytes + viewBytes} must exceed memory ${limits.memoryMaxBytes}`);
  assert.ok(session.workingMemory.snapshot().highWaterBytes <= limits.memoryMaxBytes);
 } finally {
  JSON.stringify = stringify; construction.close(); await writer.discard(); await session.close();
 }
 assert.equal(session.workingMemory.snapshot().bytes, 0); assert.equal(capacity.bytes, 0);
 const oracle = await prepareReviewPacket(packet, f.deps.sources, true);
 assert.equal(projection, oracle.projection?.identity);
});
