/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Procix Software India. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/**
 * Unit tests for the shared tracker module (pure — no gh, no fs mutate).
 *
 * Run: npx tsx --test src/workflow/tracker/__tests__/tracker.test.ts
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { mkdirSync, mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { parseGithubRemoteUrl, commitAndPushArtifacts, _setTrackerExecForTests } from '../github.js';
import { parseIssueRef, buildRef, issueUrl, trackerRefLine } from '../refs.js';
import { renderEpicBody, renderStoryBody, updateEpicTaskList, mapIssueStatus } from '../conventions.js';
import { resolveWorkflowRef } from '../resolve.js';
import { ARTIFACTS_DIR } from '../../storage.js';
import type { DefineArtifact, DefineStory } from '../../artifacts/define.js';

const SLUG = 'demo-feature';
const HASH = 'a1b2c3d4e5f60718';
const CREATED = '2026-07-17T07:42:28.275Z';   // → E20260717a1b2c3d4
const EPIC_SEGMENT = 'E20260717a1b2c3d4';
const EPIC_FOLDER = `docs/epics/${SLUG}-${EPIC_SEGMENT}`;

// ---------------------------------------------------------------------------
// git remote parse — dotted repo names must survive (regression)
// ---------------------------------------------------------------------------

test('parseGithubRemoteUrl handles ssh + https + .git suffix', () => {
	assert.deepEqual(parseGithubRemoteUrl('git@github.com:foo/bar.git'), { owner: 'foo', repo: 'bar' });
	assert.deepEqual(parseGithubRemoteUrl('git@github.com:foo/bar'),     { owner: 'foo', repo: 'bar' });
	assert.deepEqual(parseGithubRemoteUrl('https://github.com/foo/bar.git'), { owner: 'foo', repo: 'bar' });
	assert.deepEqual(parseGithubRemoteUrl('https://github.com/foo/bar'),     { owner: 'foo', repo: 'bar' });
});

test('parseGithubRemoteUrl keeps dots in repo names', () => {
	assert.deepEqual(parseGithubRemoteUrl('git@github.com:acme/react.dev.git'), { owner: 'acme', repo: 'react.dev' });
	assert.deepEqual(parseGithubRemoteUrl('https://github.com/acme/react.dev'), { owner: 'acme', repo: 'react.dev' });
	assert.deepEqual(parseGithubRemoteUrl('https://github.com/acme/docs.github.com.git'), { owner: 'acme', repo: 'docs.github.com' });
});

test('parseGithubRemoteUrl rejects non-github urls', () => {
	assert.equal(parseGithubRemoteUrl('https://gitlab.com/foo/bar.git'), null);
	assert.equal(parseGithubRemoteUrl('not a url'), null);
});

// ---------------------------------------------------------------------------
// refs
// ---------------------------------------------------------------------------

test('ref parse/build/url/line', () => {
	assert.deepEqual(parseIssueRef('acme/demo#42'), { owner: 'acme', repo: 'demo', number: '42' });
	assert.equal(buildRef('acme', 'demo', 42), 'acme/demo#42');
	assert.equal(issueUrl('acme/demo#42'), 'https://github.com/acme/demo/issues/42');
	assert.equal(trackerRefLine('acme/demo#42'), '**Tracker:** [acme/demo#42](https://github.com/acme/demo/issues/42)');
	assert.throws(() => parseIssueRef('no-hash'));
});

// ---------------------------------------------------------------------------
// status map
// ---------------------------------------------------------------------------

test('mapIssueStatus follows the convention (closed overrides)', () => {
	assert.equal(mapIssueStatus('open', []), 'open');
	assert.equal(mapIssueStatus('OPEN', ['insrc:in-progress']), 'in-progress');
	assert.equal(mapIssueStatus('open', ['insrc:blocked']), 'blocked');
	assert.equal(mapIssueStatus('closed', ['insrc:in-progress']), 'closed');
});

// ---------------------------------------------------------------------------
// body renderers — slug-based doc links (the regression fix)
// ---------------------------------------------------------------------------

function makeDefine(): DefineArtifact {
	return {
		meta: { workflow: 'define', runId: 'r', repoPath: '/repo', focus: 'demo', epicHash: HASH, epicSlug: SLUG, createdAt: CREATED, schemaVersion: 1 },
		body: {
			flavor: 'new-capability',
			problem: 'Users cannot filter results. This blocks onboarding.',
			nonGoals: [{ text: 'Redesign UI', rationale: 'Out of scope' }],
			assumptions: [],
			constraints: [{ id: 'c1', text: 'Respect auth', type: 'invariant', source: 'c-01' }],
			stories: [{ id: 's1', title: 'Add filter field', userValue: 'type a filter', acceptanceCriteria: [], sizeEstimate: 'S' }],
			openQuestions: [],
		},
		citations: [],
	} as unknown as DefineArtifact;
}

test('renderEpicBody links slug-based docs (not hash)', () => {
	const body = renderEpicBody(makeDefine(), SLUG);
	assert.match(body, /## Stories/);
	assert.match(body, /- \[ \] s1: Add filter field \(S\)/);
	assert.match(body, new RegExp(`${EPIC_FOLDER}/HLD\\.md`));
	assert.match(body, new RegExp(`${EPIC_FOLDER}/DEF\\.md`));
	assert.doesNotMatch(body, /HLD-a1b2c3d4e5f60718\.md/);   // never the flat hash path
});

test('render*Body emit clickable blob links with a repo ref, bare paths without', () => {
	const repo = { owner: 'acme', repo: 'demo' };
	const epic = renderEpicBody(makeDefine(), SLUG, repo);
	assert.match(epic, new RegExp(`\\[\`${EPIC_FOLDER}/HLD\\.md\`\\]\\(https://github\\.com/acme/demo/blob/main/${EPIC_FOLDER}/HLD\\.md\\)`));
	const story: DefineStory = { id: 's2', title: 'T', userValue: 'v', acceptanceCriteria: [] };
	assert.match(renderStoryBody('acme/demo#1', story, SLUG, HASH, CREATED, repo), new RegExp(`blob/main/${EPIC_FOLDER}/S002/LLD\\.md`));
	// custom branch honored
	assert.match(renderEpicBody(makeDefine(), SLUG, { ...repo, branch: 'dev' }), new RegExp(`blob/dev/${EPIC_FOLDER}/`));
	// no repo ref → bare backticked path, no link
	assert.match(renderEpicBody(makeDefine(), SLUG), new RegExp(`- HLD: \`${EPIC_FOLDER}/HLD\\.md\``));
	assert.doesNotMatch(renderEpicBody(makeDefine(), SLUG), /github\.com/);
});

// ---------------------------------------------------------------------------
// commitAndPushArtifacts — the commit-on-approve helper
// ---------------------------------------------------------------------------

/** A fake exec: records git argv, and treats `diff --cached --quiet` as
 *  "there ARE staged changes" by throwing (its non-zero-exit signal), unless
 *  `nothingStaged`; optionally makes `push` throw. */
function fakeGit(opts: { nothingStaged?: boolean; pushFails?: boolean } = {}) {
	const calls: string[][] = [];
	const fn = ((cmd: string, args: readonly string[]) => {
		calls.push([cmd, ...args]);
		const a = args.join(' ');
		if (a.includes('diff --cached --quiet') && !opts.nothingStaged) throw new Error('exit 1: staged changes');
		if (a.includes('push') && opts.pushFails) throw new Error('no upstream');
		return '';
	}) as unknown as Parameters<typeof _setTrackerExecForTests>[0];
	return { fn, calls };
}

test('commitAndPushArtifacts stages, commits, and pushes present files', () => {
	const dir = mkdtempSync(join(tmpdir(), 'insrc-commit-'));
	const f = join(dir, 'a.json'); writeFileSync(f, '{}');
	const { fn, calls } = fakeGit();
	_setTrackerExecForTests(fn);
	try {
		const r = commitAndPushArtifacts(dir, [f], 'msg');
		assert.deepEqual({ committed: r.committed, pushed: r.pushed }, { committed: true, pushed: true });
		assert.ok(calls.some(c => c.includes('add')), 'staged');
		assert.ok(calls.some(c => c.includes('commit')), 'committed');
		assert.ok(calls.some(c => c.includes('push')), 'pushed');
	} finally { _setTrackerExecForTests(); rmSync(dir, { recursive: true, force: true }); }
});

test('commitAndPushArtifacts reports committed-not-pushed on push failure', () => {
	const dir = mkdtempSync(join(tmpdir(), 'insrc-commit-'));
	const f = join(dir, 'a.json'); writeFileSync(f, '{}');
	_setTrackerExecForTests(fakeGit({ pushFails: true }).fn);
	try {
		const r = commitAndPushArtifacts(dir, [f], 'msg');
		assert.equal(r.committed, true);
		assert.equal(r.pushed, false);
		assert.match(r.reason ?? '', /push failed/);
	} finally { _setTrackerExecForTests(); rmSync(dir, { recursive: true, force: true }); }
});

test('commitAndPushArtifacts is a no-op when nothing is staged', () => {
	const dir = mkdtempSync(join(tmpdir(), 'insrc-commit-'));
	const f = join(dir, 'a.json'); writeFileSync(f, '{}');
	const { fn, calls } = fakeGit({ nothingStaged: true });
	_setTrackerExecForTests(fn);
	try {
		const r = commitAndPushArtifacts(dir, [f], 'msg');
		assert.equal(r.committed, false);
		assert.match(r.reason ?? '', /nothing to commit/);
		assert.ok(!calls.some(c => c.includes('commit')), 'never committed');
	} finally { _setTrackerExecForTests(); rmSync(dir, { recursive: true, force: true }); }
});

test('commitAndPushArtifacts no-ops when no file is present', () => {
	const dir = mkdtempSync(join(tmpdir(), 'insrc-commit-'));
	_setTrackerExecForTests(fakeGit().fn);
	try {
		const r = commitAndPushArtifacts(dir, [join(dir, 'missing.json')], 'msg');
		assert.equal(r.committed, false);
		assert.match(r.reason ?? '', /no artifact files/);
	} finally { _setTrackerExecForTests(); rmSync(dir, { recursive: true, force: true }); }
});

test('renderStoryBody back-refs the Epic + links the slug LLD', () => {
	const story: DefineStory = { id: 's3', title: 'Third', userValue: 'v3', acceptanceCriteria: [{ id: 'ac1', given: 'x', when: 'y', then: 'z', operationalizes: [] }], sizeEstimate: 'M' };
	const body = renderStoryBody('acme/demo#42', story, SLUG, HASH, CREATED);
	assert.match(body, /^\*\*Epic:\*\* #42$/m);
	assert.match(body, /- \*\*ac1:\*\* Given x, when y, then z\./);
	assert.match(body, new RegExp(`${EPIC_FOLDER}/S003/LLD\\.md`));
	assert.match(body, /Size: M/);
});

test('updateEpicTaskList splices the link + is idempotent', () => {
	const before = ['## Stories', '', '- [ ] s1: Add filter field (S)', '- [ ] s2: Persist', ''].join('\n');
	const linked = updateEpicTaskList(before, 's1', 'acme/demo#7', 'Add filter field');
	assert.match(linked, /- \[ \] #7 — s1: Add filter field \(S\)/);
	assert.match(linked, /- \[ \] s2: Persist/);
	assert.equal(updateEpicTaskList(linked, 's1', 'acme/demo#7', 'Add filter field'), linked);   // idempotent
});

// ---------------------------------------------------------------------------
// resolveWorkflowRef — optional epic scope for a structural label (BUGFIX)
//
// A structural label (`s1/t1`) resolved ONLY in a single-epic artifacts dir.
// An optional `opts.epicHash` scope now lets it resolve in a MULTI-epic dir;
// every unscoped / non-label / single-epic path stays byte-identical.
// ---------------------------------------------------------------------------

// Two epics sharing a 4-char prefix (`aaaa`) so a short prefix is ambiguous,
// but each 8-char prefix is unique.
const EPIC_A_HASH = 'aaaa1111bbbb2222';
const EPIC_B_HASH = 'aaaa9999cccc8888';
const EPIC_A_CREATED = '2026-07-17T07:42:28.275Z';
const EPIC_B_CREATED = '2026-08-20T09:00:00.000Z';

function seedEpic(dir: string, hash: string, slug: string, createdAt: string, taskRef: string): void {
	writeFileSync(join(dir, `DEF-${hash}.json`), JSON.stringify({
		meta: { workflow: 'define', epicHash: hash, epicSlug: slug, createdAt, approvedAt: createdAt },
		body: { problem: 'p', stories: [{ id: 's1', title: 'Story one' }] },
		citations: [],
	}));
	writeFileSync(join(dir, `LLD-${hash}-s1.json`), JSON.stringify({
		meta: {
			workflow: 'design.story', schemaVersion: 1, epicHash: hash, epicSlug: slug,
			storyId: 's1', createdAt, approvedAt: createdAt, tracker: { storyRef: `acme/demo#${taskRef}0` },
		},
		body: { openQuestions: [] }, citations: [],
	}));
	writeFileSync(join(dir, `PLAN-${hash}-s1.json`), JSON.stringify({
		meta: {
			workflow: 'plan', schemaVersion: 1, epicHash: hash, epicSlug: slug, storyId: 's1', createdAt,
			tracker: { taskRefs: { t1: `acme/demo#${taskRef}` } },
		},
		body: { tasks: [{ id: 't1', title: 'T', summary: 's', size: 'S', order: 1, dependsOn: [], acceptanceChecks: [], derivedFrom: [], tests: [] }] },
		citations: [],
	}));
}

/** A tmp repo whose `.insrc/artifacts/` holds two epics, both with s1/t1. */
function mkMultiEpicRepo(): string {
	const repo = mkdtempSync(join(tmpdir(), 'insrc-resolve-multi-'));
	const dir = join(repo, ARTIFACTS_DIR);
	mkdirSync(dir, { recursive: true });
	seedEpic(dir, EPIC_A_HASH, 'epic-alpha', EPIC_A_CREATED, '101');
	seedEpic(dir, EPIC_B_HASH, 'epic-beta',  EPIC_B_CREATED, '202');
	return repo;
}

/** A tmp repo whose `.insrc/artifacts/` holds exactly one epic. */
function mkSingleEpicRepo(): string {
	const repo = mkdtempSync(join(tmpdir(), 'insrc-resolve-single-'));
	const dir = join(repo, ARTIFACTS_DIR);
	mkdirSync(dir, { recursive: true });
	seedEpic(dir, EPIC_A_HASH, 'epic-alpha', EPIC_A_CREATED, '101');
	return repo;
}

test('resolveWorkflowRef: scoped label resolves in a multi-epic dir (full hash + 8-char prefix)', () => {
	const repo = mkMultiEpicRepo();
	try {
		const full = resolveWorkflowRef(repo, 's1/t1', { epicHash: EPIC_A_HASH });
		assert.ok(full !== null, 'full-hash scope resolves');
		assert.equal(full!.level, 'task');
		assert.equal(full!.epicHash, EPIC_A_HASH);
		assert.equal(full!.storyId, 's1');
		assert.equal(full!.taskId, 't1');
		assert.equal(full!.issueRef, 'acme/demo#101');

		// An 8-char prefix that uniquely names epic A resolves identically.
		const prefixed = resolveWorkflowRef(repo, 's1/t1', { epicHash: 'aaaa1111' });
		assert.deepEqual(prefixed, full);

		// Scoping to epic B resolves to B's task instead.
		const b = resolveWorkflowRef(repo, 's1/t1', { epicHash: EPIC_B_HASH });
		assert.equal(b!.epicHash, EPIC_B_HASH);
		assert.equal(b!.issueRef, 'acme/demo#202');
	} finally { rmSync(repo, { recursive: true, force: true }); }
});

/** A tmp repo with two epics where only epic A holds s1/t1 — epic B is a
 *  DEF-only bystander (no declared stories, no LLD, no PLAN). */
function mkBystanderEpicRepo(): string {
	const repo = mkdtempSync(join(tmpdir(), 'insrc-resolve-bystander-'));
	const dir = join(repo, ARTIFACTS_DIR);
	mkdirSync(dir, { recursive: true });
	seedEpic(dir, EPIC_A_HASH, 'epic-alpha', EPIC_A_CREATED, '101');
	writeFileSync(join(dir, `DEF-${EPIC_B_HASH}.json`), JSON.stringify({
		meta: { workflow: 'define', epicHash: EPIC_B_HASH, epicSlug: 'epic-beta', createdAt: EPIC_B_CREATED, approvedAt: EPIC_B_CREATED },
		body: { problem: 'p', stories: [] },
		citations: [],
	}));
	return repo;
}

test('resolveWorkflowRef: a multi-epic dir where only ONE epic holds the label resolves it unscoped (S001/t5)', () => {
	// ADDED at S001/t5. The pre-existing multi-epic test below passes under BOTH
	// the old count rule and the new evidence rule, because its fixture gives
	// both epics a full s1/t1 — genuine ambiguity. So it pins nothing about the
	// change. This arm is the discriminating one: with a DEF-only bystander
	// present, the count rule refused and the evidence rule resolves.
	const repo = mkBystanderEpicRepo();
	try {
		const r = resolveWorkflowRef(repo, 's1/t1');
		assert.notEqual(r, null, 'the bystander epic evidences no s1, so the label is unambiguous');
		assert.equal(r!.epicHash, EPIC_A_HASH);
		assert.equal(r!.taskId, 't1');
		// The bystander itself still refuses the story it does not have.
		assert.equal(resolveWorkflowRef(repo, 's1/t1', { epicHash: EPIC_B_HASH }), null);
	} finally { rmSync(repo, { recursive: true, force: true }); }
});

test('resolveWorkflowRef: unscoped label still null in a multi-epic dir; single-epic still resolves unscoped', () => {
	const multi = mkMultiEpicRepo();
	try {
		// Still a refusal, but now for a different REASON: seedEpic gives BOTH
		// epics a DEF declaring s1 plus an LLD and a PLAN, so both genuinely
		// evidence s1/t1. That is real ambiguity, which the evidence rule
		// refuses exactly as the old count rule did.
		assert.equal(resolveWorkflowRef(multi, 's1/t1'), null);
	} finally { rmSync(multi, { recursive: true, force: true }); }

	const single = mkSingleEpicRepo();
	try {
		const r = resolveWorkflowRef(single, 's1/t1');   // unchanged single-epic resolve
		assert.ok(r !== null);
		assert.equal(r!.level, 'task');
		assert.equal(r!.epicHash, EPIC_A_HASH);
		assert.equal(r!.taskId, 't1');
	} finally { rmSync(single, { recursive: true, force: true }); }
});

test('resolveWorkflowRef: epicHash matching zero epics → null; a prefix matching >1 → null', () => {
	const repo = mkMultiEpicRepo();
	try {
		assert.equal(resolveWorkflowRef(repo, 's1/t1', { epicHash: 'ffffffff' }), null);   // zero matches
		assert.equal(resolveWorkflowRef(repo, 's1/t1', { epicHash: 'aaaa' }), null);        // >1 matches (ambiguous)
	} finally { rmSync(repo, { recursive: true, force: true }); }
});

test('resolveWorkflowRef: issue# and hierarchical-id forms resolve identically with or without opts.epicHash', () => {
	const repo = mkMultiEpicRepo();
	try {
		// issue# — scope is ignored off the label path; both resolve epic A's task.
		const issue     = resolveWorkflowRef(repo, '#101');
		const issueOpt  = resolveWorkflowRef(repo, '#101', { epicHash: EPIC_B_HASH });
		assert.ok(issue !== null);
		assert.equal(issue!.epicHash, EPIC_A_HASH);
		assert.deepEqual(issueOpt, issue);

		// owner/repo#N form, likewise unaffected.
		const ownerRepo = resolveWorkflowRef(repo, 'acme/demo#202', { epicHash: EPIC_A_HASH });
		assert.ok(ownerRepo !== null);
		assert.equal(ownerRepo!.epicHash, EPIC_B_HASH);

		// hierarchical id — take epic A's canonical id, resolve it with/without the opt.
		const scoped = resolveWorkflowRef(repo, 's1/t1', { epicHash: EPIC_A_HASH });
		assert.ok(scoped !== null);
		const viaHier    = resolveWorkflowRef(repo, scoped!.workflowId);
		const viaHierOpt = resolveWorkflowRef(repo, scoped!.workflowId, { epicHash: EPIC_B_HASH });
		assert.deepEqual(viaHier, scoped);
		assert.deepEqual(viaHierOpt, scoped);
	} finally { rmSync(repo, { recursive: true, force: true }); }
});
