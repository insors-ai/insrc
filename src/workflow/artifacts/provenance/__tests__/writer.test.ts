/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Procix Software India. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/**
 * S001 (provenance/feedback) t2 — the append-only writer is KEY-PRESERVING and
 * REJECTS the three unsafe inputs. A round-trip proves meta + citations + every
 * other body key survive byte-identical and only `body.feedback` grows; the
 * rejection tests prove an out-of-tree path, a malformed artifact, and a
 * blank author/comment all throw ArtifactFeedbackError (never a silent write).
 *
 * Run: npx tsx --test src/workflow/artifacts/provenance/__tests__/writer.test.ts
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { appendFeedback, ArtifactFeedbackError, writeArtifactJson, type ArtifactShape } from '../writer.js';

/** A temp repo with a `.insrc/artifacts` root the path guard accepts. */
function tmpArtifactPath(name: string): { path: string; cleanup: () => void } {
	const root = mkdtempSync(join(tmpdir(), 'insrc-feedback-'));
	const dir = join(root, '.insrc', 'artifacts');
	mkdirSync(dir, { recursive: true });
	return { path: join(dir, name), cleanup: () => rmSync(root, { recursive: true, force: true }) };
}

const baseArtifact: ArtifactShape = {
	meta: { workflow: 'define', runId: 'r1', schemaVersion: 1, epicHash: 'abc' },
	body: { flavor: 'enhancement', problem: 'p', stories: [{ id: 's1' }] },
	citations: [{ id: 'c1', kind: 'doc', ref: 'x' }],
};

test('round-trip: append preserves meta + citations + other body keys byte-identical; only body.feedback grows', () => {
	const { path, cleanup } = tmpArtifactPath('DEF-abc.json');
	try {
		writeArtifactJson(path, baseArtifact);
		const before = JSON.parse(readFileSync(path, 'utf8'));

		const res = appendFeedback({
			artifactPath: path,
			entry: { author: 'rev', comment: 'looks good', target: { file: 'DEF-abc.json' } },
		});
		assert.equal(res.total, 1);
		assert.ok(res.entryId.length > 0);

		const after = JSON.parse(readFileSync(path, 'utf8'));
		// meta + citations + non-feedback body keys unchanged.
		assert.deepEqual(after.meta, before.meta);
		assert.deepEqual(after.citations, before.citations);
		assert.deepEqual(after.body.flavor, before.body.flavor);
		assert.deepEqual(after.body.problem, before.body.problem);
		assert.deepEqual(after.body.stories, before.body.stories);
		// only body.feedback grew.
		assert.equal(Array.isArray(after.body.feedback), true);
		assert.equal(after.body.feedback.length, 1);
		assert.equal(after.body.feedback[0].author, 'rev');
		assert.equal(after.body.feedback[0].comment, 'looks good');
		assert.equal(after.body.feedback[0].id, res.entryId);
		assert.ok(typeof after.body.feedback[0].timestamp === 'string');

		// A second append is additive (never edits/removes the first).
		const res2 = appendFeedback({ artifactPath: path, entry: { author: 'rev2', comment: 'one more', target: { file: 'f' } } });
		assert.equal(res2.total, 2);
		const after2 = JSON.parse(readFileSync(path, 'utf8'));
		assert.equal(after2.body.feedback.length, 2);
		assert.equal(after2.body.feedback[0].id, res.entryId); // first entry untouched
	} finally {
		cleanup();
	}
});

test('rejects an out-of-tree path (not under .insrc/artifacts or docs/)', () => {
	const root = mkdtempSync(join(tmpdir(), 'insrc-feedback-oot-'));
	try {
		const bad = join(root, 'DEF-abc.json');
		writeFileSync(bad, JSON.stringify(baseArtifact));
		assert.throws(
			() => appendFeedback({ artifactPath: bad, entry: { author: 'a', comment: 'c', target: { file: 'f' } } }),
			ArtifactFeedbackError,
		);
	} finally {
		rmSync(root, { recursive: true, force: true });
	}
});

test('rejects a malformed / missing artifact JSON', () => {
	const { path, cleanup } = tmpArtifactPath('DEF-bad.json');
	try {
		writeFileSync(path, '{ not json');
		assert.throws(
			() => appendFeedback({ artifactPath: path, entry: { author: 'a', comment: 'c', target: { file: 'f' } } }),
			ArtifactFeedbackError,
		);
		// A missing file also throws (never creates it).
		const { path: missing, cleanup: c2 } = tmpArtifactPath('DEF-missing.json');
		try {
			assert.throws(
				() => appendFeedback({ artifactPath: missing, entry: { author: 'a', comment: 'c', target: { file: 'f' } } }),
				ArtifactFeedbackError,
			);
		} finally { c2(); }
	} finally {
		cleanup();
	}
});

test('rejects a blank author or blank comment', () => {
	const { path, cleanup } = tmpArtifactPath('DEF-blank.json');
	try {
		writeArtifactJson(path, baseArtifact);
		assert.throws(
			() => appendFeedback({ artifactPath: path, entry: { author: '   ', comment: 'c', target: { file: 'f' } } }),
			ArtifactFeedbackError,
		);
		assert.throws(
			() => appendFeedback({ artifactPath: path, entry: { author: 'a', comment: '', target: { file: 'f' } } }),
			ArtifactFeedbackError,
		);
	} finally {
		cleanup();
	}
});

test('writeArtifactJson refuses an out-of-tree destination', () => {
	const root = mkdtempSync(join(tmpdir(), 'insrc-feedback-w-'));
	try {
		assert.throws(() => writeArtifactJson(join(root, 'x.json'), baseArtifact), ArtifactFeedbackError);
	} finally {
		rmSync(root, { recursive: true, force: true });
	}
});
