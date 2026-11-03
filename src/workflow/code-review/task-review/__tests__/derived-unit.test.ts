/* Copyright (c) Procix Software India. Licensed under the MIT License. */
import test from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { registerGitTools } from '../../../../daemon/tools/builtins/git/index.js';
import { RegistryReviewSources } from '../sources.js';
import { TaskReviewInputError } from '../contracts.js';
import type { ReviewPacket } from '../contracts.js';
import { deriveTaskAssignments, prepareReviewPacket } from '../packet.js';
import { directAssignments } from '../assessment.js';
import type { StoryRoute } from '../route.js';

registerGitTools();
const hash = '1234567890abcdef';

/** A temporary repository with an LLD, an ISSUE and `files` changed source files in one commit. */
function fixture(files = 1) {
	const repo = mkdtempSync(join(tmpdir(), 'task-review-unit-'));
	const git = (...args: string[]) => execFileSync('git', ['-C', repo, ...args], { encoding: 'utf8', env: { ...process.env, GIT_CONFIG_NOSYSTEM: '1', GIT_CONFIG_GLOBAL: '/dev/null' } }).trim();
	git('init', '-q'); git('config', 'user.name', 'Fixture'); git('config', 'user.email', 'fixture@example.test');
	const put = (path: string, text: string) => { mkdirSync(join(repo, path, '..'), { recursive: true }); writeFileSync(join(repo, path), text); };
	put('lld.json', JSON.stringify({ meta: { epicHash: hash, storyId: 's1', workflow: 'design.story' }, body: { testStrategy: { acceptanceMapping: [{ criterionId: 'ac1', provingTests: ['proves it', 'and again'] }] } } }));
	put('issue.json', JSON.stringify({ meta: { workflow: 'issue', issueHash: hash }, body: { title: 'The defect', fixIntent: 'Fix it properly' } }));
	put('test.ts', 'test behaviour\n');
	for (let i = 0; i < files; i++) put(`src/f${i}.ts`, 'one\ntwo\n');
	git('add', '.'); git('commit', '-qm', 'base'); const base = git('rev-parse', 'HEAD');
	for (let i = 0; i < files; i++) put(`src/f${i}.ts`, 'ONE\ntwo\n');
	git('add', '.'); git('commit', '-qm', 'change'); const commit = git('rev-parse', 'HEAD');
	const packetWith = (documents: ReviewPacket['documents']): ReviewPacket => ({
		storyId: 's1', functionalSummary: 'Change behaviour', documents,
		reviewSet: [{ commit, parent: base, files: Array.from({ length: files }, (_, i) => ({ path: `src/f${i}.ts`, segments: [{ after: [1, 1] as [number, number] }] })) }],
		tests: [{ file: 'test.ts', cases: ['behaviour'], command: 'target test', result: 'pass', executionDetails: 'Builder reported run', evidenceReferences: [`${commit}:test.ts`] }],
	});
	const sources = new RegistryReviewSources({ repoPath: repo, sessionId: 'task-review-unit-test', requestId: 1, send: () => {} });
	const route = (over: Partial<StoryRoute>): StoryRoute => ({ epicHash: hash, storyId: 's1', plan: false, lld: false, issue: false, def: false, build: { taskIds: ['s1'], focus: 'Fix the behaviour' }, ...over });
	return { at: (path: string) => ({ path, commit: base }), packetWith, sources, route, cleanup: () => rmSync(repo, { recursive: true, force: true }) };
}

test('src/workflow/code-review/task-review/__tests__/derived-unit.test.ts: each Plan-less route derives one unit with the BUILD task id and checks from its design record', async () => {
	const f = fixture();
	try {
		const lld = await prepareReviewPacket(f.packetWith({ lld: f.at('lld.json') }), f.sources, false, f.route({ lld: true }));
		assert.equal(lld.tasks.length, 1);
		assert.equal(lld.tasks[0]!.id, 's1');
		assert.deepEqual(lld.tasks[0]!.acceptanceChecks, ['Criterion ac1 is proven by: proves it; and again']);
		const issue = await prepareReviewPacket(f.packetWith({ issue: f.at('issue.json') }), f.sources, false, f.route({ issue: true }));
		assert.equal(issue.tasks.length, 1);
		assert.equal(issue.tasks[0]!.id, 's1');
		assert.equal(issue.tasks[0]!.title, 'The defect');
		assert.deepEqual(issue.tasks[0]!.acceptanceChecks, ['Fix it properly']);
		const none = await prepareReviewPacket(f.packetWith({}), f.sources, false, f.route({}));
		assert.equal(none.tasks.length, 1);
		assert.equal(none.tasks[0]!.id, 's1');
		assert.deepEqual(none.tasks[0]!.acceptanceChecks, ['Fix the behaviour']);
		for (const unit of [lld.tasks[0]!, issue.tasks[0]!, none.tasks[0]!]) {
			assert.equal(unit.order, 1);
			assert.deepEqual([unit.dependsOn, unit.derivedFrom, unit.tests], [[], [], []]);
		}
	} finally { f.cleanup(); }
});

test('src/workflow/code-review/task-review/__tests__/derived-unit.test.ts: the unit size follows the number of selected changed files', async () => {
	const sizes: [number, string][] = [[1, 'S'], [2, 'S'], [3, 'M'], [8, 'M'], [9, 'L']];
	for (const [files, expected] of sizes) {
		const f = fixture(files);
		try {
			const prepared = await prepareReviewPacket(f.packetWith({}), f.sources, false, f.route({}));
			assert.equal(prepared.tasks[0]!.size, expected, `${files} changed files`);
		} finally { f.cleanup(); }
	}
});

test('src/workflow/code-review/task-review/__tests__/derived-unit.test.ts: a Plan-less route with a multi-task BUILD is refused and all changes and tests attribute to the one unit', async () => {
	const f = fixture(3);
	try {
		await assert.rejects(prepareReviewPacket(f.packetWith({}), f.sources, false, f.route({ build: { taskIds: ['s1', 't2'], focus: 'Fix' } })), (e: unknown) => e instanceof TaskReviewInputError && /exactly one task/.test(e.message));
		await assert.rejects(prepareReviewPacket(f.packetWith({}), f.sources, false, f.route({ build: { taskIds: ['s1'], focus: undefined } })), (e: unknown) => e instanceof TaskReviewInputError && /no stated done condition/.test(e.message));
		const prepared = await prepareReviewPacket(f.packetWith({}), f.sources, false, f.route({}));
		const assignments = deriveTaskAssignments(prepared, [{ taskId: 's1', changeIndexes: [0, 1, 2], testIndexes: [0] }]);
		assert.equal(assignments.length, 1);
		assert.equal(assignments[0]!.changes.length, 3);
		assert.equal(assignments[0]!.tests.length, 1);
		assert.equal(directAssignments(prepared)?.length, 1, 'a single unit needs no model attribution');
	} finally { f.cleanup(); }
});
