/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Procix Software India. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/**
 * S001/t7 — the REGRESSION GUARD for the folder-identity Story.
 *
 * Tasks t1-t6 made the artifact-docs tree resolve a work item's folder through
 * its DEFINITION HEAD (`DEF`, else `ISSUE`) instead of through the define
 * artifact alone. Every one of those changes is reached by the EPIC route too,
 * because the epic route shares the same accessor. This file pins the epic route
 * so a later change cannot quietly re-aim it:
 *
 *  - a DEF-bearing epic chain composes the SAME paths it composed before the
 *    Story. The expected paths are PINNED LITERALS, licensed by path-scheme.ts
 *    being unedited across the Story; an expectation computed with the functions
 *    under test drifts along with them and proves nothing.
 *  - `workItemKindOf` still collapses absent and `false` to 'epic', so the
 *    standalone inheritance added in t4 cannot reclassify an epic artifact;
 *  - path construction stays PURE — it composes for a repo directory that does
 *    not exist, which is only possible if it reads nothing. The definition head
 *    is consulted at FINALIZE time; pulling that read into path resolution would
 *    make every path depend on disk state, and this test is what fails.
 */

import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';

import { deriveWorkItemIdentity, resolveArtifactMdPath } from '../path-scheme.js';
import { readEpicCreatedAt, readEpicDefinitionCore, workItemKindOf } from '../storage.js';

const EPIC_HASH   = 'abcdef0123456789';              // → hash8 'abcdef01'
const DEF_CREATED = '2026-03-11T09:15:00.000Z';      // → E20260311
const EPIC_SLUG   = 'an-epic-with-many-stories';

/** A repo whose work item is EPIC-shaped: a DEF head, no `standalone`. */
function seedEpicRepo(): { repo: string; cleanup: () => void } {
	const repo = mkdtempSync(join(tmpdir(), 'insrc-t7-epic-'));
	mkdirSync(join(repo, '.insrc', 'artifacts'), { recursive: true });
	const wr = (id: string, meta: Record<string, unknown>): void =>
		writeFileSync(join(repo, '.insrc', 'artifacts', `${id}.json`), JSON.stringify({ meta, body: {} }));

	// The DEF is the definition head. `standalone` is ABSENT, not false — the
	// epic route never writes the key at all, and t4's inheritance must treat
	// that exactly as it treated it before.
	wr(`DEF-${EPIC_HASH}`,          { epicHash: EPIC_HASH, epicSlug: EPIC_SLUG, createdAt: DEF_CREATED });
	wr(`HLD-${EPIC_HASH}`,          { epicHash: EPIC_HASH, epicSlug: EPIC_SLUG, createdAt: '2026-03-12T10:00:00.000Z' });
	wr(`LLD-${EPIC_HASH}-S002`,     { epicHash: EPIC_HASH, epicSlug: EPIC_SLUG, createdAt: '2026-03-13T11:00:00.000Z', storyId: 'S002' });
	wr(`PLAN-${EPIC_HASH}-S002`,    { epicHash: EPIC_HASH, epicSlug: EPIC_SLUG, createdAt: '2026-03-14T12:00:00.000Z', storyId: 'S002' });
	return { repo, cleanup: () => rmSync(repo, { recursive: true, force: true }) };
}

test('t7 REGRESSION GUARD: a DEF-bearing epic chain composes byte-identical paths to the pre-change baseline', () => {
	const { repo, cleanup } = seedEpicRepo();
	try {
		// The pre-change baseline: before t1-t6, an epic's anchor came from the
		// DEF's createdAt and its label from the DEF's epicSlug. Recompute the
		// baseline from those two values DIRECTLY — independent of the accessor
		// under test — so agreement is evidence rather than a shared assumption.
		// CRITIQUE APPLIED — the baseline is now PINNED, not computed.
		//
		// This test previously derived its expected paths with the SAME post-change
		// deriveWorkItemIdentity / resolveArtifactMdPath it was checking, and the
		// header called that a virtue ("computed, not a literal"). That reasoning was
		// backwards: a computed expectation moves WITH the implementation, so both
		// sides can drift together and the assertion still passes. A pinned literal
		// cannot drift — which is the entire property a regression baseline needs.
		//
		// What licenses pinning these exact strings is that path-scheme.ts is
		// UNEDITED across the whole Story (verified by diff against the baseline
		// commit), so today's output IS the pre-change output. If either the segment
		// scheme or the folder layout changes, these strings fail, which is the point.
		const PINNED_HLD = join(repo, 'docs/epics/an-epic-with-many-stories-E20260311abcdef01/HLD.md');
		const PINNED_LLD = join(repo, 'docs/epics/an-epic-with-many-stories-E20260311abcdef01/S002/LLD.md');

		// What the post-change accessor resolves.
		const core = readEpicDefinitionCore(repo, EPIC_HASH);
		assert.equal(core.createdAt, DEF_CREATED, 'the DEF must still be the anchor source');
		assert.equal(core.epicSlug,  EPIC_SLUG,   'the DEF must still be the label source');
		assert.equal(core.standalone, undefined,  'an epic DEF must not acquire a standalone flag');

		// ...and the paths those values compose, for an item-root kind and a
		// story-scoped one.
		const kind = workItemKindOf(core);
		assert.equal(kind, 'epic');
		const hld = resolveArtifactMdPath(repo, deriveWorkItemIdentity(EPIC_HASH, core.createdAt!), 'HLD', kind, core.epicSlug!);
		const lld = resolveArtifactMdPath(repo, deriveWorkItemIdentity(EPIC_HASH, core.createdAt!, 'S002'), 'LLD', kind, core.epicSlug!);

		assert.equal(hld, PINNED_HLD);
		assert.equal(lld, PINNED_LLD);

		// The segment is DATE-only, so every stage of the chain — DEF, HLD, LLD,
		// PLAN, spanning four different days — must still land in ONE folder keyed
		// to the DEF's date, not each stage's own.
		assert.ok(hld.includes('E20260311abcdef01'), hld);
		assert.ok(lld.includes('E20260311abcdef01'), lld);
	} finally { cleanup(); }
});

test("t7 — workItemKindOf still maps absent and false alike to 'epic'", () => {
	assert.equal(workItemKindOf({}), 'epic', 'absent → epic');
	assert.equal(workItemKindOf({ standalone: false }), 'epic', 'false → epic');
	assert.equal(workItemKindOf({ standalone: undefined }), 'epic', 'explicit undefined → epic');
	assert.equal(workItemKindOf({ standalone: true }), 'standalone', 'only true → standalone');
});

test("t7 — readEpicCreatedAt's behaviour for a DEF-bearing epic is unchanged", () => {
	const { repo, cleanup } = seedEpicRepo();
	try {
		assert.equal(readEpicCreatedAt(repo, EPIC_HASH), DEF_CREATED);
		// Absent work item → undefined, so callers' `?? nowISO` still governs.
		assert.equal(readEpicCreatedAt(repo, '0'.repeat(16)), undefined);
	} finally { cleanup(); }
});

test('t7 PURITY: the markdown path builders perform no filesystem read — a path composes for a nonexistent repo directory', () => {
	const ghost = join(tmpdir(), `insrc-t7-does-not-exist-${Date.now()}`);
	assert.equal(existsSync(ghost), false, 'the fixture must genuinely not exist');

	const identity = deriveWorkItemIdentity(EPIC_HASH, DEF_CREATED, 'S002');
	const p = resolveArtifactMdPath(ghost, identity, 'LLD', 'epic', EPIC_SLUG);
	assert.equal(p, join(ghost, 'docs', 'epics', `${EPIC_SLUG}-E20260311abcdef01`, 'S002', 'LLD.md'));
	assert.equal(existsSync(ghost), false, 'composing a path must not CREATE anything either');
});

test('t7 — the definition artifact is consulted at finalize time only, never during path resolution', () => {
	// resolveArtifactMdPath takes identity + slug + kind as VALUES. If it reached
	// for the definition head itself, it could not compose a path for a repo with
	// no artifact store at all — so this composing successfully is the evidence
	// that the read stays at the finalize call site.
	const bare = mkdtempSync(join(tmpdir(), 'insrc-t7-bare-'));
	try {
		assert.equal(existsSync(join(bare, '.insrc')), false, 'no artifact store in this repo');
		const identity = deriveWorkItemIdentity(EPIC_HASH, DEF_CREATED);
		assert.equal(
			resolveArtifactMdPath(bare, identity, 'HLD', 'epic', EPIC_SLUG),
			join(bare, 'docs', 'epics', `${EPIC_SLUG}-E20260311abcdef01`, 'HLD.md'),
		);
		// And the accessor over that same empty store degrades, rather than throwing.
		assert.deepEqual(readEpicDefinitionCore(bare, EPIC_HASH), {});
	} finally { rmSync(bare, { recursive: true, force: true }); }
});

// ---------------------------------------------------------------------------
// S001/t7 — coverage for t3 and t4a.
//
// The mutation sweep at the end of this Story caught both of these as mutations
// that DID NOT BITE: t3 (inherit the label) and t4a (stamp the placement on a
// PLAN) changed orchestrator.ts, but the commit that made them added tests only
// to the BUILD-side files. Both finalizers are module-private `async` functions
// with no seam, so there was nothing to assert against. The shared inherit-then-
// fallback shape is now an exported helper used by all three sites, and these are
// its tests — the mutations bite through them.
// ---------------------------------------------------------------------------

import { inheritedEpicSlug, inheritedStandalone } from '../storage.js';

const BUGFIX_HASH  = 'fedcba9876543210';
const ISSUE_SLUG   = 'the-issue-own-label';
const ISSUE_MADE   = '2026-05-04T08:00:00.000Z';

/** A bugfix-shaped work item: an ISSUE head (standalone), no DEF. */
function seedIssueRepo(opts: { slug?: string | undefined; standalone?: boolean | undefined } = {}): { repo: string; cleanup: () => void } {
	const repo = mkdtempSync(join(tmpdir(), 'insrc-t7-issue-'));
	mkdirSync(join(repo, '.insrc', 'artifacts'), { recursive: true });
	const meta: Record<string, unknown> = { epicHash: BUGFIX_HASH, createdAt: ISSUE_MADE };
	if ('slug' in opts) { if (opts.slug !== undefined) meta['epicSlug'] = opts.slug; }
	else meta['epicSlug'] = ISSUE_SLUG;
	if (opts.standalone !== undefined) meta['standalone'] = opts.standalone;
	writeFileSync(join(repo, '.insrc', 'artifacts', `ISSUE-${BUGFIX_HASH}.json`), JSON.stringify({ meta, body: {} }));
	return { repo, cleanup: () => rmSync(repo, { recursive: true, force: true }) };
}

test('t7/t3 — the label is INHERITED from the definition head, not re-derived from the stage focus', () => {
	const { repo, cleanup } = seedIssueRepo();
	try {
		// This is the exact fork: the LLD stage's own focus derives a DIFFERENT slug,
		// and before t3 that freshly-derived slug named the folder — so the ISSUE and
		// its own LLD sat in two folders under one identity segment.
		assert.equal(
			inheritedEpicSlug(repo, BUGFIX_HASH, 'a-label-derived-from-this-stage-focus'),
			ISSUE_SLUG,
			"the head's label must win over the stage's own",
		);
	} finally { cleanup(); }
});

test('t7/t3 — the fallback still governs a work item with NO definition artifact', () => {
	const bare = mkdtempSync(join(tmpdir(), 'insrc-t7-nodef-'));
	try {
		assert.equal(inheritedEpicSlug(bare, BUGFIX_HASH, 'derived-fallback'), 'derived-fallback');
	} finally { rmSync(bare, { recursive: true, force: true }); }
});

test('t7/t3 — an EMPTY stored label counts as absent, so no folder name can begin with a dash', () => {
	const { repo, cleanup } = seedIssueRepo({ slug: '' });
	try {
		assert.equal(inheritedEpicSlug(repo, BUGFIX_HASH, 'derived-fallback'), 'derived-fallback');
		assert.ok(!inheritedEpicSlug(repo, BUGFIX_HASH, 'derived-fallback').startsWith('-'));
	} finally { cleanup(); }
});

test('t7/t4a — the PLACEMENT is inherited from the definition head, overriding the stage fallback', () => {
	const { repo, cleanup } = seedIssueRepo({ standalone: true });
	try {
		// The head says standalone. Before t4a the PLAN carried no flag at all, so a
		// standalone story's PLAN.md landed under docs/epics while its LLD.md sat
		// under docs/standalone — the live four-folder item, exactly.
		assert.equal(inheritedStandalone(repo, BUGFIX_HASH, undefined), true);
		// The head wins over a disagreeing caller fallback...
		assert.equal(inheritedStandalone(repo, BUGFIX_HASH, false), true);
	} finally { cleanup(); }
});

test('t7/t4a — the caller fallback is used only when the head is SILENT', () => {
	const { repo, cleanup } = seedIssueRepo();          // head has no `standalone` key
	try {
		assert.equal(inheritedStandalone(repo, BUGFIX_HASH, true), true, "the LLD's own flag carries");
		assert.equal(inheritedStandalone(repo, BUGFIX_HASH, undefined), undefined, 'silent head + silent caller → silent');
	} finally { cleanup(); }
});

test('t7/t4a — a stored FALSE is reported as false, never silently promoted to true', () => {
	const { repo, cleanup } = seedIssueRepo({ standalone: false });
	try {
		const flag = inheritedStandalone(repo, BUGFIX_HASH, undefined);
		// SCOPE OF THIS TEST, stated because its previous version overreached: this
		// asserts only what the HELPER returns. It used to also re-type the call
		// sites' `...(flag === true ? ... : {})` spread inside the test body and
		// assert on that copy — which proved nothing about any call site and stayed
		// green through a mutation that made finalizePlan write `standalone: false`
		// outright. That prohibition is now asserted where it actually lives, over
		// WRITTEN artifact metadata, in folder-identity-finalize.test.ts.
		assert.equal(flag, false);
		assert.notEqual(flag, true);
	} finally { cleanup(); }
});
