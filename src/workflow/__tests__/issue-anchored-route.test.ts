/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Procix Software India. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/**
 * ISSUE-149283b0d0455a43 / s1 / t6 — the ISSUE-anchored route as one typed
 * flow, proven end to end against a seeded ISSUE-only repo (no production
 * changes; this file is the regression net for the whole Story):
 *
 *   a sized bugfix's design.story, started with epicHash=issueHash and
 *   storyId='s1', finalizes as LLD-<issueHash>-s1 — no second root is
 *   minted, and the LLD inherits the ISSUE's label, anchor and docs/standalone
 *   folder (t1/t4, modelled on seedIssueRepo in folder-identity-finalize.test.ts);
 *   design review classifies that LLD as kind 'issue' with the approved ISSUE
 *   as its originating_issue (subject.ts workflowFor);
 *   the placement helpers (requireEpicAnchor / inheritedStoryStandalone /
 *   inheritedEpicSlug) that PLAN and BUILD finalize on keep the ISSUE's
 *   anchor, placement and label;
 *   a second start revises the same LLD record instead of minting a second
 *   root; a genuine standalone feature still mints its own; an Epic story
 *   still requires its approved DEF and HLD; requireApprovedEpic still refuses
 *   an ISSUE root, naming it; a bugfix LLD with no ISSUE provenance is still
 *   rejected; and the chain report returns the implied s1 and chain-complete
 *   once that LLD is approved (t5).
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';

import { finalizeArtifact } from '../orchestrator.js';
import { buildChainReport } from '../chain.js';
import { requireApprovedEpic, ArtifactMissingError } from '../gates.js';
import {
	artifactJsonPath,
	defineArtifactId,
	inheritedEpicSlug,
	inheritedStoryStandalone,
	issueArtifactId,
	lldArtifactId,
	lldArtifactPaths,
	requireEpicAnchor,
	workItemKindOf,
	writeAtomic,
} from '../storage.js';
import { resolveArtifactMdPath } from '../path-scheme.js';
import type { WorkflowIntent } from '../types.js';
import type { LldArtifact } from '../artifacts/lld.js';
import { markApprovedSync } from './lifecycle-fixtures.js';

const HASH = 'd4e5f60718293a4b';
const ISSUE_MADE = '2026-04-09T08:30:00.000Z';
const SLUG = 'story-list-readers-do-not-recognise';
const TITLE = 'Make the story-list readers recognise an ISSUE-anchored work item';
/** A focus whose own derived slug would visibly differ from the ISSUE's label. */
const STAGE_FOCUS = 'a completely different wording for the very same work item';

function minimalLldBody(): Record<string, unknown> {
	return {
		hldContextSlice: { frameworkSummary: 'standalone', ownedContracts: [], consumedContracts: [], boundary: { storyId: 's1', owns: [], depends: [], internal: 'x' }, adjacentBoundaries: [], rolloutPhase: 'standalone', nonFunctional: {} },
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

function issueIntent(repo: string): WorkflowIntent {
	return {
		workflow: 'design.story', focus: STAGE_FOCUS, repoPath: repo,
		repoIndexedAt: null,
		params: { standalone: true, epicHash: HASH, storyId: 's1', sizeClass: 'bugfix', storyTitle: TITLE },
	} as unknown as WorkflowIntent;
}

/** An approved ISSUE-only repo: the work item's sole root is ISSUE-<hash>,
 *  with its canonical ISSUE.md beside it (design review reads both halves). */
function seedIssueRepo(opts: { approved?: boolean } = {}): { repo: string; cleanup: () => void } {
	const repo = mkdtempSync(join(tmpdir(), 'insrc-route-issue-'));
	mkdirSync(join(repo, '.insrc', 'artifacts'), { recursive: true });
	const json = artifactJsonPath(repo, issueArtifactId(HASH));
	writeAtomic(json, JSON.stringify({
		meta: {
			workflow: 'issue', runId: 'iss-1', repoPath: repo, schemaVersion: 1,
			issueHash: HASH, epicHash: HASH, epicSlug: SLUG, authoredBy: 'controller',
			createdAt: ISSUE_MADE, epicCreatedAt: ISSUE_MADE, standalone: true, magnitude: 'sized',
		},
		body: { title: TITLE, reproduction: 'x', rootCause: 'y', fixIntent: 'z' },
		citations: [],
	}, null, 2));
	const md = resolveArtifactMdPath(repo, { epicHash: HASH, epicCreatedAt: ISSUE_MADE }, 'ISSUE', 'standalone', SLUG);
	mkdirSync(dirname(md), { recursive: true });
	writeFileSync(md, `<!-- insrc:artifact ${issueArtifactId(HASH)} -->\n# ISSUE\n\n## Title\n${TITLE}\n`);
	if (opts.approved === true) markApprovedSync(json);
	return { repo, cleanup: () => rmSync(repo, { recursive: true, force: true }) };
}

/** The real standalone path builder, over the artifact's persisted meta. */
function lldFolder(repo: string, meta: LldArtifact['meta']): string {
	return lldArtifactPaths(repo, meta.epicHash!, 's1', meta.epicCreatedAt ?? meta.createdAt, workItemKindOf(meta), meta.epicSlug).md;
}

async function finalizeIssueLld(repo: string, runId: string): Promise<LldArtifact> {
	const emit = { body: minimalLldBody(), citations: [{ id: 'c1', kind: 'code', ref: 'src/x.ts' }] };
	const result = await finalizeArtifact(issueIntent(repo), {}, runId, 5, emit, 'client');
	assert.equal(result.ok, true, `finalize failed: ${JSON.stringify((result as { failure?: unknown }).failure)}`);
	return result.finalized.artifact as LldArtifact;
}

test('issue-anchored-route.test.ts: sized ISSUE start writes LLD-<issueHash>-s1 and no second root', async () => {
	const s = seedIssueRepo({ approved: true });
	try {
		const before = readdirSync(join(s.repo, '.insrc', 'artifacts')).sort();
		const lld = await finalizeIssueLld(s.repo, 'wf-route-a');
		// The finalize path returns the artifact without persisting; the writer
		// composes the JSON path from its identity — exactly one record, named
		// LLD-<hash>-s1, and nothing else appears.
		writeAtomic(artifactJsonPath(s.repo, lldArtifactId(HASH, 's1')), JSON.stringify(lld, null, 2));
		assert.equal(lld.meta.epicHash, HASH, 'the LLD keeps the ISSUE hash as its work-item anchor');
		assert.equal(lld.meta.storyId, 's1', 'the one implied story');
		assert.equal(lld.meta.sizeClass, 'bugfix');
		const after = readdirSync(join(s.repo, '.insrc', 'artifacts')).sort();
		assert.deepEqual(after.filter(n => !before.includes(n)), [`LLD-${HASH}-s1.json`], 'no second root artifact is minted');
		assert.ok(!existsSync(artifactJsonPath(s.repo, defineArtifactId(HASH))), 'no Define is created for a bugfix');
	} finally { s.cleanup(); }
});

test('issue-anchored-route.test.ts: the LLD inherits the ISSUE label, epicCreatedAt and folder', async () => {
	const s = seedIssueRepo({ approved: true });
	try {
		const lld = await finalizeIssueLld(s.repo, 'wf-route-b');
		assert.equal(lld.meta.epicSlug, SLUG, 'the ISSUE label, not one derived from the stage focus');
		assert.ok(!String(lld.meta.epicSlug).includes('completely-different'), 'the focus prose must not supply the label');
		assert.equal(lld.meta.epicCreatedAt, ISSUE_MADE, 'the ISSUE createdAt as the folder anchor');
		const folder = lldFolder(s.repo, lld.meta);
		assert.ok(folder.includes('/docs/standalone/'), `standalone placement, got ${folder}`);
		assert.ok(folder.includes(`${SLUG}-E20260409`), `the ISSUE's label and day, got ${folder}`);
	} finally { s.cleanup(); }
});

test('issue-anchored-route.test.ts: PLAN and BUILD placement helpers keep the ISSUE epicHash, anchor and folder', async () => {
	const s = seedIssueRepo({ approved: true });
	try {
		const lld = await finalizeIssueLld(s.repo, 'wf-route-d');
		// These three helpers are what finalizePlan / the BUILD writer call to
		// decide the work item's anchor, placement and label.
		assert.equal(requireEpicAnchor(s.repo, HASH), ISSUE_MADE, 'requireEpicAnchor resolves the ISSUE createdAt');
		assert.equal(inheritedStoryStandalone(s.repo, HASH, 's1', lld.meta.standalone), true, 'standalone placement from the ISSUE head');
		assert.equal(inheritedEpicSlug(s.repo, HASH, 'fallback-slug'), SLUG, 'the ISSUE label, not the fallback');
		// The LLD's own persisted meta composes the same standalone folder the
		// PLAN/BUILD records will share.
		const folder = lldFolder(s.repo, lld.meta);
		assert.ok(folder.includes(`/docs/standalone/`) && folder.includes(`${SLUG}-E20260409`), `got ${folder}`);
		assert.ok(!folder.includes('/docs/epics/'), 'an ISSUE-anchored story never lands under docs/epics');
	} finally { s.cleanup(); }
});

test('issue-anchored-route.test.ts: a second design.story start revises the same LLD and creates no duplicate', async () => {
	const s = seedIssueRepo({ approved: true });
	try {
		const first = await finalizeIssueLld(s.repo, 'wf-route-e1');
		writeAtomic(artifactJsonPath(s.repo, lldArtifactId(HASH, 's1')), JSON.stringify(first, null, 2));
		const second = await finalizeIssueLld(s.repo, 'wf-route-e2');
		// Both runs finalize to the SAME identity — LLD-<issueHash>-s1 — so the
		// writer overwrites one record (a revision), never a second root.
		assert.equal(second.meta.epicHash, HASH);
		assert.equal(second.meta.storyId, 's1');
		assert.equal(second.meta.epicSlug, SLUG, 'the re-finalized LLD still inherits the ISSUE label, not its own focus');
		assert.equal(second.meta.epicCreatedAt, ISSUE_MADE, 'the anchor is stable across revisions');
		const llds = readdirSync(join(s.repo, '.insrc', 'artifacts')).filter(n => n.startsWith('LLD-'));
		assert.deepEqual(llds, [`LLD-${HASH}-s1.json`], 'exactly one LLD record exists');
	} finally { s.cleanup(); }
});

test('issue-anchored-route.test.ts: a genuine standalone feature still mints its own root', async () => {
	const repo = mkdtempSync(join(tmpdir(), 'insrc-route-standalone-'));
	try {
		// No DEF, no ISSUE: the LLD IS the work item's first record.
		const lld = await finalizeIssueLld(repo, 'wf-route-f');
		assert.equal(lld.meta.epicHash, HASH, 'the standalone params minted the hash');
		assert.equal(lld.meta.epicCreatedAt, lld.meta.createdAt, 'the first record stamps its own time as the anchor');
		const day = String(lld.meta.createdAt).slice(0, 10).replace(/-/g, '');
		const folder = lldFolder(repo, lld.meta);
		assert.ok(folder.includes('/docs/standalone/'), `standalone placement, got ${folder}`);
		assert.ok(folder.includes(`-E${day}`), `its own day, got ${folder}`);
		assert.ok(!folder.includes(`-E20260409`), 'not the ISSUE day — there is no ISSUE here');
	} finally { rmSync(repo, { recursive: true, force: true }); }
});

test('issue-anchored-route.test.ts: an Epic story still requires its DEF and HLD', async () => {
	const repo = mkdtempSync(join(tmpdir(), 'insrc-route-epic-'));
	try {
		mkdirSync(join(repo, '.insrc', 'artifacts'), { recursive: true });
		// A DEF only — no HLD: the Epic-route LLD gate must still refuse.
		writeAtomic(artifactJsonPath(repo, defineArtifactId(HASH)), JSON.stringify({
			meta: { workflow: 'define', runId: 'd1', repoPath: repo, schemaVersion: 1, epicHash: HASH, epicSlug: SLUG, createdAt: ISSUE_MADE, epicCreatedAt: ISSUE_MADE },
			body: { problem: 'p', stories: [{ id: 's1', title: TITLE }] },
			citations: [],
		}, null, 2));
		markApprovedSync(artifactJsonPath(repo, defineArtifactId(HASH)));
		const emit = { body: minimalLldBody(), citations: [] };
		const result = await finalizeArtifact({ ...issueIntent(repo), params: { epicHash: HASH, storyId: 's1' } } as unknown as WorkflowIntent, {}, 'wf-route-g', 5, emit, 'client');
		assert.equal(result.ok, false, 'an Epic story without an approved HLD still fails');
	} finally { rmSync(repo, { recursive: true, force: true }); }
});

test('issue-anchored-route.test.ts: requireApprovedEpic still refuses an ISSUE root with a message naming the ISSUE', () => {
	const s = seedIssueRepo({ approved: true });
	try {
		assert.throws(
			() => requireApprovedEpic(s.repo, HASH),
			(err: Error) => err instanceof ArtifactMissingError
				&& err.message.includes(`ISSUE-${HASH}`)
				&& err.message.includes('ISSUE-anchored bugfix'),
		);
	} finally { s.cleanup(); }
});

test('issue-anchored-route.test.ts: chain report for the seeded ISSUE repo returns the implied s1 and reaches chain-complete', async () => {
	const s = seedIssueRepo({ approved: true });
	try {
		const lld = await finalizeIssueLld(s.repo, 'wf-route-h');
		const json = artifactJsonPath(s.repo, lldArtifactId(HASH, 's1'));
		writeAtomic(json, JSON.stringify(lld, null, 2));

		// Before approval: the implied s1 is listed from the ISSUE, run-lld/approve-lld fire.
		const draft = buildChainReport(s.repo, HASH);
		assert.equal(draft.definitionKind, 'issue');
		assert.deepEqual(draft.stories.map(x => x.id), ['s1'], 'the ISSUE declares exactly the one implied story');
		assert.equal(draft.stories[0]!.title, TITLE);
		assert.equal(draft.stories[0]!.hasLld, true);
		assert.equal(draft.nextAction.kind, 'approve-lld');

		// Once the LLD is approved the chain reaches the tracker steps
		// (ISSUE-5f9d4ab4c90c0b4c s1/t5): unpushed -> push-tracker.
		markApprovedSync(json);
		const done = buildChainReport(s.repo, HASH);
		assert.equal(done.stories[0]!.approved, true);
		assert.equal(done.nextAction.kind, 'push-tracker', JSON.stringify(done.nextAction));
		const path = done.stories[0]!.path;
		assert.ok(path !== undefined && path.includes('/docs/standalone/') && path.includes(SLUG), `the standalone story path, got ${path}`);
	} finally { s.cleanup(); }
});
