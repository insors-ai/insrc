/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Procix Software India. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/**
 * Integration tests for the deterministic approve-time tracker push,
 * driven against a FAKE `gh`/`git` (injected via _setTrackerExecForTests)
 * so no network/real repo is needed.
 *
 * Covers: Epic + Story creation, nested `meta.tracker` writes, doc→issue
 * linkage (the `.md` gets a `**Tracker:**` line), slug-based doc links in
 * the issue body, the duplicate-adopt guard, and idempotence.
 *
 * Run: npx tsx --test src/workflow/__tests__/tracker-auto.test.ts
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync, readFileSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';

import { autoPushEpicOnHld, autoPushStoryOnLld } from '../tracker-auto.js';
import { _setTrackerExecForTests, type TrackerExec } from '../tracker/github.js';

const HASH = 'a1b2c3d4e5f60718';
const SLUG = 'demo-feature';

// ---------------------------------------------------------------------------
// Fake gh/git
// ---------------------------------------------------------------------------

function makeFakeGh() {
	let counter = 0;
	let findResult = '';                          // dup-guard: '' = none, '<n>' = adopt
	const bodies = new Map<string, string>();
	const calls: string[][] = [];
	const fn: TrackerExec = (cmd, args) => {
		calls.push([cmd, ...args]);
		if (cmd === 'git') return 'git@github.com:acme/demo.git\n';
		const [sub0, sub1] = args;
		if (sub0 === 'auth' || sub0 === 'label') return '';
		if (sub0 === 'api') {
			const pi = args.indexOf('POST');
			const path = pi >= 0 ? String(args[pi + 1] ?? '') : '';
			if (path.endsWith('/sub_issues')) return '';                 // native sub-issue link — ok
			if (path.endsWith('/issues')) {                              // issue create via REST (story now)
				counter += 1;
				const bodyArg = args.find(a => String(a).startsWith('body='));
				if (bodyArg !== undefined) bodies.set(String(counter), String(bodyArg).slice('body='.length));
				return JSON.stringify({ number: counter, id: 1000 + counter });
			}
			return '';
		}
		if (sub0 === 'issue') {
			if (sub1 === 'create') {
				counter += 1;
				const bi = args.indexOf('--body');
				bodies.set(String(counter), bi >= 0 ? String(args[bi + 1]) : '');
				return `https://github.com/acme/demo/issues/${counter}\n`;
			}
			if (sub1 === 'list') return findResult;
			if (sub1 === 'view') return args.includes('body') ? (bodies.get(String(args[2])) ?? '') : JSON.stringify({ state: 'OPEN', labels: [] });
			if (sub1 === 'edit') { const bi = args.indexOf('--body'); if (bi >= 0) bodies.set(String(args[2]), String(args[bi + 1])); return ''; }
			if (sub1 === 'comment') return '';
		}
		return '';
	};
	return { fn, calls, bodies, setFind: (r: string) => { findResult = r; }, createCount: () => counter };
}

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

function writeJson(path: string, obj: unknown): void {
	mkdirSync(dirname(path), { recursive: true });
	writeFileSync(path, JSON.stringify(obj, null, 2) + '\n');
}

/** tmp repo with a github.json (type: github → git-remote fallback) and
 *  the Define/HLD/LLD artifact JSONs. */
function setup(): { repo: string; hldJson: string; lldJson: string; defineJson: string; cleanup: () => void } {
	const repo = mkdtempSync(join(tmpdir(), 'insrc-tracker-'));
	mkdirSync(join(repo, 'docs/defines'), { recursive: true });
	mkdirSync(join(repo, 'docs/designs'), { recursive: true });
	const ghCfg = join(repo, 'github.json');
	writeFileSync(ghCfg, JSON.stringify({ default: { type: 'github' } }));
	process.env['INSRC_GITHUB_CONFIG'] = ghCfg;

	const defineJson = join(repo, '.insrc/artifacts', `DEF-${HASH}.json`);
	writeJson(defineJson, {
		meta: { workflow: 'define', runId: 'd1', repoPath: repo, focus: 'demo', epicHash: HASH, epicSlug: SLUG, createdAt: '', schemaVersion: 1 },
		body: {
			flavor: 'new-capability',
			problem: 'Users cannot filter results. This blocks onboarding.',
			nonGoals: [], assumptions: [],
			constraints: [{ id: 'c1', text: 'Respect auth', type: 'invariant', source: 'c-01' }],
			stories: [{ id: 's1', title: 'Add filter field', userValue: 'type a filter', acceptanceCriteria: [], sizeEstimate: 'S' }],
			openQuestions: [],
		},
		citations: [],
	});
	const hldJson = join(repo, '.insrc/artifacts', `HLD-${HASH}.json`);
	writeJson(hldJson, { meta: { workflow: 'design.epic', runId: 'h1', repoPath: repo, epicHash: HASH, epicSlug: SLUG, schemaVersion: 1 }, body: {} });
	const lldJson = join(repo, '.insrc/artifacts', `LLD-${HASH}-s1.json`);
	writeJson(lldJson, { meta: { workflow: 'design.story', runId: 'l1', repoPath: repo, epicHash: HASH, epicSlug: SLUG, storyId: 's1', hldBaseRunId: 'h1', hldEffectiveHash: 'deadbeefcafe', hldAmendmentsApplied: [], schemaVersion: 1 }, body: {} });

	return { repo, hldJson, lldJson, defineJson, cleanup: () => { delete process.env['INSRC_GITHUB_CONFIG']; _setTrackerExecForTests(); rmSync(repo, { recursive: true, force: true }); } };
}

function trackerOf(jsonPath: string): Record<string, unknown> {
	return (JSON.parse(readFileSync(jsonPath, 'utf8')) as { meta: { tracker?: Record<string, unknown> } }).meta.tracker ?? {};
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

test('HLD approve creates the Epic issue, links docs, and writes nested meta.tracker', () => {
	const gh = makeFakeGh();
	_setTrackerExecForTests(gh.fn);
	const s = setup();
	try {
		const r = autoPushEpicOnHld(s.hldJson);
		assert.equal(r.status, 'created');
		assert.equal(r.status === 'created' ? r.epicRef : '', 'acme/demo#1');

		// nested meta.tracker on BOTH the HLD and the Define (aggregate).
		assert.equal(trackerOf(s.hldJson)['epicRef'], 'acme/demo#1');
		assert.equal(trackerOf(s.defineJson)['epicRef'], 'acme/demo#1');

		// doc → issue: the Define markdown gained a Tracker link.
		const defineMd = readFileSync(join(s.repo, 'docs/defines', `DEF-${SLUG}.md`), 'utf8');
		assert.match(defineMd, /\*\*Tracker:\*\* \[acme\/demo#1\]/);

		// issue body carries slug-based doc links (not hash).
		const epicBody = gh.bodies.get('1') ?? '';
		assert.match(epicBody, new RegExp(`docs/designs/HLD-${SLUG}\\.md`));
		assert.doesNotMatch(epicBody, /HLD-a1b2c3d4e5f60718\.md/);
	} finally { s.cleanup(); }
});

test('LLD approve creates the Story issue + aggregates into the Define; links the LLD doc', () => {
	const gh = makeFakeGh();
	_setTrackerExecForTests(gh.fn);
	const s = setup();
	try {
		autoPushEpicOnHld(s.hldJson);           // epic first (LLD needs the epicRef)
		const r = autoPushStoryOnLld(s.lldJson);
		assert.equal(r.status, 'created');
		assert.equal(r.status === 'created' ? r.storyRef : '', 'acme/demo#2');

		assert.equal(trackerOf(s.lldJson)['storyRef'], 'acme/demo#2');
		assert.deepEqual(trackerOf(s.defineJson)['storyRefs'], { s1: 'acme/demo#2' });
	} finally { s.cleanup(); }
});

test('re-approving the HLD is idempotent (no second issue)', () => {
	const gh = makeFakeGh();
	_setTrackerExecForTests(gh.fn);
	const s = setup();
	try {
		autoPushEpicOnHld(s.hldJson);
		const before = gh.createCount();
		const r = autoPushEpicOnHld(s.hldJson);
		assert.equal(r.status, 'already-exists');
		assert.equal(gh.createCount(), before);   // no new create
	} finally { s.cleanup(); }
});

test('duplicate guard adopts an existing Epic issue instead of creating one', () => {
	const gh = makeFakeGh();
	gh.setFind('9');                             // an epic issue already exists
	_setTrackerExecForTests(gh.fn);
	const s = setup();
	try {
		const r = autoPushEpicOnHld(s.hldJson);
		assert.equal(r.status, 'already-exists');
		assert.equal(r.status === 'already-exists' ? r.epicRef : '', 'acme/demo#9');
		assert.equal(gh.createCount(), 0);       // adopted, not created
		assert.equal(trackerOf(s.hldJson)['epicRef'], 'acme/demo#9');
	} finally { s.cleanup(); }
});

test('tracker disabled (no config) skips cleanly', () => {
	const gh = makeFakeGh();
	_setTrackerExecForTests(gh.fn);
	const s = setup();
	// Point at a path that does not exist → the loader returns {} → type: none.
	// (Deleting the env var would fall back to the user's real ~/.insrc/github.json,
	// making the test non-hermetic — it fails whenever a real tracker is configured.)
	process.env['INSRC_GITHUB_CONFIG'] = join(s.repo, 'no-such-github.json');
	try {
		const r = autoPushEpicOnHld(s.hldJson);
		assert.equal(r.status, 'skipped');
	} finally { s.cleanup(); }
});

test('missing required meta fields skip', () => {
	const gh = makeFakeGh();
	_setTrackerExecForTests(gh.fn);
	const s = setup();
	try {
		writeJson(s.hldJson, { meta: { workflow: 'design.epic', runId: 'h1', repoPath: s.repo }, body: {} });
		const r = autoPushEpicOnHld(s.hldJson);
		assert.equal(r.status, 'skipped');
		assert.equal(r.status === 'skipped' && /missing epicHash/.test(r.reason), true);
	} finally { s.cleanup(); }
});
