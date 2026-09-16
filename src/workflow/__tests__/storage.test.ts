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
