/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Procix Software India. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';

import { deriveWorkItemIdentity } from '../id.js';
import {
	listArtifactMdPaths,
	listWorkItems,
	resolveArtifactMdPath,
	type ArtifactKind,
} from '../path-scheme.js';
import {
	ARTIFACTS_DIR,
	defineArtifactId,
	lldArtifactPaths,
	lldMdRel,
} from '../storage.js';

const HASH = '185807ba9a6b35d3';                    // 16-hex epic hash
const CREATED = '2026-07-17T07:42:28.275Z';          // → E20260717185807ba
const EPIC_SEGMENT = 'E20260717185807ba';
const SLUG = 'my-feature';

// ---------------------------------------------------------------------------
// resolveArtifactMdPath — placement per kind (ac1 / ac3)
// ---------------------------------------------------------------------------

test('resolveArtifactMdPath: SPEC/DEF/HLD land at the work-item root (no story segment)', () => {
	const identity = deriveWorkItemIdentity(HASH, CREATED);   // epic-level, no story
	for (const kind of ['SPEC', 'DEF', 'HLD'] as const) {
		const p = resolveArtifactMdPath('/repo', identity, kind, 'epic', SLUG);
		assert.equal(p, `/repo/docs/epics/${SLUG}-${EPIC_SEGMENT}/${kind}.md`);
	}
});

test('resolveArtifactMdPath: LLD/PLAN/BUILD/CR/EXT land under S<nnn>/', () => {
	const identity = deriveWorkItemIdentity(HASH, CREATED, 's1');
	for (const kind of ['LLD', 'PLAN', 'BUILD', 'CR', 'EXT'] as const) {
		const p = resolveArtifactMdPath('/repo', identity, kind, 'epic', SLUG);
		assert.equal(p, `/repo/docs/epics/${SLUG}-${EPIC_SEGMENT}/S001/${kind}.md`);
	}
});

test("resolveArtifactMdPath: workItemKind 'standalone' → docs/standalone, same internal S<nnn> grouping", () => {
	const identity = deriveWorkItemIdentity(HASH, CREATED, 's2');
	const epicP = resolveArtifactMdPath('/repo', identity, 'LLD', 'epic', SLUG);
	const saP   = resolveArtifactMdPath('/repo', identity, 'LLD', 'standalone', SLUG);
	assert.equal(epicP, `/repo/docs/epics/${SLUG}-${EPIC_SEGMENT}/S002/LLD.md`);
	assert.equal(saP,   `/repo/docs/standalone/${SLUG}-${EPIC_SEGMENT}/S002/LLD.md`);
});

test('resolveArtifactMdPath: bare <KIND>.md; folder key is fileSeg(slug)+epicSegment; identity (not filename) supplies the key', () => {
	const identity = deriveWorkItemIdentity(HASH, CREATED, 's1');
	// A slug with filesystem-unsafe chars is sanitised for the LABEL only.
	const p = resolveArtifactMdPath('/repo', identity, 'LLD', 'epic', 'Weird Slug/v2!!');
	assert.equal(p, `/repo/docs/epics/Weird-Slug-v2-${EPIC_SEGMENT}/S001/LLD.md`);
	// Two different slugs, same identity → the epicSegment (not the slug) is the key.
	const other = resolveArtifactMdPath('/repo', identity, 'LLD', 'epic', 'renamed');
	assert.ok(other.includes(EPIC_SEGMENT));
});

test('resolveArtifactMdPath: throws when a story-scoped kind gets an epic-level identity', () => {
	const epicIdentity = deriveWorkItemIdentity(HASH, CREATED);   // story === undefined
	for (const kind of ['LLD', 'PLAN', 'BUILD', 'CR', 'EXT'] as ArtifactKind[]) {
		assert.throws(() => resolveArtifactMdPath('/repo', epicIdentity, kind, 'epic', SLUG), /story-scoped/);
	}
	// item-root kinds are fine with an epic-level identity.
	for (const kind of ['SPEC', 'DEF', 'HLD'] as ArtifactKind[]) {
		assert.doesNotThrow(() => resolveArtifactMdPath('/repo', epicIdentity, kind, 'epic', SLUG));
	}
});

test('resolveArtifactMdPath: story ordinal is zero-padded to S<nnn> (>=1000 keeps full width)', () => {
	const id12 = deriveWorkItemIdentity(HASH, CREATED, 's12');
	assert.match(resolveArtifactMdPath('/repo', id12, 'LLD', 'epic', SLUG), /\/S012\/LLD\.md$/);
	const id1234 = deriveWorkItemIdentity(HASH, CREATED, 's1234');
	assert.match(resolveArtifactMdPath('/repo', id1234, 'LLD', 'epic', SLUG), /\/S1234\/LLD\.md$/);
});

// ---------------------------------------------------------------------------
// listWorkItems / listArtifactMdPaths — read side (ac2)
// ---------------------------------------------------------------------------

function seedTree(root: string): void {
	// Epic with two stories.
	const epicRoot = join(root, 'docs', 'epics', `alpha-${EPIC_SEGMENT}`);
	mkdirSync(join(epicRoot, 'S001'), { recursive: true });
	mkdirSync(join(epicRoot, 'S002'), { recursive: true });
	writeFileSync(join(epicRoot, 'DEF.md'), '# def');
	writeFileSync(join(epicRoot, 'HLD.md'), '# hld');
	writeFileSync(join(epicRoot, 'S001', 'LLD.md'), '# lld1');
	writeFileSync(join(epicRoot, 'S001', 'PLAN.md'), '# plan1');
	writeFileSync(join(epicRoot, 'S002', 'LLD.md'), '# lld2');
	// One standalone item.
	const saRoot = join(root, 'docs', 'standalone', `beta-E20260101abcdef01`);
	mkdirSync(join(saRoot, 'S001'), { recursive: true });
	writeFileSync(join(saRoot, 'S001', 'LLD.md'), '# lld');
}

test('listWorkItems: one kind-tagged, sorted entry per work-item folder across both top-levels', () => {
	const root = mkdtempSync(join(tmpdir(), 'insrc-ps-'));
	try {
		seedTree(root);
		const items = listWorkItems(root);
		assert.equal(items.length, 2);
		const epic = items.find(i => i.kind === 'epic');
		const sa   = items.find(i => i.kind === 'standalone');
		assert.ok(epic && epic.root === join('docs', 'epics', `alpha-${EPIC_SEGMENT}`));
		assert.ok(sa && sa.root === join('docs', 'standalone', 'beta-E20260101abcdef01'));
	} finally {
		rmSync(root, { recursive: true, force: true });
	}
});

test('listWorkItems: empty list (no throw) when docs/epics and docs/standalone are absent', () => {
	const root = mkdtempSync(join(tmpdir(), 'insrc-ps-'));
	try {
		assert.deepEqual(listWorkItems(root), []);
	} finally {
		rmSync(root, { recursive: true, force: true });
	}
});

test('listArtifactMdPaths: every md within one work item (item-root + each S<nnn>/)', () => {
	const root = mkdtempSync(join(tmpdir(), 'insrc-ps-'));
	try {
		seedTree(root);
		const epic = listWorkItems(root).find(i => i.kind === 'epic')!;
		const mds = listArtifactMdPaths(root, epic).map(p => p.slice(root.length + 1));
		assert.deepEqual([...mds].sort(), [
			join('docs', 'epics', `alpha-${EPIC_SEGMENT}`, 'DEF.md'),
			join('docs', 'epics', `alpha-${EPIC_SEGMENT}`, 'HLD.md'),
			join('docs', 'epics', `alpha-${EPIC_SEGMENT}`, 'S001', 'LLD.md'),
			join('docs', 'epics', `alpha-${EPIC_SEGMENT}`, 'S001', 'PLAN.md'),
			join('docs', 'epics', `alpha-${EPIC_SEGMENT}`, 'S002', 'LLD.md'),
		].sort());
	} finally {
		rmSync(root, { recursive: true, force: true });
	}
});

// ---------------------------------------------------------------------------
// *ArtifactPaths helper delegation — md nested, json byte-identical
// ---------------------------------------------------------------------------

test('lldArtifactPaths: md is the nested resolver path; json is unchanged ARTIFACTS_DIR/<hashId>.json', () => {
	const { md, json } = lldArtifactPaths('/repo', HASH, 's1', CREATED, 'epic', SLUG);
	assert.equal(md,   `/repo/docs/epics/${SLUG}-${EPIC_SEGMENT}/S001/LLD.md`);
	assert.equal(json, join('/repo', ARTIFACTS_DIR, `LLD-${HASH}-s1.json`));
});

test('lldArtifactPaths: epicSlug omitted → folder label falls back to fileSeg(epicHash); json unchanged', () => {
	const { md, json } = lldArtifactPaths('/repo', HASH, 's1', CREATED, 'epic');
	assert.equal(md,   `/repo/docs/epics/${HASH}-${EPIC_SEGMENT}/S001/LLD.md`);
	assert.equal(json, join('/repo', ARTIFACTS_DIR, `LLD-${HASH}-s1.json`));
});

test('lldMdRel: nested repo-relative md path matching the absolute helper', () => {
	const rel = lldMdRel(HASH, CREATED, 'epic', SLUG, 's1');
	assert.equal(rel, join('docs', 'epics', `${SLUG}-${EPIC_SEGMENT}`, 'S001', 'LLD.md'));
});

// A guard the whole scheme leans on: the json id helper never changed shape.
test('defineArtifactId is unchanged (hash-flat json store stays untouched)', () => {
	assert.equal(defineArtifactId(HASH), `DEF-${HASH}`);
});
