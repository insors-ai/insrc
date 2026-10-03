/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Procix Software India. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/**
 * Storage primitives — writeAtomic + artifact-path helpers.
 *
 * Run:
 *   npx tsx --test src/insrc/workflow/__tests__/storage.test.ts
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import {
	amendmentArtifactPath,
	amendmentFilenamePrefix,
	amendmentsRootDir,
	defineArtifactPaths,
	hldArtifactPaths,
	lldArtifactPaths,
	lldFilenamePrefix,
	buildArtifactPaths,
	buildRecordFolderArgs,
	readEpicCreatedAt,
	readEpicDefinitionCore,
	stubArtifactPaths,
	writeAtomic,
} from '../storage.js';
import { deriveWorkItemIdentity } from '../id.js';

const HASH = 'a3f4b8c9d1e2f3a4';
const CREATED = '2026-07-17T07:42:28.275Z';   // → E20260717a3f4b8c9
const EPIC_SEGMENT = 'E20260717a3f4b8c9';      // E<YYYYMMDD><hash8>, hash8 = HASH.slice(0,8)

test('writeAtomic creates parent dirs + writes content', () => {
	const tmp = mkdtempSync(join(tmpdir(), 'insrc-storage-'));
	try {
		const target = join(tmp, 'nested/dir/file.md');
		writeAtomic(target, 'hello world\n');
		assert.equal(readFileSync(target, 'utf8'), 'hello world\n');
	} finally {
		rmSync(tmp, { recursive: true, force: true });
	}
});

test('writeAtomic overwrites existing file', () => {
	const tmp = mkdtempSync(join(tmpdir(), 'insrc-storage-'));
	try {
		const target = join(tmp, 'a.md');
		writeAtomic(target, 'first\n');
		writeAtomic(target, 'second\n');
		assert.equal(readFileSync(target, 'utf8'), 'second\n');
	} finally {
		rmSync(tmp, { recursive: true, force: true });
	}
});

test('writeAtomic refuses relative paths', () => {
	assert.throws(() => writeAtomic('not/absolute', 'x'));
});

test('writeAtomic refuses empty path', () => {
	assert.throws(() => writeAtomic('', 'x'));
});

test('stubArtifactPaths returns docs/stub layout', () => {
	const p = stubArtifactPaths('/repo', 'my-slug');
	assert.equal(p.md,   '/repo/docs/stub/my-slug.md');
	assert.equal(p.json, '/repo/docs/stub/my-slug.json');
});

test('defineArtifactPaths — nested md in docs/epics/, json in .insrc/artifacts/', () => {
	const p = defineArtifactPaths('/repo', HASH, CREATED, 'epic');
	assert.equal(p.md,   `/repo/docs/epics/${HASH}-${EPIC_SEGMENT}/DEF.md`);
	assert.equal(p.json, `/repo/.insrc/artifacts/DEF-${HASH}.json`);
});

test('hldArtifactPaths — nested md in docs/epics/, json in .insrc/artifacts/', () => {
	const p = hldArtifactPaths('/repo', HASH, CREATED, 'epic');
	assert.equal(p.md,   `/repo/docs/epics/${HASH}-${EPIC_SEGMENT}/HLD.md`);
	assert.equal(p.json, `/repo/.insrc/artifacts/HLD-${HASH}.json`);
});

test('lldArtifactPaths — story-scoped nested md, json in .insrc/artifacts/', () => {
	const p = lldArtifactPaths('/repo', HASH, 's3', CREATED, 'epic');
	assert.equal(p.md,   `/repo/docs/epics/${HASH}-${EPIC_SEGMENT}/S003/LLD.md`);
	assert.equal(p.json, `/repo/.insrc/artifacts/LLD-${HASH}-s3.json`);
});

test('md folder is labelled by slug; json stays named by hash', () => {
	const d = defineArtifactPaths('/repo', HASH, CREATED, 'epic', 'add-tag-filter');
	assert.equal(d.md,   `/repo/docs/epics/add-tag-filter-${EPIC_SEGMENT}/DEF.md`);
	assert.equal(d.json, `/repo/.insrc/artifacts/DEF-${HASH}.json`);

	const h = hldArtifactPaths('/repo', HASH, CREATED, 'epic', 'add-tag-filter');
	assert.equal(h.md,   `/repo/docs/epics/add-tag-filter-${EPIC_SEGMENT}/HLD.md`);
	assert.equal(h.json, `/repo/.insrc/artifacts/HLD-${HASH}.json`);

	const l = lldArtifactPaths('/repo', HASH, 's3', CREATED, 'epic', 'add-tag-filter');
	assert.equal(l.md,   `/repo/docs/epics/add-tag-filter-${EPIC_SEGMENT}/S003/LLD.md`);
	assert.equal(l.json, `/repo/.insrc/artifacts/LLD-${HASH}-s3.json`);
});

test('slug label is sanitised against path separators', () => {
	const p = defineArtifactPaths('/repo', HASH, CREATED, 'epic', 'a/b evil');
	assert.equal(p.md, `/repo/docs/epics/a-b-evil-${EPIC_SEGMENT}/DEF.md`);
});

test('amendmentArtifactPath uses the AMD- prefix inside .insrc/artifacts/', () => {
	assert.equal(
		amendmentArtifactPath('/repo', `AMD-${HASH}-1`),
		`/repo/.insrc/artifacts/AMD-${HASH}-1.json`,
	);
});

test('amendmentFilenamePrefix is `AMD-<hash>-`', () => {
	assert.equal(amendmentFilenamePrefix(HASH), `AMD-${HASH}-`);
});

test('lldFilenamePrefix is `LLD-<hash>-`', () => {
	assert.equal(lldFilenamePrefix(HASH), `LLD-${HASH}-`);
});

test('amendmentsRootDir points at .insrc/artifacts', () => {
	assert.equal(amendmentsRootDir('/repo'), '/repo/.insrc/artifacts');
});


// ---------------------------------------------------------------------------
// S001/t1 — the definition-artifact accessor (DEF-then-ISSUE, first-READABLE-wins)
// ---------------------------------------------------------------------------

const DEF_HASH = 'b1c2d3e4f5a6b7c8';
const DEF_CREATED   = '2026-10-01T09:15:00.000Z';
const ISSUE_CREATED = '2026-10-02T18:19:50.067Z';

/** A temp repo plus writers for each definition-artifact shape. */
function defRepo(): {
	repo: string;
	writeDef:     (body: string) => void;
	writeIssue:   (body: string) => void;
	cleanup:      () => void;
} {
	const repo = mkdtempSync(join(tmpdir(), 'insrc-defcore-'));
	const write = (id: string, body: string): void => writeAtomic(join(repo, '.insrc/artifacts', `${id}.json`), body);
	return {
		repo,
		writeDef:   body => write(`DEF-${DEF_HASH}`, body),
		writeIssue: body => write(`ISSUE-${DEF_HASH}`, body),
		cleanup:    () => rmSync(repo, { recursive: true, force: true }),
	};
}

const defJson = JSON.stringify({
	meta: { createdAt: DEF_CREATED, epicSlug: 'from-the-def', standalone: false },
});
const issueJson = JSON.stringify({
	meta: { createdAt: ISSUE_CREATED, epicSlug: 'from-the-issue', standalone: true },
});

test('t1 — a DEF present and readable wins outright; the ISSUE is never consulted', () => {
	const r = defRepo();
	try {
		r.writeDef(defJson);
		r.writeIssue(issueJson);
		const core = readEpicDefinitionCore(r.repo, DEF_HASH);
		assert.equal(core.epicSlug, 'from-the-def', 'the DEF must win while it is readable');
		assert.equal(core.createdAt, DEF_CREATED);
		assert.equal(core.standalone, false, 'and its values must not be mixed with the ISSUE\'s');
	} finally { r.cleanup(); }
});

test('t1 — a hash carrying BOTH artifacts resolves to the DEF, so the read ORDER is the discriminator', () => {
	const r = defRepo();
	try {
		// Same fixture as above, asserted from the other direction: nothing of the
		// ISSUE's leaks through. Reaching the ISSUE must mean the DEF was unusable.
		r.writeDef(defJson);
		r.writeIssue(issueJson);
		const core = readEpicDefinitionCore(r.repo, DEF_HASH);
		assert.notEqual(core.epicSlug, 'from-the-issue');
		assert.notEqual(core.createdAt, ISSUE_CREATED);
		assert.notEqual(core.standalone, true);
	} finally { r.cleanup(); }
});

test('t1 — a DEF absent with an ISSUE present yields the ISSUE\'s values', () => {
	const r = defRepo();
	try {
		r.writeIssue(issueJson);
		const core = readEpicDefinitionCore(r.repo, DEF_HASH);
		assert.equal(core.epicSlug, 'from-the-issue');
		assert.equal(core.createdAt, ISSUE_CREATED);
		assert.equal(core.standalone, true);
	} finally { r.cleanup(); }
});

test('t1 — a CORRUPT DEF falls through to a valid ISSUE: first-READABLE-wins, not first-PRESENT-wins', () => {
	const r = defRepo();
	try {
		r.writeDef('{ this is not json');
		r.writeIssue(issueJson);
		const core = readEpicDefinitionCore(r.repo, DEF_HASH);
		assert.equal(core.epicSlug, 'from-the-issue',
			'a present-but-unparseable DEF must not shadow a readable ISSUE');
	} finally { r.cleanup(); }
});

test('t1 — a DEF that PARSES but carries none of the three fields also falls through', () => {
	const r = defRepo();
	try {
		// "Readable" means it yielded a usable field. A well-formed DEF with no
		// epic-level properties is as useless as one that does not parse, and
		// must not win merely by being syntactically valid.
		r.writeDef(JSON.stringify({ meta: { workflow: 'define' }, body: {} }));
		r.writeIssue(issueJson);
		assert.equal(readEpicDefinitionCore(r.repo, DEF_HASH).epicSlug, 'from-the-issue');
	} finally { r.cleanup(); }
});

test('t1 — neither artifact readable yields an empty result and does NOT throw', () => {
	const r = defRepo();
	try {
		assert.doesNotThrow(() => readEpicDefinitionCore(r.repo, DEF_HASH));
		assert.deepEqual(readEpicDefinitionCore(r.repo, DEF_HASH), {});

		// Both present but both unparseable — still empty, still no throw.
		r.writeDef('nope');
		r.writeIssue('also nope');
		assert.doesNotThrow(() => readEpicDefinitionCore(r.repo, DEF_HASH));
		assert.deepEqual(readEpicDefinitionCore(r.repo, DEF_HASH), {});

		// A repo directory that does not exist at all.
		assert.deepEqual(readEpicDefinitionCore(join(r.repo, 'no-such-dir'), DEF_HASH), {});
	} finally { r.cleanup(); }
});

test('t1 — standalone is reported only when genuinely boolean; the other two fields are unaffected', () => {
	const r = defRepo();
	try {
		// A non-boolean standalone must be OMITTED, not coerced — workItemKindOf
		// treats only an explicit true as standalone and this read must not
		// manufacture one.
		r.writeDef(JSON.stringify({ meta: { createdAt: DEF_CREATED, epicSlug: 'slug-ok', standalone: 'true' } }));
		const coerced = readEpicDefinitionCore(r.repo, DEF_HASH);
		assert.equal(coerced.standalone, undefined, "the string 'true' must not become boolean true");
		assert.equal(coerced.createdAt, DEF_CREATED, 'and the pre-existing fields must still be read');
		assert.equal(coerced.epicSlug, 'slug-ok');

		// Absent standalone: omitted, other two intact.
		r.writeDef(JSON.stringify({ meta: { createdAt: DEF_CREATED, epicSlug: 'slug-ok' } }));
		const absent = readEpicDefinitionCore(r.repo, DEF_HASH);
		assert.equal(absent.standalone, undefined);
		assert.equal(absent.createdAt, DEF_CREATED);
		assert.equal(absent.epicSlug, 'slug-ok');

		// An explicit false is a real value and must be reported as false, not dropped.
		r.writeDef(JSON.stringify({ meta: { createdAt: DEF_CREATED, standalone: false } }));
		assert.equal(readEpicDefinitionCore(r.repo, DEF_HASH).standalone, false);
	} finally { r.cleanup(); }
});

test('t1 — UNWIRED: the accessor exists but changes no folder path yet', () => {
	const r = defRepo();
	try {
		r.writeIssue(issueJson);
		// The accessor can see the ISSUE's slug...
		assert.equal(readEpicDefinitionCore(r.repo, DEF_HASH).epicSlug, 'from-the-issue');
		// ...but nothing consumes it, so a path built for this work item still
		// uses only what the CALLER passes. t2 and t5 wire it; this pins that t1
		// is inert, so a reviewer can tell the reader's contract was falsifiable
		// before anything depended on it.
		const paths = lldArtifactPaths(r.repo, DEF_HASH, 's1', ISSUE_CREATED, 'epic', undefined);
		assert.ok(paths.md.includes(DEF_HASH), 'with no slug passed, the path still degrades to the hash');
		assert.ok(!paths.md.includes('from-the-issue'), 'the accessor is NOT consulted by path construction at t1');
	} finally { r.cleanup(); }
});


// ---------------------------------------------------------------------------
// S001/t2 — the folder anchor recognises an ISSUE, so the identity segment
// stops drifting. The cross-midnight fixture is MANDATORY: a same-day fixture
// passes whether or not the fix works.
// ---------------------------------------------------------------------------

const MIDNIGHT_HASH = 'c9d8e7f6a5b4c3d2';
/** Late on one UTC day — the ISSUE's own createdAt. */
const LATE_DAY_N   = '2026-10-02T23:50:00.000Z';   // -> E20261002
/** Early on the NEXT UTC day — a later stage's own clock. */
const EARLY_DAY_N1 = '2026-10-03T00:10:00.000Z';   // -> E20261003

test('t2 — an ISSUE-anchored work item yields the ISSUE\'s createdAt instead of undefined', () => {
	const repo = mkdtempSync(join(tmpdir(), 'insrc-anchor-'));
	try {
		writeAtomic(join(repo, '.insrc/artifacts', `ISSUE-${MIDNIGHT_HASH}.json`),
			JSON.stringify({ meta: { createdAt: LATE_DAY_N, epicSlug: 'bugfix-item', standalone: true } }));
		assert.equal(readEpicCreatedAt(repo, MIDNIGHT_HASH), LATE_DAY_N);
	} finally { rmSync(repo, { recursive: true, force: true }); }
});

test('t2 — signature and return meaning unchanged for a DEF-bearing epic', () => {
	const repo = mkdtempSync(join(tmpdir(), 'insrc-anchor-def-'));
	try {
		writeAtomic(join(repo, '.insrc/artifacts', `DEF-${MIDNIGHT_HASH}.json`),
			JSON.stringify({ meta: { createdAt: LATE_DAY_N, epicSlug: 'epic-item' } }));
		assert.equal(readEpicCreatedAt(repo, MIDNIGHT_HASH), LATE_DAY_N);

		// Absent -> undefined, as before, so every caller's `?? nowISO` still fires.
		const empty = mkdtempSync(join(tmpdir(), 'insrc-anchor-none-'));
		try {
			assert.equal(readEpicCreatedAt(empty, MIDNIGHT_HASH), undefined);
		} finally { rmSync(empty, { recursive: true, force: true }); }

		// An EMPTY-STRING createdAt is not a usable anchor and must degrade too.
		writeAtomic(join(repo, '.insrc/artifacts', `DEF-${MIDNIGHT_HASH}.json`),
			JSON.stringify({ meta: { createdAt: '', epicSlug: 'epic-item' } }));
		assert.equal(readEpicCreatedAt(repo, MIDNIGHT_HASH), undefined,
			'the non-empty guard is preserved from the previous implementation');
	} finally { rmSync(repo, { recursive: true, force: true }); }
});

test('t2 — CLOCK INDEPENDENCE: two stages straddling midnight UTC resolve to ONE identity segment', () => {
	const repo = mkdtempSync(join(tmpdir(), 'insrc-midnight-'));
	try {
		// A bugfix work item: ISSUE only, no DEF. Its anchor is late on day N.
		writeAtomic(join(repo, '.insrc/artifacts', `ISSUE-${MIDNIGHT_HASH}.json`),
			JSON.stringify({ meta: { createdAt: LATE_DAY_N, epicSlug: 'bugfix-item', standalone: true } }));

		// Each stage does what every real caller does: read the anchor, else fall
		// back to its OWN clock. Stage one runs late on day N, stage two early on
		// day N+1 — the exact condition that forks a folder today.
		const stageOneAnchor = readEpicCreatedAt(repo, MIDNIGHT_HASH) ?? LATE_DAY_N;
		const stageTwoAnchor = readEpicCreatedAt(repo, MIDNIGHT_HASH) ?? EARLY_DAY_N1;

		const segOne = deriveWorkItemIdentity(MIDNIGHT_HASH, stageOneAnchor, 's1').epicSegment;
		const segTwo = deriveWorkItemIdentity(MIDNIGHT_HASH, stageTwoAnchor, 's1').epicSegment;

		assert.equal(segOne, segTwo, 'both stages must land on ONE identity segment');
		assert.equal(segOne, `E20261002${MIDNIGHT_HASH.slice(0, 8)}`,
			'and that segment is the ISSUE\'s date, not the later stage\'s clock');

		// Guard the fixture itself: the two clocks MUST fall on different dates,
		// or this test would pass without exercising anything.
		assert.notEqual(
			deriveWorkItemIdentity(MIDNIGHT_HASH, LATE_DAY_N, 's1').epicSegment,
			deriveWorkItemIdentity(MIDNIGHT_HASH, EARLY_DAY_N1, 's1').epicSegment,
			'fixture precondition: the two stage clocks straddle a UTC date boundary',
		);
	} finally { rmSync(repo, { recursive: true, force: true }); }
});

test('t2 — a SAME-DAY fixture cannot detect the defect, which is why the above is mandatory', () => {
	const repo = mkdtempSync(join(tmpdir(), 'insrc-sameday-'));
	try {
		// This mirrors the live four-folder work item, whose 18:19 and 20:03
		// timestamps fell on one date and so masked the fork entirely. Recorded as
		// a test so the inadequacy is visible rather than folklore: the two
		// anchors DIFFER yet the segments MATCH, so an assertion on the segment
		// alone is satisfied whether or not the anchor was inherited.
		const early = '2026-10-02T18:19:50.067Z';
		const later = '2026-10-02T20:03:03.910Z';
		writeAtomic(join(repo, '.insrc/artifacts', `ISSUE-${MIDNIGHT_HASH}.json`),
			JSON.stringify({ meta: { createdAt: early, epicSlug: 'bugfix-item', standalone: true } }));

		assert.notEqual(early, later, 'the two anchors genuinely differ');
		assert.equal(
			deriveWorkItemIdentity(MIDNIGHT_HASH, early, 's1').epicSegment,
			deriveWorkItemIdentity(MIDNIGHT_HASH, later, 's1').epicSegment,
			'yet they collapse to the same segment — so a same-day fixture proves nothing',
		);
	} finally { rmSync(repo, { recursive: true, force: true }); }
});

test('t2 — the anchor read is finalize-time only: path construction performs no read', () => {
	// Asserted structurally rather than by inspection: compose a path for a repo
	// directory that does not exist. A correct string can only come back if
	// nothing was read from disk.
	const nowhere = join(tmpdir(), 'insrc-does-not-exist-' + String(Date.now()));
	const paths = lldArtifactPaths(nowhere, MIDNIGHT_HASH, 's1', LATE_DAY_N, 'standalone', 'some-label');
	assert.ok(paths.md.includes(`E20261002${MIDNIGHT_HASH.slice(0, 8)}`));
	assert.ok(paths.md.includes('some-label'));
});

// ---------------------------------------------------------------------------
// S001/t5 — the BUILD folder-arg derivation yields a real label for an
// ISSUE-anchored work item, so the raw-hash fallback stops being reached.
// ---------------------------------------------------------------------------

const T5_HASH = 'd4c3b2a1f0e9d8c7';
const T5_CREATED = '2026-10-02T08:30:00.000Z';

function t5Repo(): { repo: string; cleanup: () => void } {
	const repo = mkdtempSync(join(tmpdir(), 'insrc-t5-folderargs-'));
	return { repo, cleanup: () => rmSync(repo, { recursive: true, force: true }) };
}

test('t5 — the non-standalone branch yields a real label for an ISSUE-anchored work item', () => {
	const r = t5Repo();
	try {
		writeAtomic(join(r.repo, '.insrc/artifacts', `ISSUE-${T5_HASH}.json`),
			JSON.stringify({ meta: { createdAt: T5_CREATED, epicSlug: 'a-real-label', standalone: true } }));

		// Called with standalone=false, i.e. the branch that previously read the
		// define artifact alone and found nothing.
		const fa = buildRecordFolderArgs(r.repo, T5_HASH, 'S001', false, '2026-10-03T00:00:00.000Z');
		assert.equal(fa.epicSlug, 'a-real-label', 'the label now comes from the ISSUE instead of being undefined');
		assert.equal(fa.createdAtISO, T5_CREATED, 'and the anchor comes from it too, not from ownCreatedAt');
	} finally { r.cleanup(); }
});

test('t5 — the raw hash appears nowhere in the composed folder name', () => {
	const r = t5Repo();
	try {
		writeAtomic(join(r.repo, '.insrc/artifacts', `ISSUE-${T5_HASH}.json`),
			JSON.stringify({ meta: { createdAt: T5_CREATED, epicSlug: 'a-real-label', standalone: true } }));
		const fa = buildRecordFolderArgs(r.repo, T5_HASH, 'S001', false, '2026-10-03T00:00:00.000Z');
		const md = buildArtifactPaths(r.repo, T5_HASH, 'S001', fa.createdAtISO, fa.workItemKind, fa.epicSlug).md;
		assert.ok(md.includes('a-real-label'), md);
		// The 16-hex hash must not appear as the folder LABEL. The 8-char identity
		// segment legitimately contains the first half of the hash, so the check is
		// on the full hash, which only the degraded label would introduce.
		assert.ok(!md.includes(`${T5_HASH}-E`), `the raw-hash label is gone: ${md}`);
	} finally { r.cleanup(); }
});

test('t5 — an explicit standalone=true still reads the LLD branch and still falls back to ownCreatedAt', () => {
	const r = t5Repo();
	try {
		// No LLD on disk: the standalone branch must degrade to the record's own
		// anchor, which is the Trivial-standalone case.
		const own = '2026-10-03T06:00:00.000Z';
		const fa = buildRecordFolderArgs(r.repo, T5_HASH, 'S001', true, own);
		assert.equal(fa.workItemKind, 'standalone');
		assert.equal(fa.createdAtISO, own, 'with no LLD the record\'s own createdAt is the anchor');
		assert.equal(fa.epicSlug, undefined);
	} finally { r.cleanup(); }
});

test('t5 — the hash fallback is still REACHABLE for a work item with no definition artifact', () => {
	const r = t5Repo();
	try {
		// A guard that survives in source but becomes unreachable is
		// indistinguishable from a deleted one, and t1 is what narrows the path to
		// this one. So prove it still fires rather than only that it still exists.
		const own = '2026-10-03T06:00:00.000Z';
		const fa = buildRecordFolderArgs(r.repo, T5_HASH, 'S001', false, own);
		assert.equal(fa.epicSlug, undefined, 'nothing to inherit, so no label');
		const md = buildArtifactPaths(r.repo, T5_HASH, 'S001', fa.createdAtISO, fa.workItemKind, fa.epicSlug).md;
		assert.ok(md.includes(T5_HASH), `degrades to the hash rather than throwing: ${md}`);
	} finally { r.cleanup(); }
});

// ---------------------------------------------------------------------------
// ISSUE-3a98d279 — buildRecordFolderArgs takes the LABEL from the definition
// head on BOTH routes, while the ANCHOR still comes from the nearest upstream.
//
// The standalone route used to take both from the LLD, so an LLD that had
// re-derived its own slug named the BUILD's folder and a work item whose ISSUE
// and LLD disagreed ended up with two folders for one identity segment.
// ---------------------------------------------------------------------------

const LABEL_HEAD = 'the-definition-head-label';
const LABEL_LLD  = 'a-label-the-lld-coined';

/** An ISSUE head and an LLD that DISAGREE about the label. The LLD also carries
 *  its own createdAt, so the anchor and the label can be told apart. */
function seedDisagreeing(repo: string, lldCreatedAt = '2026-10-02T19:00:00.000Z'): void {
	writeAtomic(join(repo, '.insrc/artifacts', `ISSUE-${T5_HASH}.json`),
		JSON.stringify({ meta: { createdAt: T5_CREATED, epicSlug: LABEL_HEAD, standalone: true } }));
	writeAtomic(join(repo, '.insrc/artifacts', `LLD-${T5_HASH}-S001.json`),
		JSON.stringify({ meta: { createdAt: lldCreatedAt, epicSlug: LABEL_LLD, standalone: true } }));
}

test('3a98d279 — the STANDALONE route takes the label from the head, not the LLD', () => {
	const r = t5Repo();
	try {
		seedDisagreeing(r.repo);
		const fa = buildRecordFolderArgs(r.repo, T5_HASH, 'S001', true, '2026-10-03T00:00:00.000Z');
		assert.equal(fa.epicSlug, LABEL_HEAD, 'the head names the folder');
		assert.notEqual(fa.epicSlug, LABEL_LLD, 'the LLD must not');
		const md = buildArtifactPaths(r.repo, T5_HASH, 'S001', fa.createdAtISO, fa.workItemKind, fa.epicSlug).md;
		assert.ok(md.includes(LABEL_HEAD), md);
		assert.ok(!md.includes(LABEL_LLD), md);
	} finally { r.cleanup(); }
});

test('3a98d279 — the ANCHOR is untouched: the standalone route still reads the LLD\'s createdAt', () => {
	// The label and the anchor come from DIFFERENT places on this route, and the
	// change moved only the label. Asserted together so a later edit cannot quietly
	// swap the anchor's source while the label assertion keeps passing.
	const r = t5Repo();
	try {
		const lldCreated = '2026-10-02T19:00:00.000Z';
		seedDisagreeing(r.repo, lldCreated);
		const fa = buildRecordFolderArgs(r.repo, T5_HASH, 'S001', true, '2026-10-03T00:00:00.000Z');
		assert.equal(fa.createdAtISO, lldCreated, 'anchor from the LLD');
		assert.notEqual(fa.createdAtISO, T5_CREATED, 'NOT from the head');
		assert.equal(fa.epicSlug, LABEL_HEAD, 'label from the head');
		assert.equal(fa.workItemKind, 'standalone');
	} finally { r.cleanup(); }
});

test('3a98d279 — with no definition head the LLD\'s label is still the fallback, not a raw hash', () => {
	const r = t5Repo();
	try {
		// LLD only: nothing to inherit, so the upstream label must still be used
		// rather than degrading this work item into a hash-named folder.
		writeAtomic(join(r.repo, '.insrc/artifacts', `LLD-${T5_HASH}-S001.json`),
			JSON.stringify({ meta: { createdAt: '2026-10-02T19:00:00.000Z', epicSlug: LABEL_LLD, standalone: true } }));
		const fa = buildRecordFolderArgs(r.repo, T5_HASH, 'S001', true, '2026-10-03T00:00:00.000Z');
		assert.equal(fa.epicSlug, LABEL_LLD, 'the upstream label survives as the fallback');
		const md = buildArtifactPaths(r.repo, T5_HASH, 'S001', fa.createdAtISO, fa.workItemKind, fa.epicSlug).md;
		assert.ok(!md.includes(`${T5_HASH}-E`), `must not regress to a raw-hash folder: ${md}`);
	} finally { r.cleanup(); }
});

test('3a98d279 — the EPIC route is unchanged: head is the only source, so no second read alters it', () => {
	const r = t5Repo();
	try {
		seedDisagreeing(r.repo);
		const fa = buildRecordFolderArgs(r.repo, T5_HASH, 'S001', false, '2026-10-03T00:00:00.000Z');
		assert.equal(fa.epicSlug, LABEL_HEAD);
		assert.equal(fa.createdAtISO, T5_CREATED, 'the epic route anchors on the head, as before');
		assert.equal(fa.workItemKind, 'epic');
	} finally { r.cleanup(); }
});

test('3a98d279 — an EMPTY head label counts as absent, so it cannot name a folder `artifact`', () => {
	// Caught by reviewing this very change: `??` catches undefined but passes ''
	// through, and fileSeg maps an empty label to the literal segment 'artifact'. So
	// without a length guard a head storing an empty string both named the folder
	// `artifact-E<segment>` AND suppressed the upstream label that would have been
	// correct — strictly worse than the behaviour being fixed.
	const r = t5Repo();
	try {
		writeAtomic(join(r.repo, '.insrc/artifacts', `ISSUE-${T5_HASH}.json`),
			JSON.stringify({ meta: { createdAt: T5_CREATED, epicSlug: '', standalone: true } }));
		writeAtomic(join(r.repo, '.insrc/artifacts', `LLD-${T5_HASH}-S001.json`),
			JSON.stringify({ meta: { createdAt: '2026-10-02T19:00:00.000Z', epicSlug: LABEL_LLD, standalone: true } }));

		const fa = buildRecordFolderArgs(r.repo, T5_HASH, 'S001', true, '2026-10-03T00:00:00.000Z');
		assert.equal(fa.epicSlug, LABEL_LLD, 'the empty head label is ignored and the upstream one is used');
		assert.notEqual(fa.epicSlug, '', 'an empty string must never be returned as a label');
		const md = buildArtifactPaths(r.repo, T5_HASH, 'S001', fa.createdAtISO, fa.workItemKind, fa.epicSlug).md;
		assert.ok(!md.includes('/artifact-E'), `no folder may be named 'artifact': ${md}`);
	} finally { r.cleanup(); }
});
