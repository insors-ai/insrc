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
import { prepareReviewPacket } from '../packet.js';

registerGitTools();
const ISSUE_ONLY = '1111111111111111', LLD_ONLY = '2222222222222222', PLAN_STORY = '3333333333333333', NO_BUILD = '4444444444444444';
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
	put(artifact(`PLAN-${PLAN_STORY}-s1`), { meta: { epicHash: PLAN_STORY, storyId: 's1', workflow: 'plan' }, body: { tasks: [{ id: 't1', title: 'T', summary: 'S', size: 'S', order: 1, dependsOn: [], acceptanceChecks: ['Holds'], derivedFrom: ['c1'], tests: [{ level: 'unit', name: 'N' }] }] }, citations: [{ id: 'c1', kind: 'stakeholder', ref: 'Fixture' }] });
	put(artifact(`ISSUE-${NO_BUILD}`), { meta: { workflow: 'issue', issueHash: NO_BUILD }, body: { title: 'Defect', fixIntent: 'Fix it' } });
	put('src/a.ts', 'first\nsecond\n');
	git('add', '.'); git('commit', '-qm', 'base'); const base = git('rev-parse', 'HEAD');
	put('src/a.ts', 'FIRST\nsecond\n');
	git('add', '.'); git('commit', '-qm', 'change'); const commit = git('rev-parse', 'HEAD');
	const at = (name: string) => ({ path: artifact(name), commit: base });
	const packetWith = (documents: ReviewPacket['documents']): ReviewPacket => ({
		storyId: 's1', functionalSummary: 'Change behaviour', documents,
		reviewSet: [{ commit, parent: base, files: [{ path: 'src/a.ts', segments: [{ after: [1, 1] }] }] }], tests: [],
	});
	const sources = new RegistryReviewSources({ repoPath: repo, sessionId: 'task-review-route-admission', requestId: 1, send: () => {} });
	const admit = (packet: ReviewPacket, epicHash: string, id = 'review-1') => prepareReviewAdmission(repo, id, 1, packet, 'daemon', sources, { epicHash });
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
