import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import { convertLegacyFeedback } from '../../artifact-core/feedback-convert.js';
import type { FeedbackEntry } from '../../artifacts/provenance/types.js';

const DOC = 'docs/epics/e/S002/LLD.md';
const entry = (over: Partial<FeedbackEntry> = {}): FeedbackEntry => ({
	id: 'fb1', author: 'Alice Smith', timestamp: '2026-10-20T10:00:00Z', comment: 'tighten this',
	target: { file: DOC }, ...over,
});

describe('convert-feedback', () => {
	it('convert-feedback.test.ts: each mapping of convertLegacyFeedback from the s5 hand-off (actor, kind, anchor section, kept fields)', () => {
		// actor: a namespaced author is kept lower-cased, any other becomes legacy:<slug> with the text as the name
		for (const author of ['os:Alice@Laptop', 'GIT:alice@example.com', 'github:Alice']) {
			const actor = convertLegacyFeedback(entry({ author }), DOC).feedback.actor;
			assert.equal(actor.id, author.toLowerCase());
			assert.deepEqual(actor.properties, { name: author });
		}
		const plain = convertLegacyFeedback(entry({ author: ' Alice  Smith! ' }), DOC).feedback.actor;
		assert.deepEqual([plain.id, plain.kind, plain.properties], ['legacy:alice-smith', 'person', { name: ' Alice  Smith! ' }]);
		assert.equal(convertLegacyFeedback(entry({ author: '???' }), DOC).feedback.actor.id, 'legacy:unknown');
		assert.equal(convertLegacyFeedback(entry({ author: 'Alice' }), DOC).feedback.actor.id, convertLegacyFeedback(entry({ author: 'alice' }), DOC).feedback.actor.id, 'the id is stable across spellings');

		// kind: a feedback decision or kind is a revision request, a suggestion stays, the rest are comments
		const kind = (over: Partial<FeedbackEntry>): string => convertLegacyFeedback(entry(over), DOC).feedback.kind;
		assert.equal(kind({ kind: 'feedback' }), 'revision-request');
		assert.equal(kind({ decision: 'feedback' }), 'revision-request');
		assert.equal(kind({ kind: 'suggestion', decision: 'feedback' }), 'revision-request');
		assert.equal(kind({ kind: 'suggestion' }), 'suggestion');
		assert.equal(kind({ kind: 'comment' }), 'comment');
		assert.equal(kind({ decision: 'approve' }), 'comment');
		assert.equal(kind({ decision: 'reject' }), 'comment');
		assert.equal(kind({}), 'comment');

		// anchor: a foreign file lands in the section (with the heading slug after a '#') and is not unmapped; the own file adds nothing
		const foreign = convertLegacyFeedback(entry({ target: { file: 'docs/epics/e/S002/PLAN.md' } }), DOC);
		assert.deepEqual(foreign.feedback.anchor, { section: 'docs/epics/e/S002/PLAN.md' });
		assert.deepEqual(foreign.unmapped, []);
		const slugged = convertLegacyFeedback(entry({ target: { file: 'x.md' }, anchor: { quote: 'q', sectionSlug: 'error-paths' } }), DOC);
		assert.deepEqual(slugged.feedback.anchor, { quote: 'q', section: 'x.md#error-paths' });
		assert.equal(convertLegacyFeedback(entry(), DOC).feedback.anchor, undefined);

		// kept: id, timestamp, batch id, revision and the text
		const kept = convertLegacyFeedback(entry({ id: 'fb9', batchId: 'b7', target: { file: DOC, version: '4' } }), DOC);
		assert.deepEqual([kept.feedback.id, kept.feedback.timestamp, kept.feedback.batchId, kept.feedback.revision, kept.feedback.text], ['fb9', '2026-10-20T10:00:00Z', 'b7', 4, 'tighten this']);
	});
});
