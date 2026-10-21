import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import { contentHash } from '../lifecycle.js';

describe('contentHash', () => {
	it('ignores key order and everything but the description and payload', () => {
		const a = contentHash('d', { body: { x: 1, y: { p: 1, q: [1, 2] } }, citations: [{ a: 1, b: 2 }] });
		const b = contentHash('d', { citations: [{ b: 2, a: 1 }], body: { y: { q: [1, 2], p: 1 }, x: 1 } });
		assert.equal(a, b);
		assert.match(a, /^[0-9a-f]{64}$/);
		assert.notEqual(a, contentHash('d2', { body: { x: 1, y: { p: 1, q: [1, 2] } }, citations: [{ a: 1, b: 2 }] }));
		assert.notEqual(a, contentHash('d', { body: { x: 2, y: { p: 1, q: [1, 2] } }, citations: [{ a: 1, b: 2 }] }));
		assert.notEqual(a, contentHash('d', { body: { x: 1, y: { p: 1, q: [1, 2] } }, citations: [] }));
		// the signature takes only the description and payload, so references, parent, attachments, binding and lifecycle cannot reach it
		assert.equal(contentHash.length, 2);
		// an array keeps its order; toJSON counts as what it persists as; undefined members are dropped
		assert.notEqual(contentHash('d', { body: [1, 2], citations: [] }), contentHash('d', { body: [2, 1], citations: [] }));
		assert.equal(contentHash('d', { body: { t: { toJSON: () => 'x' } }, citations: [] }), contentHash('d', { body: { t: 'x' }, citations: [] }));
		assert.equal(contentHash('d', { body: { u: undefined, v: 1 }, citations: [] }), contentHash('d', { body: { v: 1 }, citations: [] }));
	});
});
