/* Copyright (c) Procix Software India. Licensed under the MIT License. */
import test from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { existsSync, mkdtempSync, mkdirSync, rmSync, writeFileSync, realpathSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { registerGitTools } from '../../../../daemon/tools/builtins/git/index.js';
import { RegistryReviewSources } from '../sources.js';
import { TaskReviewInputError } from '../contracts.js';
import type { ReviewPacket } from '../contracts.js';
import { prepareReviewAdmission } from '../admission.js';
import { saveCheckpoint } from '../checkpoint.js';
import { CodePreparation } from '../../../review/code-preparation.js';
import { reviewPreparationLimits } from '../../../../config/review.js';
import { ReviewPreparationCapacity } from '../../../review/source-session.js';
import { PreparedContextReader } from '../../../review/prepared-context.js';
import { prepareReviewPacket } from '../packet.js';

registerGitTools();
const ISSUE_ONLY = '1111111111111111', LLD_ONLY = '2222222222222222', PLAN_STORY = '3333333333333333', NO_BUILD = '4444444444444444', BUILD_ONLY = '6666666666666666', DEF_STORY = '7777777777777777';
const artifact = (name: string) => `.insrc/artifacts/${name}.json`;

/** A repository with four Stories on different routes, their artifacts committed and stored in .insrc/artifacts. */
function fixture() {
	const repo = realpathSync(mkdtempSync(join(tmpdir(), 'task-review-route-admission-')));
	const git = (...args: string[]) => execFileSync('git', ['-C', repo, ...args], { encoding: 'utf8', env: { ...process.env, GIT_CONFIG_NOSYSTEM: '1', GIT_CONFIG_GLOBAL: '/dev/null' } }).trim();
	git('init', '-q'); git('config', 'user.name', 'Fixture'); git('config', 'user.email', 'fixture@example.test');
	const put = (path: string, value: unknown) => { mkdirSync(join(repo, path, '..'), { recursive: true }); writeFileSync(join(repo, path), typeof value === 'string' ? value : JSON.stringify(value)); };
	const build = (hash: string) => put(artifact(`BUILD-${hash}-s1`), { meta: { epicHash: hash, storyId: 's1' }, body: { focus: 'Change the behaviour', tasks: [{ id: 's1', passed: true }] } });
	const lld = (hash: string) => put(artifact(`LLD-${hash}-s1`), { meta: { epicHash: hash, storyId: 's1', workflow: 'design.story' }, body: {} });
	put(artifact(`ISSUE-${ISSUE_ONLY}`), { meta: { workflow: 'issue', issueHash: ISSUE_ONLY }, body: { title: 'Defect', fixIntent: 'Fix it' } }); build(ISSUE_ONLY);
	lld(LLD_ONLY); build(LLD_ONLY);
	lld(PLAN_STORY); build(PLAN_STORY);
	const plan = (hash: string) => put(artifact(`PLAN-${hash}-s1`), { meta: { epicHash: hash, storyId: 's1', workflow: 'plan' }, body: { tasks: [{ id: 't1', title: 'T', summary: 'S', size: 'S', order: 1, dependsOn: [], acceptanceChecks: ['Holds'], derivedFrom: ['c1'], tests: [{ level: 'unit', name: 'N' }] }] }, citations: [{ id: 'c1', kind: 'stakeholder', ref: 'Fixture' }] });
	plan(PLAN_STORY);
	build(BUILD_ONLY); // a trivial Story: a BUILD and nothing else
	lld(DEF_STORY); plan(DEF_STORY); build(DEF_STORY); // an epic Story: its epic has a DEF
	put(artifact(`DEF-${DEF_STORY}`), { meta: { epicHash: DEF_STORY, workflow: 'define' }, body: { stories: [{ id: 's1' }] } });
	put(artifact(`ISSUE-${NO_BUILD}`), { meta: { workflow: 'issue', issueHash: NO_BUILD }, body: { title: 'Defect', fixIntent: 'Fix it' } });
	put('src/a.ts', 'first\nsecond\n');
	git('add', '.'); git('commit', '-qm', 'base'); const base = git('rev-parse', 'HEAD');
	put('src/a.ts', 'FIRST\nsecond\n');
	git('add', '.'); git('commit', '-qm', 'change'); const commit = git('rev-parse', 'HEAD');
	const at = (name: string) => ({ path: artifact(name), commit: base });
	const packetWith = (documents: ReviewPacket['documents']): ReviewPacket => ({
		reviewRevision: commit, storyId: 's1', functionalSummary: 'Change behaviour', documents,
		reviewSet: [{ commit, parent: base, files: [{ path: 'src/a.ts', segments: [{ after: [1, 1] }] }] }], tests: [],
	});
	const sources = new RegistryReviewSources({ repoPath: repo, sessionId: 'task-review-route-admission', requestId: 1, send: () => {} });
	const admit = async (packet: ReviewPacket, epicHash: string, id = 'review-1') => {
  const limits = reviewPreparationLimits(join(repo, 'missing-config.json')), capacity = new ReviewPreparationCapacity(limits.cacheMaxBytes);
  const preparation = await CodePreparation.create({ project: repo, family: 'code', reviewId: id }, sources, limits, capacity);
  try { return await preparation.prepare(repo, id, 1, packet, 'daemon', sources, { epicHash }); }
  finally { await preparation.close(); }
 };
	return { repo, at, packetWith, sources, admit, cleanup: () => rmSync(repo, { recursive: true, force: true }) };
}
const refused = (promise: Promise<unknown>, message: RegExp) => assert.rejects(promise, (error: unknown) => error instanceof TaskReviewInputError && message.test(error.message));

test('src/workflow/code-review/task-review/__tests__/route-admission.test.ts: admission builds the route from the Story\'s stored artifacts and refuses a packet that does not match it', async () => {
	const f = fixture();
	try {
		const issue = await f.admit(f.packetWith({ issue: f.at(`ISSUE-${ISSUE_ONLY}`) }), ISSUE_ONLY);
		assert.equal(issue.prepared.tasks.length, 1);
		assert.equal(issue.prepared.tasks[0]!.id, 's1');
		const lld = await f.admit(f.packetWith({ lld: f.at(`LLD-${LLD_ONLY}-s1`) }), LLD_ONLY);
		assert.equal(lld.prepared.tasks.length, 1);
		const plan = await f.admit(f.packetWith({ lld: f.at(`LLD-${PLAN_STORY}-s1`), plan: f.at(`PLAN-${PLAN_STORY}-s1`) }), PLAN_STORY);
		assert.deepEqual(plan.prepared.tasks.map(task => task.id), ['t1']);
		const trivial = await f.admit(f.packetWith({}), BUILD_ONLY);
		assert.deepEqual(trivial.prepared.tasks.map(task => task.id), ['s1'], 'a Story with only a BUILD admits the no-document route');
		assert.deepEqual(trivial.prepared.tasks[0]!.acceptanceChecks, ['Change the behaviour'], 'its check is the BUILD focus');
		await refused(f.admit(f.packetWith({ lld: f.at(`LLD-${BUILD_ONLY}-s1`) }), BUILD_ONLY), /Expected the documents none .* got lld/);
		const epic = await f.admit(f.packetWith({ story: f.at(`DEF-${DEF_STORY}`), lld: f.at(`LLD-${DEF_STORY}-s1`), plan: f.at(`PLAN-${DEF_STORY}-s1`) }), DEF_STORY);
		assert.deepEqual(epic.prepared.tasks.map(task => task.id), ['t1'], 'a Story whose epic has a DEF admits the story role');
		await refused(f.admit(f.packetWith({ lld: f.at(`LLD-${DEF_STORY}-s1`), plan: f.at(`PLAN-${DEF_STORY}-s1`) }), DEF_STORY), /Expected the documents story, lld, plan .* got lld, plan/);
		await refused(f.admit(f.packetWith({ story: f.at(`DEF-${DEF_STORY}`), lld: f.at(`LLD-${PLAN_STORY}-s1`), plan: f.at(`PLAN-${PLAN_STORY}-s1`) }), PLAN_STORY), /Expected the documents lld, plan .* got story, lld, plan/);
		await refused(f.admit(f.packetWith({}), ISSUE_ONLY), /Expected the documents issue .* got none/);
		await refused(f.admit(f.packetWith({ lld: f.at(`LLD-${LLD_ONLY}-s1`), issue: f.at(`ISSUE-${ISSUE_ONLY}`) }), LLD_ONLY), /Expected the documents lld .* got lld, issue/);
		await refused(f.admit(f.packetWith({ lld: f.at(`LLD-${PLAN_STORY}-s1`) }), PLAN_STORY), /Expected the documents lld, plan .* got lld/);
	} finally { f.cleanup(); }
});

test('src/workflow/code-review/task-review/__tests__/route-admission.test.ts: a Story with no BUILD record is refused before anything is admitted', async () => {
	const f = fixture();
	try {
		await refused(f.admit(f.packetWith({ issue: f.at(`ISSUE-${NO_BUILD}`) }), NO_BUILD, 'review-nobuild'), /exactly one task/);
		assert.equal(existsSync(join(f.repo, '.insrc', 'tmp', 'code-review')), false, 'nothing was written');
	} finally { f.cleanup(); }
});

test('src/workflow/code-review/task-review/__tests__/route-admission.test.ts: resume and publication of a stored review read no route', async () => {
	const f = fixture();
	try {
		const admitted = await f.admit(f.packetWith({ issue: f.at(`ISSUE-${ISSUE_ONLY}`) }), ISSUE_ONLY);
		await saveCheckpoint(admitted.path, { ...admitted.checkpoint });
		// the Story's artifacts change after the review started: a route read now would say something else
		rmSync(join(f.repo, artifact(`ISSUE-${ISSUE_ONLY}`)));
		const resumed = await prepareReviewAdmission(f.repo, 'review-1', 1, undefined, 'daemon', f.sources, { operation: 'resume', epicHash: ISSUE_ONLY });
		assert.deepEqual(resumed.prepared.tasks.map(task => task.id), ['s1']);
		assert.equal(admitted.attempt.header.derived?.epicHash, ISSUE_ONLY, 'admission kept the epic and the unit it derived');
		const stored = await prepareReviewPacket(admitted.attempt.submitted, f.sources, true, undefined, admitted.attempt.header.derived);
		assert.deepEqual(stored.tasks.map(task => task.id), ['s1']);
		assert.deepEqual(stored.tasks[0]!.acceptanceChecks, ['Fix it']);
		assert.equal(stored.epicHash, ISSUE_ONLY);
	} finally { f.cleanup(); }
});


test('shared preparation retains route-qualified views for pinned recovery without native refetch', async () => {
 const f = fixture();
 try {
  const limits = reviewPreparationLimits(join(f.repo, 'missing-config.json')), capacity = new ReviewPreparationCapacity(limits.cacheMaxBytes);
  const key = { project: f.repo, family: 'code' as const, reviewId: 'shared-recovery' };
  const preparation = await CodePreparation.create(key, f.sources, limits, capacity);
  const packet = f.packetWith({ issue: f.at(`ISSUE-${ISSUE_ONLY}`) });
  const admitted = await preparation.prepare(f.repo, key.reviewId, 1, packet, 'daemon', f.sources, { epicHash: ISSUE_ONLY });
  await saveCheckpoint(admitted.path, admitted.checkpoint);
  const expected = await prepareReviewPacket(admitted.attempt.submitted, preparation.sources, true, undefined, admitted.attempt.header.derived);
  const receipt = await preparation.seal(admitted);
  await preparation.close();
  rmSync(join(f.repo, artifact(`ISSUE-${ISSUE_ONLY}`)));
  const reader = await PreparedContextReader.open(receipt, limits, async () => {}, async error => { throw error; });
  let nativeCalls = 0;
  const sources: typeof f.sources = new Proxy(f.sources, { get() { return async () => { nativeCalls++; throw new Error('Native access forbidden on warm recovery'); }; } });
  const cachedSources = {
   commit: (oid: string) => reader.query('commit', [oid]),
   file: (oid: string, path: string) => reader.query('file', [oid, path]),
   isAncestor: (a: string, b: string) => reader.query('isAncestor', [a, b]),
   changedRanges: (oid: string, parent: string | null, paths: readonly string[]) => reader.query('changedRanges', [oid, parent, paths]),
   pathChanges: (a: string, b: string, path: string) => reader.query('pathChanges', [a, b, path]),
  } as import('../sources.js').ReviewSources;
  const recovered = await CodePreparation.reuse(key, reader, cachedSources, limits, capacity);
  const resumed = await recovered.prepare(f.repo, key.reviewId, 1, undefined, 'daemon', sources, { operation: 'resume', epicHash: ISSUE_ONLY });
  assert.deepEqual(resumed.prepared, structuredClone(expected));
  assert.equal(nativeCalls, 0);
  const changed = structuredClone(packet); changed.functionalSummary = 'changed pinned input';
  await assert.rejects(recovered.prepare(f.repo, key.reviewId, 1, changed, 'daemon', sources, { operation: 'resume', epicHash: ISSUE_ONLY }), /pinned/);
  await recovered.close();
 } finally { f.cleanup(); }
});


test('shared preparation preserves task selection and canonical story aliases across planned routes', async () => {
 const f = fixture();
 try {
  for (const hash of [PLAN_STORY, DEF_STORY]) {
   const documents = { ...(hash === DEF_STORY ? { story: f.at(`DEF-${hash}`) } : {}), lld: f.at(`LLD-${hash}-s1`), plan: f.at(`PLAN-${hash}-s1`) };
   const packet = { ...f.packetWith(documents), storyId: `STORY-${hash}-s1`, taskId: 't1' };
   const admitted = await f.admit(packet, hash, `task-${hash}`);
   assert.deepEqual(admitted.attempt.header.selectedTaskIds, ['t1']);
   assert.equal(admitted.prepared.packet.storyId, packet.storyId);
   assert.deepEqual(admitted.prepared.packet.reviewSet, packet.reviewSet);
   assert.deepEqual(admitted.prepared.projection!.entries[0]!.segments, [{ after: [1, 1] }]);
  }
 } finally { f.cleanup(); }
});
