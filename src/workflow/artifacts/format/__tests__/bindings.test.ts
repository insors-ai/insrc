/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Procix Software India. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/**
 * S001 (provenance/feedback) t3 — `feedbackBodyLines` mirrors `companionBodyLines`:
 * present feedback renders one bullet per entry (author, timestamp, target file +
 * optional line span, optional kind, comment); absent/empty feedback returns `[]`
 * so the renderer omits the section (absent-safe / byte-identical).
 *
 * Run: npx tsx --test src/workflow/artifacts/format/__tests__/bindings.test.ts
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { feedbackBodyLines } from '../bindings.js';
import type { FeedbackRecord } from '../../provenance/types.js';

test('feedbackBodyLines: absent → []', () => {
	assert.deepEqual(feedbackBodyLines(undefined), []);
});

test('feedbackBodyLines: empty → []', () => {
	assert.deepEqual(feedbackBodyLines([]), []);
});

test('feedbackBodyLines: present → one bullet per entry with author/timestamp/target/comment', () => {
	const fb: FeedbackRecord = [
		{ id: '1', author: 'rev', timestamp: '2026-09-28T00:00:00Z', target: { file: 'HLD-x.json' }, comment: 'tighten' },
		{ id: '2', author: 'rev2', timestamp: '2026-09-28T01:00:00Z', target: { file: 'src/y.ts', segment: { startLine: 4, endLine: 9 } }, comment: 'edge case', kind: 'suggestion' },
	];
	const lines = feedbackBodyLines(fb);
	assert.equal(lines.length, 2);
	assert.match(lines[0]!, /\*\*rev\*\*/);
	assert.match(lines[0]!, /2026-09-28T00:00:00Z/);
	assert.match(lines[0]!, /`HLD-x\.json`/);
	assert.match(lines[0]!, /tighten/);
	// second entry: line segment + kind badge.
	assert.match(lines[1]!, /`src\/y\.ts:4-9`/);
	assert.match(lines[1]!, /`suggestion`/);
});
