/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Procix Software India. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/**
 * Story E202610138d4b90c9:S001 / t1 — a feedback entry's anchor, decision and batch id:
 * both writers store them, both schemas and the request coercion accept them, the
 * Feedback section shows them, and an entry without them is handled exactly as before.
 *
 * Run: npx tsx --test src/workflow/artifacts/provenance/__tests__/review-fields.test.ts
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, rmSync, statSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Ajv } from 'ajv';

import {
	appendFeedback, appendFeedbackBatch, priorFeedback, ArtifactFeedbackError, writeArtifactJson,
	type ArtifactShape, type FeedbackEntryInput,
} from '../writer.js';
import { artifactFeedbackTool, coerceRequest } from '../tool.js';
import { FEEDBACK_PROPERTY_SCHEMA } from '../schema.js';
import { feedbackBodyLines } from '../../format/bindings.js';
import type { FeedbackEntry, FeedbackRecord } from '../types.js';

/** A temp repo with a `.insrc/artifacts` root the path guard accepts. */
function tmpArtifactPath(name: string): { path: string; cleanup: () => void } {
	const root = mkdtempSync(join(tmpdir(), 'insrc-review-fields-'));
	const dir = join(root, '.insrc', 'artifacts');
	mkdirSync(dir, { recursive: true });
	return { path: join(dir, name), cleanup: () => rmSync(root, { recursive: true, force: true }) };
}

const baseArtifact: ArtifactShape = {
	meta: { workflow: 'design.story', runId: 'r1', schemaVersion: 1, epicHash: 'abc' },
	body: { summary: { prose: 'p' }, openQuestions: ['q'] },
	citations: [{ id: 'c1', kind: 'doc', ref: 'x' }],
};

const ANCHOR = { quote: 'cut to 8 lines', sectionSlug: 'summary', prefix: 'colours, ', suffix: ' until the reader' } as const;
const inline: FeedbackEntryInput = {
	author: 'Rev', comment: 'Say what the header shows.', target: { file: 'docs/x/LLD.md', version: 'v1' },
	kind: 'comment', anchor: ANCHOR, decision: 'reject', batchId: 'b1',
};
const general: FeedbackEntryInput = {
	author: 'Rev', comment: 'Good overall.', target: { file: 'docs/x/LLD.md', version: 'v1' }, kind: 'comment', decision: 'reject', batchId: 'b1',
};

test('feedback: appendFeedbackBatch writes every entry in one write with ids and one timestamp, changes no other key, and writes nothing when any entry is invalid', () => {
	const { path, cleanup } = tmpArtifactPath('LLD-abc-S001.json');
	try {
		writeArtifactJson(path, { ...baseArtifact, body: { ...baseArtifact.body, feedback: [{ id: 'old', author: 'A', timestamp: 't0', target: { file: 'f' }, comment: 'earlier' }] } });
		const before = JSON.parse(readFileSync(path, 'utf8'));

		const res = appendFeedbackBatch({ artifactPath: path, entries: [inline, general] });
		assert.equal(res.total, 3);
		assert.equal(res.entryIds.length, 2);
		assert.notEqual(res.entryIds[0], res.entryIds[1]);

		const after = JSON.parse(readFileSync(path, 'utf8'));
		assert.deepEqual(after.meta, before.meta);
		assert.deepEqual(after.citations, before.citations);
		assert.deepEqual({ ...after.body, feedback: undefined }, { ...before.body, feedback: undefined }, 'no other body key changes');
		const fb = after.body.feedback as FeedbackEntry[];
		assert.deepEqual(fb[0], before.body.feedback[0], 'the earlier entry is untouched');
		assert.deepEqual(fb.slice(1).map((e) => e.id), res.entryIds, 'in the order given');
		assert.equal(fb[1]!.timestamp, fb[2]!.timestamp, 'one timestamp for the batch');
		assert.match(fb[1]!.timestamp, /^\d{4}-\d{2}-\d{2}T/);
		assert.deepEqual({ ...fb[1], id: '', timestamp: '' }, { id: '', timestamp: '', author: 'Rev', target: inline.target, comment: inline.comment, kind: 'comment', anchor: ANCHOR, decision: 'reject', batchId: 'b1' });
		assert.equal('anchor' in fb[2]!, false, 'an entry without an anchor stores none');

		// One invalid entry: nothing is written, not even the valid ones.
		const snapshot = readFileSync(path, 'utf8');
		const mtime = statSync(path).mtimeMs;
		assert.throws(() => appendFeedbackBatch({ artifactPath: path, entries: [inline, { ...general, comment: '   ' }] }), ArtifactFeedbackError);
		assert.throws(() => appendFeedbackBatch({ artifactPath: path, entries: [{ ...inline, author: '' }] }), ArtifactFeedbackError);
		assert.throws(() => appendFeedbackBatch({ artifactPath: path, entries: [] }), /at least one entry/);
		assert.equal(readFileSync(path, 'utf8'), snapshot);
		assert.equal(statSync(path).mtimeMs, mtime, 'the file was not rewritten');
		// The path guard and a missing artifact are refused as for a single entry.
		assert.throws(() => appendFeedbackBatch({ artifactPath: join(tmpdir(), 'elsewhere.json'), entries: [inline] }), ArtifactFeedbackError);
		assert.throws(() => appendFeedbackBatch({ artifactPath: join(path, '..', 'missing.json'), entries: [inline] }), ArtifactFeedbackError);
	} finally {
		cleanup();
	}
});

test("feedback: appendFeedback stores an entry's anchor, decision and batchId when the request has them and stores a request without them exactly as before", () => {
	const { path, cleanup } = tmpArtifactPath('LLD-abc-S001.json');
	try {
		writeArtifactJson(path, baseArtifact);
		appendFeedback({ artifactPath: path, entry: { ...inline, timestamp: '2026-10-13T00:00:00.000Z' } });
		appendFeedback({ artifactPath: path, entry: { author: ' rev ', comment: ' plain ', target: { file: 'f', segment: { startLine: 1, endLine: 2 } }, kind: 'suggestion', timestamp: '2026-10-13T00:00:01.000Z' } });
		const fb = JSON.parse(readFileSync(path, 'utf8')).body.feedback as FeedbackEntry[];
		assert.deepEqual({ ...fb[0], id: '' }, { id: '', author: 'Rev', timestamp: '2026-10-13T00:00:00.000Z', target: inline.target, comment: inline.comment, kind: 'comment', anchor: ANCHOR, decision: 'reject', batchId: 'b1' });
		// A request without the new fields: the same keys, in the same order, as before this Story.
		assert.deepEqual(Object.keys(fb[1]!), ['id', 'author', 'timestamp', 'target', 'comment', 'kind']);
		assert.deepEqual({ ...fb[1], id: '' }, { id: '', author: 'rev', timestamp: '2026-10-13T00:00:01.000Z', target: { file: 'f', segment: { startLine: 1, endLine: 2 } }, comment: 'plain', kind: 'suggestion' });
	} finally {
		cleanup();
	}
});

test("feedback: the tool's input schema, coerceRequest and the stored list's schema accept an entry with an anchor, a decision and a batchId, and an entry without them is still valid", () => {
	const ajv = new Ajv({ allErrors: true });
	const request = ajv.compile(artifactFeedbackTool.inputSchema as object);
	const stored = ajv.compile(FEEDBACK_PROPERTY_SCHEMA);

	const withFields = { artifactPath: '/r/.insrc/artifacts/LLD-a-S001.json', author: 'Rev', comment: 'c', target: { file: 'docs/x/LLD.md', version: 'v1' }, kind: 'comment', anchor: ANCHOR, decision: 'approve', batchId: 'b1' };
	const without = { artifactPath: '/r/.insrc/artifacts/LLD-a-S001.json', author: 'Rev', comment: 'c', target: { file: 'f' } };
	assert.equal(request(withFields), true, JSON.stringify(request.errors));
	assert.equal(request(without), true, JSON.stringify(request.errors));
	// The schema is still closed: an unknown key, a bad decision and an anchor with no quote are refused.
	assert.equal(request({ ...without, extra: 1 }), false);
	assert.equal(request({ ...without, decision: 'maybe' }), false);
	assert.equal(request({ ...without, anchor: { sectionSlug: 's' } }), false);
	assert.equal(request({ ...without, anchor: { quote: 'q', other: 1 } }), false);

	// coerceRequest passes the three fields through and drops malformed ones.
	const coerced = coerceRequest(withFields);
	assert.deepEqual(coerced.entry, { author: 'Rev', comment: 'c', target: { file: 'docs/x/LLD.md', version: 'v1' }, kind: 'comment', anchor: ANCHOR, decision: 'approve', batchId: 'b1' });
	assert.deepEqual(coerceRequest(without).entry, { author: 'Rev', comment: 'c', target: { file: 'f' } });
	const bad = coerceRequest({ ...without, anchor: { sectionSlug: 's' }, decision: 'maybe', batchId: '' }).entry;
	assert.deepEqual(Object.keys(bad), ['author', 'comment', 'target']);
	assert.deepEqual(coerceRequest({ ...without, anchor: { quote: 'q', prefix: 7 } }).entry.anchor, { quote: 'q' });

	// The stored list.
	const full: FeedbackEntry = { id: 'i1', author: 'Rev', timestamp: 't', target: { file: 'f' }, comment: 'c', kind: 'comment', anchor: ANCHOR, decision: 'feedback', batchId: 'b1' };
	const old: FeedbackEntry = { id: 'i0', author: 'A', timestamp: 't', target: { file: 'f' }, comment: 'c' };
	assert.equal(stored([full, old]), true, JSON.stringify(stored.errors));
	assert.equal(stored([{ ...old, decision: 'maybe' }]), false);
	assert.equal(stored([{ ...old, surprise: true }]), false);
});

test('feedback: feedbackBodyLines shows the decision and the quoted text of an entry that has them and renders an old entry byte-identically', () => {
	const old: FeedbackRecord = [
		{ id: '1', author: 'rev', timestamp: '2026-09-28T00:00:00Z', target: { file: 'HLD-x.json' }, comment: 'tighten' },
		{ id: '2', author: 'rev2', timestamp: '2026-09-28T01:00:00Z', target: { file: 'src/y.ts', segment: { startLine: 4, endLine: 9 } }, comment: 'edge case', kind: 'suggestion' },
	];
	// Exactly the lines the renderer gave before this Story.
	assert.deepEqual(feedbackBodyLines(old), [
		'- **rev** (2026-09-28T00:00:00Z) — `HLD-x.json`: tighten',
		'- **rev2** (2026-09-28T01:00:00Z) `suggestion` — `src/y.ts:4-9`: edge case',
	]);
	const long = 'x'.repeat(200);
	const lines = feedbackBodyLines([
		{ id: '3', author: 'Rev', timestamp: 't', target: { file: 'docs/x/LLD.md' }, comment: 'Say what the header shows.', kind: 'comment', decision: 'reject', anchor: { quote: 'cut to\n  8 lines' } },
		{ id: '4', author: 'Rev', timestamp: 't', target: { file: 'docs/x/LLD.md' }, comment: 'Good overall.', decision: 'approve' },
		{ id: '5', author: 'Rev', timestamp: 't', target: { file: 'f' }, comment: 'c', anchor: { quote: long } },
	]);
	assert.equal(lines[0], '- **Rev** (t) `comment` `reject` — `docs/x/LLD.md`: on "cut to 8 lines": Say what the header shows.');
	assert.equal(lines[1], '- **Rev** (t) `approve` — `docs/x/LLD.md`: Good overall.');
	assert.equal(lines[2], `- **Rev** (t) — \`f\`: on "${'x'.repeat(120)}…": c`);
	assert.deepEqual(feedbackBodyLines(undefined), []);
	assert.deepEqual(feedbackBodyLines([]), []);
});

test('feedback: priorFeedback returns the stored list, and an empty list for a missing, unreadable or feedback-less artifact', () => {
	const { path, cleanup } = tmpArtifactPath('LLD-abc-S001.json');
	try {
		assert.deepEqual(priorFeedback(path), [], 'missing');
		writeArtifactJson(path, baseArtifact);
		assert.deepEqual(priorFeedback(path), [], 'no feedback key');
		appendFeedbackBatch({ artifactPath: path, entries: [inline, general] });
		const stored = JSON.parse(readFileSync(path, 'utf8')).body.feedback;
		const before = readFileSync(path, 'utf8');
		assert.deepEqual(priorFeedback(path), stored, 'the list as stored, in order');
		assert.equal(readFileSync(path, 'utf8'), before, 'reading changes nothing');

		writeFileSync(path, '{ not json');
		assert.deepEqual(priorFeedback(path), [], 'malformed');
		writeFileSync(path, JSON.stringify({ meta: {}, body: { feedback: 'nope' } }));
		assert.deepEqual(priorFeedback(path), [], 'feedback that is not a list');
		writeFileSync(path, 'null');
		assert.deepEqual(priorFeedback(path), []);
		assert.deepEqual(priorFeedback(join(path, '..')), [], 'a directory is unreadable as a file');
	} finally {
		cleanup();
	}
});
