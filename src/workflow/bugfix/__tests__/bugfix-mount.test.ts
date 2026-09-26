/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Procix Software India. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/**
 * S001 (surface-bugfix-workflow) — unit tests for the production mount
 * (advanceApprovedBugfixes). The advance / complete seams + meta read are
 * injected as spies, so the mount is exercised with no DB, no GitHub, no disk:
 * we assert WHICH completed artifact fires WHICH seam, that a throw is captured
 * as ok:false without propagating, and that non-bugfix / skipped inputs fire
 * nothing.
 *
 * Run:
 *   npx tsx --test src/workflow/bugfix/__tests__/bugfix-mount.test.ts
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { advanceApprovedBugfixes } from '../mount.js';
import type { AdvanceApprovedDeps } from '../mount.js';
import type { AdvanceResult, StampDeps } from '../types.js';
import type { TrackerCloseResult, TrackerCloseDeps } from '../tracker.js';

const REPO = '/repo';

// A stamp/close deps + inferCandidates that must never actually run (the seams
// are spied), present only to satisfy the injected-deps shape.
const inertStamp = {} as StampDeps;
const inertClose = {} as TrackerCloseDeps;
const inferNever: AdvanceApprovedDeps['inferCandidates'] = async () => {
	throw new Error('inferCandidates must not run when the seam is spied');
};

interface AdvanceCall { readonly input: { repoPath: string; issueHash: string; repo: string }; readonly opts: unknown }
interface CompleteCall { readonly input: { repoPath: string; issueHash: string }; readonly opts: unknown }

function harness(over: Partial<AdvanceApprovedDeps> & {
	readonly meta: Record<string, { workflow?: string; issueHash?: string } | null>;
}): {
	deps: { repoPath: string } & AdvanceApprovedDeps;
	advanceCalls: AdvanceCall[];
	completeCalls: CompleteCall[];
} {
	const advanceCalls: AdvanceCall[] = [];
	const completeCalls: CompleteCall[] = [];
	const deps = {
		repoPath: REPO,
		inferCandidates: inferNever,
		stampDeps: inertStamp,
		closeDeps: inertClose,
		readMeta: (p: string) => over.meta[p] ?? null,
		advance: over.advance ?? (async (input, _deps, opts): Promise<AdvanceResult> => {
			advanceCalls.push({ input, opts });
			return {};
		}),
		complete: over.complete ?? (async (input, _deps, opts): Promise<TrackerCloseResult> => {
			completeCalls.push({ input, opts });
			return { status: 'skipped', reason: 'no tracker configured' };
		}),
		...(over.bugfixCategory !== undefined ? { bugfixCategory: over.bugfixCategory } : {}),
	} as { repoPath: string } & AdvanceApprovedDeps;
	return { deps, advanceCalls, completeCalls };
}

test('an approved issue artifact fires advanceBugfixAfterIssue with {repoPath, issueHash, repo}', async () => {
	const p = '/repo/.insrc/artifacts/ISSUE-abc123.json';
	const { deps, advanceCalls, completeCalls } = harness({ meta: { [p]: { workflow: 'issue', issueHash: 'abc123' } } });
	const out = await advanceApprovedBugfixes([{ path: p }], deps);
	assert.equal(advanceCalls.length, 1);
	assert.deepEqual(advanceCalls[0]!.input, { repoPath: REPO, issueHash: 'abc123', repo: REPO });
	assert.equal(completeCalls.length, 0);
	assert.deepEqual(out, [{ kind: 'bugfix-advance', artifactPath: p, ok: true }]);
});

test('a non-bugfix approval fires no seam and returns an empty followOn', async () => {
	const p = '/repo/.insrc/artifacts/LLD-deadbeef-s001.json';
	const { deps, advanceCalls, completeCalls } = harness({ meta: { [p]: { workflow: 'design.story' } } });
	const out = await advanceApprovedBugfixes([{ path: p }], deps);
	assert.equal(advanceCalls.length, 0);
	assert.equal(completeCalls.length, 0);
	assert.deepEqual(out, []);
});

test('an issue artifact missing issueHash does NOT advance (guarded)', async () => {
	const p = '/repo/.insrc/artifacts/ISSUE-x.json';
	const { deps, advanceCalls } = harness({ meta: { [p]: { workflow: 'issue' } } });
	const out = await advanceApprovedBugfixes([{ path: p }], deps);
	assert.equal(advanceCalls.length, 0);
	assert.deepEqual(out, []);
});

test('a rejecting advance seam is captured as ok:false + note, never propagates', async () => {
	const p = '/repo/.insrc/artifacts/ISSUE-boom.json';
	const { deps } = harness({
		meta: { [p]: { workflow: 'issue', issueHash: 'boom' } },
		advance: async () => { throw new Error('stamp failed'); },
	});
	const out = await advanceApprovedBugfixes([{ path: p }], deps);
	assert.deepEqual(out, [{ kind: 'bugfix-advance', artifactPath: p, ok: false, note: 'stamp failed' }]);
});

test('a skipped advance result surfaces its reason as an ok:true note', async () => {
	const p = '/repo/.insrc/artifacts/ISSUE-skip.json';
	const { deps } = harness({
		meta: { [p]: { workflow: 'issue', issueHash: 'skip' } },
		advance: async () => ({ skipped: 'not an issue artifact' }),
	});
	const out = await advanceApprovedBugfixes([{ path: p }], deps);
	assert.deepEqual(out, [{ kind: 'bugfix-advance', artifactPath: p, ok: true, note: 'not an issue artifact' }]);
});

test('bugfixCategory:false is threaded through to the seam opts', async () => {
	const p = '/repo/.insrc/artifacts/ISSUE-gate.json';
	const { deps, advanceCalls } = harness({ meta: { [p]: { workflow: 'issue', issueHash: 'gate' } }, bugfixCategory: false });
	await advanceApprovedBugfixes([{ path: p }], deps);
	assert.deepEqual(advanceCalls[0]!.opts, { bugfixCategory: false });
});

test('a BUILD artifact carrying issueHash fires completeBugfixTracker', async () => {
	const p = '/repo/.insrc/artifacts/BUILD-abc-s001.json';
	const { deps, advanceCalls, completeCalls } = harness({ meta: { [p]: { issueHash: 'abc' } } });
	const out = await advanceApprovedBugfixes([{ path: p }], deps);
	assert.equal(advanceCalls.length, 0);
	assert.equal(completeCalls.length, 1);
	assert.deepEqual(completeCalls[0]!.input, { repoPath: REPO, issueHash: 'abc' });
	assert.equal(out[0]!.kind, 'bugfix-complete');
	assert.equal(out[0]!.ok, true);
});

test('a BUILD artifact WITHOUT issueHash fires no completion (current data-model reality)', async () => {
	const p = '/repo/.insrc/artifacts/BUILD-abc-s001.json';
	const { deps, completeCalls } = harness({ meta: { [p]: { workflow: 'build' } } });
	const out = await advanceApprovedBugfixes([{ path: p }], deps);
	assert.equal(completeCalls.length, 0);
	assert.deepEqual(out, []);
});

test('a batch fires the seam only for the matching completed artifact', async () => {
	const issueP = '/repo/.insrc/artifacts/ISSUE-abc.json';
	const lldP   = '/repo/.insrc/artifacts/LLD-abc-s001.json';
	const { deps, advanceCalls } = harness({
		meta: {
			[issueP]: { workflow: 'issue', issueHash: 'abc' },
			[lldP]:   { workflow: 'design.story' },
		},
	});
	const out = await advanceApprovedBugfixes([{ path: issueP }, { path: lldP }], deps);
	assert.equal(advanceCalls.length, 1);
	assert.equal(advanceCalls[0]!.input.issueHash, 'abc');
	assert.deepEqual(out, [{ kind: 'bugfix-advance', artifactPath: issueP, ok: true }]);
});

test('an unreadable / meta-less artifact is skipped (no seam, no throw)', async () => {
	const p = '/repo/.insrc/artifacts/ISSUE-missing.json';
	const { deps } = harness({ meta: { [p]: null } });
	const out = await advanceApprovedBugfixes([{ path: p }], deps);
	assert.deepEqual(out, []);
});
