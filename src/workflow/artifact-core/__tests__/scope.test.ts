import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import type { Pointer, Scope, ValidationResult } from '../types.js';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../../../..');
const TSC = resolve(ROOT, 'node_modules/typescript/bin/tsc');
const FIXTURE = 'src/workflow/artifact-core/__type-tests__/scope.typecheck.ts';

/**
 * tsconfig.json excludes `__type-tests__` from the main build, so this runs tsc itself against
 * a throwaway project that extends the root config with just the fixture included -- proving
 * every field's required/optional and readonly status (asserted there via @ts-expect-error)
 * without widening any shared tsconfig.
 */
function typecheckFixture(): void {
	const dir = mkdtempSync(join(tmpdir(), 'insrc-scope-typecheck-'));
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

describe('Scope, ScopeType, ScopeLevel, ValidationResult and ScopeValidator', () => {
	it('are exported with the exact documented field shapes', () => {
		assert.doesNotThrow(typecheckFixture,
			`${FIXTURE} must compile with no @ts-expect-error mismatches`);

		const pointer: Pointer = { path: 'docs/epics/example/HLD.md' };

		const minimal: Scope = { scopeType: 'design', scopeLevel: 'def' };
		assert.equal(minimal.scopeType, 'design');
		assert.equal(minimal.scopeLevel, 'def');
		assert.equal(minimal.hld, undefined);

		const full: Scope = {
			scopeType: 'code',
			scopeLevel: 'task',
			def: pointer,
			hld: pointer,
			lld: pointer,
			plan: pointer,
			tasks: [pointer],
			extension: pointer,
			amendment: pointer,
		};
		// Each named field is independently addressable -- not folded into one generic map.
		assert.deepEqual(full.def, pointer);
		assert.deepEqual(full.hld, pointer);
		assert.deepEqual(full.lld, pointer);
		assert.deepEqual(full.plan, pointer);
		assert.deepEqual(full.tasks, [pointer]);
		assert.deepEqual(full.extension, pointer);
		assert.deepEqual(full.amendment, pointer);

		const result: ValidationResult = { ok: false, violations: ['x escapes the repo root'] };
		assert.equal(result.ok, false);
		assert.deepEqual(result.violations, ['x escapes the repo root']);
	});
});
