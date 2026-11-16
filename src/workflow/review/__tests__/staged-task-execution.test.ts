import test from 'node:test';
import assert from 'node:assert/strict';
import { fixture } from '../../code-review/task-review/__tests__/publication-fixture.js';
import { prepareReviewPacket, deriveTaskAssignments } from '../../code-review/task-review/packet.js';
import { assignmentPrompt } from '../../code-review/task-review/policy.js';
import { taskReferences, assessTaskResult } from '../../code-review/task-review/assessment.js';
import { CliProvider } from '../../../agent/providers/cli-provider.js';
import { ReviewSourceSession, ReviewPreparationCapacity } from '../source-session.js';
import { PreparedViewWriter, PreparedViewReader } from '../prepared-views.js';
import { StagedPacketSources } from '../staged-packet-sources.js';
import { StagedPacketConstruction } from '../staged-packet-construction.js';
import { StagedTaskExecution, stageExecutionTask } from '../staged-task-execution.js';
import { ReviewPromptWindow } from '../prompt-window.js';
import { preparationDigest } from '../prepared-context.js';
import { reviewPreparationLimits } from '../../../config/review.js';
import type { ActivityReviewSessionOpts, StructuredSchema } from '../../../shared/types.js';

async function setup(t: { after(fn: () => Promise<void>): void }, full: boolean) {
 const f = await fixture(full, full ? 2 : 1), limits = reviewPreparationLimits('/tmp/no-staged-execution-config'), capacity = new ReviewPreparationCapacity(limits.cacheMaxBytes);
 const parent = f.packet.reviewRevision!;
 f.put('second.js', 'export const other = 3;\n'); f.git('add', 'second.js'); f.git('commit', '-qm', 'second scoped module');
 const revision = f.git('rev-parse', 'HEAD'); f.packet.reviewRevision = revision;
 f.packet.reviewSet.push({ commit: revision, parent, files: [{ path: 'second.js', segments: [{ after: [1, 1] }] }] });
 const session = await ReviewSourceSession.create({ project: f.repo, family: 'code', reviewId: 'staged-execution' }, f.deps.sources, limits, capacity), d = preparationDigest('staged-execution');
 const writer = await PreparedViewWriter.create({ key: session.key, attempt: 1, validatorVersion: 2, inputDigest: d, routeDigest: d, sourceIdentity: d, scopeDigest: d, testDocumentDigest: d }, limits, capacity, session.workingMemory, session);
 const sources = new StagedPacketSources(session, writer), construction = new StagedPacketConstruction(sources, writer);
 const prepared = await construction.preparePacket(f.packet, sources);
 const assignments = deriveTaskAssignments(prepared, prepared.tasks.map(task => ({ taskId: task.id, changeIndexes: prepared.changes.map((_change, index) => index), testIndexes: [0] })));
 for (const assignment of assignments) await stageExecutionTask(writer, prepared, assignment);
 await construction.release(prepared); construction.close(); const receipt = await writer.seal();
 const reader = await PreparedViewReader.open(receipt, limits, session.workingMemory, async () => {}, async () => {});
 t.after(async () => { reader.close(); await session.close(); f.cleanup(); });
 return { f, reader, session, execution: new StagedTaskExecution(reader) };
}
const options = (extra: Partial<ActivityReviewSessionOpts> = {}): ActivityReviewSessionOpts => ({ mode: 'activity', cwd: '/tmp', inactivityMs: 1800000, signal: new AbortController().signal, internalRetry: false, onActivity: () => {}, onCandidate: async () => ({ accepted: true }), ...extra });

for (const full of [false, true]) test(`bounded ${full ? 'story' : 'task'} execution preserves all selected modules and mandatory coverage with charged CLI copies`, async t => {
 const { f, reader, execution } = await setup(t, full), oracle = await prepareReviewPacket(f.packet, f.deps.sources);
 const rows = deriveTaskAssignments(oracle, oracle.tasks.map(task => ({ taskId: task.id, changeIndexes: oracle.changes.map((_change, index) => index), testIndexes: [0] })));
 for (const row of rows) {
  let coverage = '';
  await execution.coverage(row.taskId, async (test, revision, bytes) => {
   assert.equal(test.file, 'test.js'); assert.equal(revision, f.packet.reviewRevision); coverage += Buffer.from(bytes).toString('utf8');
  });
  assert.match(coverage, /Assertion evidence/);
  const prompt = await execution.codePrompt(row.taskId, [], f.repo);
  assert.equal(prompt.prompt, assignmentPrompt(oracle, row, [], f.repo));
  assert.ok(prompt.prompt.includes('source.js')); assert.ok(prompt.prompt.includes('second.js'));
  assert.match(prompt.prompt, /test bodies\/assertions/); assert.match(prompt.prompt, /running integration checks, tests, typechecks or builds is OPTIONAL/);
  const before = reader.memory.snapshot().bytes, provider = new CliProvider({ kind: 'codex' });
  Reflect.set(provider, 'activityReview', async (input: string, _schema: StructuredSchema, opts: ActivityReviewSessionOpts) => {
   assert.equal(input, prompt.prompt); assert.ok(reader.memory.snapshot().bytes > before);
   assert.throws(() => prompt.release(), /provider still owns/); assert.equal(opts.signal.aborted, false);
   return { ...f.result, taskId: row.taskId };
  });
  const result = await execution.dispatch<{ taskId: string }>(provider, prompt, { type: 'object' }, options());
  assert.equal(result.taskId, row.taskId); assert.equal(reader.memory.snapshot().bytes, before);
  prompt.release();
 }
});

test('design path policy and transport stay borrowed until canceled CLI consumption settles', async t => {
 const { reader, execution } = await setup(t, false);
 const prompt = await ReviewPromptWindow.create(reader, 200, () => 'Review latest /project/LLD.md using requirements and coverage guidelines.');
 assert.match(prompt.prompt, /latest.*LLD.md/);
 const provider = new CliProvider({ kind: 'claude' }); let started!: () => void;
 const startedPromise = new Promise<void>(resolve => { started = resolve; });
 Reflect.set(provider, 'activityReview', async (_prompt: string, _schema: StructuredSchema, opts: ActivityReviewSessionOpts) => {
  started(); await new Promise<void>(resolve => opts.signal.addEventListener('abort', () => resolve(), { once: true }));
  throw new Error('fixture CLI canceled');
 });
 const pending = execution.dispatch(provider, prompt, { type: 'object' }, options());
 await startedPromise; const charged = reader.memory.snapshot().bytes; reader.cancel();
 assert.equal(reader.memory.snapshot().bytes, charged); assert.throws(() => prompt.release(), /provider still owns/);
 await assert.rejects(pending, /CLI canceled/); prompt.release();
});

test('revoked input refuses provider dispatch and assembly pressure refuses before invoking a builder', async t => {
 const { reader, execution } = await setup(t, false); let built = false, called = false;
 await assert.rejects(ReviewPromptWindow.create(reader, reader.memory.limit, () => { built = true; return 'bad'; }), /prompt assembly.*charged=.*requested=.*limit=/);
 assert.equal(built, false);
 const prompt = await ReviewPromptWindow.create(reader, 20, () => 'Read latest path'); reader.cancel();
 const provider = new CliProvider({ kind: 'codex' }); Reflect.set(provider, 'activityReview', async () => { called = true; });
 await assert.rejects(execution.dispatch(provider, prompt, { type: 'object' }, options()), /fenced/);
 assert.equal(called, false); prompt.release();
});

test('transport pressure and foreign-generation prompts refuse before CLI dispatch', async t => {
 const a = await setup(t, false), b = await setup(t, false);
 const prompt = await ReviewPromptWindow.create(a.reader, 20, () => 'Read latest path');
 const provider = new CliProvider({ kind: 'codex' }); let called = false;
 Reflect.set(provider, 'activityReview', async () => { called = true; });
 await assert.rejects(b.execution.dispatch(provider, prompt, { type: 'object' }, options()), /Foreign review prompt/);
 const pressure = a.reader.memory.reserve(a.reader.memory.limit - a.reader.memory.snapshot().bytes - 512, 'fixture transport pressure');
 try { await assert.rejects(a.execution.dispatch(provider, prompt, { type: 'object', description: 'x'.repeat(65536) }, options()), /CLI prompt\/schema transport.*charged=.*requested=.*limit=/); }
 finally { pressure.release(); prompt.release(); }
 assert.equal(called, false);
});

test('coverage cancellation retains the active leaf until its consumer returns', async t => {
 const { reader, execution } = await setup(t, false); let visited = false;
 await assert.rejects(execution.coverage('t1', async (_test, _revision, bytes) => {
  visited = true; const charged = reader.memory.snapshot().bytes; assert.ok(bytes.length > 0);
  reader.cancel(); assert.equal(reader.memory.snapshot().bytes, charged);
  assert.throws(() => reader.close(), /borrowed/);
 }), /fenced/);
 assert.equal(visited, true);
});

test('assessment evidence probes release owned committed bodies after reference resolution', async t => {
 const { f, reader, session } = await setup(t, false), prepared = await prepareReviewPacket(f.packet, f.deps.sources);
 const assignment = deriveTaskAssignments(prepared, [{ taskId: 't1', changeIndexes: [0, 1], testIndexes: [0] }])[0]!;
 await taskReferences(session, prepared, assignment); // retain newly discovered immutable query evidence once
 const before = reader.memory.snapshot().bytes;
 const references = await taskReferences(session, prepared, assignment);
 assert.ok(references.some(ref => ref.endsWith(':test.js')));
 assert.equal(reader.memory.snapshot().bytes, before);
 const result = await assessTaskResult(session, assignment, f.result, []);
 assert.equal(result.testCoverage.assessment, 'verified');
 assert.equal(reader.memory.snapshot().bytes, before);
});
