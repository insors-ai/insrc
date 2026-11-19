import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import type { Locator, Pointer, StalenessResult, PathValidationResult } from '../types.js';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../../../..');
const TSC = resolve(ROOT, 'node_modules/typescript/bin/tsc');
const FIXTURE = 'src/workflow/artifact-core/__type-tests__/locator-pointer.typecheck.ts';

/**
 * tsconfig.json excludes `__type-tests__` from the main build, so this runs tsc itself against
 * a throwaway project that extends the root config with just the fixture included -- proving
 * every field's required/optional and readonly status (asserted there via @ts-expect-error)
 * without widening any shared tsconfig.
 */
function typecheckFixture(): void {
	const dir = mkdtempSync(join(tmpdir(), 'insrc-locator-pointer-typecheck-'));
	try {
		writeFileSync(join(dir, 'tsconfig.json'), JSON.stringify({
			extends: resolve(ROOT, 'tsconfig.json'),
			compilerOptions: {
				noEmit: true, declaration: false, declarationMap: false, sourceMap: false,
				typeRoots: [resolve(ROOT, 'node_modules/@types')],
			},
			include: [resolve(ROOT, FIXTURE)],
			exclude: [],
		}));
		execFileSync('node', [TSC, '-p', join(dir, 'tsconfig.json')], { cwd: ROOT, stdio: 'pipe' });
	} finally {
		rmSync(dir, { recursive: true, force: true });
	}
}

describe('Locator, Pointer, StalenessResult and PathValidationResult', () => {
	it('are exported with the exact documented field shapes', () => {
		assert.doesNotThrow(typecheckFixture,
			`${FIXTURE} must compile with no @ts-expect-error mismatches`);

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

	it('a Pointer with path + section (Locator) identifies both the file and the region', () => {
		const section: Locator = { kind: 'lineRange', value: '10-20' };
		const pointer: Pointer = { path: 'docs/epics/example/HLD.md', section };
		assert.equal(pointer.path, 'docs/epics/example/HLD.md');
		assert.deepEqual(pointer.section, section);
	});

	it('a Pointer with no section still identifies the whole file', () => {
		const pointer: Pointer = { path: 'docs/epics/example/DEF.md' };
		assert.equal(pointer.path, 'docs/epics/example/DEF.md');
		assert.equal(pointer.section, undefined);
	});

	it("a Locator with kind='symbol'/'lineRange'/'docSection' is accepted", () => {
		const bySymbol: Locator = { kind: 'symbol', value: 'someSymbol' };
		const byLineRange: Locator = { kind: 'lineRange', value: '10-20' };
		const byDocSection: Locator = { kind: 'docSection', value: '3.2' };
		assert.equal(bySymbol.kind, 'symbol');
		assert.equal(byLineRange.kind, 'lineRange');
		assert.equal(byDocSection.kind, 'docSection');
	});

	it('a Locator with an arbitrary future kind string is accepted and read via a non-exhaustive string-keyed lookup, not an exhaustive switch', () => {
		const futureLocator: Locator = { kind: 'futureKind', value: 'whatever' };
		const readers: Record<string, (l: Locator) => string> = {
			symbol: (l) => `symbol:${l.value}`,
			lineRange: (l) => `lineRange:${l.value}`,
			docSection: (l) => `docSection:${l.value}`,
		};
		const read = readers[futureLocator.kind] ?? ((l) => `unknown:${l.value}`);
		assert.equal(read(futureLocator), 'unknown:whatever');
	});
});
