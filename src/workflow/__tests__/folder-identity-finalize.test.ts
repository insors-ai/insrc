/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Procix Software India. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/**
 * S001/t8 — CALL-SITE coverage for the folder-identity Story, through the real
 * finalize entry point.
 *
 * WHY THIS FILE EXISTS. t7 extracted `inheritedEpicSlug` / `inheritedStandalone`
 * so the inherit-then-fallback shape could be asserted, and its tests call those
 * helpers DIRECTLY. The post-build validate gate then pointed out the hole that
 * leaves: restoring the unconditional derivation at the orchestrator CALL SITE
 * would turn nothing red, because no test reaches `finalizeStandaloneLld` or
 * `finalizePlan` at all. Nothing asserted on a PERSISTED artifact's metadata —
 * which is the only thing that actually decides a folder.
 *
 * t7's own header claimed those finalizers were "module-private async functions
 * with no seam". That was simply wrong: `finalizeArtifact` is exported and
 * dispatches to both, and four companion tests already drive it. These tests use
 * that seam, so the call sites are covered by the same standard as the helpers.
 *
 * Every assertion here is on the artifact the finalizer RETURNS (and the path it
 * resolves), never on an expression re-typed inside the test.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { finalizeArtifact } from '../orchestrator.js';
import { deriveWorkItemIdentity, resolveArtifactMdPath } from '../path-scheme.js';
import { workItemKindOf } from '../storage.js';
import type { WorkflowIntent } from '../types.js';
import type { LldArtifact } from '../artifacts/lld.js';

/** The folder the REAL path builder composes from an artifact's own PERSISTED
 *  metadata. Nothing here is re-typed from the implementation: the metadata is
 *  whatever the finalizer wrote, and the builder is the shipping one. */
function folderFor(repo: string, meta: { epicHash?: string; epicSlug?: string; createdAt?: string; epicCreatedAt?: string; standalone?: boolean }, storyId: string): string {
	const anchor = meta.epicCreatedAt ?? meta.createdAt!;
	const identity = deriveWorkItemIdentity(meta.epicHash!, anchor, storyId);
	return resolveArtifactMdPath(repo, identity, 'LLD', workItemKindOf(meta), meta.epicSlug!);
}

const HASH = 'c4d5e6f708192a3b';
/** What the ISSUE (the definition head) calls this work item. */
const HEAD_SLUG = 'the-definition-head-label';
/** The focus the LLD stage runs with — deriving a visibly DIFFERENT slug. This
 *  divergence is the live defect: the ISSUE said one thing, the LLD coined
 *  another, and the work item ended up with two folders. */
const STAGE_FOCUS = 'a completely different wording for the very same work item';
const ISSUE_MADE = '2026-04-09T08:30:00.000Z';

function minimalLldBody(): Record<string, unknown> {
	return {
		hldContextSlice: { frameworkSummary: 'standalone', ownedContracts: [], consumedContracts: [], boundary: { storyId: 'S001', owns: [], depends: [], internal: 'x' }, adjacentBoundaries: [], rolloutPhase: 'standalone', nonFunctional: {} },
		contractDetails: { surfaceLevel: 'internal', api: [] },
		dataModelChanges: [],
		interactionWithShared: [],
		errorPaths: { errorCases: [], edgeCases: [], invariantsToPreserve: [] },
		testStrategy: { testLevels: [], acceptanceMapping: [], testFramework: 'node:test' },
		alternativesConsidered: [{ id: 'a1', name: 'n', oneLineSummary: 'x', approach: 'x', pros: ['x'], cons: ['x'], costEstimate: 'S' }],
		chosenAlternative: 'a1',
		openQuestions: [],
	};
}

function standaloneLldIntent(repo: string): WorkflowIntent {
	return {
		workflow: 'design.story', focus: STAGE_FOCUS, repoPath: repo,
		repoIndexedAt: null,
		params: { standalone: true, epicHash: HASH, storyId: 'S001', sizeClass: 'small' },
	} as unknown as WorkflowIntent;
}

/** A repo whose definition head is an ISSUE carrying HEAD_SLUG. */
function seedIssueRepo(opts: { slug?: string | undefined; standalone?: boolean } = {}): string {
	const repo = mkdtempSync(join(tmpdir(), 'insrc-t8-'));
	mkdirSync(join(repo, '.insrc', 'artifacts'), { recursive: true });
	const meta: Record<string, unknown> = { epicHash: HASH, createdAt: ISSUE_MADE };
	const slug = 'slug' in opts ? opts.slug : HEAD_SLUG;
	if (slug !== undefined) meta['epicSlug'] = slug;
	if (opts.standalone !== undefined) meta['standalone'] = opts.standalone;
	writeFileSync(join(repo, '.insrc', 'artifacts', `ISSUE-${HASH}.json`), JSON.stringify({ meta, body: {} }));
	return repo;
}

test('t8/t3 CALL SITE: a finalized standalone LLD PERSISTS the definition head\'s label, not one derived from its own focus', async () => {
	const repo = seedIssueRepo({ standalone: true });
	try {
		const emit = { body: minimalLldBody(), citations: [{ id: 'c1', kind: 'code', ref: 'src/x.ts' }] };
		const result = await finalizeArtifact(standaloneLldIntent(repo), {}, 'wf-t8-a', 5, emit, 'client');
		assert.equal(result.ok, true, `finalize failed: ${JSON.stringify((result as { failure?: unknown }).failure)}`);

		const artifact = result.finalized.artifact as LldArtifact;
		// The assertion that the helper tests could not make: what was WRITTEN.
		assert.equal(
			artifact.meta.epicSlug, HEAD_SLUG,
			'the persisted LLD must carry the ISSUE\'s label',
		);
		// And the derived-from-focus label must appear nowhere, since that is what
		// composes the second folder.
		assert.ok(
			!String(artifact.meta.epicSlug).includes('completely-different'),
			`the stage focus must not supply the label, got ${artifact.meta.epicSlug}`,
		);
		// The folder follows from the label, which is the whole point. Composed by
		// the shipping builder from the metadata the finalizer actually wrote.
		const folder = folderFor(repo, artifact.meta, 'S001');
		assert.ok(folder.includes(`${HEAD_SLUG}-E`), `must land in the head's folder, got ${folder}`);
		assert.ok(folder.includes('/docs/standalone/'), `a standalone item belongs under docs/standalone, got ${folder}`);
	} finally { rmSync(repo, { recursive: true, force: true }); }
});

test('t8/t3 CALL SITE: with NO definition head, the finalized LLD still falls back to a label derived from its focus', async () => {
	// Proves the fallback stayed REACHABLE at the call site — a guard that
	// survives in source while becoming unreachable is indistinguishable from a
	// deleted one.
	const repo = mkdtempSync(join(tmpdir(), 'insrc-t8-nohead-'));
	try {
		const emit = { body: minimalLldBody(), citations: [{ id: 'c1', kind: 'code', ref: 'src/x.ts' }] };
		const result = await finalizeArtifact(standaloneLldIntent(repo), {}, 'wf-t8-b', 5, emit, 'client');
		assert.equal(result.ok, true, `finalize failed: ${JSON.stringify((result as { failure?: unknown }).failure)}`);
		const artifact = result.finalized.artifact as LldArtifact;
		const slug = String(artifact.meta.epicSlug ?? '');
		assert.ok(slug.length > 0, 'a label must still be produced');
		assert.notEqual(slug, HEAD_SLUG, 'it cannot be the head label — there is no head');
		assert.ok(!slug.startsWith('-'), `a folder name must not begin with a separator, got ${slug}`);
	} finally { rmSync(repo, { recursive: true, force: true }); }
});

test('t8/t3 CALL SITE: an EMPTY label on the definition head is treated as absent at the call site too', async () => {
	const repo = seedIssueRepo({ slug: '', standalone: true });
	try {
		const emit = { body: minimalLldBody(), citations: [{ id: 'c1', kind: 'code', ref: 'src/x.ts' }] };
		const result = await finalizeArtifact(standaloneLldIntent(repo), {}, 'wf-t8-c', 5, emit, 'client');
		assert.equal(result.ok, true, `finalize failed: ${JSON.stringify((result as { failure?: unknown }).failure)}`);
		const artifact = result.finalized.artifact as LldArtifact;
		const slug = String(artifact.meta.epicSlug ?? '');
		assert.ok(slug.length > 0, 'an empty stored label must not become the folder name');
		assert.ok(!slug.startsWith('-'), `no folder name may begin with a separator, got ${slug}`);
		const folder = folderFor(repo, artifact.meta, 'S001');
		assert.ok(!folder.includes('/-'), `no path segment may begin with a separator, got ${folder}`);
	} finally { rmSync(repo, { recursive: true, force: true }); }
});

// ---------------------------------------------------------------------------
// t8/t4a — the PLAN call site.
//
// t4a's guard lives in `finalizePlan`, and the validate gate found nothing
// asserting on a WRITTEN PlanArtifact's meta.standalone. Worse, the t7 test that
// looked like it covered the prohibition was SELF-REFERENTIAL: it re-typed the
// `...(flag === true ? ... : {})` spread inside the test body and asserted on
// that copy, so it stayed green no matter what finalizePlan did. These drive the
// real finalizer and assert on what it returns.
// ---------------------------------------------------------------------------

/** A minimal VALID plan body: one Task that derives from the one citation, which
 *  the plan's cross-artifact coverage check requires. */
function minimalPlanBody(): Record<string, unknown> {
	return {
		tasks: [{
			id: 't1', title: 'A task', summary: 'Does the thing.', size: 'S', order: 1,
			dependsOn: [], acceptanceChecks: ['it holds'], derivedFrom: ['c1'],
			tests: [{ level: 'unit', name: 'unit: t1 works' }],
		}],
		testStrategyCoverage: [],
	};
}

function planIntent(repo: string): WorkflowIntent {
	return {
		workflow: 'plan', focus: STAGE_FOCUS, repoPath: repo,
		repoIndexedAt: null,
		params: { standalone: true, epicHash: HASH, storyId: 'S001' },
	} as unknown as WorkflowIntent;
}

/** Seed an APPROVED standalone LLD — approved so the plan gate admits it, and
 *  standalone so there is no parent HLD to be stale against. */
function seedApprovedLld(repo: string, over: Record<string, unknown> = {}): void {
	const meta = {
		workflow: 'design.story', epicHash: HASH, storyId: 'S001',
		epicSlug: HEAD_SLUG, standalone: true,
		createdAt: ISSUE_MADE, epicCreatedAt: ISSUE_MADE,
		approvedAt: '2026-04-09T09:00:00.000Z',
		runId: 'wf-seed-lld',
		...over,
	};
	writeFileSync(
		join(repo, '.insrc', 'artifacts', `LLD-${HASH}-S001.json`),
		JSON.stringify({ meta, body: minimalLldBody() }),
	);
}

test('t8/t4a CALL SITE: a finalized PLAN for a standalone work item PERSISTS the placement flag', async () => {
	const repo = seedIssueRepo({ standalone: true });
	try {
		seedApprovedLld(repo);
		const emit = { body: minimalPlanBody(), citations: [{ id: 'c1', kind: 'code', ref: 'src/x.ts' }] };
		const result = await finalizeArtifact(planIntent(repo), {}, 'wf-t8-plan', 5, emit, 'client');
		assert.equal(result.ok, true, `finalize failed: ${JSON.stringify((result as { failure?: unknown }).failure)}`);

		const meta = result.finalized.artifact.meta as { standalone?: boolean; epicSlug?: string };
		// The assertion that did not exist: the WRITTEN flag. Before t4a the PLAN
		// carried no `standalone` at all, so a standalone story's PLAN.md landed
		// under docs/epics while its own LLD.md sat under docs/standalone.
		assert.equal(meta.standalone, true, 'the written PLAN must carry the placement flag');
		const folder = folderFor(repo, result.finalized.artifact.meta as never, 'S001');
		assert.ok(folder.includes('/docs/standalone/'), `the PLAN belongs under docs/standalone, got ${folder}`);
	} finally { rmSync(repo, { recursive: true, force: true }); }
});

test('t8/t4a CALL SITE: an epic-parented PLAN still writes NO placement key at all', async () => {
	// The prohibition, asserted over WRITTEN metadata rather than over a copy of
	// the spread expression: a false must contribute no key, so mergeWithPrior can
	// still carry a prior true forward and the old relocate-and-orphan bug cannot
	// return through this path.
	const repo = mkdtempSync(join(tmpdir(), 'insrc-t8-epic-'));
	try {
		mkdirSync(join(repo, '.insrc', 'artifacts'), { recursive: true });
		// A DEF head that is explicitly NOT standalone, and an LLD to match.
		writeFileSync(join(repo, '.insrc', 'artifacts', `DEF-${HASH}.json`),
			JSON.stringify({ meta: { epicHash: HASH, epicSlug: HEAD_SLUG, createdAt: ISSUE_MADE, standalone: false }, body: {} }));
		// staleAckedAt short-circuits the HLD-staleness branch, so this test needs no
		// parent HLD on disk — HLD staleness is orthogonal to placement.
		seedApprovedLld(repo, { standalone: false, staleAckedAt: '2026-04-09T09:30:00.000Z' });
		const emit = { body: minimalPlanBody(), citations: [{ id: 'c1', kind: 'code', ref: 'src/x.ts' }] };
		const result = await finalizeArtifact(planIntent(repo), {}, 'wf-t8-plan-epic', 5, emit, 'client');
		assert.equal(result.ok, true, `finalize failed: ${JSON.stringify((result as { failure?: unknown }).failure)}`);

		const meta = result.finalized.artifact.meta as Record<string, unknown>;
		assert.ok(!('standalone' in meta), `an epic-parented PLAN must write no standalone key, got ${JSON.stringify(meta['standalone'])}`);
		const folder = folderFor(repo, meta as never, 'S001');
		assert.ok(folder.includes('/docs/epics/'), `an epic item belongs under docs/epics, got ${folder}`);
	} finally { rmSync(repo, { recursive: true, force: true }); }
});

// ---------------------------------------------------------------------------
// ISSUE-3a98d279 — the LABEL comes from the definition head, not the LLD.
//
// The sibling tests above cover the LLD's OWN label being inherited from the
// head. These cover the next hop: a PLAN finalized against an LLD whose label
// DISAGREES with the head. That is the live arrangement that forked work items
// — an LLD written before the label fix kept its own re-derived slug, and every
// downstream stage followed it instead of the definition.
// ---------------------------------------------------------------------------

/** What an LLD written before the label fix persisted for itself. */
const LLD_OWN_SLUG = 'a-label-the-lld-coined-for-itself';

test('3a98d279 — a PLAN whose LLD carries a DIFFERENT label still takes the definition head\'s', async () => {
	const repo = seedIssueRepo({ standalone: true });
	try {
		// The ISSUE says HEAD_SLUG; the approved LLD says something else entirely.
		seedApprovedLld(repo, { epicSlug: LLD_OWN_SLUG });
		const emit = { body: minimalPlanBody(), citations: [{ id: 'c1', kind: 'code', ref: 'src/x.ts' }] };
		const result = await finalizeArtifact(planIntent(repo), {}, 'wf-3a98-plan', 5, emit, 'client');
		assert.equal(result.ok, true, `finalize failed: ${JSON.stringify((result as { failure?: unknown }).failure)}`);

		const meta = result.finalized.artifact.meta as { epicSlug?: string };
		assert.equal(meta.epicSlug, HEAD_SLUG, 'the PLAN must carry the head\'s label');
		assert.notEqual(meta.epicSlug, LLD_OWN_SLUG, 'and must NOT inherit the LLD\'s own');

		const folder = folderFor(repo, result.finalized.artifact.meta as never, 'S001');
		assert.ok(folder.includes(`${HEAD_SLUG}-E`), `must land in the head's folder, got ${folder}`);
		assert.ok(!folder.includes(LLD_OWN_SLUG), `the LLD's label must name no folder, got ${folder}`);
	} finally { rmSync(repo, { recursive: true, force: true }); }
});

test('3a98d279 — with NO definition head, a PLAN still falls back rather than composing an empty label', async () => {
	// Proves the fallback stayed reachable at this call site after the source change.
	const repo = mkdtempSync(join(tmpdir(), 'insrc-3a98-nohead-'));
	try {
		mkdirSync(join(repo, '.insrc', 'artifacts'), { recursive: true });
		seedApprovedLld(repo, { epicSlug: LLD_OWN_SLUG });
		const emit = { body: minimalPlanBody(), citations: [{ id: 'c1', kind: 'code', ref: 'src/x.ts' }] };
		const result = await finalizeArtifact(planIntent(repo), {}, 'wf-3a98-nohead', 5, emit, 'client');
		assert.equal(result.ok, true, `finalize failed: ${JSON.stringify((result as { failure?: unknown }).failure)}`);
		const slug = String((result.finalized.artifact.meta as { epicSlug?: string }).epicSlug ?? '');
		assert.ok(slug.length > 0, 'a label must still be produced');
		assert.ok(!slug.startsWith('-'), `no folder name may begin with a separator, got ${slug}`);
	} finally { rmSync(repo, { recursive: true, force: true }); }
});
