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
import type { Completeness } from '../../../completeness.js';
import type { PlannedTask, TemplateExecuteArgs, TemplateExecuteResult, TemplateRuntime } from '../../../executor/types.js';
import { MODULE_RULE } from '../../shared/source-modules.js';
import { codeDiscoveryModulesRuntime } from '../discovery-modules.js';
import { codeStructureModuleTreeRuntime, MODULE_TREE_RULE } from '../structure-module-tree.js';

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

interface ModuleRecord { name: string; path: string; repo: string; directory: string; fileCount: number; entityId?: string }
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
