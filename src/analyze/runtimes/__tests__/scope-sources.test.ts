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
		// One read of the repo's entities in each; its form is asserted per runtime below.
		assert.equal(text.match(/listEntitiesForRepo\(/g)!.length, 1, file);
	}
	// The adherence check, shared by three families: both of its readers take the
	// repo from the one function, with the family of the template that runs.
	const adherence = shared.get('shared/adherence.ts')!;
	assert.match(adherence, /graphRepoOf\(await resolveTaskScope\(args\.intent\.scopeRef, familyOfTemplate\(templateId\), templateId\)\)/);
	assert.equal(adherence.match(/const repoPath = await adherenceRepoPath\(/g)!.length, 2);
	assert.equal(adherence.match(/\brepoPath\s*=/g)!.length, 2, 'no other source of a repo path in the adherence check');
});

/**
 * How each code runtime with a scope of its own reads the repo's entities.
 *   - 'area':  the read is narrowed to the scope's area at once; nothing else of the repo is seen.
 *   - 'whole': the read is kept whole (Story s8). The area's entities and the repo's stored module
 *              entities are both taken from it, and it is used for nothing else: a stored module
 *              entity above the area still owns the files under its directory.
 */
const READ_FORM: Readonly<Record<string, 'area' | 'whole'>> = {
	'code/discovery-entrypoints.ts':  'area',
	'code/discovery-modules.ts':      'whole',
	'code/structure-module-tree.ts':  'whole',
};

/** Check one runtime's source against its form; returns what is wrong, or null. */
function readFormProblem(text: string, form: 'area' | 'whole'): string | null {
	if ((text.match(/listEntitiesForRepo\(/g) ?? []).length !== 1) return 'it does not read the repo\'s entities exactly once';
	if (form === 'area') {
		return /listEntitiesForRepo\(db, repoPath\)\)\.filter\(inAreaOf\(scope\)\)/.test(text) ? null : 'the read is not narrowed to the area at once';
	}
	if (!/const repoEntities = await listEntitiesForRepo\(db, repoPath\);/.test(text)) return 'the read is not kept whole as repoEntities';
	if (!/const entities\s+= repoEntities\.filter\(inAreaOf\(scope\)\);/.test(text)) return 'the area\'s entities are not taken from the one read';
	if (!/const storedModulesOfRepo = repoEntities\.filter\(e => e\.kind === 'module'\);/.test(text)) return 'the stored module entities are not taken from the one read';
	if (!/sourceModulesOf\(scope, entities, storedModulesOfRepo\)/.test(text)) return 'the modules do not come from the one definition';
	// The whole result: declared once, used twice (the area's entities, the stored modules), and for nothing else.
	if ((text.match(/\brepoEntities\b/g) ?? []).length !== 3) return 'the whole read is used for something else';
	return null;
}

test("the source scan asserts one read of the repo's entities kept whole in discovery-modules.ts and today's form in the tree and the entry-points runtimes (mutation: read the repo's entities a second time)", () => {
	const code = sources('code');
	const callers = [...code].filter(([, text]) => /\breadScopeRef\(/.test(text) && !/export function readScopeRef/.test(text));
	// Every code runtime with a scope of its own has a row, and every row is a runtime.
	assert.deepEqual(callers.map(([f]) => f), Object.keys(READ_FORM).sort());
	for (const [file, text] of callers) {
		assert.equal(readFormProblem(text, READ_FORM[file]!), null, file);
	}
	// A runtime does not pass as the other form.
	assert.equal(readFormProblem(code.get('code/discovery-modules.ts')!, 'area'), 'the read is not narrowed to the area at once');
	assert.equal(readFormProblem(code.get('code/discovery-entrypoints.ts')!, 'whole'), 'the read is not kept whole as repoEntities');

	// The check does see each way of going wrong.
	const whole = [
		'const repoEntities = await listEntitiesForRepo(db, repoPath);',
		'const entities     = repoEntities.filter(inAreaOf(scope));',
		"const storedModulesOfRepo = repoEntities.filter(e => e.kind === 'module');",
		'const modules = sourceModulesOf(scope, entities, storedModulesOfRepo);',
	].join('\n');
	assert.equal(readFormProblem(whole, 'whole'), null);
	assert.equal(readFormProblem(`${whole}\nconst again = await listEntitiesForRepo(db, repoPath);`, 'whole'), "it does not read the repo's entities exactly once");
	assert.equal(readFormProblem(`${whole}\nconst files = repoEntities.filter(e => e.kind === 'file');`, 'whole'), 'the whole read is used for something else');
	assert.equal(readFormProblem(whole.replace('repoEntities.filter(inAreaOf(scope))', 'repoEntities'), 'whole'), "the area's entities are not taken from the one read");
	assert.equal(readFormProblem(whole.replace("repoEntities.filter(e => e.kind === 'module')", 'entities'), 'whole'), 'the stored module entities are not taken from the one read');
	assert.equal(readFormProblem('const entities = (await listEntitiesForRepo(db, repoPath)).filter(inAreaOf(scope));', 'area'), null);
	assert.equal(readFormProblem('const entities = await listEntitiesForRepo(db, repoPath);', 'area'), 'the read is not narrowed to the area at once');
});

test('the source scan asserts the new form for structure-module-tree.ts', () => {
	// The test above is titled for the state after Story s8's second task, when the tree
	// still narrowed its read at once. The third task moved the tree to the whole read.
	const tree = sources('code').get('code/structure-module-tree.ts')!;
	assert.equal(READ_FORM['code/structure-module-tree.ts'], 'whole');
	assert.equal(readFormProblem(tree, 'whole'), null);
	assert.equal(readFormProblem(tree, 'area'), 'the read is not narrowed to the area at once');
	// Only the entry-points task, which lists no module, still narrows its read at once.
	assert.deepEqual(Object.entries(READ_FORM).filter(([, form]) => form === 'area').map(([file]) => file), ['code/discovery-entrypoints.ts']);
});

test("the source scan asserts that surface-functional.ts resolves the run's scope through the one scope function for a directory path", () => {
	const text = sources('code').get('code/surface-functional.ts')!;
	// The task has no scope parameter of its own: it does not call readScopeRef, so the
	// scan's list of runtimes with a scope does not find it. It takes the run's scope.
	assert.ok(!/\breadScopeRef\(/.test(text));
	assert.equal(text.match(/\bresolveTaskScope\(/g)!.length, 1);
	assert.match(text, /const scope\s+= await resolveTaskScope\(args\.intent\.scopeRef, 'code', TEMPLATE_ID\);/);
	assert.ok(!VALUE_READ.test(text), "reads the scope's value");

	// The id is asked first, and the scope is resolved only on the branch where it was not an id.
	const idAt    = text.indexOf('await moduleOfEntityId(moduleId, id => getEntity(db, id), args.task.taskId)');
	const branch  = text.indexOf('if (byId !== null) {');
	const elseAt  = text.indexOf('} else {', branch);
	const scopeAt = text.indexOf('await resolveTaskScope(');
	assert.ok(idAt > 0 && branch > idAt && elseAt > branch && scopeAt > elseAt, 'the scope is resolved after the id lookup, in the else branch');
	// On the id branch the entity's own repo is read whole; on the directory branch the scope's repo, narrowed to its area.
	const idBranch = text.slice(branch, elseAt);
	const dirBranch = text.slice(elseAt, text.indexOf('inModule.sort('));
	assert.match(idBranch, /await listEntitiesForRepo\(db, byId\.entity!\.repo\);/);
	assert.ok(!/inAreaOf|resolveTaskScope|graphRepoOf/.test(idBranch), 'the id branch reads no scope');
	assert.match(dirBranch, /\(await listEntitiesForRepo\(db, graphRepoOf\(scope\)\)\)\.filter\(inAreaOf\(scope\)\);/);
	assert.match(dirBranch, /named = moduleOfDirectory\(moduleId, scope, entities\);/);
});

test("no docs runtime uses the scope's value as a repo path", () => {
	const docs = sources('docs');
	assert.ok(docs.size >= 6, `the scan found the runtime files (${docs.size} docs)`);

	for (const [file, text] of docs) {
		assert.ok(!VALUE_READ.test(text), `${file}: reads the scope's value`);
		assert.ok(!/\bresolveRepoPath\b/.test(text), `${file}: resolveRepoPath`);
	}
	// The four docs tasks that have a scope resolve it through the one function,
	// as the docs family; the fifth, the report, has none.
	const callers = [...docs].filter(([, text]) => /\bresolveTaskScope\(/.test(text));
	assert.deepEqual(callers.map(([f]) => f), [
		'docs/constraint-enumerate.ts', 'docs/decision-trace.ts', 'docs/discovery-inventory.ts', 'docs/family-summarise.ts',
	]);
	for (const [file, text] of callers) {
		assert.match(text, /resolveTaskScope\((scopeRef as AnalyzeScopeRef|args\.intent\.scopeRef), 'docs', TEMPLATE_ID\)/, file);
		assert.equal(text.match(/\bresolveTaskScope\(/g)!.length, 1, file);
		// Every repo path in the file comes from the resolved scope.
		const sourcesOfRepoPath = text.match(/\bconst repoPath\s*=.*$/gm) ?? [];
		assert.equal(sourcesOfRepoPath.length, 1, file);
		assert.match(sourcesOfRepoPath[0]!, /= graphRepoOf\(/, file);
	}
	// The two tasks that select documents themselves keep to the scope's area.
	assert.match(docs.get('docs/discovery-inventory.ts')!, /\)\)\.filter\(inAreaOf\(scope\)\);/);
	assert.match(docs.get('docs/family-summarise.ts')!, /if \(!inArea\(\{ id: entityId, file \}\)\) continue;/);
});

test('the unrelated resolveRepoPath under src/mcp is untouched', () => {
	const mcp = readFileSync(join(RUNTIMES, '..', '..', 'mcp', 'resolve-repo.ts'), 'utf8');
	assert.match(mcp, /export (async )?function resolveRepoPath\(/);
});
