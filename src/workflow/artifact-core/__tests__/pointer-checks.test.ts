import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import type { Pointer } from '../types.js';
import { checkPointerStaleness, validatePointerPath } from '../pointer-checks.js';

describe('PointerStalenessCheck and PointerPathValidator', () => {
	it('are exported with their documented signatures and are pure (no I/O)', () => {
		const withHash: Pointer = { path: 'docs/epics/example/HLD.md', contentHash: 'abc123' };
		assert.equal(checkPointerStaleness(withHash, 'abc123').stale, checkPointerStaleness(withHash, 'abc123').stale);
		const stale = checkPointerStaleness(withHash, 'def456');
		assert.equal(stale.stale, true);
		assert.equal(typeof stale.checkedAt, 'string');
		const fresh = checkPointerStaleness(withHash, 'abc123');
		assert.equal(fresh.stale, false);

		const noHash: Pointer = { path: 'docs/epics/example/DEF.md' };
		assert.equal(checkPointerStaleness(noHash, 'anything').stale, false);
		assert.equal(checkPointerStaleness(noHash, '').stale, false);

		const emptyHash: Pointer = { path: 'docs/epics/example/LLD.md', contentHash: '' };
		assert.equal(checkPointerStaleness(emptyHash, 'realHexDigest').stale, true);

		const inRoot: Pointer = { path: 'docs/epics/example/HLD.md' };
		const inRootResult = validatePointerPath(inRoot, '/repo/root');
		assert.equal(inRootResult.ok, true);
		assert.deepEqual(inRootResult.violations, []);

		const escaping: Pointer = { path: '../../etc/passwd' };
		const escapingResult = validatePointerPath(escaping, '/repo/root');
		assert.equal(escapingResult.ok, false);
		assert.equal(escapingResult.violations.length, 1);
		assert.match(escapingResult.violations[0]!, /etc\/passwd/);

	});
});
