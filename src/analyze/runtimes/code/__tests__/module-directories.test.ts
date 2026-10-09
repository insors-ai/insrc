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
import { closeGraphStore, setGraphStorePath } from '../../../../db/graph/store.js';
import { addRepo } from '../../../../db/repos.js';
import { makeEntityId } from '../../../../indexer/parser/base.js';
import type { AnalyzeScopeRef, ClassifiedIntent } from '../../../../shared/analyze-types.js';
import type { Entity, EntityKind } from '../../../../shared/types.js';
import type { Completeness } from '../../../completeness.js';
import type { PlannedTask, TemplateExecuteArgs, TemplateExecuteResult, TemplateRuntime } from '../../../executor/types.js';
import { MODULE_RULE } from '../../shared/source-modules.js';
import { codeDiscoveryModulesRuntime } from '../discovery-modules.js';

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
