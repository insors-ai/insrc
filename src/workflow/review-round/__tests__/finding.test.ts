/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Procix Software India. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { DEFAULT_SEVERITY_SCALE } from '../finding.js';
import type { Finding } from '../finding.js';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../../../..');
const TSC = resolve(ROOT, 'node_modules/typescript/bin/tsc');
const FIXTURE = 'src/workflow/review-round/__type-tests__/finding.typecheck.ts';

/**
 * tsconfig.json excludes `__type-tests__` from the main build, so this runs tsc itself against
 * a throwaway project that extends the root config with just the fixture included -- proving
 * every field's required/optional and readonly status (asserted there via @ts-expect-error)
 * without widening any shared tsconfig.
 */
function typecheckFixture(): void {
	const dir = mkdtempSync(join(tmpdir(), 'insrc-finding-typecheck-'));
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

describe('Finding and FindingCategory', () => {
	it('Finding and FindingCategory are exported with the exact documented field shapes, including the id field', () => {
		assert.doesNotThrow(typecheckFixture,
			`${FIXTURE} must compile with no @ts-expect-error mismatches`);

		const finding: Finding = { id: 'f1', category: 'correctness', severity: 'HIGH' };
		assert.equal(finding.id, 'f1');
		assert.equal(finding.category, 'correctness');
		assert.equal(finding.severity, 'HIGH');
	});

	it('FindingCategory accepts exactly the five fixed categories (correctness, functional-completeness, security, quality, maintainability) and rejects any other category value at compile time', () => {
		const categories: Finding['category'][] = ['correctness', 'functional-completeness', 'security', 'quality', 'maintainability'];
		for (const category of categories) {
			const finding: Finding = { id: 'f1', category, severity: 'HIGH' };
			assert.equal(finding.category, category);
		}
		// The rejection half of this subject is proved at compile time by finding.typecheck.ts's _c1/_f1 cases.
	});

	it('Finding.severity accepts any string value, including a review-type-specific custom severity scale outside HIGH/MED', () => {
		const custom: Finding = { id: 'f1', category: 'security', severity: 'CRITICAL' };
		assert.equal(custom.severity, 'CRITICAL');
		const typo: Finding = { id: 'f2', category: 'quality', severity: 'Hihg' };
		assert.equal(typo.severity, 'Hihg');
	});

	it('DEFAULT_SEVERITY_SCALE names HIGH and MED as the documented fallback scale for a review type that declares none', () => {
		assert.deepEqual(DEFAULT_SEVERITY_SCALE, ['HIGH', 'MED']);
	});

	it("Finding's exported shape contains exactly id, category and severity, and no other field of any kind", () => {
		const finding: Finding = { id: 'f1', category: 'correctness', severity: 'HIGH' };
		assert.deepEqual(Object.keys(finding).sort(), ['category', 'id', 'severity']);
		// The exhaustive, type-level version of this proof (fails to compile for an added OR
		// removed key of any name, not just the one checked at runtime here) is finding.typecheck.ts's
		// _findingKeysExact assertion.
	});

	it('two Finding values with identical category and severity but different id values are distinct findings', () => {
		const a: Finding = { id: 'f1', category: 'correctness', severity: 'HIGH' };
		const b: Finding = { id: 'f2', category: 'correctness', severity: 'HIGH' };
		assert.notEqual(a.id, b.id);
		assert.deepEqual({ ...a, id: undefined }, { ...b, id: undefined });
	});
});
