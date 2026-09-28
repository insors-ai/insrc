/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Procix Software India. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/**
 * S001 (provenance/feedback) t1 — the provenance vocabulary is the shape the
 * feedback API + render binding depend on. tsc proves the compile-time shape;
 * this pins the runtime field set (a FeedbackEntry carries id/author/timestamp/
 * target/comment + optional kind; a target may carry a line segment; the
 * s2-reserved ChangeLogEntry shares the authorship stamp).
 *
 * Run: npx tsx --test src/workflow/artifacts/provenance/__tests__/types.test.ts
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import type { ChangeLogEntry, FeedbackEntry, FeedbackRecord, ProvenanceTarget } from '../types.js';

test('FeedbackEntry carries the full authorship + target + comment shape', () => {
	const target: ProvenanceTarget = { file: 'src/x.ts', version: 'v2', segment: { startLine: 10, endLine: 20 } };
	const entry: FeedbackEntry = {
		id: 'ab12cd34', author: 'reviewer@x', timestamp: '2026-09-28T00:00:00Z',
		target, comment: 'tighten this', kind: 'suggestion',
	};
	assert.equal(entry.id, 'ab12cd34');
	assert.equal(entry.target.segment?.startLine, 10);
	assert.equal(entry.kind, 'suggestion');
});

test('a FeedbackEntry with a bare target (no version/segment/kind) is valid', () => {
	const entry: FeedbackEntry = {
		id: 'x', author: 'a', timestamp: 't', target: { file: 'f' }, comment: 'c',
	};
	const record: FeedbackRecord = [entry];
	assert.equal(record.length, 1);
	assert.equal(record[0]!.target.version, undefined);
});

test('ChangeLogEntry (s2-reserved) shares the authorship stamp', () => {
	const cl: ChangeLogEntry = { author: 'a', timestamp: 't', target: { file: 'f' }, summary: 's' };
	assert.equal(cl.summary, 's');
});
