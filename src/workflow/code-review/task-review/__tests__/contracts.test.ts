/* Copyright (c) Procix Software India. Licensed under the MIT License. */
import test from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync, renameSync, unlinkSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { registerGitTools } from '../../../../daemon/tools/builtins/git/index.js';
import { RegistryReviewSources } from '../sources.js';
import { parsePacket } from '../contracts.js';
import type { ReviewPacket, TaskReviewResult } from '../contracts.js';
import { prepareReviewPacket, deriveTaskAssignments } from '../packet.js';
import { validateTaskResult, aggregateTaskStatus } from '../results.js';

registerGitTools();
const hash = '1234567890abcdef';
function fixture() {
 const repo = mkdtempSync(join(tmpdir(), 'task-review-packet-'));
 const git = (...args: string[]) => execFileSync('git', ['-C', repo, ...args], { encoding: 'utf8', env: { ...process.env, GIT_CONFIG_NOSYSTEM: '1', GIT_CONFIG_GLOBAL: '/dev/null' } }).trim();
 git('init', '-q'); git('config', 'user.name', 'Fixture'); git('config', 'user.email', 'fixture@example.test');
 const put = (path: string, text: string) => { mkdirSync(join(repo, path, '..'), { recursive: true }); writeFileSync(join(repo, path), text); };
 const tasks = ['S', 'M', 'L'].map((size, i) => ({ id: `t${i + 1}`, title: `Task ${i + 1}`, summary: 'Behavior', size, order: i + 1,
  dependsOn: i ? [`t${i}`] : [], acceptanceChecks: ['Behavior holds'], derivedFrom: ['c1'], tests: [{ level: 'unit', name: 'Behavior' }] }));
 const meta = { epicHash: hash, storyId: 's1' };
 put('story.json', JSON.stringify({ meta: { ...meta, workflow: 'define' }, body: { stories: [{ id: 's1' }] } }));
 put('lld.json', JSON.stringify({ meta: { ...meta, workflow: 'design.story' }, body: {} }));
 const plan = { meta: { ...meta, workflow: 'plan' }, body: { tasks }, citations: [{ id: 'c1', kind: 'stakeholder', ref: 'Fixture' }] };
 put('plan.json', JSON.stringify(plan));
 put('src/a.ts', 'first\nsecond\nthird\nfourth\nfifth\n'); put('unrelated.ts', 'old\n'); put('test.ts', 'test behavior\n');
 git('add', '.'); git('commit', '-qm', 'base'); const base = git('rev-parse', 'HEAD');
 put('src/a.ts', 'FIRST\nsecond\nthird\nfourth\nFIFTH\n'); put('unrelated.ts', 'unrelated change\n');
 git('add', '.'); git('commit', '-qm', 'selected and unrelated'); const commit = git('rev-parse', 'HEAD');
 const packet: ReviewPacket = { storyId: `STORY-${hash}-s1`, functionalSummary: 'Change first behavior',
  documents: { story: { path: 'story.json', commit: base }, lld: { path: 'lld.json', commit: base }, plan: { path: 'plan.json', commit: base } },
  reviewSet: [{ commit, parent: base, files: [{ path: 'src/a.ts', segments: [{ before: [1, 1], after: [1, 1] }] }] }],
  tests: [{ file: 'test.ts', cases: ['behavior'], command: 'target test', result: 'pass', executionDetails: 'Builder reported run', evidenceReferences: [`${commit}:test.ts`] }] };
 const sources = new RegistryReviewSources({ repoPath: repo, sessionId: 'task-review-test', requestId: 1, send: () => {} });
 return { repo, git, put, base, commit, packet, plan, sources, cleanup: () => rmSync(repo, { recursive: true, force: true }) };
}

test('selected-change packet: commit pointers, exact ranges, committed documents and excluded same-commit changes', async () => {
 const f = fixture(); try {
  // Moving HEAD/worktree is irrelevant: only the packet pointers are read.
  f.git('checkout', '--detach', '-q', f.base); f.put('src/a.ts', 'uncommitted\n');
  const prepared = await prepareReviewPacket(f.packet, f.sources);
  assert.equal(prepared.changes.length, 1); assert.equal(prepared.changes[0]!.path, 'src/a.ts');
  assert.deepEqual(prepared.changes[0]!.segments, [{ before: [1, 1], after: [1, 1] }]);
  assert.equal(Buffer.from(prepared.changes[0]!.after!.bytes).toString(), 'FIRST\nsecond\nthird\nfourth\nFIFTH\n');
  assert.ok(!prepared.changes.some(c => c.path === 'unrelated.ts'));
  const original = f.packet.functionalSummary; const parsed = parsePacket(f.packet); f.packet.functionalSummary = 'mutated'; assert.equal(parsed.functionalSummary, original);
  f.git('config', 'diff.interHunkContext', '10'); // Joined hunks must not turn context into changed scope.
  const badRange = structuredClone(f.packet); badRange.reviewSet[0]!.files[0]!.segments[0] = { after: [2, 2] };
  await assert.rejects(prepareReviewPacket(badRange, f.sources), /changed hunk/);
  const crossed = structuredClone(f.packet); crossed.reviewSet[0]!.files[0]!.segments[0] = { before: [1, 1], after: [5, 5] };
  await assert.rejects(prepareReviewPacket(crossed, f.sources), /changed hunk/);
  const wrongParent = structuredClone(f.packet); wrongParent.reviewSet[0]!.parent = null;
  await assert.rejects(prepareReviewPacket(wrongParent, f.sources), /not a parent/);
  const unsafe = structuredClone(f.packet); unsafe.reviewSet[0]!.files[0]!.path = '../secret'; assert.throws(() => parsePacket(unsafe), /relative/);
  const missing = structuredClone(f.packet); missing.documents.lld.path = 'missing.json'; await assert.rejects(prepareReviewPacket(missing, f.sources), /Missing committed/);
  const missingTest = structuredClone(f.packet); missingTest.tests[0]!.file = 'missing-test.ts'; await assert.rejects(prepareReviewPacket(missingTest, f.sources), /Test file/);
  const root = structuredClone(f.packet); root.reviewSet = [{ commit: f.base, parent: null, files: [{ path: 'src/a.ts', segments: [{ after: [1, 1] }] }] }];
  assert.equal((await prepareReviewPacket(root, f.sources)).changes[0]!.before, null);
 } finally { f.cleanup(); }
});

test('selected-change packet preserves deletion rename and non-textual limits without invented ranges', async () => {
 const f = fixture(); try {
  renameSync(join(f.repo, 'src/a.ts'), join(f.repo, 'moved.ts')); unlinkSync(join(f.repo, 'unrelated.ts'));
  writeFileSync(join(f.repo, 'binary.bin'), Buffer.from([0, 255, 1])); f.git('add', '.'); f.git('commit', '-qm', 'move remove binary');
  const commit = f.git('rev-parse', 'HEAD'); const packet = structuredClone(f.packet);
  packet.reviewSet = [{ commit, parent: f.commit, files: [{ path: 'moved.ts', previousPath: 'src/a.ts', segments: [] }, { path: 'unrelated.ts', segments: [{ before: [1, 1] }] }, { path: 'binary.bin', segments: [] }] }];
  const prepared = await prepareReviewPacket(packet, f.sources);
  assert.equal(prepared.changes.length, 3); assert.equal(prepared.changes[1]!.after, null);
  assert.equal(prepared.changes[0]!.limitations.length, 1); assert.equal(prepared.changes[2]!.limitations.length, 1);
 } finally { f.cleanup(); }
});

test('derived tasks: pinned dependencies, S/M/L sizes and complete selected-change attribution', async () => {
 const f = fixture(); try {
  const prepared = await prepareReviewPacket(f.packet, f.sources);
  const scopes = [{ taskId: 't3', changeIndexes: [0], testIndexes: [0] }, { taskId: 't1', changeIndexes: [0], testIndexes: [0] }, { taskId: 't2', changeIndexes: [0], testIndexes: [] }];
  const assigned = deriveTaskAssignments(prepared, scopes);
  assert.deepEqual(assigned.map(a => [a.taskId, a.timeoutMs]), [['t1', 300000], ['t2', 600000], ['t3', 900000]]);
  assert.throws(() => deriveTaskAssignments(prepared, scopes.slice(1)), /Every applicable task/);
  assert.throws(() => deriveTaskAssignments(prepared, scopes.map(s => ({ ...s, changeIndexes: [] }))), /omit submitted/);
  assert.throws(() => deriveTaskAssignments(prepared, scopes.map(s => ({ ...s, changeIndexes: [5] }))), /Unknown selected/);
  const narrowed = { ...prepared, packet: { ...prepared.packet, taskId: 't2' } };
  assert.deepEqual(deriveTaskAssignments(narrowed, [{ taskId: 't2', changeIndexes: [0], testIndexes: [0] }]).map(a => a.taskId), ['t2']);
  f.plan.body.tasks[0]!.dependsOn = ['t3']; f.put('plan.json', JSON.stringify(f.plan)); f.git('add', '.'); f.git('commit', '-qm', 'bad plan');
  const badPlan = structuredClone(f.packet); badPlan.documents.plan.commit = f.git('rev-parse', 'HEAD');
  await assert.rejects(prepareReviewPacket(badPlan, f.sources), /topological|cycle/);
 } finally { f.cleanup(); }
});

const passed = (): TaskReviewResult => ({ taskId: 't1', status: 'passed', summary: 'Behavior inspected', findings: [],
 testCoverage: { assessment: 'verified', explanation: 'Relevant case asserts the changed branch', evidenceReferences: ['commit:test.ts:1'] },
 limitations: [], advice: ['Optional naming suggestion'], inspectedReferences: ['commit:src/a.ts:1'], executedTests: [] });
test('ordinary results: required evidence, coverage strength, supported severity and nonblocking advice', () => {
 const scope = { taskId: 't1', changes: [{ path: 'src/a.ts', previousPath: 'src/a.ts', segments: [{ after: [1, 1] as [number, number] }] }], evidenceReferences: ['commit:src/a.ts:1', 'commit:test.ts:1'] };
 const result = passed(); assert.equal(validateTaskResult(result, scope).status, 'passed');
 assert.throws(() => validateTaskResult({ ...result, inspectedReferences: [] }, scope), /source evidence/);
 for (const assessment of ['partial', 'unverified', 'unsupported']) assert.throws(() => validateTaskResult({ ...result, testCoverage: { ...result.testCoverage, assessment } }, scope), /Unverified coverage/);
 assert.throws(() => validateTaskResult({ ...result, limitations: ['No assertion evidence'] }, scope), /remain incomplete/);
 const finding = { severity: 'MED' as const, location: 'src/a.ts:1', message: 'Wrong branch', rationale: 'Changed condition reverses expected behavior', evidenceReferences: ['commit:src/a.ts:1'] };
 assert.throws(() => validateTaskResult({ ...result, findings: [finding] }, scope), /HIGH\/MED/);
 assert.equal(validateTaskResult({ ...result, status: 'changes_requested', findings: [finding] }, scope).status, 'changes_requested');
 assert.throws(() => validateTaskResult({ ...result, findings: [{ ...finding, evidenceReferences: [] }] }, scope));
 assert.throws(() => validateTaskResult(result, { ...scope, taskId: 't2' }), /assigned task/);
 assert.throws(() => validateTaskResult({ ...result, inspectedReferences: ['foreign'] }, scope), /not resolved/);
 assert.throws(() => validateTaskResult({ ...result, status: 'changes_requested', findings: [{ ...finding, location: 'unrelated.ts:1' }] }, scope), /outside/);
 assert.throws(() => validateTaskResult({ ...result, status: 'changes_requested', findings: [{ ...finding, location: 'src/a.ts:5' }] }, scope), /outside/);
 const incomplete = validateTaskResult({ ...result, status: 'incomplete', limitations: ['Coverage records unavailable'], testCoverage: { ...result.testCoverage, assessment: 'unverified' } }, scope);
 assert.equal(incomplete.findings.length, 0, 'missing evidence is not a fabricated defect');
 const failed = validateTaskResult({ ...result, status: 'failed', error: 'Provider disconnected' }, scope);
 assert.equal(aggregateTaskStatus([result, incomplete, failed]), 'failed');
 assert.equal(aggregateTaskStatus([result, incomplete]), 'incomplete');
 assert.throws(() => aggregateTaskStatus([]), /cannot pass/);
});
