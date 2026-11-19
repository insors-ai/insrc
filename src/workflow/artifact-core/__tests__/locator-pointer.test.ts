import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import type { Locator, Pointer, StalenessResult, PathValidationResult } from '../types.js';

describe('Locator, Pointer, StalenessResult and PathValidationResult', () => {
	it('are exported with the exact documented field shapes', () => {
		const locator: Locator = { kind: 'symbol', value: 'someSymbol' };
		assert.equal(locator.kind, 'symbol');
		assert.equal(locator.value, 'someSymbol');

		const pointerWithSection: Pointer = {
			path: 'docs/epics/example/HLD.md',
			section: locator,
			contentHash: 'abc123',
		};
		assert.equal(pointerWithSection.path, 'docs/epics/example/HLD.md');
		assert.deepEqual(pointerWithSection.section, locator);
		assert.equal(pointerWithSection.contentHash, 'abc123');

		const pointerWithoutSection: Pointer = { path: 'docs/epics/example/DEF.md' };
		assert.equal(pointerWithoutSection.path, 'docs/epics/example/DEF.md');
		assert.equal(pointerWithoutSection.section, undefined);
		assert.equal(pointerWithoutSection.contentHash, undefined);

		const staleness: StalenessResult = { stale: true, checkedAt: '2026-11-19T00:00:00.000Z' };
		assert.equal(staleness.stale, true);
		assert.equal(staleness.checkedAt, '2026-11-19T00:00:00.000Z');

		const pathValidation: PathValidationResult = { ok: false, violations: ['path escapes repo root'] };
		assert.equal(pathValidation.ok, false);
		assert.deepEqual(pathValidation.violations, ['path escapes repo root']);
	});

	it('accept an arbitrary future Locator kind string without requiring a code change', () => {
		const futureLocator: Locator = { kind: 'futureKind', value: 'whatever' };
		// Consumers must read `kind` structurally (e.g. a string-keyed lookup), never via an
		// exhaustive switch with no default -- this test only asserts the type itself accepts
		// any string, not how a consumer should branch on it.
		assert.equal(futureLocator.kind, 'futureKind');
	});
});
