import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import type { Locator, Pointer, StalenessResult, PathValidationResult } from '../types.js';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../../../..');
const TSC = resolve(ROOT, 'node_modules/typescript/bin/tsc');

describe('Locator, Pointer, StalenessResult and PathValidationResult', () => {
	it('are exported with the exact documented field shapes', () => {
		// Runtime values prove the shapes are usable; tsc -p tsconfig.typecheck.json (npm run
		// typecheck:tools) compiles __type-tests__/locator-pointer.typecheck.ts, which asserts
		// via @ts-expect-error that every field's required/optional and readonly status is
		// exactly as documented -- tsconfig.json excludes tests from the main tsc pass, so only
		// that dedicated config actually typechecks those claims.
		assert.doesNotThrow(() => execFileSync('node', [TSC, '-p', 'tsconfig.typecheck.json'], { cwd: ROOT, stdio: 'pipe' }),
			'npm run typecheck:tools (tsc -p tsconfig.typecheck.json) must compile locator-pointer.typecheck.ts with no @ts-expect-error mismatches');

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
