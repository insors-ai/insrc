/**
 * concept.resolve inside a named area, and its anchor (Story
 * 65b643840a294422/s1, task t8). Real graph store and a real directory tree;
 * no model.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { upsertEntities } from '../../../db/entities.js';
import { closeGraphStore, setGraphStorePath } from '../../../db/graph/store.js';
import { addRepo } from '../../../db/repos.js';
import { savedAnalysisExecution } from '../../connection-access.js';
import { permissiveIgnoreFilter } from '../../context/repo-ignore-filter.js';
import type { ResolvedScope } from '../../context/scope.js';
import type { Entity } from '../../../shared/types.js';
import { runConceptResolve } from '../concept-resolve.js';
import type { ConceptResolveOutput, ExplorationRunnerContext } from '../types.js';

let sandbox: string;
let repo: string;

const file = (...parts: string[]): string => join(repo, ...parts);

test.beforeEach(async () => {
	await closeGraphStore();
	sandbox = mkdtempSync(join(tmpdir(), 'concept-resolve-scope-'));
	setGraphStorePath(join(sandbox, 'graph.lmdb'));
	repo = join(sandbox, 'app');
	for (const dir of ['src/pay/refund', 'src/billing']) mkdirSync(join(repo, dir), { recursive: true });
	const files = ['src/pay/settle.ts', 'src/pay/refund/refund.ts', 'src/billing/invoice.ts'];
	for (const f of files) writeFileSync(join(repo, f), '');
	await addRepo(null, { path: repo, name: repo, addedAt: '2026-01-01T00:00:00.000Z', status: 'ready' });
	const fileEntity = (f: string): Record<string, unknown> => ({ id: `f-${f}`, repo, file: join(repo, f), kind: 'file', name: f.split('/').pop(), language: 'typescript', startLine: 1, endLine: 1 });
	const fn = (id: string, f: string, name: string): Record<string, unknown> => ({ id, repo, file: join(repo, f), kind: 'function', name, language: 'typescript', startLine: 1, endLine: 2 });
	await upsertEntities(null, [
		...files.map(fileEntity),
		fn('e-settle', 'src/pay/settle.ts', 'settlePayment'),
		fn('e-refund', 'src/pay/refund/refund.ts', 'refundPayment'),
		fn('e-invoice', 'src/billing/invoice.ts', 'sendInvoice'),
	] as unknown as Entity[]);
});

test.afterEach(async () => {
	await closeGraphStore();
	rmSync(sandbox, { recursive: true, force: true });
});

function ctxFor(scope: ResolvedScope | undefined): ExplorationRunnerContext {
	return {
		connectionExecution: savedAnalysisExecution(repo),
		runId: 'r1', repoPath: repo, closureRepos: [repo],
		...(scope !== undefined ? { scope } : {}),
		readDep: () => undefined, ignoreFilter: permissiveIgnoreFilter(repo),
	};
}

const run = (query: string, scope?: ResolvedScope): Promise<ConceptResolveOutput> =>
	runConceptResolve({ id: 'e1', type: 'concept.resolve', purpose: 'p', params: { query } } as never, ctxFor(scope));

const moduleScope = (dir: string, kind: 'module' | 'manifest-dir' = 'module'): ResolvedScope =>
	({ kind, value: dir, repoPath: repo, lookupPath: dir });

const inside = (path: string, dir: string): boolean => path === dir || path.startsWith(`${dir}/`);

for (const kind of ['module', 'manifest-dir'] as const) {
	test(`${kind} scope: no hit lies outside the area, the anchor is the area even with no hit, and a child that outranks the area does not displace it`, async () => {
		const area = file('src', 'pay');
		const scope = moduleScope(area, kind);

		// words that match only outside the area: nothing outside is returned; the anchor is still the area
		const outside = await run('billing invoice', scope);
		assert.deepEqual(outside.hits, [], 'no hit outside the area');
		assert.deepEqual(outside.anchor, { path: area, kind: 'dir', source: 'named-scope' });
		assert.equal(outside.completeness.complete, true, 'an empty result inside a valid area is complete');

		// a question with no distinctive word: the anchor is still the area
		const none = await run('the of and', scope);
		assert.deepEqual(none.hits, []);
		assert.deepEqual(none.anchor, { path: area, kind: 'dir', source: 'named-scope' });

		// the child outranks the named module by token match, and the anchor stays the module
		const child = await run('refund', scope);
		assert.ok(child.hits.length > 0);
		assert.equal(child.hits[0]!.path, file('src', 'pay', 'refund'), 'the child ranks first');
		assert.ok(child.hits.every(h => inside(h.path, area)), `every hit lies in the area: ${child.hits.map(h => h.path).join(', ')}`);
		assert.deepEqual(child.anchor, { path: area, kind: 'dir', source: 'named-scope' });

		// the same query without a scope does reach outside
		const whole = await run('billing invoice');
		assert.ok(whole.hits.some(h => inside(h.path, file('src', 'billing'))), 'the whole-repository result has the billing hits');
	});
}

test('file scope: only that file and its entities are candidates; the anchor is the file', async () => {
	const settle = file('src', 'pay', 'settle.ts');
	const scope: ResolvedScope = { kind: 'file', value: settle, repoPath: repo, lookupPath: repo, filePath: settle };
	const out = await run('settle payment refund invoice', scope);
	assert.ok(out.hits.length > 0);
	assert.ok(out.hits.every(h => h.path === settle && h.kind !== 'dir'), `hits: ${out.hits.map(h => `${h.kind}:${h.path}`).join(', ')}`);
	assert.deepEqual(out.anchor, { path: settle, kind: 'file', source: 'named-scope' });
});

test('symbol scope: the one entity is the only candidate; the anchor is the symbol with its entity id and file', async () => {
	const settle = file('src', 'pay', 'settle.ts');
	const scope: ResolvedScope = { kind: 'symbol', value: `${settle}#settlePayment`, repoPath: repo, lookupPath: repo, filePath: settle, entityId: 'e-settle' };
	const out = await run('settle payment refund invoice', scope);
	assert.ok(out.hits.length > 0);
	assert.ok(out.hits.every(h => h.kind === 'entity' && h.entityId === 'e-settle'), `hits: ${out.hits.map(h => `${h.kind}:${h.entityId}`).join(', ')}`);
	assert.deepEqual(out.anchor, { path: settle, kind: 'symbol', source: 'named-scope', entityId: 'e-settle', filePath: settle });
	// no matching word: the anchor is still the symbol
	const none = await run('zebra', scope);
	assert.deepEqual(none.hits, []);
	assert.equal(none.anchor?.entityId, 'e-settle');
});

test('workspace and repo scopes return today\'s hits and the top hit as the anchor; a ranked entity hit becomes a symbol anchor; no hit gives no anchor', async () => {
	const bare = await run('settle payment');
	for (const kind of ['workspace', 'repo'] as const) {
		const scoped = await run('settle payment', { kind, value: repo, repoPath: repo, lookupPath: repo });
		assert.deepEqual(scoped.hits, bare.hits, `${kind}: the hits equal the bare-repository result`);
		assert.deepEqual(scoped.anchor, bare.anchor, `${kind}: the same anchor`);
	}
	const top = bare.hits[0]!;
	assert.ok(bare.anchor !== undefined);
	assert.equal(bare.anchor.source, 'ranked');
	assert.equal(bare.anchor.path, top.path);

	// an entity hit on top becomes a symbol anchor with its entity id and file
	assert.equal(top.kind, 'entity', 'the entity ranks first for this query');
	assert.deepEqual(bare.anchor, { path: top.path, kind: 'symbol', source: 'ranked', entityId: top.entityId, filePath: top.path });
	assert.equal(top.entityId, 'e-settle');

	// a file or directory hit keeps its kind
	const dir = await run('refund', undefined);
	const first = dir.hits[0]!;
	assert.ok(first.kind === 'dir' || first.kind === 'file', `the first hit for 'refund' is a ${first.kind}`);
	assert.deepEqual(dir.anchor, { path: first.path, kind: first.kind, source: 'ranked' });

	// no hit, no scope: no anchor
	const nothing = await run('zebra');
	assert.deepEqual(nothing.hits, []);
	assert.equal(nothing.anchor, undefined);
});
