/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Procix Software India. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/**
 * S005 — GitHub-issue create/link/close tests (t7).
 *
 * Units (no network, no DB): createBugfixTrackerIssue (config-gated create +
 * link + k4 body, standalone/unpushed/link-throw unlinked, none/GithubConfigError/
 * authOk skip, reused idempotent), closeBugfixTrackerIssue (close/skip/deleted-
 * propagates), the ghCloseIssue argv wrapper (via _setTrackerExecForTests), and
 * the prompt-on-lost-ref branches (recordRef-throw on create; no-ref on close).
 * Integration: a create -> record -> close round-trip over a fake `gh` + stubbed
 * config, plus the unconfigured no-op.
 *
 * Run:
 *   npx tsx --test src/workflow/__tests__/bugfix-tracker.test.ts
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import {
	createBugfixTrackerIssue,
	closeBugfixTrackerIssue,
	defaultTrackerCreateDeps,
	defaultTrackerCloseDeps,
	parentRefIdentifiers,
	type TrackerCreateDeps,
	type TrackerCloseDeps,
	type PromptOnLostRef,
} from '../bugfix/tracker.js';
import { renderIssueMarkdown, type IssueArtifact } from '../artifacts/issue.js';
import { _setTrackerExecForTests, ghCloseIssue, type CreatedIssue } from '../tracker/github.js';
import { GithubConfigError, type ResolvedGithubConfig } from '../config/github.js';
import { artifactJsonPath, issueArtifactId } from '../storage.js';
import type { WorkItemRef } from '../types.js';

// --- fixtures --------------------------------------------------------------

function issue(over: { parentRef?: WorkItemRef | null | undefined; hasParentRef?: boolean } = {}): IssueArtifact {
	const meta: Record<string, unknown> = {
		workflow: 'issue', runId: 'r', repoPath: '/repo', createdAt: '2026-01-01T00:00:00.000Z',
		elapsedMs: 1, repoIndexedAt: null, schemaVersion: 1, issueHash: 'abcd1234abcd1234',
		approvedAt: '2026-01-02T00:00:00.000Z',
	};
	if (over.hasParentRef === true || over.parentRef !== undefined) meta['parentRef'] = over.parentRef ?? null;
	return {
		meta: meta as IssueArtifact['meta'],
		body: { title: 'Fix the boom', reproduction: 'do X', rootCause: 'Y', fixIntent: 'Z' },
		citations: [],
	};
}

const GH: ResolvedGithubConfig = {
	type: 'github', owner: 'acme', repo: 'widget',
	epicLabel: 'insrc:epic', storyLabel: 'insrc:story', taskLabel: 'insrc:task',
	useMilestones: false, pushTasks: false, commitArtifacts: true,
	taskIssueType: 'Task', epicIssueType: 'Epic', storyIssueType: 'Story',
	source: 'per-repo-config',
};
const NONE: ResolvedGithubConfig = { type: 'none', source: 'default-config' };

const CREATED: CreatedIssue = { ref: 'acme/widget#42', id: 9001, typed: false };

interface CreateSpy {
	createCalls: Array<{ owner: string; repo: string; title: string; body: string; labels: readonly string[] }>;
	linkCalls: Array<{ parentRef: string; childId: number }>;
	recorded: Array<{ issueHash: string; ref: string }>;
}

function makeCreateDeps(over: Partial<TrackerCreateDeps> & { readonly spy?: CreateSpy } = {}): TrackerCreateDeps {
	const spy = over.spy ?? { createCalls: [], linkCalls: [], recorded: [] };
	return {
		resolveConfig:   over.resolveConfig ?? (() => GH),
		authOk:          over.authOk ?? (() => ({ ok: true })),
		readIssue:       over.readIssue ?? (() => issue({ parentRef: { slug: 'owner', storyId: 's1' } })),
		readRecordedRef: over.readRecordedRef ?? (() => null),
		renderBody:      over.renderBody ?? renderIssueMarkdown,
		createIssue:     over.createIssue ?? ((owner, repo, title, body, labels) => {
			spy.createCalls.push({ owner, repo, title, body, labels });
			return CREATED;
		}),
		resolveParentIssueRef: over.resolveParentIssueRef ?? (() => 'acme/widget#7'),
		linkSubIssue:    over.linkSubIssue ?? ((_o, _r, parentRef, childId) => { spy.linkCalls.push({ parentRef, childId }); }),
		recordRef:       over.recordRef ?? ((_p, issueHash, ref) => { spy.recorded.push({ issueHash, ref }); }),
		labels:          over.labels ?? [],
		promptOnLostRef: over.promptOnLostRef ?? (() => ({ action: 'skip' })),
	};
}

interface CloseSpy { closeCalls: Array<{ ref: string }>; recorded: Array<{ ref: string }> }

function makeCloseDeps(over: Partial<TrackerCloseDeps> & { readonly spy?: CloseSpy } = {}): TrackerCloseDeps {
	const spy = over.spy ?? { closeCalls: [], recorded: [] };
	return {
		resolveConfig:   over.resolveConfig ?? (() => GH),
		authOk:          over.authOk ?? (() => ({ ok: true })),
		readRecordedRef: over.readRecordedRef ?? (() => 'acme/widget#42'),
		closeIssue:      over.closeIssue ?? ((_o, _r, ref) => { spy.closeCalls.push({ ref }); }),
		recordRef:       over.recordRef ?? ((_p, _h, ref) => { spy.recorded.push({ ref }); }),
		findByLabels:    over.findByLabels ?? (() => undefined),
		labels:          over.labels ?? [],
		promptOnLostRef: over.promptOnLostRef ?? (() => ({ action: 'skip' })),
	};
}

const IN = { repoPath: '/repo', issueHash: 'abcd1234abcd1234' };

// --- createBugfixTrackerIssue: create + link + record ----------------------

test('createBugfixTrackerIssue: configured + parent resolves -> created+linked, k4 body verbatim, ref recorded', async () => {
	const spy: CreateSpy = { createCalls: [], linkCalls: [], recorded: [] };
	const iss = issue({ parentRef: { slug: 'owner', storyId: 's1' } });
	const deps = makeCreateDeps({ spy, readIssue: () => iss });
	const r = await createBugfixTrackerIssue(IN, deps);

	assert.equal(r.status, 'created');
	assert.equal(r.ref, 'acme/widget#42');
	assert.equal(r.linked, true);
	assert.equal(spy.createCalls.length, 1);
	assert.equal(spy.createCalls[0]!.title, 'Fix the boom');
	assert.equal(spy.createCalls[0]!.body, renderIssueMarkdown(iss), 'body is renderIssueMarkdown VERBATIM (k4)');
	assert.deepEqual(spy.linkCalls, [{ parentRef: 'acme/widget#7', childId: 9001 }]);
	assert.deepEqual(spy.recorded, [{ issueHash: IN.issueHash, ref: 'acme/widget#42' }]);
});

test('createBugfixTrackerIssue: standalone (parentRef null) -> created UNLINKED', async () => {
	const spy: CreateSpy = { createCalls: [], linkCalls: [], recorded: [] };
	const deps = makeCreateDeps({ spy, readIssue: () => issue({ parentRef: null }) });
	const r = await createBugfixTrackerIssue(IN, deps);
	assert.equal(r.status, 'created');
	assert.equal(r.linked, false);
	assert.equal(spy.linkCalls.length, 0, 'no link attempt for a standalone bugfix');
});

test('createBugfixTrackerIssue: parentRef present but resolveParentIssueRef null -> created unlinked, no link attempt', async () => {
	const spy: CreateSpy = { createCalls: [], linkCalls: [], recorded: [] };
	const deps = makeCreateDeps({ spy, readIssue: () => issue({ parentRef: { storyId: 's1' } }), resolveParentIssueRef: () => null });
	const r = await createBugfixTrackerIssue(IN, deps);
	assert.equal(r.status, 'created');
	assert.equal(r.linked, false);
	assert.equal(spy.linkCalls.length, 0);
});

test('createBugfixTrackerIssue: resolveConfig type:none -> skipped, NO createIssue (ac2)', async () => {
	const spy: CreateSpy = { createCalls: [], linkCalls: [], recorded: [] };
	const deps = makeCreateDeps({ spy, resolveConfig: () => NONE });
	const r = await createBugfixTrackerIssue(IN, deps);
	assert.equal(r.status, 'skipped');
	assert.equal(spy.createCalls.length, 0);
});

test('createBugfixTrackerIssue: resolveConfig throws GithubConfigError -> skipped, NO createIssue (ac2)', async () => {
	const spy: CreateSpy = { createCalls: [], linkCalls: [], recorded: [] };
	const deps = makeCreateDeps({ spy, resolveConfig: () => { throw new GithubConfigError('no target'); } });
	const r = await createBugfixTrackerIssue(IN, deps);
	assert.equal(r.status, 'skipped');
	assert.equal(spy.createCalls.length, 0);
});

test('createBugfixTrackerIssue: authOk false -> skipped, NO createIssue', async () => {
	const spy: CreateSpy = { createCalls: [], linkCalls: [], recorded: [] };
	const deps = makeCreateDeps({ spy, authOk: () => ({ ok: false, reason: 'run gh auth login' }) });
	const r = await createBugfixTrackerIssue(IN, deps);
	assert.equal(r.status, 'skipped');
	assert.equal(r.reason, 'run gh auth login');
	assert.equal(spy.createCalls.length, 0);
});

test('createBugfixTrackerIssue: meta.tracker already carries the ref -> reused, NO createIssue (idempotent)', async () => {
	const spy: CreateSpy = { createCalls: [], linkCalls: [], recorded: [] };
	const deps = makeCreateDeps({ spy, readRecordedRef: () => 'acme/widget#42' });
	const r = await createBugfixTrackerIssue(IN, deps);
	assert.equal(r.status, 'reused');
	assert.equal(r.ref, 'acme/widget#42');
	assert.equal(spy.createCalls.length, 0);
});

test('createBugfixTrackerIssue: linkSubIssue throws (sub-issues disabled) -> still created + recorded, linked:false', async () => {
	const spy: CreateSpy = { createCalls: [], linkCalls: [], recorded: [] };
	const deps = makeCreateDeps({ spy, linkSubIssue: () => { throw new Error('sub-issues disabled'); } });
	const r = await createBugfixTrackerIssue(IN, deps);
	assert.equal(r.status, 'created');
	assert.equal(r.linked, false);
	assert.deepEqual(spy.recorded, [{ issueHash: IN.issueHash, ref: 'acme/widget#42' }], 'ref still recorded despite link failure');
});

test('createBugfixTrackerIssue: createIssue throws (post-config) -> propagates, nothing recorded', async () => {
	const spy: CreateSpy = { createCalls: [], linkCalls: [], recorded: [] };
	const deps = makeCreateDeps({ spy, createIssue: () => { throw new Error('rate limited'); } });
	await assert.rejects(() => createBugfixTrackerIssue(IN, deps), /rate limited/);
	assert.equal(spy.recorded.length, 0);
});

// --- closeBugfixTrackerIssue -----------------------------------------------

test('closeBugfixTrackerIssue: recorded ref + configured -> closed', async () => {
	const spy: CloseSpy = { closeCalls: [], recorded: [] };
	const deps = makeCloseDeps({ spy });
	const r = await closeBugfixTrackerIssue(IN, deps);
	assert.equal(r.status, 'closed');
	assert.equal(r.ref, 'acme/widget#42');
	assert.deepEqual(spy.closeCalls, [{ ref: 'acme/widget#42' }]);
});

test('closeBugfixTrackerIssue: no recorded ref -> skipped, closeIssue NOT called (ac2 symmetry)', async () => {
	const spy: CloseSpy = { closeCalls: [], recorded: [] };
	const deps = makeCloseDeps({ spy, readRecordedRef: () => null });
	const r = await closeBugfixTrackerIssue(IN, deps);
	assert.equal(r.status, 'skipped');
	assert.equal(spy.closeCalls.length, 0);
});

test('closeBugfixTrackerIssue: resolveConfig none/GithubConfigError -> skipped, closeIssue NOT called', async () => {
	const spyA: CloseSpy = { closeCalls: [], recorded: [] };
	const rNone = await closeBugfixTrackerIssue(IN, makeCloseDeps({ spy: spyA, resolveConfig: () => NONE }));
	assert.equal(rNone.status, 'skipped');
	assert.equal(spyA.closeCalls.length, 0);

	const spyB: CloseSpy = { closeCalls: [], recorded: [] };
	const rErr = await closeBugfixTrackerIssue(IN, makeCloseDeps({ spy: spyB, resolveConfig: () => { throw new GithubConfigError('x'); } }));
	assert.equal(rErr.status, 'skipped');
	assert.equal(spyB.closeCalls.length, 0);
});

test('closeBugfixTrackerIssue: closeIssue throws (deleted issue) -> propagates', async () => {
	const deps = makeCloseDeps({ closeIssue: () => { throw new Error('issue not found'); } });
	await assert.rejects(() => closeBugfixTrackerIssue(IN, deps), /issue not found/);
});

// --- ghCloseIssue argv (the ONE new gh-verb) -------------------------------

test('ghCloseIssue: shells `gh issue close <N> --repo owner/repo` via the injectable _exec', () => {
	const seen: Array<{ cmd: string; args: readonly string[] }> = [];
	_setTrackerExecForTests((cmd, args) => { seen.push({ cmd, args }); return ''; });
	try {
		ghCloseIssue('acme', 'widget', 'acme/widget#42');
	} finally {
		_setTrackerExecForTests();
	}
	assert.equal(seen.length, 1);
	assert.equal(seen[0]!.cmd, 'gh', 'uses gh, not a shell');
	assert.deepEqual([...seen[0]!.args], ['issue', 'close', '42', '--repo', 'acme/widget']);
});

// --- prompt-on-lost-ref (resolved open-question) ---------------------------

test('prompt-on-lost-ref (create): recordRef throws -> promptOnLostRef gets the created ref; retry-record re-writes', async () => {
	let attempts = 0;
	const seen: string[] = [];
	const prompt: PromptOnLostRef = (ctx) => { seen.push(ctx.createdRef ?? ''); return { action: 'retry-record' }; };
	const deps = makeCreateDeps({
		promptOnLostRef: prompt,
		recordRef: () => { attempts += 1; if (attempts === 1) throw new Error('disk full'); /* 2nd ok */ },
	});
	const r = await createBugfixTrackerIssue(IN, deps);
	assert.equal(r.status, 'created');
	assert.equal(r.ref, 'acme/widget#42');
	assert.equal(r.reason, undefined, 'retry succeeded so no residual reason');
	assert.deepEqual(seen, ['acme/widget#42'], 'prompt was handed the created ref');
	assert.equal(attempts, 2);
});

test("prompt-on-lost-ref (create): 'skip' -> created with reason ref-unrecorded, no throw", async () => {
	const deps = makeCreateDeps({
		promptOnLostRef: () => ({ action: 'skip' }),
		recordRef: () => { throw new Error('disk full'); },
	});
	const r = await createBugfixTrackerIssue(IN, deps);
	assert.equal(r.status, 'created');
	assert.equal(r.ref, 'acme/widget#42');
	assert.equal(r.reason, 'ref-unrecorded');
});

test("prompt-on-lost-ref (close): no recorded ref + 'relink-by-label' -> re-discover via labels, re-record, close", async () => {
	const spy: CloseSpy = { closeCalls: [], recorded: [] };
	let findArgs: readonly string[] = [];
	const deps = makeCloseDeps({
		spy,
		readRecordedRef: () => null,
		labels: ['issue:abcd1234abcd1234'],
		findByLabels: (_o, _r, labels) => { findArgs = labels; return 'acme/widget#99'; },
		promptOnLostRef: () => ({ action: 'relink-by-label' }),
	});
	const r = await closeBugfixTrackerIssue(IN, deps);
	assert.equal(r.status, 'closed');
	assert.equal(r.ref, 'acme/widget#99');
	assert.deepEqual([...findArgs], ['issue:abcd1234abcd1234']);
	assert.deepEqual(spy.recorded, [{ ref: 'acme/widget#99' }]);
	assert.deepEqual(spy.closeCalls, [{ ref: 'acme/widget#99' }]);
});

test("prompt-on-lost-ref (close): 'relink-by-label' with no labels -> skipped (a2 dedup stays deferred)", async () => {
	const spy: CloseSpy = { closeCalls: [], recorded: [] };
	let findCalled = false;
	const deps = makeCloseDeps({
		spy, readRecordedRef: () => null, labels: [],
		findByLabels: () => { findCalled = true; return undefined; },
		promptOnLostRef: () => ({ action: 'relink-by-label' }),
	});
	const r = await closeBugfixTrackerIssue(IN, deps);
	assert.equal(r.status, 'skipped');
	assert.equal(findCalled, false, 'no label query when no labels configured');
	assert.equal(spy.closeCalls.length, 0);
});

test('close default (no prompter): skip never re-discovers by label', async () => {
	// The default promptOnLostRef = skip. A configured close with no recorded ref
	// must NOT fire the label query — it just reports skipped.
	let findCalled = false;
	const spy: CloseSpy = { closeCalls: [], recorded: [] };
	const deps = makeCloseDeps({ spy, readRecordedRef: () => null, findByLabels: () => { findCalled = true; return 'x'; } });
	const r = await closeBugfixTrackerIssue(IN, deps);   // default promptOnLostRef = skip
	assert.equal(r.status, 'skipped');
	assert.equal(findCalled, false, 'default skip never re-discovers by label');
});

test('normal create path: promptOnLostRef is never consulted (a1 no-per-create-round-trip)', async () => {
	// A successful create (recordRef ok) touches neither the prompt nor any label
	// query — TrackerCreateDeps structurally has no findByLabels member at all.
	let promptCalled = false;
	const deps = makeCreateDeps({ promptOnLostRef: () => { promptCalled = true; return { action: 'skip' }; } });
	const r = await createBugfixTrackerIssue(IN, deps);
	assert.equal(r.status, 'created');
	assert.equal(promptCalled, false, 'a successful create never prompts');
});

test('parentRefIdentifiers: slug first, then storyId; a bare epicHash is not a resolvable candidate (MED-1)', () => {
	assert.deepEqual(parentRefIdentifiers({ slug: 'E202609181703991c-S005', storyId: 's5' }), ['E202609181703991c-S005', 's5']);
	assert.deepEqual(parentRefIdentifiers({ storyId: 's5' }), ['s5']);
	assert.deepEqual(parentRefIdentifiers({ slug: 'E202609181703991c-S005' }), ['E202609181703991c-S005']);
	assert.deepEqual(parentRefIdentifiers({ epicHash: '1703991c69967193' }), [], 'epicHash alone is not a resolvable id form');
	assert.deepEqual(parentRefIdentifiers({}), []);
});

// --- integration: create -> record -> close round-trip over a fake gh ------

test('integration: configured repo -> create records the ref, close reads it back and closes (fake gh)', async () => {
	const dir = mkdtempSync(join(tmpdir(), 'bugfix-tracker-'));
	try {
		// Write an approved ISSUE-<hash>.json so the default fs-backed deps read/patch it.
		const iss = issue({ parentRef: null });
		const json = artifactJsonPath(dir, issueArtifactId('abcd1234abcd1234'));
		mkdirSync(join(json, '..'), { recursive: true });
		writeFileSync(json, `${JSON.stringify(iss, null, 2)}\n`);

		// Fake gh: `api POST .../issues` returns a created issue JSON; `issue close` is a no-op.
		const cmds: string[][] = [];
		_setTrackerExecForTests((cmd, args) => {
			cmds.push([cmd, ...args]);
			const a = args.join(' ');
			if (cmd === 'gh' && a.includes('api') && a.includes('POST') && /repos\/[^ ]+\/issues$/.test(String(args[3] ?? ''))) {
				return JSON.stringify({ number: 42, id: 9001 });
			}
			return '';
		});

		const createDeps = defaultTrackerCreateDeps();
		// Bypass the config file: force a github target + auth-ok on the injected deps.
		const cd: TrackerCreateDeps = { ...createDeps, resolveConfig: () => GH, authOk: () => ({ ok: true }) };
		const created = await createBugfixTrackerIssue({ repoPath: dir, issueHash: 'abcd1234abcd1234' }, cd);
		assert.equal(created.status, 'created');
		assert.equal(created.ref, 'acme/widget#42');

		// The ref was persisted to meta.tracker.issueRef.
		const after = JSON.parse(readFileSync(json, 'utf8')) as { meta?: { tracker?: { issueRef?: string } } };
		assert.equal(after.meta?.tracker?.issueRef, 'acme/widget#42');

		// Close reads it back and closes.
		const closeDeps = defaultTrackerCloseDeps();
		const cld: TrackerCloseDeps = { ...closeDeps, resolveConfig: () => GH, authOk: () => ({ ok: true }) };
		const closed = await closeBugfixTrackerIssue({ repoPath: dir, issueHash: 'abcd1234abcd1234' }, cld);
		assert.equal(closed.status, 'closed');
		assert.equal(closed.ref, 'acme/widget#42');
		assert.ok(cmds.some(c => c[0] === 'gh' && c[1] === 'issue' && c[2] === 'close'), 'a `gh issue close` was shelled');
	} finally {
		_setTrackerExecForTests();
		rmSync(dir, { recursive: true, force: true });
	}
});

test('integration: unconfigured repo -> no create/close commands, local issue unchanged (ac2)', async () => {
	const dir = mkdtempSync(join(tmpdir(), 'bugfix-tracker-'));
	try {
		const iss = issue({ parentRef: null });
		const json = artifactJsonPath(dir, issueArtifactId('abcd1234abcd1234'));
		mkdirSync(join(json, '..'), { recursive: true });
		const original = `${JSON.stringify(iss, null, 2)}\n`;
		writeFileSync(json, original);

		const cmds: string[][] = [];
		_setTrackerExecForTests((cmd, args) => { cmds.push([cmd, ...args]); return ''; });

		const cd: TrackerCreateDeps = { ...defaultTrackerCreateDeps(), resolveConfig: () => NONE };
		const created = await createBugfixTrackerIssue({ repoPath: dir, issueHash: 'abcd1234abcd1234' }, cd);
		assert.equal(created.status, 'skipped');

		const cld: TrackerCloseDeps = { ...defaultTrackerCloseDeps(), resolveConfig: () => NONE };
		const closed = await closeBugfixTrackerIssue({ repoPath: dir, issueHash: 'abcd1234abcd1234' }, cld);
		assert.equal(closed.status, 'skipped');

		assert.equal(cmds.filter(c => c[0] === 'gh').length, 0, 'no gh command was run for an unconfigured repo');
		assert.equal(readFileSync(json, 'utf8'), original, 'the local IssueArtifact is byte-unchanged');
	} finally {
		_setTrackerExecForTests();
		rmSync(dir, { recursive: true, force: true });
	}
});
