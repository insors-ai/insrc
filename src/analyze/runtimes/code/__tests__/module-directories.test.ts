/**
 * The code tasks work on a repository whose graph has no module entity for
 * its directories (Story s8).
 *
 * A temporary LMDB graph store that holds what a parser stores: file,
 * function, method and class entities, and no entity of kind 'module' for the
 * repository's own directories. A second fixture adds stored module entities
 * inside the repository, the shape criterion ac3 is about.
 *
 * No model, no network.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync, realpathSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { getDb } from '../../../../db/client.js';
import { upsertEntities } from '../../../../db/entities.js';
import { upsertRelations } from '../../../../db/relations.js';
import { closeGraphStore, setGraphStorePath } from '../../../../db/graph/store.js';
import { addRepo } from '../../../../db/repos.js';
import { makeEntityId } from '../../../../indexer/parser/base.js';
import type { AnalyzeScopeRef, ClassifiedIntent } from '../../../../shared/analyze-types.js';
import type { Entity, EntityKind, Relation } from '../../../../shared/types.js';
import { buildCompleteness } from '../../../completeness.js';
import type { Completeness } from '../../../completeness.js';
import type { ScopeDeps } from '../../../context/scope.js';
import { purgeAllTaskOutputs, registerTemplateRuntime, runExecutor, _resetRuntimeRegistryForTests } from '../../../executor/index.js';
import type { PlanTask, PlannedTask, TemplateExecuteArgs, TemplateExecuteResult, TemplateRuntime } from '../../../executor/types.js';
import { MODULE_RULE } from '../../shared/source-modules.js';
import { _setTaskScopeDepsForTest } from '../../shared/task-scope.js';
import { codeDiscoveryModulesRuntime } from '../discovery-modules.js';
import { codeStructureModuleTreeRuntime, MODULE_TREE_RULE } from '../structure-module-tree.js';
import { codeSurfaceFunctionalRuntime, SURFACE_RULE } from '../surface-functional.js';

const NOW = '2026-10-09T10:00:00.000Z';

let dir: string;
let REPO: string;

function ent(kind: EntityKind, name: string, rel: string, extra: Partial<Entity> = {}): Entity {
	const file = join(REPO, rel);
	return {
		id: makeEntityId(REPO, file, kind, name), kind, name, language: 'typescript', repoId: 0, repo: REPO, file,
		startLine: 1, endLine: 5, body: `// ${name}`, embedding: [], indexedAt: NOW, ...extra,
	} as Entity;
}
/** A source file, as a parser stores it. */
const src = (rel: string): Entity => ent('file', rel.split('/').pop()!, rel);
/** A document, as the artifact parser stores it. */
const doc = (rel: string): Entity => ent('file', rel.split('/').pop()!, rel, { language: 'markdown', artifact: true });

/** What a parser stores for a small repository: no module entity for any of its directories. */
function parsedRepo(): Entity[] {
	return [
		src('main.ts'),
		src('src/pay/settle.ts'), ent('function', 'settleRefund', 'src/pay/settle.ts', { isExported: true }),
		src('src/pay/ledger.ts'), ent('class', 'Ledger', 'src/pay/ledger.ts', { isExported: true }),
		src('src/pay/rules/late.ts'), ent('function', 'lateFee', 'src/pay/rules/late.ts'),
		src('src/payments/report.ts'),
		src('src/ship/track.ts'),
		doc('docs/policy.md'), doc('src/pay/README.md'),
	];
}

async function seed(entities: readonly Entity[]): Promise<void> {
	await upsertEntities(await getDb(), [...entities]);
}

function run(runtime: TemplateRuntime, scopeRef: AnalyzeScopeRef, params: Record<string, unknown> = { scopeRef }): Promise<TemplateExecuteResult> {
	const task = { taskId: 't01', template: runtime.templateId, kind: 'leaf', params, produces: [], rationale: 'test' } as unknown as PlannedTask;
	const intent: ClassifiedIntent = { target: 'code', scope: 'M', focused: false, scopeRef, reasoning: 'test' };
	const args: TemplateExecuteArgs = { task, intent, upstreamOutputs: new Map(), runId: 'r1' };
	return runtime.execute(args);
}

interface ModuleRecord { name: string; path: string; repo: string; directory: string; fileCount: number; entityId?: string | undefined }
async function moduleList(scopeRef: AnalyzeScopeRef): Promise<{ modules: ModuleRecord[]; completeness: Completeness }> {
	const result = await run(codeDiscoveryModulesRuntime, scopeRef);
	return { modules: result.outputs.get('modules') as ModuleRecord[], completeness: result.completeness };
}
const names = async (scopeRef: AnalyzeScopeRef): Promise<string[]> => (await moduleList(scopeRef)).modules.map(m => m.name);

/** Store IMPORTS relations between files, given as pairs of repo-relative paths. */
async function imports(...pairs: ReadonlyArray<readonly [string, string]>): Promise<void> {
	const id = (rel: string): string => makeEntityId(REPO, join(REPO, rel), 'file', rel.split('/').pop()!);
	const rels: Relation[] = pairs.map(([from, to]) => ({ kind: 'IMPORTS', from: id(from), to: id(to), resolved: true }));
	await upsertRelations(await getDb(), rels);
}

interface Tree { repo: string; modules: Array<{ id: string; name: string; path: string; language: string }>; edges: Array<{ from: string; to: string; viaImports: number }> }
async function moduleTree(scopeRef: AnalyzeScopeRef): Promise<{ tree: Tree; completeness: Completeness }> {
	const result = await run(codeStructureModuleTreeRuntime, scopeRef);
	return { tree: result.outputs.get('module-tree') as Tree, completeness: result.completeness };
}
/** The tree's edges as 'from -> to x count', with each end named by its node. */
function edgesOf(tree: Tree): string[] {
	const name = new Map(tree.modules.map(m => [m.id, m.name]));
	return tree.edges.map(e => `${name.get(e.from) ?? `?${e.from}`} -> ${name.get(e.to) ?? `?${e.to}`} x${e.viaImports}`).sort();
}

const repoScope = (): AnalyzeScopeRef => ({ kind: 'repo', value: REPO });
const moduleScope = (rel: string): AnalyzeScopeRef => ({ kind: 'module', value: join(REPO, rel) });
const fileScope = (rel: string): AnalyzeScopeRef => ({ kind: 'file', value: join(REPO, rel) });

test.beforeEach(async () => {
	await closeGraphStore();
	dir = realpathSync(mkdtempSync(join(tmpdir(), 'insrc-module-directories-')));
	REPO = join(dir, 'repo');
	mkdirSync(REPO);
	setGraphStorePath(join(dir, 'graph.lmdb'));
	await addRepo(null, { path: REPO, name: '', addedAt: NOW, status: 'ready' });
});

test.afterEach(async () => {
	_setTaskScopeDepsForTest(undefined);
	_resetRuntimeRegistryForTests();
	await closeGraphStore();
	rmSync(dir, { recursive: true, force: true });
});

// ---------------------------------------------------------------------------
// code.discovery.modules
// ---------------------------------------------------------------------------

test("on a graph with no module entity for the repository's directories, the module list returns the directories that hold source, and its record's rule says what a module is (mutation: keep only entities of kind 'module', as before)", async () => {
	await seed(parsedRepo());
	const { modules, completeness } = await moduleList(repoScope());

	// The directories that directly hold a stored source file, sorted by directory.
	// `src` holds source only below it, and `docs` only a document: neither is listed.
	assert.deepEqual(modules, [
		{ name: '.', path: REPO, repo: REPO, directory: REPO, fileCount: 1 },
		{ name: 'src/pay', path: join(REPO, 'src/pay'), repo: REPO, directory: join(REPO, 'src/pay'), fileCount: 2 },
		{ name: 'src/pay/rules', path: join(REPO, 'src/pay/rules'), repo: REPO, directory: join(REPO, 'src/pay/rules'), fileCount: 1 },
		{ name: 'src/payments', path: join(REPO, 'src/payments'), repo: REPO, directory: join(REPO, 'src/payments'), fileCount: 1 },
		{ name: 'src/ship', path: join(REPO, 'src/ship'), repo: REPO, directory: join(REPO, 'src/ship'), fileCount: 1 },
	]);
	// A directory has no entity, so no record carries an entity id.
	assert.ok(modules.every(m => !('entityId' in m)));

	// The record: the stored graph, every module returned, and what a module is.
	assert.equal(completeness.basis, 'graph');
	assert.equal(completeness.returned, 5);
	assert.equal(completeness.complete, true);
	assert.ok(completeness.basisNote?.endsWith(MODULE_RULE), completeness.basisNote);
	assert.match(MODULE_RULE, /a directory that directly holds at least one source file the index stores/);
	assert.match(MODULE_RULE, /Under a scope of one file or one symbol no directory is listed\./);

	// No limit: a repository with many source directories returns every one.
	await seed(Array.from({ length: 300 }, (_, i) => src(`pkg/d${String(i).padStart(3, '0')}/a.ts`)));
	const many = await moduleList(repoScope());
	assert.equal(many.modules.length, 305);
	assert.equal(many.completeness.returned, 305);
	assert.equal(many.completeness.limited, undefined);
});

test("the module list keeps a stored module entity with the fields it had and lists no directory in or under its directory; a file scope that names a module entity's own file returns that module; a run scoped under a stored module's directory lists none (mutation: make a directory module of the sub-directory)", async () => {
	const pay = ent('module', 'pay-pkg', 'src/pay/package.json', { language: 'json' });
	await seed([...parsedRepo(), pay]);

	const { modules } = await moduleList(repoScope());
	// The stored module: the name, the path (its file), the repo and the id it always had, plus the two new fields.
	// Nothing in or under src/pay is a module of its own; src/payments is not under it.
	assert.deepEqual(modules, [
		{ name: '.', path: REPO, repo: REPO, directory: REPO, fileCount: 1 },
		{ name: 'pay-pkg', path: pay.file, repo: REPO, directory: join(REPO, 'src/pay'), fileCount: 2, entityId: pay.id },
		{ name: 'src/payments', path: join(REPO, 'src/payments'), repo: REPO, directory: join(REPO, 'src/payments'), fileCount: 1 },
		{ name: 'src/ship', path: join(REPO, 'src/ship'), repo: REPO, directory: join(REPO, 'src/ship'), fileCount: 1 },
	]);

	// A file scope that names the module entity's own file returns that module, as before.
	assert.deepEqual((await moduleList(fileScope('src/pay/package.json'))).modules, [
		{ name: 'pay-pkg', path: pay.file, repo: REPO, directory: join(REPO, 'src/pay'), fileCount: 0, entityId: pay.id },
	]);
	// A run scoped UNDER the stored module: the entity lies above the area and is not listed,
	// and the directory of the area is that module's, so nothing is listed.
	assert.deepEqual(await names(moduleScope('src/pay/rules')), []);
	// Scoped to the stored module's own directory: the one module.
	assert.deepEqual(await names(moduleScope('src/pay')), ['pay-pkg']);
});

test('under a module scope the module list keeps to the area, and under a file scope on a source file and a symbol scope it is empty', async () => {
	await seed(parsedRepo());
	// A module scope: the directories under it, and not `src/payments`, which only shares its prefix.
	assert.deepEqual(await names(moduleScope('src/pay')), ['src/pay', 'src/pay/rules']);
	assert.deepEqual(await names(moduleScope('src')), ['src/pay', 'src/pay/rules', 'src/payments', 'src/ship']);
	assert.deepEqual(await names(moduleScope('src/pay/rules')), ['src/pay/rules']);
	assert.deepEqual(await names({ kind: 'manifest-dir', value: join(REPO, 'src/ship') }), ['src/ship']);
	assert.deepEqual(await names({ kind: 'workspace', value: REPO }), ['.', 'src/pay', 'src/pay/rules', 'src/payments', 'src/ship']);

	// A file scope on a source file, and a symbol scope: the area is smaller than any directory.
	const onFile = await moduleList(fileScope('src/pay/settle.ts'));
	assert.deepEqual(onFile.modules, []);
	assert.equal(onFile.completeness.returned, 0);
	assert.ok(onFile.completeness.basisNote?.endsWith(MODULE_RULE), 'the record says what a scope of one file gives');
	assert.deepEqual(await names({ kind: 'symbol', value: `${join(REPO, 'src/pay/settle.ts')}#settleRefund` }), []);
});

// ---------------------------------------------------------------------------
// code.structure.module-tree
// ---------------------------------------------------------------------------

test('on the same graph the module tree has a node per source directory and an edge for an import between two directories, and none for an import inside one', async () => {
	// `src/payroll.ts` lies directly in `src`, beside the directory `src/pay` whose name is its prefix.
	await seed([...parsedRepo(), src('src/payroll.ts')]);
	await imports(
		['src/payroll.ts', 'src/ship/track.ts'],          // src -> src/ship: the file is src's, not src/pay's
		['main.ts', 'src/pay/settle.ts'],                 // . -> src/pay
		['main.ts', 'src/pay/ledger.ts'],                 // . -> src/pay, a second import: one edge, counted twice
		['src/pay/settle.ts', 'src/pay/ledger.ts'],       // inside src/pay: no edge
		['src/pay/settle.ts', 'src/pay/rules/late.ts'],   // src/pay -> src/pay/rules: a sub-directory is another module
		['src/ship/track.ts', 'src/pay/settle.ts'],       // src/ship -> src/pay
		['src/payments/report.ts', 'src/ship/track.ts'],  // src/payments -> src/ship
	);
	const { tree, completeness } = await moduleTree(repoScope());

	// A node per source directory, in the module list's order; a directory's id and path are the directory.
	assert.equal(tree.repo, REPO);
	assert.deepEqual(tree.modules, [
		{ id: REPO, name: '.', path: REPO, language: 'typescript' },
		{ id: join(REPO, 'src'), name: 'src', path: join(REPO, 'src'), language: 'typescript' },
		{ id: join(REPO, 'src/pay'), name: 'src/pay', path: join(REPO, 'src/pay'), language: 'typescript' },
		{ id: join(REPO, 'src/pay/rules'), name: 'src/pay/rules', path: join(REPO, 'src/pay/rules'), language: 'typescript' },
		{ id: join(REPO, 'src/payments'), name: 'src/payments', path: join(REPO, 'src/payments'), language: 'typescript' },
		{ id: join(REPO, 'src/ship'), name: 'src/ship', path: join(REPO, 'src/ship'), language: 'typescript' },
	]);
	// The nodes are the module list's modules.
	assert.deepEqual(tree.modules.map(m => m.name), (await moduleList(repoScope())).modules.map(m => m.name));
	// An edge per ordered pair of different directories, with its count; none inside one directory.
	assert.deepEqual(edgesOf(tree), [
		'. -> src/pay x2',
		'src -> src/ship x1',
		'src/pay -> src/pay/rules x1',
		'src/payments -> src/ship x1',
		'src/ship -> src/pay x1',
	]);
	assert.ok(tree.edges.every(e => e.from !== e.to));

	// The record: the stored graph, every node returned, and what the tree rests on.
	assert.equal(completeness.basis, 'graph');
	assert.equal(completeness.returned, 6);
	assert.ok(completeness.basisNote?.endsWith(MODULE_TREE_RULE), completeness.basisNote);
	assert.ok(MODULE_TREE_RULE.startsWith(MODULE_RULE));
	assert.match(MODULE_TREE_RULE, /An import whose target lies outside the area is not an edge\./);
});

test('with two stored module entities and source in a sub-directory of the first, the tree has the two nodes and the one edge between them with its count, and the sub-directory is not a node (mutation: make a directory module of the sub-directory)', async () => {
	// Two stored module entities, as the tests before this Story seed them, and nothing else as a module.
	const modA = ent('module', 'mod-a', 'mod-a/package.json');
	const modB = ent('module', 'mod-b', 'mod-b/package.json');
	await seed([
		modA, modB,
		src('mod-a/a1.ts'), src('mod-a/sub/x.ts'), src('mod-a/sub/deep/y.ts'),
		src('mod-b/b1.ts'),
	]);
	await imports(
		['mod-a/sub/x.ts', 'mod-b/b1.ts'],        // from a sub-directory of mod-a
		['mod-a/sub/deep/y.ts', 'mod-b/b1.ts'],   // and from one deeper
		['mod-a/a1.ts', 'mod-a/sub/x.ts'],        // inside mod-a: no edge
		['mod-b/b1.ts', 'mod-a/sub/x.ts'],        // mod-b -> mod-a, into the sub-directory
	);
	const { tree } = await moduleTree(repoScope());

	// The two nodes, with the id, name and path they had before this Story; the sub-directories are not nodes.
	assert.deepEqual(tree.modules, [
		{ id: modA.id, name: 'mod-a', path: modA.file, language: 'typescript' },
		{ id: modB.id, name: 'mod-b', path: modB.file, language: 'typescript' },
	]);
	// The edges between the two stored modules: a file under mod-a at any depth is mod-a's.
	// This is what the longest-prefix rule over module entities gave before this Story.
	assert.deepEqual(tree.edges, [
		{ from: modA.id, to: modB.id, viaImports: 2 },
		{ from: modB.id, to: modA.id, viaImports: 1 },
	].sort((x, y) => (x.from < y.from ? -1 : 1)));

	// Beside a stored module, a directory outside every stored module is a module, and has its edges.
	await seed([src('tools/gen.ts')]);
	await imports(['tools/gen.ts', 'mod-a/sub/x.ts']);
	const wider = await moduleTree(repoScope());
	assert.deepEqual(wider.tree.modules.map(m => m.name), ['mod-a', 'mod-b', 'tools']);
	assert.deepEqual(edgesOf(wider.tree), ['mod-a -> mod-b x2', 'mod-b -> mod-a x1', 'tools -> mod-a x1']);
});

test('under a module scope the tree keeps to the area, a file whose owning stored module lies above the area is left out, and under a file scope on a source file and a symbol scope the tree is empty', async () => {
	await seed(parsedRepo());
	await imports(
		['src/pay/settle.ts', 'src/pay/rules/late.ts'],   // inside the area src/pay
		['src/ship/track.ts', 'src/pay/settle.ts'],       // from outside the area
		['src/pay/ledger.ts', 'src/ship/track.ts'],       // to a file outside the area
	);
	// A module scope: the nodes are the directories under it, and an import to or from outside it is not an edge.
	const pay = await moduleTree(moduleScope('src/pay'));
	assert.deepEqual(pay.tree.modules.map(m => m.name), ['src/pay', 'src/pay/rules']);
	assert.deepEqual(edgesOf(pay.tree), ['src/pay -> src/pay/rules x1']);

	// A file scope on a source file and a symbol scope: no node, no edge.
	for (const scopeRef of [fileScope('src/pay/settle.ts'), { kind: 'symbol', value: `${join(REPO, 'src/pay/settle.ts')}#settleRefund` } as AnalyzeScopeRef]) {
		const { tree, completeness } = await moduleTree(scopeRef);
		assert.deepEqual([tree.modules, tree.edges], [[], []], scopeRef.kind);
		assert.equal(completeness.returned, 0);
		assert.ok(completeness.basisNote?.endsWith(MODULE_TREE_RULE));
	}

	// A stored module entity ABOVE the area owns the area's files: under a scope below it
	// the entity is not a node, the directory is not a module, and the files are left out.
	const payPkg = ent('module', 'pay-pkg', 'src/pay/package.json');
	await seed([payPkg]);
	const below = await moduleTree(moduleScope('src/pay/rules'));
	assert.deepEqual([below.tree.modules, below.tree.edges], [[], []]);
	assert.match(MODULE_TREE_RULE, /A file whose module is not in the area is not part of the tree, and neither are its imports\./);
	// The same graph under the repo: the stored module is the node for everything under src/pay.
	const whole = await moduleTree(repoScope());
	assert.deepEqual(whole.tree.modules.map(m => m.name), ['.', 'pay-pkg', 'src/payments', 'src/ship']);
	assert.deepEqual(edgesOf(whole.tree), ['pay-pkg -> src/ship x1', 'src/ship -> pay-pkg x1']);
});

test("a repository with no module entity and one source file gives one node '.' and no edge", async () => {
	// The case of the gated test in deterministic-runtimes.test.ts, which the build
	// gate cannot run (it runs without INSRC_LIVE_TESTS and would record it as skipped).
	await seed([src('x.ts')]);
	const { tree, completeness } = await moduleTree(repoScope());
	assert.deepEqual(tree.modules, [{ id: REPO, name: '.', path: REPO, language: 'typescript' }]);
	assert.deepEqual(tree.edges, []);
	assert.equal(completeness.returned, 1);
	// A repository with nothing stored as source has no node, and that is not an error.
	await closeGraphStore();
	const empty = realpathSync(mkdtempSync(join(tmpdir(), 'insrc-module-directories-empty-')));
	try {
		setGraphStorePath(join(empty, 'graph.lmdb'));
		await addRepo(null, { path: REPO, name: '', addedAt: NOW, status: 'ready' });
		await seed([doc('README.md')]);
		const none = await moduleTree(repoScope());
		assert.deepEqual([none.tree.modules, none.tree.edges], [[], []]);
	} finally {
		await closeGraphStore();
		rmSync(empty, { recursive: true, force: true });
	}
});

// ---------------------------------------------------------------------------
// code.surface.functional
// ---------------------------------------------------------------------------

interface Surface {
	module: { name: string; path: string; directory: string; entityId?: string | undefined };
	exports: Array<{ name: string; kind: string; file: string; body?: string | undefined }>;
	internalHelpers: Array<{ name: string; kind: string; file: string }>;
}
async function surfaceOf(value: string, scopeRef: AnalyzeScopeRef = repoScope(), extra: Record<string, unknown> = {}): Promise<{ surface: Surface; completeness: Completeness }> {
	const result = await run(codeSurfaceFunctionalRuntime, scopeRef, { module: value, ...extra });
	return { surface: result.outputs.get('functional-surface') as Surface, completeness: result.completeness };
}
/** The surface as [exports, internal helpers], each a list of names. */
const namesOf = (s: Surface): [string[], string[]] => [s.exports.map(e => e.name), s.internalHelpers.map(e => e.name)];
async function refusal(value: string, scopeRef: AnalyzeScopeRef = repoScope()): Promise<string> {
	try { await surfaceOf(value, scopeRef); } catch (err) { return (err as Error).message; }
	return 'NOT REFUSED';
}

test('the functional-surface task given a directory path returns the exports and helpers of every source file under it, including sub-directories, and names the directory in its output (mutation: require a stored module entity, as before)', async () => {
	await seed([
		...parsedRepo(),
		ent('method', 'Ledger.post', 'src/pay/ledger.ts', { startLine: 9 }),
		// A symbol of `src/payments`, whose name only shares the prefix of `src/pay`.
		ent('function', 'chargeCard', 'src/payments/card.ts', { isExported: true }),
	]);
	const directory = join(REPO, 'src/pay');

	// The planner writes an absolute directory path; a path relative to the repo names the same module.
	for (const value of [directory, `${directory}/`, 'src/pay', './src/pay']) {
		const { surface, completeness } = await surfaceOf(value);
		// The directory is named; it has no entity, so no entity id.
		assert.deepEqual(surface.module, { name: 'src/pay', path: directory, directory }, value);
		// Exports and internal helpers of every source file under it, at any depth, sorted by location:
		// functions, classes and methods, the sub-directory src/pay/rules included.
		assert.deepEqual(namesOf(surface), [['Ledger', 'settleRefund'], ['Ledger.post', 'lateFee']], value);
		assert.ok(surface.internalHelpers.some(h => h.file === join(REPO, 'src/pay/rules/late.ts')), 'a symbol of the sub-directory');
		// Nothing of `src/payments`, whose name only shares the prefix.
		assert.ok([...surface.exports, ...surface.internalHelpers].every(x => x.file.startsWith(`${directory}/`)), value);
		// The record: the stored graph, every symbol returned, and that sub-directories are included.
		assert.deepEqual([completeness.basis, completeness.returned, completeness.complete], ['graph', 4, true], value);
		assert.ok(completeness.basisNote?.endsWith(SURFACE_RULE), completeness.basisNote);
	}
	assert.match(SURFACE_RULE, /including its sub-directories/);

	// A sub-directory on its own, and the depth parameter as before.
	assert.deepEqual(namesOf((await surfaceOf('src/pay/rules')).surface), [[], ['lateFee']]);
	const deep = await surfaceOf('src/pay', repoScope(), { depth: 'deep' });
	assert.ok(deep.surface.exports.every(e => typeof e.body === 'string'));
	assert.ok((await surfaceOf('src/pay')).surface.exports.every(e => !('body' in e)));

	// A source directory in which no function, method or class is stored: an empty surface, and complete.
	const empty = await surfaceOf('src/ship');
	assert.deepEqual(namesOf(empty.surface), [[], []]);
	assert.deepEqual([empty.completeness.returned, empty.completeness.complete], [0, true]);
});

test('the functional-surface task given a directory that holds source only in its sub-directories returns their surface', async () => {
	await seed([...parsedRepo(), ent('function', 'track', 'src/ship/track.ts', { isExported: true })]);
	// `src` holds no file directly and is not in the module list ...
	assert.ok(!(await names(repoScope())).includes('src'));
	// ... and it is a valid module value: everything under it, in every sub-directory.
	const { surface, completeness } = await surfaceOf('src');
	assert.deepEqual(surface.module, { name: 'src', path: join(REPO, 'src'), directory: join(REPO, 'src') });
	assert.deepEqual(namesOf(surface), [['Ledger', 'settleRefund', 'track'], ['lateFee']]);
	assert.equal(completeness.returned, 4);
	// The repo's own directory, as '.' and as its path.
	for (const value of ['.', REPO]) {
		const root = await surfaceOf(value);
		assert.deepEqual(root.surface.module, { name: '.', path: REPO, directory: REPO }, value);
		assert.equal(root.completeness.returned, 4, value);
	}
});

test('the functional-surface task given a value that names nothing fails with a reason that says no stored source file lies under it, and the plan walk records the task as failed, not as an empty module', async () => {
	await seed(parsedRepo());
	// A directory that does not exist, one that holds a document only, and a bare name.
	for (const [value, directory] of [['src/none', join(REPO, 'src/none')], ['docs', join(REPO, 'docs')], ['analyze', join(REPO, 'analyze')]] as const) {
		assert.equal(await refusal(value),
			`code.surface.functional: the module value '${value}' names the directory '${directory}', and no stored source file lies under it in the repo '${REPO}'.`);
	}
	// A missing value keeps the message it had.
	await assert.rejects(run(codeSurfaceFunctionalRuntime, repoScope(), {}), /task\.params\.module missing or not a string \(taskId=t01\)/);

	// Through the plan walk: the task is failed with the reason, and has no output. It is not an empty module.
	_resetRuntimeRegistryForTests();
	registerTemplateRuntime(codeSurfaceFunctionalRuntime);
	registerTemplateRuntime({
		templateId: 'demo.aggregate',
		execute: async () => ({ outputs: new Map([['report', { summary: 's', findings: [] }]]), completeness: buildCompleteness({ returned: 1, basis: 'model-directed' }) }),
	});
	const plan = {
		planId: 'p', goal: 'g', target: 'code', scope: 'S', reasoning: 'fixture plan for the functional-surface task',
		tasks: [
			{ taskId: 't01', template: 'code.surface.functional', kind: 'leaf', params: { module: join(REPO, 'src/none') }, produces: ['functional-surface'], rationale: 'the surface of a directory that does not exist' },
			{ taskId: 't02', template: 'code.surface.functional', kind: 'leaf', params: { module: join(REPO, 'src/ship') }, produces: ['functional-surface'], rationale: 'the surface of a directory with no symbol' },
			{ taskId: 't03', template: 'demo.aggregate', kind: 'leaf', params: {}, produces: ['report'], rationale: 'the report of the plan' },
		],
	} as unknown as PlanTask;
	const runId = `module-directories-${Math.floor(Math.random() * 1e9).toString(16)}`;
	try {
		const intent: ClassifiedIntent = { target: 'code', scope: 'S', focused: false, scopeRef: repoScope(), reasoning: 'test' };
		const executed = await runExecutor({ tree: { plan, children: new Map(), childErrors: new Map() }, intent, runId });
		const failed = executed.root.perTask.get('t01')!;
		assert.equal(failed.status, 'failed');
		assert.equal(failed.error, `runtime-threw: code.surface.functional: the module value '${join(REPO, 'src/none')}' names the directory '${join(REPO, 'src/none')}', and no stored source file lies under it in the repo '${REPO}'.`);
		assert.equal(failed.outputs, undefined, 'no surface is recorded for a module that names nothing');
		assert.equal(failed.completeness, undefined);
		assert.deepEqual(executed.root.tasksFailed.map(f => f.taskId), ['t01']);
		// Beside it, a directory that exists and offers nothing IS an empty module: 'ok', with a complete record.
		const emptyModule = executed.root.perTask.get('t02')!;
		assert.equal(emptyModule.status, 'ok');
		assert.equal(emptyModule.completeness?.returned, 0);
	} finally {
		purgeAllTaskOutputs(runId);
	}
});

test("a stored module entity's id returns the surface it returned before under every kind of scope and resolves no scope: with the scope function's readers set to throw the id still answers and a directory path fails (mutation: resolve the scope before the id is looked up)", async () => {
	const pay = ent('module', 'pay-pkg', 'src/pay/package.json');
	await seed([...parsedRepo(), pay]);
	// What the id gave before this Story: every function, method and class under the directory of the
	// module entity's file, with the entity's name, file and id. `directory` is the one added field.
	const expected = {
		module: { name: 'pay-pkg', path: pay.file, directory: join(REPO, 'src/pay'), entityId: pay.id },
		names: [['Ledger', 'settleRefund'], ['lateFee']],
	};
	const check = async (scopeRef: AnalyzeScopeRef, label: string): Promise<void> => {
		const { surface, completeness } = await surfaceOf(pay.id, scopeRef);
		assert.deepEqual(surface.module, expected.module, label);
		assert.deepEqual(namesOf(surface), expected.names, label);
		assert.equal(completeness.returned, 3, label);
	};
	// Under every kind of scope, also one whose area does not contain the module ...
	await check(repoScope(), 'a repo scope');
	await check(moduleScope('src/ship'), 'a module scope on another directory');
	await check(fileScope('src/ship/track.ts'), 'a file scope');
	await check({ kind: 'symbol', value: `${join(REPO, 'src/pay/settle.ts')}#settleRefund` }, 'a symbol scope');
	// ... one the code family refuses, and one that does not resolve: no scope is resolved for an id.
	await check({ kind: 'connection', value: 'ledger-db' }, 'a connection scope, which the code family refuses');
	await check({ kind: 'repo', value: join(dir, 'not-registered') }, 'a scope in no registered repo');

	// With the scope function's readers set to throw, the id still answers under every kind of scope ...
	const symbolScope: AnalyzeScopeRef = { kind: 'symbol', value: `${join(REPO, 'src/pay/settle.ts')}#settleRefund` };
	let calls = 0;
	const throwing = (): never => { calls += 1; throw new Error('the scope readers must not be called for an entity id'); };
	_setTaskScopeDepsForTest({ listRepos: throwing, findEntitiesByFile: throwing, listEntitiesForRepo: throwing, loadConnections: throwing } as unknown as ScopeDeps);
	await check(repoScope(), 'a repo scope, with throwing scope readers');
	await check(symbolScope, 'a symbol scope, with throwing scope readers');
	assert.equal(calls, 0, 'an entity id calls no reader of the scope function');
	// ... and a directory path, which does resolve the scope, fails with the reader's error. (Under a
	// symbol scope: resolving a repo scope tolerates a registry that cannot be read, so there the
	// readers are called and their error is not the task's.)
	assert.equal(await refusal('src/pay', symbolScope), 'the scope readers must not be called for an entity id');
	assert.ok(calls > 0);
	calls = 0;
	await surfaceOf('src/pay');
	assert.ok(calls > 0, 'a directory path under a repo scope calls the readers of the scope function');
	_setTaskScopeDepsForTest(undefined);

	// The id of an entity of another kind: the message it had before, word for word.
	const fn = makeEntityId(REPO, join(REPO, 'src/pay/settle.ts'), 'function', 'settleRefund');
	assert.equal(await refusal(fn), `code.surface.functional: entity '${fn}' has kind='function', expected 'module' (taskId=t01)`);
});

test('a functional-surface task that names a directory outside the area of a module scope is refused, and a directory path under a file scope or a symbol scope is refused (mutation: test a directory against the area with the entity predicate)', async () => {
	await seed([...parsedRepo(), ent('function', 'track', 'src/ship/track.ts', { isExported: true })]);
	const payScope = moduleScope('src/pay');
	// Inside the area: the area's own directory and one under it.
	assert.deepEqual(namesOf((await surfaceOf('src/pay', payScope)).surface), [['Ledger', 'settleRefund'], ['lateFee']]);
	assert.deepEqual(namesOf((await surfaceOf('src/pay/rules', payScope)).surface), [[], ['lateFee']]);
	// Outside it: a sibling that holds source, the parent of the area, and a directory outside the repo.
	for (const [value, directory] of [['src/ship', join(REPO, 'src/ship')], ['src', join(REPO, 'src')], ['/elsewhere/src', '/elsewhere/src']] as const) {
		assert.equal(await refusal(value, payScope),
			`code.surface.functional: the module value '${value}' names the directory '${directory}', which lies outside the area of the run's scope ('${join(REPO, 'src/pay')}').`);
	}
	// `src/payments` shares the area's prefix and is outside it.
	assert.match(await refusal('src/payments', payScope), /lies outside the area of the run's scope/);

	// Under a file scope or a symbol scope a directory path is refused, whatever it names:
	// also the directory of the scope's own file.
	for (const scopeRef of [fileScope('src/pay/settle.ts'), { kind: 'symbol', value: `${join(REPO, 'src/pay/settle.ts')}#settleRefund` } as AnalyzeScopeRef]) {
		for (const value of ['src/pay', join(REPO, 'src/pay'), 'src/none']) {
			assert.equal(await refusal(value, scopeRef),
				`code.surface.functional: the module value '${value}' is a directory path, and the run's scope is a ${scopeRef.kind} scope. A scope of one file or one symbol holds no directory to describe.`);
		}
	}
	// A scope the code family refuses fails a directory path with the scope's own typed error.
	assert.match(await refusal('src/pay', { kind: 'connection', value: 'ledger-db' }), /scopeRef\.kind='connection' is incompatible with target='code'/);
});

test('an unknown module value fails with the message that no stored source file lies under it', async () => {
	// The case of the gated test in deterministic-runtimes.test.ts, which the build gate cannot run.
	await seed(parsedRepo());
	const unknown = '0'.repeat(32);
	assert.equal(await refusal(unknown),
		`code.surface.functional: the module value '${unknown}' names the directory '${join(REPO, unknown)}', and no stored source file lies under it in the repo '${REPO}'.`);
});
