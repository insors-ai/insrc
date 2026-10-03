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
	readEpicDefinitionCore,
	stubArtifactPaths,
	writeAtomic,
} from '../storage.js';

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
