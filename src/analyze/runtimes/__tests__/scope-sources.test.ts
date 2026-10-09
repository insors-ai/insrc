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

test("the code family's scope function and its test hook are gone and no code runtime uses the scope's value as a repo path", () => {
	const code = sources('code');
	const shared = sources('shared');
	assert.ok(code.size >= 8 && shared.size >= 2, `the scan found the runtime files (${code.size} code, ${shared.size} shared)`);

	for (const [file, text] of [...code, ...shared]) {
		// The removed function and the hook that exported it to tests: not declared, not imported, not called.
		assert.ok(!/\bresolveRepoPath\b/.test(text), `${file}: resolveRepoPath`);
		assert.ok(!/_resolveRepoPathForTest/.test(text), `${file}: _resolveRepoPathForTest`);
		// No runtime reads the scope's value itself.
		assert.ok(!VALUE_READ.test(text), `${file}: reads the scope's value`);
	}
	// Each code runtime that has a scope of its own resolves it through the one
	// function, reads the repo it names and keeps to its area.
	const callers = [...code].filter(([, text]) => /\breadScopeRef\(/.test(text) && !/export function readScopeRef/.test(text));
	assert.deepEqual(callers.map(([f]) => f), [
		'code/discovery-entrypoints.ts', 'code/discovery-modules.ts', 'code/structure-module-tree.ts',
	]);
	for (const [file, text] of callers) {
		assert.match(text, /const scope\s+= await resolveTaskScope\(scopeRef as AnalyzeScopeRef, 'code', TEMPLATE_ID\);/, file);
		assert.match(text, /const repoPath = graphRepoOf\(scope\);/, file);
		assert.match(text, /listEntitiesForRepo\(db, repoPath\)\)\.filter\(inAreaOf\(scope\)\)/, file);
		// The only read of the repo's entities is the one kept to the area.
		assert.equal(text.match(/listEntitiesForRepo\(/g)!.length, 1, file);
	}
	// The adherence check, shared by three families: both of its readers take the
	// repo from the one function, with the family of the template that runs.
	const adherence = shared.get('shared/adherence.ts')!;
	assert.match(adherence, /graphRepoOf\(await resolveTaskScope\(args\.intent\.scopeRef, familyOfTemplate\(templateId\), templateId\)\)/);
	assert.equal(adherence.match(/const repoPath = await adherenceRepoPath\(/g)!.length, 2);
	assert.equal(adherence.match(/\brepoPath\s*=/g)!.length, 2, 'no other source of a repo path in the adherence check');
	// The docs task that used the code family's function takes the one function too.
	assert.match(sources('docs').get('docs/discovery-inventory.ts')!, /graphRepoOf\(await resolveTaskScope\(scopeRef as AnalyzeScopeRef, 'docs', TEMPLATE_ID\)\)/);
});

test('the unrelated resolveRepoPath under src/mcp is untouched', () => {
	const mcp = readFileSync(join(RUNTIMES, '..', '..', 'mcp', 'resolve-repo.ts'), 'utf8');
	assert.match(mcp, /export (async )?function resolveRepoPath\(/);
});
