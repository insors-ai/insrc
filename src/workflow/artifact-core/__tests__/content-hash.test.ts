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
		// a JSON-owned __proto__ key is content
		assert.notEqual(
			contentHash('d', { body: JSON.parse('{"__proto__":1}'), citations: [] }),
			contentHash('d', { body: JSON.parse('{"__proto__":2}'), citations: [] }),
		);
		// references, parent, attachments, binding and lifecycle on the artifact are not part of the hash: the view's extra fields change nothing
		const view = (extra: object) => ({ description: 'd', payload: { body: { a: 1 }, citations: [] }, ...extra });
		const hashOfView = (v: { description: string; payload: { body: unknown; citations: unknown } }) => contentHash(v.description, v.payload);
		assert.equal(hashOfView(view({})), hashOfView(view({ references: [{ entityId: 'x' }], parent: { entityId: 'p' }, attachments: [1], binding: { b: 1 }, lifecycle: { status: 'approved' } })));
		// an array keeps its order; toJSON counts as what it persists as; undefined members are dropped
		assert.notEqual(contentHash('d', { body: [1, 2], citations: [] }), contentHash('d', { body: [2, 1], citations: [] }));
		assert.equal(contentHash('d', { body: { t: { toJSON: () => 'x' } }, citations: [] }), contentHash('d', { body: { t: 'x' }, citations: [] }));
		assert.equal(contentHash('d', { body: { u: undefined, v: 1 }, citations: [] }), contentHash('d', { body: { v: 1 }, citations: [] }));
	});
});
