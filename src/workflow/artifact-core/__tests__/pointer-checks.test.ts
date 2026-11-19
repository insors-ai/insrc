import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { createHash } from 'node:crypto';

import type { Pointer } from '../types.js';
import { checkPointerStaleness, validatePointerPath } from '../pointer-checks.js';

const hexDigest = (content: string): string => createHash('sha256').update(content).digest('hex');

describe('PointerStalenessCheck and PointerPathValidator', () => {
	it('are exported with their documented signatures and are pure (no I/O)', (t) => {
		// Every fs entry point a path-resolving function could plausibly reach for; none is
		// called by either function below, because both are pure string/path manipulation.
		const fsSpies = (['readFileSync', 'statSync', 'lstatSync', 'existsSync', 'accessSync', 'readdirSync'] as const)
			.map((name) => t.mock.method(fs, name, () => { throw new Error(`${name} must not be called -- these functions do no I/O`); }));

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
		assert.deepEqual(inRootResult, validatePointerPath(inRoot, '/repo/root'));

		const escaping: Pointer = { path: '../../etc/passwd' };
		const escapingResult = validatePointerPath(escaping, '/repo/root');
		assert.equal(escapingResult.ok, false);
		assert.equal(escapingResult.violations.length, 1);
		assert.match(escapingResult.violations[0]!, /etc\/passwd/);
		assert.deepEqual(escapingResult, validatePointerPath(escaping, '/repo/root'));

		for (const spy of fsSpies) assert.equal(spy.mock.calls.length, 0);
	});

	it('PointerStalenessCheck returns stale:true when pointer.contentHash differs from currentContentHash', () => {
		const pointer: Pointer = { path: 'docs/epics/example/HLD.md', contentHash: hexDigest('old content') };
		assert.equal(checkPointerStaleness(pointer, hexDigest('new content')).stale, true);
	});

	it('PointerStalenessCheck returns stale:false when pointer.contentHash equals currentContentHash', () => {
		const digest = hexDigest('same content');
		const pointer: Pointer = { path: 'docs/epics/example/HLD.md', contentHash: digest };
		assert.equal(checkPointerStaleness(pointer, digest).stale, false);
	});

	it('PointerStalenessCheck returns stale:false when pointer.contentHash is absent (no hash was ever recorded)', () => {
		const pointer: Pointer = { path: 'docs/epics/example/HLD.md' };
		assert.equal(checkPointerStaleness(pointer, hexDigest('anything')).stale, false);
	});

	it('PointerStalenessCheck returns stale:true when pointer.contentHash is an empty string compared against a real hex digest', () => {
		const pointer: Pointer = { path: 'docs/epics/example/HLD.md', contentHash: '' };
		assert.equal(checkPointerStaleness(pointer, hexDigest('real content')).stale, true);
	});

	it('PointerStalenessCheck always returns the same stale value for the same two arguments (purity), only checkedAt varies', () => {
		const digest = hexDigest('content');
		const pointer: Pointer = { path: 'docs/epics/example/HLD.md', contentHash: digest };
		const first = checkPointerStaleness(pointer, hexDigest('other content'));
		const second = checkPointerStaleness(pointer, hexDigest('other content'));
		assert.equal(first.stale, second.stale);
	});

	it('PointerPathValidator returns ok:true for a Pointer.path that resolves within registeredRepoRoot', () => {
		const pointer: Pointer = { path: 'docs/epics/example/HLD.md' };
		const result = validatePointerPath(pointer, '/repo/root');
		assert.equal(result.ok, true);
		assert.deepEqual(result.violations, []);
	});

	it("PointerPathValidator returns ok:false with a named violation for a Pointer.path containing '..' segments that resolves outside registeredRepoRoot", () => {
		const pointer: Pointer = { path: '../../etc/passwd' };
		const result = validatePointerPath(pointer, '/repo/root');
		assert.equal(result.ok, false);
		assert.equal(result.violations.length, 1);
		assert.match(result.violations[0]!, /etc\/passwd/);
	});

	it('PointerPathValidator returns ok:false with a named violation for an absolute Pointer.path, even one that falls inside registeredRepoRoot', () => {
		const pointer: Pointer = { path: '/repo/root/docs/HLD.md' };
		const result = validatePointerPath(pointer, '/repo/root');
		assert.equal(result.ok, false);
		assert.equal(result.violations.length, 1);
		assert.match(result.violations[0]!, /absolute/);
	});
});
