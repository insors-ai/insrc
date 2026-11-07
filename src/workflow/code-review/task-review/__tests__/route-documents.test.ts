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
import { prepareReviewPacket } from '../packet.js';
import type { StoryRoute } from '../route.js';

registerGitTools();
const hash = '1234567890abcdef';

/** A temporary repository holding one committed artifact per role and one selected change. */
function fixture() {
	const repo = mkdtempSync(join(tmpdir(), 'task-review-route-'));
	const git = (...args: string[]) => execFileSync('git', ['-C', repo, ...args], { encoding: 'utf8', env: { ...process.env, GIT_CONFIG_NOSYSTEM: '1', GIT_CONFIG_GLOBAL: '/dev/null' } }).trim();
	git('init', '-q'); git('config', 'user.name', 'Fixture'); git('config', 'user.email', 'fixture@example.test');
	const put = (path: string, text: string) => { mkdirSync(join(repo, path, '..'), { recursive: true }); writeFileSync(join(repo, path), text); };
	const tasks = [{ id: 't1', title: 'Task 1', summary: 'Behaviour', size: 'S', order: 1, dependsOn: [], acceptanceChecks: ['Behaviour holds'], derivedFrom: ['c1'], tests: [{ level: 'unit', name: 'Behaviour' }] }];
	const meta = { epicHash: hash, storyId: 's1' };
	put('story.json', JSON.stringify({ meta: { ...meta, workflow: 'define' }, body: { stories: [{ id: 's1' }] } }));
	put('lld.json', JSON.stringify({ meta: { ...meta, workflow: 'design.story' }, body: {} }));
	put('plan.json', JSON.stringify({ meta: { ...meta, workflow: 'plan' }, body: { tasks }, citations: [{ id: 'c1', kind: 'stakeholder', ref: 'Fixture' }] }));
	put('issue.json', JSON.stringify({ meta: { workflow: 'issue', issueHash: hash }, body: { title: 'Defect', fixIntent: 'Fix it' } }));
	put('other-issue.json', JSON.stringify({ meta: { workflow: 'issue', issueHash: 'fedcba0987654321' }, body: {} }));
	put('other-story.json', JSON.stringify({ meta: { ...meta, storyId: 's2', workflow: 'design.story' }, body: {} }));
	put('src/a.ts', 'first\nsecond\n');
	git('add', '.'); git('commit', '-qm', 'base'); const base = git('rev-parse', 'HEAD');
	put('src/a.ts', 'FIRST\nsecond\n');
	git('add', '.'); git('commit', '-qm', 'change'); const commit = git('rev-parse', 'HEAD');
	const at = (path: string) => ({ path, commit: base });
	const packetWith = (documents: ReviewPacket['documents']): ReviewPacket => ({
		reviewRevision: commit, storyId: 's1', functionalSummary: 'Change behaviour', documents,
		reviewSet: [{ commit, parent: base, files: [{ path: 'src/a.ts', segments: [{ after: [1, 1] }] }] }], tests: [],
	});
	const sources = new RegistryReviewSources({ repoPath: repo, sessionId: 'task-review-route-test', requestId: 1, send: () => {} });
	const route = (over: Partial<StoryRoute>): StoryRoute => ({ epicHash: hash, storyId: 's1', plan: false, lld: false, issue: false, def: false, build: { taskIds: ['s1'], focus: 'Fix it' }, ...over });
	return { at, packetWith, sources, route, cleanup: () => rmSync(repo, { recursive: true, force: true }) };
}
const refused = (promise: Promise<unknown>, message: RegExp) => assert.rejects(promise, (error: unknown) => error instanceof TaskReviewInputError && message.test(error.message));

test('src/workflow/code-review/task-review/__tests__/route-documents.test.ts: a Plan route is validated with the same documents, units and messages as without a route', async () => {
	const f = fixture();
	try {
		const packet = f.packetWith({ story: f.at('story.json'), lld: f.at('lld.json'), plan: f.at('plan.json') });
		const without = await prepareReviewPacket(packet, f.sources);
		const withRoute = await prepareReviewPacket(packet, f.sources, false, f.route({ plan: true, lld: true, def: true }));
		assert.deepEqual(withRoute.tasks, without.tasks);
		assert.deepEqual(withRoute.documents, without.documents);
		assert.equal(withRoute.epicHash, without.epicHash);
		assert.equal(without.tasks.length, 1);
		await refused(prepareReviewPacket(f.packetWith({ lld: f.at('lld.json'), plan: f.at('plan.json') }), f.sources), /Expected story, lld and plan documents/);
	} finally { f.cleanup(); }
});

test('src/workflow/code-review/task-review/__tests__/route-documents.test.ts: an LLD-only, an ISSUE-only and a no-document route accept exactly their set', async () => {
	const f = fixture();
	try {
		const lld = await prepareReviewPacket(f.packetWith({ lld: f.at('lld.json') }), f.sources, false, f.route({ lld: true }));
		assert.deepEqual(Object.keys(lld.documents), ['lld']);
		const issue = await prepareReviewPacket(f.packetWith({ issue: f.at('issue.json') }), f.sources, false, f.route({ issue: true }));
		assert.deepEqual(Object.keys(issue.documents), ['issue']);
		const none = await prepareReviewPacket(f.packetWith({}), f.sources, false, f.route({}));
		assert.deepEqual(Object.keys(none.documents), []);
		assert.equal(lld.epicHash, hash);
	} finally { f.cleanup(); }
});

test('src/workflow/code-review/task-review/__tests__/route-documents.test.ts: the story role is required only when a DEF exists', async () => {
	const f = fixture();
	try {
		const standalone = f.route({ plan: true, lld: true });
		const accepted = await prepareReviewPacket(f.packetWith({ lld: f.at('lld.json'), plan: f.at('plan.json') }), f.sources, false, standalone);
		assert.deepEqual(Object.keys(accepted.documents).sort(), ['lld', 'plan']);
		await refused(prepareReviewPacket(f.packetWith({ story: f.at('story.json'), lld: f.at('lld.json'), plan: f.at('plan.json') }), f.sources, false, standalone), /Expected the documents lld, plan .* got story, lld, plan/);
		const epic = f.route({ plan: true, lld: true, def: true });
		await refused(prepareReviewPacket(f.packetWith({ lld: f.at('lld.json'), plan: f.at('plan.json') }), f.sources, false, epic), /Expected the documents story, lld, plan .* got lld, plan/);
		const withStory = await prepareReviewPacket(f.packetWith({ story: f.at('story.json'), lld: f.at('lld.json'), plan: f.at('plan.json') }), f.sources, false, epic);
		assert.deepEqual(Object.keys(withStory.documents).sort(), ['lld', 'plan', 'story']);
	} finally { f.cleanup(); }
});

test('src/workflow/code-review/task-review/__tests__/route-documents.test.ts: a document set that differs from the route, or a document of the wrong workflow, epicHash, issueHash or story, is refused', async () => {
	const f = fixture();
	try {
		const lldRoute = f.route({ lld: true });
		await refused(prepareReviewPacket(f.packetWith({ lld: f.at('lld.json'), issue: f.at('issue.json') }), f.sources, false, lldRoute), /Expected the documents lld .* got lld, issue/);
		await refused(prepareReviewPacket(f.packetWith({}), f.sources, false, lldRoute), /Expected the documents lld .* got none/);
		await refused(prepareReviewPacket(f.packetWith({ lld: f.at('plan.json') }), f.sources, false, lldRoute), /documents\.lld: Expected a design\.story artifact/);
		await refused(prepareReviewPacket(f.packetWith({ lld: f.at('lld.json') }), f.sources, false, f.route({ lld: true, epicHash: 'fedcba0987654321' })), /documents\.lld: Document belongs to another epic/);
		await refused(prepareReviewPacket(f.packetWith({ lld: f.at('other-story.json') }), f.sources, false, lldRoute), /documents\.lld: LLD belongs to another story/);
		await refused(prepareReviewPacket(f.packetWith({ issue: f.at('other-issue.json') }), f.sources, false, f.route({ issue: true })), /documents\.issue: Document belongs to another epic/);
		await refused(prepareReviewPacket(f.packetWith({ lld: f.at('lld.json') }), f.sources, false, f.route({ lld: true, storyId: 's2' })), /storyId: Packet belongs to another story/);
	} finally { f.cleanup(); }
});

test('src/workflow/code-review/task-review/__tests__/route-documents.test.ts: a stored review of a Story with a Plan is re-read with the LLD and Plan alone, and a new packet without a route still needs all three', async () => {
	const f = fixture();
	try {
		const pair = f.packetWith({ lld: f.at('lld.json'), plan: f.at('plan.json') });
		const stored = await prepareReviewPacket(pair, f.sources, true);
		const atStart = await prepareReviewPacket(pair, f.sources, false, f.route({ plan: true, lld: true }));
		assert.deepEqual(stored.tasks, atStart.tasks, 'same unit as at start');
		assert.deepEqual(stored.documents, atStart.documents, 'same document set as at start');
		assert.equal(stored.epicHash, hash);
		// the legacy triple still re-reads, and start-side checks stay strict
		const triple = f.packetWith({ story: f.at('story.json'), lld: f.at('lld.json'), plan: f.at('plan.json') });
		assert.deepEqual(Object.keys((await prepareReviewPacket(triple, f.sources, true)).documents).sort(), ['lld', 'plan', 'story']);
		await refused(prepareReviewPacket(pair, f.sources), /Expected story, lld and plan documents/);
	} finally { f.cleanup(); }
});

test('src/workflow/code-review/task-review/__tests__/route-documents.test.ts: a stored re-read still refuses a missing LLD or Plan and documents of another epic or story', async () => {
	const f = fixture();
	try {
		await refused(prepareReviewPacket(f.packetWith({ plan: f.at('plan.json') }), f.sources, true), /Expected story, lld and plan documents/);
		await refused(prepareReviewPacket(f.packetWith({ lld: f.at('lld.json') }), f.sources, true), /Expected story, lld and plan documents/);
		await refused(prepareReviewPacket(f.packetWith({ lld: f.at('other-story.json'), plan: f.at('plan.json') }), f.sources, true), /documents\.lld: LLD belongs to another story/);
	} finally { f.cleanup(); }
});
