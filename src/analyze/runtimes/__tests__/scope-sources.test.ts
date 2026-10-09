/**
 * Where a plan task's scope comes from (Story s7): every runtime takes it from
 * the one scope function, shared/task-scope.ts. A scan over the runtime
 * sources, so that a per-family helper or a direct read of the scope's value
 * cannot come back unnoticed.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readdirSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const RUNTIMES = join(dirname(fileURLToPath(import.meta.url)), '..');

/** The source files of one family, tests left out: name -> code with comments removed. */
function sources(family: string): Map<string, string> {
	const out = new Map<string, string>();
	for (const name of readdirSync(join(RUNTIMES, family)).sort()) {
		if (!name.endsWith('.ts')) continue;
		const text = readFileSync(join(RUNTIMES, family, name), 'utf8');
		// Comments say what the code does not do any more; only code is scanned.
		out.set(`${family}/${name}`, text.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, ''));
	}
	return out;
}

/** A read of a scope's value: `scopeRef.value`, `sr.value`, `intent.scopeRef.value`. */
const VALUE_READ = /\b(scopeRef|sr)\s*\.\s*value\b/;

test("the infra and data scope functions are gone and no infra or data runtime uses the scope's value as a repo path", () => {
	const infra = sources('infra');
	const data = sources('data');
	assert.ok(infra.size >= 8 && data.size >= 5, `the scan found the runtime files (${infra.size} infra, ${data.size} data)`);

	for (const [file, code] of [...infra, ...data]) {
		// The two removed functions: not declared, not imported, not called.
		assert.ok(!/\bresolveRepoPath\b/.test(code), `${file}: resolveRepoPath`);
		assert.ok(!/\bresolveRepoPathFromIntent\b/.test(code), `${file}: resolveRepoPathFromIntent`);
		// No runtime reads the scope's value itself.
		assert.ok(!VALUE_READ.test(code), `${file}: reads the scope's value`);
	}
	// Each infra runtime that has a scope resolves it through the one function ...
	const infraCallers = [...infra].filter(([, code]) => /\breadScopeRef\(/.test(code) && !/export function readScopeRef/.test(code));
	assert.deepEqual(infraCallers.map(([f]) => f), [
		'infra/discovery-families.ts', 'infra/inventory-ci.ts', 'infra/inventory-docker.ts',
		'infra/inventory-helm.ts', 'infra/inventory-kubernetes.ts', 'infra/inventory-terraform.ts',
	]);
	for (const [file, code] of infraCallers) {
		assert.match(code, /resolveTaskScope\(scopeRef as AnalyzeScopeRef, 'infra', TEMPLATE_ID\)/, file);
	}
	// ... and the data runtimes through their one helper, which calls it with the data family.
	assert.match(data.get('data/_shared.ts')!, /resolveTaskScope\(args\.intent\.scopeRef, 'data', templateLabel\)/);
	for (const file of ['data/discovery-connections.ts', 'data/discovery-objects.ts', 'data/schema-table.ts']) {
		assert.match(data.get(file)!, /resolveDataScope\(args, TEMPLATE_ID\)/, file);
	}
	// The scan does see a read when there is one.
	assert.ok(VALUE_READ.test('const repoPath = args.intent.scopeRef.value;'));
	assert.ok(VALUE_READ.test('return sr.value;'));
});

test('the unrelated resolveRepoPath under src/mcp is untouched', () => {
	const mcp = readFileSync(join(RUNTIMES, '..', '..', 'mcp', 'resolve-repo.ts'), 'utf8');
	assert.match(mcp, /export (async )?function resolveRepoPath\(/);
});
