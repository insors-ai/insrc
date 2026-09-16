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

import { mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { parseGithubRemoteUrl, commitAndPushArtifacts, _setTrackerExecForTests } from '../github.js';
import { parseIssueRef, buildRef, issueUrl, trackerRefLine } from '../refs.js';
import { renderEpicBody, renderStoryBody, updateEpicTaskList, mapIssueStatus } from '../conventions.js';
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
