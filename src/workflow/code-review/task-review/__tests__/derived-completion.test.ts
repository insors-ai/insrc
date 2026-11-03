/* Copyright (c) Procix Software India. Licensed under the MIT License. */
import test from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, rmSync, writeFileSync, realpathSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { registerGitTools } from '../../../../daemon/tools/builtins/git/index.js';
import { reviewedBuildFingerprint } from '../../build-freshness.js';
import { RegistryReviewSources } from '../sources.js';
import type { CompletedReviewSummary, ReviewPacket, TaskReviewResult } from '../contracts.js';
import { prepareReviewAdmission } from '../admission.js';
import { inspectTaskCompletion } from '../completion.js';

registerGitTools();
const hash = '5555555555555555';
const buildPath = `.insrc/artifacts/BUILD-${hash}-s1.json`;

/** A trivial Story (a BUILD and nothing else) with one committed change, admitted through the real admission. */
async function admitted() {
	const repo = realpathSync(mkdtempSync(join(tmpdir(), 'task-review-derived-completion-')));
	const git = (...args: string[]) => execFileSync('git', ['-C', repo, ...args], { encoding: 'utf8', env: { ...process.env, GIT_CONFIG_NOSYSTEM: '1', GIT_CONFIG_GLOBAL: '/dev/null' } }).trim();
	git('init', '-q'); git('config', 'user.name', 'Fixture'); git('config', 'user.email', 'fixture@example.test');
	const put = (path: string, value: unknown) => { mkdirSync(join(repo, path, '..'), { recursive: true }); writeFileSync(join(repo, path), typeof value === 'string' ? value : JSON.stringify(value)); };
	const build = {
		meta: { epicHash: hash, storyId: 's1', createdAt: '2026-11-03T00:00:00.000Z' },
		body: { commit: 'abc1234', focus: 'Change the behaviour', summary: 'Changed it', tasks: [{ id: 's1', passed: true }], changeLog: [{ target: { file: 'src/a.ts' } }] },
	};
	put(buildPath, build); put('src/a.ts', 'first\nsecond\n');
	git('add', '.'); git('commit', '-qm', 'base'); const base = git('rev-parse', 'HEAD');
	put('src/a.ts', 'FIRST\nsecond\n');
	git('add', '.'); git('commit', '-qm', 'change'); const commit = git('rev-parse', 'HEAD');
	const packet: ReviewPacket = { storyId: 's1', functionalSummary: 'Change behaviour', documents: {}, reviewSet: [{ commit, parent: base, files: [{ path: 'src/a.ts', segments: [{ after: [1, 1] }] }] }], tests: [] };
	const sources = new RegistryReviewSources({ repoPath: repo, sessionId: 'task-review-derived-completion', requestId: 1, send: () => {} });
	const review = await prepareReviewAdmission(repo, 'review-1', 1, packet, 'daemon', sources, { epicHash: hash });
	return { review, build, cleanup: () => rmSync(repo, { recursive: true, force: true }) };
}

const passing = (taskId: string, over: Partial<TaskReviewResult> = {}): TaskReviewResult => ({
	taskId, status: 'passed', summary: 'The change is correct', findings: [],
	testCoverage: { assessment: 'verified', explanation: 'Covered', evidenceReferences: ['ref:test'] },
	limitations: [], advice: [], inspectedReferences: ['ref:code'], executedTests: [], ...over,
});
/** The CR record a review of this admitted packet would publish. */
const record = (review: Awaited<ReturnType<typeof admitted>>['review'], build: unknown, over: { task?: TaskReviewResult; taskOnly?: boolean; fingerprint?: string } = {}) => {
	const packet = review.prepared.packet, task = over.task ?? passing(review.prepared.tasks[0]!.id);
	const summary: CompletedReviewSummary = {
		reviewId: 'review-1', attempt: 1, storyId: 's1', ...(over.taskOnly ? { taskId: task.taskId } : {}), reviewer: 'daemon', status: task.status,
		scope: { storyId: packet.storyId, ...(over.taskOnly ? { taskId: task.taskId } : {}), documents: packet.documents, reviewSet: packet.reviewSet },
		tasks: [task], summary: 'Reviewed', completedAt: '2026-11-03T01:00:00.000Z', buildFingerprint: over.fingerprint ?? reviewedBuildFingerprint(build),
	};
	return { meta: { workflow: 'code-review', schemaVersion: 2, epicHash: hash, storyId: 's1', reviewedBy: 'daemon' }, body: { kind: 'code-review', format: 'task-based', storyId: 's1', status: task.status, reviews: [summary] } };
};

test('src/workflow/code-review/task-review/__tests__/derived-completion.test.ts: a passing whole-story review of a derived unit lets inspectTaskCompletion pass', async () => {
	const { review, build, cleanup } = await admitted();
	try {
		assert.deepEqual(review.prepared.tasks.map(task => task.id), ['s1'], 'the derived unit carries the BUILD task id');
		assert.deepEqual(inspectTaskCompletion(record(review, build), build, hash, 's1'), { counts: { high: 0, med: 0, low: 0 } });
	} finally { cleanup(); }
});

test('src/workflow/code-review/task-review/__tests__/derived-completion.test.ts: a task-only, non-passing or stale-fingerprint derived-unit review is withheld', async () => {
	const { review, build, cleanup } = await admitted();
	try {
		const id = review.prepared.tasks[0]!.id;
		assert.match(inspectTaskCompletion(record(review, build, { taskOnly: true }), build, hash, 's1').gap ?? '', /task-only review does not establish whole-story signoff/);
		const blocked = passing(id, { status: 'changes_requested', findings: [{ severity: 'MED', location: 'src/a.ts:1', message: 'Wrong', rationale: 'Because', evidenceReferences: ['ref:code'] }] });
		const nonPassing = inspectTaskCompletion(record(review, build, { task: blocked }), build, hash, 's1');
		assert.match(nonPassing.gap ?? '', /Task-based review is changes_requested/);
		assert.equal(nonPassing.counts.med, 1);
		const changed = { ...build, body: { ...build.body, summary: 'Changed it again' } };
		assert.match(inspectTaskCompletion(record(review, build), changed, hash, 's1').gap ?? '', /BUILD has changed/);
		const other = passing('t9');
		assert.match(inspectTaskCompletion(record(review, build, { task: other }), build, hash, 's1').gap ?? '', /does not cover every current BUILD task/);
	} finally { cleanup(); }
});
