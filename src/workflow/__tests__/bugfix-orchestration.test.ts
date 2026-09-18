/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Procix Software India. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/**
 * S004 — scope-gated bugfix orchestration tests (t6).
 *
 * Units (no DB, no daemon): nextAfterIssue (magnitude route + invalid-magnitude),
 * admitBugfixAdvance (approved+resolved / null / absent / not-approved),
 * locateAndStampParent (stamp / standalone / not-found / not-approved / reject),
 * and the composed advanceBugfixAfterIssue wiring (issue-only gate, flag off).
 * Integration: a bugfix BUILD completes / is withheld through the REUSED
 * approveWorkflowTarget gate under codeReview.enforce (ac3).
 *
 * Run:
 *   npx tsx --test src/workflow/__tests__/bugfix-orchestration.test.ts
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { nextAfterIssue } from '../bugfix/next-after-issue.js';
import { admitBugfixAdvance } from '../bugfix/admit.js';
import { locateAndStampParent, defaultStampDeps } from '../bugfix/stamp.js';
import { advanceBugfixAfterIssue } from '../bugfix/advance.js';
import type { StampDeps } from '../bugfix/types.js';
import type { IssueArtifact } from '../artifacts/issue.js';
import type { ParentLocation } from '../locate/index.js';
import { artifactJsonPath, issueArtifactId, codeReviewArtifactId } from '../storage.js';
import { approveWorkflowTarget } from '../gates.js';
import type { BugfixMagnitude, WorkItemRef } from '../types.js';

// --- fixtures --------------------------------------------------------------

function issue(over: {
	magnitude?: BugfixMagnitude | undefined;
	approvedAt?: string | undefined;
	parentRef?: WorkItemRef | null | undefined;
	workflow?: string;
	hasParentRef?: boolean;
} = {}): IssueArtifact {
	const meta: Record<string, unknown> = {
		workflow:      over.workflow ?? 'issue',
		runId:         'r', repoPath: '/repo', createdAt: '2026-01-01T00:00:00.000Z',
		elapsedMs:     1, repoIndexedAt: null, schemaVersion: 1,
	};
	if (over.magnitude !== undefined)  meta['magnitude']  = over.magnitude;
	if (over.approvedAt !== undefined) meta['approvedAt'] = over.approvedAt;
	// distinguish "absent" from "explicit null": only set when hasParentRef or a value given
	if (over.hasParentRef === true || over.parentRef !== undefined) meta['parentRef'] = over.parentRef ?? null;
	return {
		meta: meta as IssueArtifact['meta'],
		body: { title: 'Fix the boom', reproduction: 'do X', rootCause: 'Y', fixIntent: 'Z' },
		citations: [],
	};
}

const APPROVED = '2026-01-02T00:00:00.000Z';
function loc(over: Partial<ParentLocation> = {}): ParentLocation {
	return { tier: 'semantic', parentRef: { slug: 'owner', storyId: 's1' }, confidence: 0.9, evidence: ['ev'], ...over };
}

// --- nextAfterIssue --------------------------------------------------------

test("nextAfterIssue: magnitude='small' -> standalone insrc_build_step (issue->build)", () => {
	const nc = nextAfterIssue(issue({ magnitude: 'small', approvedAt: APPROVED }), '/repo');
	assert.equal(nc.tool, 'insrc_build_step');
	assert.equal(nc.params['phase'], 'implement');
	assert.ok(nc.params['standalone']);
});

test("nextAfterIssue: magnitude='sized' -> standalone insrc_workflow_run design.story", () => {
	const nc = nextAfterIssue(issue({ magnitude: 'sized', approvedAt: APPROVED }), '/repo');
	assert.equal(nc.tool, 'insrc_workflow_run');
	assert.equal(nc.params['workflow'], 'design.story');
});

test('nextAfterIssue: the small build routes through the build-step NO-LLD path (sizeClass=trivial, consumable)', () => {
	// handleStandaloneImplement derives producesLld = sizeClass !== 'trivial' and
	// ignores an explicit producesLld — so a small bugfix (no LLD) MUST route as
	// 'trivial' or the reused build-step refuses with no-identity/plan-missing.
	const nc = nextAfterIssue(issue({ magnitude: 'small', approvedAt: APPROVED }), '/repo');
	const st = nc.params['standalone'] as { standalone?: boolean; sizeClass?: string; focus?: string };
	assert.equal(st.standalone, true);
	assert.equal(st.sizeClass, 'trivial', 'small bugfix uses the build-step no-LLD path');
	// the full defect scope rides in focus, not just the title
	assert.match(st.focus ?? '', /Fix the boom/);
	assert.match(st.focus ?? '', /do X/);
});

test('nextAfterIssue: the sized design.story spec carries the full defect body, not just the title', () => {
	const nc = nextAfterIssue(issue({ magnitude: 'sized', approvedAt: APPROVED }), '/repo');
	const p = nc.params['params'] as { storySpec?: string; storyTitle?: string };
	assert.equal(p.storyTitle, 'Fix the boom');
	assert.match(p.storySpec ?? '', /do X/);   // reproduction
	assert.match(p.storySpec ?? '', /Y/);       // rootCause
	assert.match(p.storySpec ?? '', /Z/);       // fixIntent
});

test('nextAfterIssue: emitted stage matches routeForSizeClass (small->build has no design.story)', () => {
	const small = nextAfterIssue(issue({ magnitude: 'small' }), '/repo');
	assert.notEqual(small.params['workflow'], 'design.story');
	const sized = nextAfterIssue(issue({ magnitude: 'sized' }), '/repo');
	assert.equal(sized.params['workflow'], 'design.story');
});

test('nextAfterIssue: magnitude absent/invalid -> throws invalid-magnitude', () => {
	assert.throws(() => nextAfterIssue(issue({ magnitude: undefined }), '/repo'), /invalid-magnitude/);
});

// --- admitBugfixAdvance ----------------------------------------------------

test('admitBugfixAdvance: approved + parentRef WorkItemRef -> admitted', () => {
	assert.deepEqual(
		admitBugfixAdvance(issue({ approvedAt: APPROVED, parentRef: { slug: 'o' } })),
		{ admitted: true },
	);
});

test('admitBugfixAdvance: approved + parentRef===null (standalone) -> admitted', () => {
	assert.equal(admitBugfixAdvance(issue({ approvedAt: APPROVED, parentRef: null })).admitted, true);
});

test('admitBugfixAdvance: approved + parentRef ABSENT -> not admitted', () => {
	const r = admitBugfixAdvance(issue({ approvedAt: APPROVED })); // no parentRef set
	assert.equal(r.admitted, false);
	assert.match(r.reason ?? '', /parent not resolved/);
});

test('admitBugfixAdvance: not approved -> not admitted', () => {
	const r = admitBugfixAdvance(issue({ parentRef: { slug: 'o' } }));
	assert.equal(r.admitted, false);
	assert.match(r.reason ?? '', /not approved/);
});

// --- locateAndStampParent (injected deps) ----------------------------------

function stampDeps(over: Partial<StampDeps> & { issue?: IssueArtifact | null; located?: ParentLocation; reject?: boolean } = {}): {
	deps: StampDeps; writes: { ref: WorkItemRef | null }[];
} {
	const writes: { ref: WorkItemRef | null }[] = [];
	const deps: StampDeps = {
		readIssue: over.readIssue ?? (() => (over.issue === undefined ? issue({ approvedAt: APPROVED }) : over.issue)),
		locateParent: over.locateParent ?? (async () => { if (over.reject) throw new Error('daemon down'); return over.located ?? loc(); }),
		writeParentRef: over.writeParentRef ?? ((_r, _h, ref) => { writes.push({ ref }); }),
	};
	return { deps, writes };
}

test('locateAndStampParent: WorkItemRef -> writeParentRef(ref); returns the ParentLocation', async () => {
	const { deps, writes } = stampDeps({ located: loc({ parentRef: { slug: 'owner' } }) });
	const out = await locateAndStampParent({ repoPath: '/repo', issueHash: 'h' }, deps);
	assert.deepEqual(out.parentRef, { slug: 'owner' });
	assert.deepEqual(writes, [{ ref: { slug: 'owner' } }]);
});

test('locateAndStampParent: standalone (null) -> writeParentRef(null)', async () => {
	const { deps, writes } = stampDeps({ located: loc({ tier: 'standalone', parentRef: null, confidence: 0 }) });
	await locateAndStampParent({ repoPath: '/repo', issueHash: 'h' }, deps);
	assert.deepEqual(writes, [{ ref: null }]);
});

test('locateAndStampParent: readIssue null -> throws issue-not-found, no write', async () => {
	const { deps, writes } = stampDeps({ issue: null });
	await assert.rejects(() => locateAndStampParent({ repoPath: '/repo', issueHash: 'h' }, deps), /issue-not-found/);
	assert.equal(writes.length, 0);
});

test('locateAndStampParent: not approved -> throws not-approved, no write', async () => {
	const { deps, writes } = stampDeps({ issue: issue({}) }); // no approvedAt
	await assert.rejects(() => locateAndStampParent({ repoPath: '/repo', issueHash: 'h' }, deps), /not-approved/);
	assert.equal(writes.length, 0);
});

test('locateAndStampParent: locateParent rejects -> propagates, no write', async () => {
	const { deps, writes } = stampDeps({ reject: true });
	await assert.rejects(() => locateAndStampParent({ repoPath: '/repo', issueHash: 'h' }, deps), /daemon down/);
	assert.equal(writes.length, 0);
});

test('locateAndStampParent: defectDescription is built from the issue body; touchedPaths empty', async () => {
	let seen: { touchedPaths: string[]; defectDescription: string } | null = null;
	const { deps } = stampDeps({ locateParent: async (i) => { seen = i; return loc(); } });
	await locateAndStampParent({ repoPath: '/repo', issueHash: 'h' }, deps);
	assert.ok(seen);
	assert.deepEqual(seen!.touchedPaths, []);
	assert.match(seen!.defectDescription, /Fix the boom/);
	assert.match(seen!.defectDescription, /do X/);
});

// --- defaultStampDeps: the real fs round-trip is a meta-only patch (k4) -----

test('defaultStampDeps: writeParentRef patches meta.parentRef only, body byte-unchanged (k4)', () => {
	const repo = mkdtempSync(join(tmpdir(), 'bugfix-stamp-'));
	try {
		const dir = join(repo, '.insrc', 'artifacts');
		mkdirSync(dir, { recursive: true });
		const hash = 'abc123def4567890';
		const json = artifactJsonPath(repo, issueArtifactId(hash));
		const original = issue({ magnitude: 'small', approvedAt: APPROVED });
		writeFileSync(json, JSON.stringify(original, null, 2));

		const deps = defaultStampDeps(async () => loc());
		deps.writeParentRef(repo, hash, { slug: 'owner', storyId: 's2' });

		const after = JSON.parse(readFileSync(json, 'utf8')) as IssueArtifact;
		assert.deepEqual(after.meta.parentRef, { slug: 'owner', storyId: 's2' });
		assert.deepEqual(after.body, original.body, 'body untouched (k4)');
		// readIssue round-trips the same file
		assert.ok(deps.readIssue(repo, hash));
		assert.equal(deps.readIssue(repo, 'missinghash00000000'), null);
	} finally {
		rmSync(repo, { recursive: true, force: true });
	}
});

// --- advanceBugfixAfterIssue (the composed wiring) -------------------------

test('advanceBugfixAfterIssue: bugfix issue -> stamps, admits, returns nextCall', async () => {
	// readIssue returns an approved issue; after the stamp the re-read reflects parentRef.
	let stamped: WorkItemRef | null | undefined;
	const deps: StampDeps = {
		readIssue: () => issue({ magnitude: 'sized', approvedAt: APPROVED, ...(stamped !== undefined ? { parentRef: stamped, hasParentRef: true } : {}) }),
		locateParent: async () => loc({ parentRef: { slug: 'owner' } }),
		writeParentRef: (_r, _h, ref) => { stamped = ref; },
	};
	const out = await advanceBugfixAfterIssue({ repoPath: '/repo', issueHash: 'h', repo: '/repo' }, deps);
	assert.deepEqual(out.location?.parentRef, { slug: 'owner' });
	assert.equal(out.admission?.admitted, true);
	assert.equal(out.nextCall?.params['workflow'], 'design.story');
});

test('advanceBugfixAfterIssue: non-issue artifact -> skipped, nothing routed', async () => {
	const deps: StampDeps = {
		readIssue: () => issue({ workflow: 'design.story', approvedAt: APPROVED }),
		locateParent: async () => loc(),
		writeParentRef: () => {},
	};
	const out = await advanceBugfixAfterIssue({ repoPath: '/repo', issueHash: 'h', repo: '/repo' }, deps);
	assert.match(out.skipped ?? '', /not an issue artifact/);
	assert.equal(out.nextCall, undefined);
});

test('advanceBugfixAfterIssue: bugfixCategory flag off -> skipped', async () => {
	const deps: StampDeps = { readIssue: () => issue({ approvedAt: APPROVED }), locateParent: async () => loc(), writeParentRef: () => {} };
	const out = await advanceBugfixAfterIssue({ repoPath: '/repo', issueHash: 'h', repo: '/repo' }, deps, { bugfixCategory: false });
	assert.match(out.skipped ?? '', /bugfixCategory/);
});

// --- integration: completion reuses approveWorkflowTarget (ac3) -------------

const HASH = 'abc123def4567890';
function withRepo(fn: (repo: string, dir: string) => void): void {
	const repo = mkdtempSync(join(tmpdir(), 'bugfix-complete-'));
	const dir = join(repo, '.insrc', 'artifacts');
	mkdirSync(dir, { recursive: true });
	try { fn(repo, dir); } finally { rmSync(repo, { recursive: true, force: true }); }
}
function writeBuild(dir: string, storyId: string): string {
	const p = join(dir, `BUILD-${HASH}-${storyId}.json`);
	writeFileSync(p, JSON.stringify({ meta: { workflow: 'build', epicHash: HASH, storyId }, body: {}, citations: [] }, null, 2));
	return p;
}
function writeCR(repo: string, storyId: string, verdict: 'pass' | 'block'): void {
	const json = artifactJsonPath(repo, codeReviewArtifactId(HASH, storyId));
	writeFileSync(json, JSON.stringify({ body: { verdict, counts: { high: verdict === 'block' ? 2 : 0, med: 0, low: 0 } } }, null, 2));
}
const isApproved = (p: string): boolean =>
	(JSON.parse(readFileSync(p, 'utf8')) as { meta?: { approvedAt?: string } }).meta?.approvedAt !== undefined;

test('ac3: a bugfix BUILD + enforce + CR pass -> completes via approveWorkflowTarget (reused gate)', () => {
	withRepo((repo, dir) => {
		const p = writeBuild(dir, 's4bf');
		writeCR(repo, 's4bf', 'pass');
		const out = approveWorkflowTarget({ repoPath: repo, artifactPath: p }, { enforce: true });
		assert.equal(out.skipped.length, 0);
		assert.ok(isApproved(p), 'a bugfix build completes when its CR passes under enforce');
	});
});

test('ac3: a bugfix BUILD + enforce + absent CR -> withheld into skipped[], not approved', () => {
	withRepo((repo, dir) => {
		const p = writeBuild(dir, 's4bf');
		const out = approveWorkflowTarget({ repoPath: repo, artifactPath: p }, { enforce: true });
		assert.ok(out.skipped.length >= 1, 'no CR under enforce withholds completion');
		assert.ok(!isApproved(p));
	});
});

test('ac3: a bugfix BUILD + enforce OFF + absent CR -> completes byte-identical (no new path)', () => {
	withRepo((repo, dir) => {
		const p = writeBuild(dir, 's4bf');
		const out = approveWorkflowTarget({ repoPath: repo, artifactPath: p }, { enforce: false });
		assert.equal(out.skipped.length, 0);
		assert.ok(isApproved(p));
	});
});
