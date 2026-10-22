/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Procix Software India. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/**
 * The request of `artifact.feedback.append`: coerceRequest shapes the loosely typed input into a validated request, passes an
 * entry's anchor, decision and batch id through when they are well formed, and drops them when they are not.
 *
 * Run: npx tsx --test src/workflow/feedback/__tests__/legacy-request.test.ts
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { ArtifactFeedbackError, coerceRequest } from '../legacy-request.js';

const ANCHOR = { quote: 'cut to 8 lines', sectionSlug: 'summary', prefix: 'colours, ', suffix: ' until the reader' } as const;
const without = { artifactPath: '/r/.insrc/artifacts/LLD-a-s1.json', author: 'Rev', comment: 'c', target: { file: 'f' } };

test('coerceRequest passes the anchor, the decision and the batch id through and drops malformed ones', () => {
	const withFields = { ...without, target: { file: 'docs/x/LLD.md', version: 'v1' }, kind: 'comment', anchor: ANCHOR, decision: 'approve', batchId: 'b1' };
	assert.deepEqual(coerceRequest(withFields).entry, { author: 'Rev', comment: 'c', target: { file: 'docs/x/LLD.md', version: 'v1' }, kind: 'comment', anchor: ANCHOR, decision: 'approve', batchId: 'b1' });
	assert.deepEqual(coerceRequest(without).entry, { author: 'Rev', comment: 'c', target: { file: 'f' } });
	const bad = coerceRequest({ ...without, anchor: { sectionSlug: 's' }, decision: 'maybe', batchId: '' }).entry;
	assert.deepEqual(Object.keys(bad), ['author', 'comment', 'target']);
	assert.deepEqual(coerceRequest({ ...without, anchor: { quote: 'q', prefix: 7 } }).entry.anchor, { quote: 'q' });
});

test('coerceRequest keeps a segment and a timestamp, and refuses a request with no path or no target file', () => {
	const req = coerceRequest({ ...without, timestamp: '2026-10-13T00:00:00.000Z', target: { file: 'f', segment: { startLine: 1, endLine: 2 } }, kind: 'suggestion' });
	assert.deepEqual(req.entry, { author: 'Rev', comment: 'c', target: { file: 'f', segment: { startLine: 1, endLine: 2 } }, timestamp: '2026-10-13T00:00:00.000Z', kind: 'suggestion' });
	assert.throws(() => coerceRequest({ ...without, artifactPath: '' }), ArtifactFeedbackError);
	assert.throws(() => coerceRequest({ ...without, target: {} }), /target\.file/);
});
