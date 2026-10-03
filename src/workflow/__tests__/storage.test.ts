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
