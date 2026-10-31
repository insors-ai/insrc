/* Copyright (c) Procix Software India. Licensed under the MIT License. */
import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { LLMProvider, ReviewSessionOpts, StructuredSchema } from '../../../../shared/types.js';
import { TaskReviewCoordinator } from '../coordinator.js';
import type { ReviewPacket, ReviewCheckpoint, TaskReviewResult } from '../contracts.js';
import type { ReviewSources } from '../sources.js';
import { saveCheckpoint } from '../checkpoint.js';
import { prepareReviewPacket } from '../packet.js';
import { codeTaskCommands, assignmentPrompt } from '../policy.js';
import { deriveTaskAssignments } from '../packet.js';
import { claudeReviewSessionArgs, codexReviewSessionArgs, ReviewSessionTimeoutError } from '../../../../agent/providers/cli-provider.js';

const commit = 'a'.repeat(40), parent = 'b'.repeat(40), hash = '1234567890abcdef';
async function fixture(scoped = true) {
 const project = await mkdtemp(join(tmpdir(), 'task-review-execution-'));
 const tasks = ['S', 'M', 'L'].map((size, i) => ({ id: `t${i + 1}`, title: `Task ${i + 1}`, summary: 'Required behavior', size, order: i + 1, dependsOn: i ? [`t${i}`] : [], acceptanceChecks: ['Required behavior holds'], derivedFrom: ['c1'], tests: [{ level: 'unit', name: 'Behavior' }] }));
 const meta = { epicHash: hash, storyId: 's1' };
 const files: Record<string, string> = {
  'story.json': JSON.stringify({ meta: { ...meta, workflow: 'define' }, body: { stories: [{ id: 's1' }] } }),
  'lld.json': JSON.stringify({ meta: { ...meta, workflow: 'design.story' }, body: {} }),
  'plan.json': JSON.stringify({ meta: { ...meta, workflow: 'plan' }, body: { tasks }, citations: [{ id: 'c1', kind: 'stakeholder', ref: 'Fixture' }] }),
  'source.ts': 'new behavior\n', 'test.ts': 'assert behavior\n',
 };
 const sources: ReviewSources = { commit: async oid => oid === commit ? [parent] : [], file: async (oid, path) => files[path] === undefined ? null : ({ bytes: Buffer.from(oid === parent && path === 'source.ts' ? 'old behavior\n' : files[path]!), oid: 'c'.repeat(40) }), changedRanges: async () => [{ before: [1, 1], after: [1, 1] }] };
 const packet: ReviewPacket = { storyId: 's1', ...(scoped ? { taskId: 't1' } : {}), functionalSummary: 'Changed behavior', documents: { story: { commit, path: 'story.json' }, lld: { commit, path: 'lld.json' }, plan: { commit, path: 'plan.json' } }, reviewSet: [{ commit, parent, files: [{ path: 'source.ts', segments: [{ before: [1, 1], after: [1, 1] }] }] }], tests: [{ file: 'test.ts', cases: ['behavior'], command: 'node --test test.ts', result: 'pass', executionDetails: 'Builder-reported execution', evidenceReferences: [`${commit}:test.ts`] }] };
 const read = async (path: string): Promise<ReviewCheckpoint> => JSON.parse(await readFile(path, 'utf8')) as ReviewCheckpoint;
 return { project, sources, packet, read, cleanup: () => rm(project, { recursive: true, force: true }) };
}
const assessment = (taskId: string): TaskReviewResult => ({ taskId, status: 'passed', summary: 'Required behavior and relevant assertions inspected.', findings: [], testCoverage: { assessment: 'verified', explanation: 'Relevant test asserts the changed behavior; submitted execution is builder-reported.', evidenceReferences: [`${commit}:test.ts`] }, limitations: [], advice: [], inspectedReferences: [`${commit}:source.ts`, `${commit}:test.ts`], executedTests: [] });
function provider(run: (prompt: string, schema: StructuredSchema, opts: ReviewSessionOpts) => Promise<unknown>): LLMProvider {
 return { runReviewSession: run } as unknown as LLMProvider;
}

test('task review admission: short acknowledgement, initial atomic JSON and same-id exclusion', async () => {
 const f = await fixture();
 let release: ((value: unknown) => void) | undefined, calls = 0;
 const coordinator = new TaskReviewCoordinator({ sources: f.sources, provider: () => provider(async () => { calls++; return new Promise(resolve => { release = resolve; }); }) });
 try {
  const ack = await coordinator.start(f.project, 'admission', 1, f.packet);
  assert.equal(calls, 0, 'acknowledgement does not wait for or start the provider');
  const initial = await f.read(ack.path);
  assert.equal(initial.attempts[0]!.header.status, 'pending');
  assert.deepEqual(initial.attempts[0]!.submitted, f.packet);
  await assert.rejects(coordinator.start(f.project, 'admission', 1, f.packet), /already-running/);
  while (!release) await new Promise<void>(resolve => setImmediate(resolve));
  release(assessment('t1')); await coordinator.settled(f.project, 'admission');
  const complete = await f.read(ack.path);
  assert.equal(complete.attempts[0]!.header.status, 'passed');
  assert.equal(complete.attempts[0]!['review-response'].crPublication, 'pending');
  assert.equal(calls, 1);
  await assert.rejects(coordinator.start(f.project, 'admission', 1, f.packet), /attempt-conflict/);
 } finally { await f.cleanup(); }
});

test('task execution: checkpoint before next task, one size-based deadline, failure continuation and no automatic retry', async () => {
 const f = await fixture(false);
 let clock = 0, expire: (() => void) | undefined, current = '', calls = 0;
 const allowances: number[] = [], saved: ReviewCheckpoint[] = [];
 const coordinator = new TaskReviewCoordinator({ sources: f.sources, now: () => clock,
  timer: (callback, ms) => { allowances.push(ms); expire = callback; return () => {}; },
  save: async (path, record) => { await saveCheckpoint(path, record); saved.push(await f.read(path)); },
  provider: () => provider(async (prompt, _schema, opts) => {
   calls++; assert.equal(opts.internalRetry, false); assert.equal(opts.stallMs, opts.deadlineMs);
   if (prompt.startsWith('Derive task attribution')) { clock += 25; return { tasks: ['t1', 't2', 't3'].map(taskId => ({ taskId, changeIndexes: [0], testIndexes: [0] })) }; }
   current = /"taskId":"(t\d+)"/.exec(prompt)![1]!;
   const disk = saved.at(-1)!;
   assert.equal(disk.attempts[0]!['review-response'].tasks.length, Number(current.slice(1)) - 1, 'prior result durable before next provider');
   if (current === 't1') { assert.equal(opts.deadlineMs, 299975, 'attribution shares first task allowance'); throw new Error('Transport unavailable'); }
   if (current === 't2') { clock += 600000; expire!(); return new Promise(() => {}); }
   return assessment('t3');
  }) });
 try {
  const ack = await coordinator.start(f.project, 'continuation', 1, f.packet);
  await coordinator.settled(f.project, 'continuation');
  const complete = await f.read(ack.path), results = complete.attempts[0]!['review-response'].tasks;
  assert.deepEqual(allowances, [300000, 600000, 900000]);
  assert.deepEqual(results.map(r => r.status), ['failed', 'incomplete', 'passed']);
  assert.equal(complete.attempts[0]!.header.status, 'failed'); assert.equal(calls, 4, 'one attribution and exactly one call per task');
  assert.equal(saved.every(record => record.attempts.length === 1), true);
 } finally { await f.cleanup(); }
});

test('checkpoint write failure stops scheduling and retains the last complete JSON', async () => {
 const f = await fixture(false); let writes = 0, calls = 0;
 const coordinator = new TaskReviewCoordinator({ sources: f.sources, save: async (path, record) => { writes++; if (writes === 5) throw new Error('Disk full'); await saveCheckpoint(path, record); }, provider: () => provider(async prompt => {
  calls++; if (prompt.startsWith('Derive task attribution')) return { tasks: ['t1', 't2', 't3'].map(taskId => ({ taskId, changeIndexes: [0], testIndexes: [0] })) };
  return assessment(calls === 2 ? 't1' : 't2');
 }) });
 try {
  const ack = await coordinator.start(f.project, 'disk-failure', 1, f.packet); await coordinator.settled(f.project, 'disk-failure');
  const retained = await f.read(ack.path);
  assert.deepEqual(retained.attempts[0]!['review-response'].tasks.map(task => task.taskId), ['t1']); assert.equal(calls, 3, 'no third task after failed second result write');
 } finally { await f.cleanup(); }
});

test('code-task provider tools: committed reads, permitted target tests and unchanged design-review defaults', async () => {
 const f = await fixture();
 try {
  const prepared = await prepareReviewPacket(f.packet, f.sources), commands = codeTaskCommands(prepared);
  assert.ok(commands.includes(`git show ${commit}:source.ts`)); assert.ok(commands.includes(`git show ${parent}:source.ts`)); assert.ok(commands.includes('node --test test.ts'));
  const design = claudeReviewSessionArgs({}, []), code = claudeReviewSessionArgs({}, [], commands);
  assert.equal(design[design.indexOf('--tools') + 1], 'Read,Grep,Glob');
  assert.equal(code[code.indexOf('--tools') + 1], 'Read,Grep,Glob,Bash');
  const allowed = code[code.indexOf('--allowedTools') + 1]!;
  assert.ok(allowed.includes(`Bash(git show ${commit}:source.ts)`)); assert.ok(allowed.includes('Bash(node --test test.ts)'));
  assert.ok(!allowed.includes('Bash(*)')); assert.ok(!code.includes('--permission-mode'));
  assert.ok(codexReviewSessionArgs('schema', f.project, []).includes('read-only'), 'Codex retains its sandbox; unsupported writes stay unsupported');
  prepared.packet.tests[0]!.command = 'node --test test.ts; touch source.ts';
  assert.ok(!codeTaskCommands(prepared).some(c => c.includes(';')));
  const assignment = deriveTaskAssignments(prepared, [{ taskId: 't1', changeIndexes: [0], testIndexes: [0] }])[0]!;
  const prompt = assignmentPrompt(prepared, assignment, [`${commit}:source.ts`]);
  assert.ok(prompt.includes('"after":[1,1]'), 'selected ranges preserved'); assert.ok(!prompt.includes('"bytes"'), 'no raw source prepack');
  assert.ok(prompt.includes('unsupported')); assert.ok(prompt.includes('Builder-reported'));
 } finally { await f.cleanup(); }
});


test('native provider timeout is incomplete even when it returns just before the host timer', async () => {
 const f = await fixture();
 const coordinator = new TaskReviewCoordinator({ sources: f.sources, provider: () => provider(async () => { throw new ReviewSessionTimeoutError(300000); }) });
 try {
  const ack = await coordinator.start(f.project, 'native-timeout', 1, f.packet); await coordinator.settled(f.project, 'native-timeout');
  assert.equal((await f.read(ack.path)).attempts[0]!['review-response'].tasks[0]!.status, 'incomplete');
 } finally { await f.cleanup(); }
});

test('malformed provider result is saved as failed without retrying the task', async () => {
 const f = await fixture(); let calls = 0;
 const coordinator = new TaskReviewCoordinator({ sources: f.sources, provider: () => provider(async () => { calls++; return { findings: [] }; }) });
 try {
  const ack = await coordinator.start(f.project, 'invalid-answer', 1, f.packet); await coordinator.settled(f.project, 'invalid-answer');
  const result = (await f.read(ack.path)).attempts[0]!['review-response'].tasks[0]!;
  assert.equal(result.status, 'failed'); assert.ok(result.error); assert.equal(calls, 1);
 } finally { await f.cleanup(); }
});
