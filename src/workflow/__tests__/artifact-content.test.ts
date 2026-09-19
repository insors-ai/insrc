/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Procix Software India. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/**
 * S002 (Epic ide-artifact-review-panel-jetbrains-plugin) — daemon tests for
 * handleArtifactContent (t1) + the workflow.artifactContent contract (t2).
 *
 * Over a temp docs/ + .insrc/artifacts fixture (no socket): view assembly
 * (renderedMarkdown byte-equal to the .md; openQuestions from the .json;
 * approvable/blockReason from meta.review) and every failure mapping
 * (path-escape, missing .md, missing/malformed .json, repo/mdPath unresolved),
 * plus the read-only guarantee.
 *
 * Run: npx tsx --test src/workflow/__tests__/artifact-content.test.ts
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync, readdirSync, rmSync, symlinkSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { handleArtifactContent, type ArtifactReviewView } from '../artifact-content.js';
import { ARTIFACTS_DIR } from '../storage.js';

const HASH = '1703991c69967193';
const ID = `LLD-${HASH}-s1`;
const SEG = 'E20260101abcdef12';
const MD_REL = `docs/epics/demo-${SEG}/S001/LLD.md`;
const MD_BODY = `<!-- insrc:artifact ${ID} -->\n\n# S002 demo\n\nSome **rendered** content.\n`;

interface Fixture { repo: string; mdRel: string }

function makeFixture(opts: {
	md?: string;
	json?: unknown | string | null;   // null => omit the .json
	mdRel?: string;
} = {}): Fixture {
	const repo = mkdtempSync(join(tmpdir(), 'insrc-artcontent-'));
	const mdRel = opts.mdRel ?? MD_REL;
	const mdAbs = join(repo, mdRel);
	mkdirSync(join(mdAbs, '..'), { recursive: true });
	writeFileSync(mdAbs, opts.md ?? MD_BODY);
	if (opts.json !== null) {
		const dir = join(repo, ARTIFACTS_DIR);
		mkdirSync(dir, { recursive: true });
		const content = opts.json === undefined
			? JSON.stringify({ meta: {}, body: { openQuestions: ['First?', 'Second?'] } })
			: (typeof opts.json === 'string' ? opts.json : JSON.stringify(opts.json));
		writeFileSync(join(dir, `${ID}.json`), content);
	}
	return { repo, mdRel };
}

function cleanup(repo: string): void { rmSync(repo, { recursive: true, force: true }); }

function asView(r: ArtifactReviewView | { error: string }): ArtifactReviewView {
	assert.ok(!('error' in r), `expected a view, got error: ${(r as { error?: string }).error}`);
	return r as ArtifactReviewView;
}

test('handleArtifactContent: happy path — renderedMarkdown byte-equal to the .md; kind/artifactId; openQuestions; approvable', () => {
	const { repo, mdRel } = makeFixture();
	try {
		const v = asView(handleArtifactContent({ repo, mdPath: mdRel }, undefined));
		assert.equal(v.renderedMarkdown, MD_BODY);   // verbatim, no transformation (ac3/k5)
		assert.equal(v.kind, 'LLD');
		assert.equal(v.artifactId, ID);
		assert.deepEqual(v.openQuestions.map(q => q.text), ['First?', 'Second?']);
		assert.ok(v.openQuestions.every(q => q.status === 'open'));
		assert.equal(v.approvable, true);
		assert.equal(v.blockReason ?? null, null);
	} finally {
		cleanup(repo);
	}
});

test('handleArtifactContent: a standing review block-verdict -> approvable=false + blockReason', () => {
	const review = {
		artifact: ID, stage: 'design.story', verdict: 'block',
		findings: [{ claimId: 'c1', kind: 'semantic', severity: 'HIGH', premise: 'a load-bearing premise', evidence: 'e', action: 'fix it', fixability: 'manual' }],
		counts: { high: 1, med: 0, low: 0 }, reviewedAt: '2026-09-19T00:00:00.000Z', model: 'client',
	};
	const { repo, mdRel } = makeFixture({ json: { meta: { review }, body: {} } });
	try {
		const v = asView(handleArtifactContent({ repo, mdPath: mdRel }, undefined));
		assert.equal(v.approvable, false);
		assert.match(v.blockReason ?? '', /Review blocks approval/);
	} finally {
		cleanup(repo);
	}
});

test('handleArtifactContent: openQuestions absent -> empty list (not an error)', () => {
	const { repo, mdRel } = makeFixture({ json: { meta: {}, body: {} } });
	try {
		const v = asView(handleArtifactContent({ repo, mdPath: mdRel }, undefined));
		assert.deepEqual(v.openQuestions, []);
	} finally {
		cleanup(repo);
	}
});

test('handleArtifactContent: mdPath escaping docs/ -> { error }, and no read outside docs/', () => {
	const { repo } = makeFixture();
	try {
		for (const bad of ['../../etc/passwd', 'src/daemon/index.ts', '/etc/hosts']) {
			const r = handleArtifactContent({ repo, mdPath: bad }, undefined);
			assert.ok('error' in r, `expected error for ${bad}`);
			assert.match((r as { error: string }).error, /docs\//);
		}
	} finally {
		cleanup(repo);
	}
});

test('handleArtifactContent: missing/unreadable .md -> { error }', () => {
	const { repo } = makeFixture();
	try {
		const r = handleArtifactContent({ repo, mdPath: `docs/epics/demo-${SEG}/S001/NOPE.md` }, undefined);
		assert.ok('error' in r);
	} finally {
		cleanup(repo);
	}
});

test('handleArtifactContent: missing sibling .json -> { error }', () => {
	const { repo, mdRel } = makeFixture({ json: null });   // md present (with marker), json absent
	try {
		const r = handleArtifactContent({ repo, mdPath: mdRel }, undefined);
		assert.ok('error' in r);
	} finally {
		cleanup(repo);
	}
});

test('handleArtifactContent: malformed sibling .json -> { error }', () => {
	const { repo, mdRel } = makeFixture({ json: '{ not valid json' });
	try {
		const r = handleArtifactContent({ repo, mdPath: mdRel }, undefined);
		assert.ok('error' in r);
	} finally {
		cleanup(repo);
	}
});

test('handleArtifactContent: repo unresolved / empty mdPath -> { error } (never a partial view)', () => {
	const noRepo = handleArtifactContent({ mdPath: MD_REL }, undefined);
	assert.ok('error' in noRepo && !('artifactId' in noRepo));

	const { repo } = makeFixture();
	try {
		const noMd = handleArtifactContent({ repo, mdPath: '' }, undefined);
		assert.ok('error' in noMd);
		// env fallback resolves repo
		const viaEnv = handleArtifactContent({ mdPath: MD_REL }, repo);
		assert.ok('artifactId' in viaEnv);
	} finally {
		cleanup(repo);
	}
});

test('handleArtifactContent: a symlink under docs/ escaping the tree -> { error }, target not read', () => {
	const { repo } = makeFixture();
	// A secret file OUTSIDE the repo, and a symlink docs/leak -> that outside dir.
	const outside = mkdtempSync(join(tmpdir(), 'insrc-outside-'));
	writeFileSync(join(outside, 'secret.md'), '<!-- insrc:artifact LLD-deadbeef-s1 -->\nSECRET');
	try {
		symlinkSync(outside, join(repo, 'docs', 'leak'), 'dir');
		// Lexically 'docs/leak/secret.md' looks under docs/, but realpath escapes.
		const r = handleArtifactContent({ repo, mdPath: 'docs/leak/secret.md' }, undefined);
		assert.ok('error' in r, 'a symlink escaping docs/ must be refused');
		assert.ok(!('renderedMarkdown' in r), 'the target must not be read');
	} finally {
		cleanup(repo);
		cleanup(outside);
	}
});

test('handleArtifactContent: read-only — no file created or mutated over the fixture', () => {
	const { repo, mdRel } = makeFixture();
	try {
		const before = readdirSync(join(repo, ARTIFACTS_DIR)).sort();
		handleArtifactContent({ repo, mdPath: mdRel }, undefined);
		const after = readdirSync(join(repo, ARTIFACTS_DIR)).sort();
		assert.deepEqual(after, before);
	} finally {
		cleanup(repo);
	}
});
