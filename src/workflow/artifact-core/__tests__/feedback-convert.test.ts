import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import { convertLegacyFeedback, legacyBatchOutcomes } from '../feedback-convert.js';
import type { FeedbackEntry } from '../../artifacts/provenance/types.js';

const DOC = 'docs/epics/e/S002/LLD.md';
const entry = (over: Partial<FeedbackEntry> = {}): FeedbackEntry => ({
	id: 'fb1', author: 'Alice Smith', timestamp: '2026-10-20T10:00:00Z', comment: 'tighten this',
	target: { file: DOC }, ...over,
});

describe('legacy feedback conversion', () => {
	it('the legacy feedback conversion maps every field and reports what it cannot map', () => {
		// the plain case: absent kind becomes comment, the author gets the unknown: namespace, nothing is unmapped
		const plain = convertLegacyFeedback(entry(), DOC);
		assert.deepEqual(plain.feedback, {
			id: 'fb1', text: 'tighten this', actor: { id: 'unknown:Alice Smith', kind: 'person', properties: {} },
			timestamp: '2026-10-20T10:00:00Z', feedback: [], kind: 'comment',
		});
		assert.deepEqual(plain.unmapped, []);
		assert.equal(plain.decision, undefined);

		// kinds
		assert.equal(convertLegacyFeedback(entry({ kind: 'feedback' }), DOC).feedback.kind, 'comment');
		assert.equal(convertLegacyFeedback(entry({ kind: 'comment' }), DOC).feedback.kind, 'comment');
		assert.equal(convertLegacyFeedback(entry({ kind: 'suggestion' }), DOC).feedback.kind, 'suggestion');

		// anchor: quote, prefix, suffix copy; sectionSlug becomes section; the segment becomes lines
		const anchored = convertLegacyFeedback(entry({
			anchor: { quote: 'q', prefix: 'pre', suffix: 'suf', sectionSlug: 'error-paths' },
			target: { file: DOC, segment: { startLine: 4, endLine: 9 } },
		}), DOC);
		assert.deepEqual(anchored.feedback.anchor, { quote: 'q', prefix: 'pre', suffix: 'suf', section: 'error-paths', lines: [4, 9] });
		assert.deepEqual(convertLegacyFeedback(entry({ anchor: { quote: 'q' } }), DOC).feedback.anchor, { quote: 'q' });
		assert.deepEqual(convertLegacyFeedback(entry({ target: { file: DOC, segment: { startLine: 1, endLine: 1 } } }), DOC).feedback.anchor, { lines: [1, 1] });

		// target.version: an integer becomes revision; anything else is reported, not dropped
		const integer = convertLegacyFeedback(entry({ target: { file: DOC, version: '3' } }), DOC);
		assert.equal(integer.feedback.revision, 3);
		assert.deepEqual(integer.unmapped, []);
		const odd = convertLegacyFeedback(entry({ target: { file: DOC, version: 'v3-draft' } }), DOC);
		assert.equal(odd.feedback.revision, undefined);
		assert.deepEqual(odd.unmapped, [{ field: 'target.version', value: 'v3-draft', reason: 'not an integer revision' }]);
		for (const v of ['3.5', '-1', '', '1e3']) assert.equal(convertLegacyFeedback(entry({ target: { file: DOC, version: v } }), DOC).unmapped.length, 1, v);

		// target.file: the artifact's own document is dropped, any other is reported
		const foreign = convertLegacyFeedback(entry({ target: { file: 'src/other.ts' } }), DOC);
		assert.deepEqual(foreign.unmapped, [{ field: 'target.file', value: 'src/other.ts', reason: "not the artifact's own document" }]);
		assert.equal(convertLegacyFeedback(entry(), undefined).unmapped.length, 1, 'with no own document every file is reported');

		// batchId copies; the decision becomes the batch's log outcome
		const a = convertLegacyFeedback(entry({ id: 'a', batchId: 'b1', decision: 'reject' }), DOC);
		const b = convertLegacyFeedback(entry({ id: 'b', batchId: 'b1', decision: 'reject' }), DOC);
		const c = convertLegacyFeedback(entry({ id: 'c', batchId: 'b2', decision: 'approve' }), DOC);
		const d = convertLegacyFeedback(entry({ id: 'd', decision: 'feedback' }), DOC);
		assert.equal(a.feedback.batchId, 'b1');
		assert.equal(a.decision, 'reject');
		assert.deepEqual(legacyBatchOutcomes([a, b, c, d]), [
			{ batchId: 'b1', outcome: { result: 'reject', summary: 'review decision: reject' } },
			{ batchId: 'b2', outcome: { result: 'approve', summary: 'review decision: approve' } },
		]);
		assert.deepEqual(legacyBatchOutcomes([]), []);
	});
});
