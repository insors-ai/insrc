import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import type { Pointer, ReviewTargets } from '../types.js';
import { validatePointerPath } from '../pointer-checks.js';
import * as types from '../types.js';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../../../..');
const TSC = resolve(ROOT, 'node_modules/typescript/bin/tsc');
const FIXTURE = 'src/workflow/artifact-core/__type-tests__/review-targets.typecheck.ts';

/**
 * tsconfig.json excludes `__type-tests__` from the main build, so this runs tsc itself against
 * a throwaway project that extends the root config with just the fixture included -- proving
 * the field's required/optional and readonly status (asserted there via @ts-expect-error)
 * without widening any shared tsconfig.
 */
function typecheckFixture(): void {
	const dir = mkdtempSync(join(tmpdir(), 'insrc-review-targets-typecheck-'));
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

describe('ReviewTargets', () => {
	it('is exported with the exact documented field shape', () => {
		assert.doesNotThrow(typecheckFixture,
			`${FIXTURE} must compile with no @ts-expect-error mismatches`);

		const pointer: Pointer = { path: 'docs/epics/example/HLD.md' };
		const targets: ReviewTargets = { entries: [pointer] };
		assert.deepEqual(targets.entries, [pointer]);

		const empty: ReviewTargets = { entries: [] };
		assert.deepEqual(empty.entries, []);
	});

	it('a ReviewTargets built from a fresh Pointer list contains exactly those entries, nothing else', () => {
		const pointer1: Pointer = { path: 'a.md' };
		const pointer2: Pointer = { path: 'b.md' };
		const targets: ReviewTargets = { entries: [pointer1, pointer2] };
		assert.deepEqual(Object.keys(targets), ['entries']);
		assert.deepEqual(targets.entries, [pointer1, pointer2]);
	});

	it("no builder, factory or merge function exists anywhere in ReviewTargets' exported surface (a1's deliberate absence of such an API)", () => {
		// The interface itself produces no runtime export (types are erased), so there is no
		// name to search for; instead this exhaustively checks every runtime export of the
		// module ReviewTargets lands in. Every one is an Error subclass (sc3/sc4 and friends are
		// types only) -- there is no plain function anywhere, so none can be a builder/factory/
		// merge function for ReviewTargets specifically.
		const plainFunctions = Object.entries(types).filter(([, value]) => typeof value === 'function' && !(value.prototype instanceof Error));
		assert.deepEqual(plainFunctions.map(([key]) => key), []);
	});

	it('two ReviewTargets instances built for consecutive rounds on the same artifact are independent objects sharing no entries by construction', () => {
		const roundOnePointers: readonly Pointer[] = [{ path: 'round-one.md' }];
		const roundOne: ReviewTargets = { entries: roundOnePointers };

		const roundTwoPointers: readonly Pointer[] = [{ path: 'round-two.md' }];
		const roundTwo: ReviewTargets = { entries: roundTwoPointers };

		assert.notEqual(roundOne, roundTwo);
		assert.notEqual(roundOne.entries, roundTwo.entries);
		for (const pointer of roundTwo.entries) assert.ok(!roundOne.entries.includes(pointer));
	});

	it("ReviewTargets' exported surface contains no validator, allow-list or restriction function of any kind that could cap investigation to entries", () => {
		const plainFunctions = Object.entries(types).filter(([, value]) => typeof value === 'function' && !(value.prototype instanceof Error));
		assert.deepEqual(plainFunctions.map(([key]) => key), []);
	});

	it('a ReviewTargets with zero entries is structurally valid', () => {
		const targets: ReviewTargets = { entries: [] };
		assert.deepEqual(targets.entries, []);
	});

	it('entries with a duplicate Pointer (same path and section) is accepted', () => {
		const pointer: Pointer = { path: 'a.md', section: { kind: 'symbol', value: 'x' } };
		const targets: ReviewTargets = { entries: [pointer, pointer] };
		assert.equal(targets.entries.length, 2);
		assert.deepEqual(targets.entries[0], targets.entries[1]);
	});

	it('entries mixing whole-file Pointers (no section) and region-pinned Pointers (section populated) is accepted', () => {
		const wholeFile: Pointer = { path: 'a.md' };
		const regionPinned: Pointer = { path: 'b.md', section: { kind: 'lineRange', value: '1-10' } };
		const targets: ReviewTargets = { entries: [wholeFile, regionPinned] };
		assert.equal(targets.entries[0]!.section, undefined);
		assert.deepEqual(targets.entries[1]!.section, regionPinned.section);
	});

	it("every ReviewTargets.entries[] Pointer can be passed directly to sc6's PointerPathValidator with no reshaping", () => {
		const targets: ReviewTargets = { entries: [{ path: 'a.md' }, { path: '../../etc/passwd' }] };
		const results = targets.entries.map((pointer) => validatePointerPath(pointer, '/repo/root'));
		assert.equal(results[0]!.ok, true);
		assert.equal(results[1]!.ok, false);
	});
});
