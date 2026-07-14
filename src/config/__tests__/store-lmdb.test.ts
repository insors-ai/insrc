/**
 * Phase 2.8 tests for the LMDB-backed `config/store.ts`.
 *
 * Verifies the public surface preserves the prior DuckDB-backed
 * behaviour: ConfigStore class with upsert/delete/get/list/vector-
 * search methods. Vector search is stubbed -- Phase 3.4 wires Lance.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { closeGraphStore, setGraphStorePath } from '../../db/graph/store.js';
import { ConfigStore } from '../store.js';
import type { ConfigEntry } from '../../shared/types.js';

let dir: string;

test.beforeEach(async () => {
	await closeGraphStore();
	dir = mkdtempSync(join(tmpdir(), 'insrc-config-store-lmdb-2.8-'));
	setGraphStorePath(join(dir, 'graph.lmdb'));
});
test.afterEach(async () => {
	await closeGraphStore();
	rmSync(dir, { recursive: true, force: true });
});

const NOW = '2026-05-05T10:00:00.000Z';

function makeEntry(overrides: Partial<ConfigEntry> = {}): ConfigEntry {
	return {
		id:          overrides.id          ?? 'cfg-1',
		scope:       overrides.scope       ?? { kind: 'global' },
		namespace:   overrides.namespace   ?? 'implementation',
		category:    overrides.category    ?? 'template',
		language:    overrides.language    ?? 'typescript',
		name:        overrides.name        ?? 'pair-prompt',
		filePath:    overrides.filePath    ?? '~/.insrc/templates/foo.md',
		body:        overrides.body        ?? 'template body',
		tags:        overrides.tags        ?? [],
		updatedAt:   overrides.updatedAt   ?? NOW,
		contentHash: overrides.contentHash ?? 'h',
		embedding:   overrides.embedding   ?? [],
	};
}

// ---------------------------------------------------------------------------
// Construction + basic round-trip
// ---------------------------------------------------------------------------

test('upsertEntry + getEntry round-trip', async () => {
	const cs = new ConfigStore(null);
	await cs.upsertEntry(makeEntry({
		tags: ['a', 'b', 'c'],
		body: 'hello',
	}));
	const back = await cs.getEntry('cfg-1');
	assert.ok(back);
	assert.equal(back.id, 'cfg-1');
	assert.equal(back.scope.kind, 'global');
	assert.equal(back.namespace, 'implementation');
	assert.equal(back.category, 'template');
	assert.equal(back.body, 'hello');
	assert.deepEqual(back.tags, ['a', 'b', 'c']);
	assert.deepEqual(back.embedding, []); // Lance not yet wired
});

test('getEntry on unknown id returns null', async () => {
	const cs = new ConfigStore(null);
	assert.equal(await cs.getEntry('no-such'), null);
});

test('upsertEntry replaces existing row', async () => {
	const cs = new ConfigStore(null);
	await cs.upsertEntry(makeEntry({ body: 'first' }));
	await cs.upsertEntry(makeEntry({ body: 'second' }));
	const back = await cs.getEntry('cfg-1');
	assert.equal(back?.body, 'second');
});

test('upsertEntry preserves project scope', async () => {
	const cs = new ConfigStore(null);
	await cs.upsertEntry(makeEntry({ scope: { kind: 'project', repoPath: '/repo/foo' } }));
	const back = await cs.getEntry('cfg-1');
	assert.equal(back?.scope.kind, 'project');
	if (back?.scope.kind === 'project') {
		assert.equal(back.scope.repoPath, '/repo/foo');
	}
});

// ---------------------------------------------------------------------------
// deleteEntry / deleteByScope
// ---------------------------------------------------------------------------

test('deleteEntry removes the row', async () => {
	const cs = new ConfigStore(null);
	await cs.upsertEntry(makeEntry());
	await cs.deleteEntry('cfg-1');
	assert.equal(await cs.getEntry('cfg-1'), null);
});

test('deleteEntry on unknown id is a silent no-op', async () => {
	const cs = new ConfigStore(null);
	await cs.deleteEntry('no-such');
});

test('deleteByScope removes only entries with matching scope', async () => {
	const cs = new ConfigStore(null);
	await cs.upsertEntry(makeEntry({ id: 'g1', scope: { kind: 'global' } }));
	await cs.upsertEntry(makeEntry({ id: 'g2', scope: { kind: 'global' } }));
	await cs.upsertEntry(makeEntry({ id: 'p1', scope: { kind: 'project', repoPath: '/repo/foo' } }));
	await cs.deleteByScope('global');
	assert.equal(await cs.getEntry('g1'), null);
	assert.equal(await cs.getEntry('g2'), null);
	assert.ok(await cs.getEntry('p1'));
});

test('deleteByScope on empty matches is a silent no-op', async () => {
	const cs = new ConfigStore(null);
	await cs.upsertEntry(makeEntry({ scope: { kind: 'global' } }));
	await cs.deleteByScope('project:/repo/nope');
	assert.ok(await cs.getEntry('cfg-1'));
});

// ---------------------------------------------------------------------------
// listEntries with filters
// ---------------------------------------------------------------------------

test('listEntries returns all entries when no filter', async () => {
	const cs = new ConfigStore(null);
	await cs.upsertEntry(makeEntry({ id: 'a', namespace: 'implementation' }));
	await cs.upsertEntry(makeEntry({ id: 'b', namespace: 'designer' }));
	await cs.upsertEntry(makeEntry({ id: 'c', namespace: 'planner' }));
	const all = await cs.listEntries();
	assert.equal(all.length, 3);
});

test('listEntries filters by namespace', async () => {
	const cs = new ConfigStore(null);
	await cs.upsertEntry(makeEntry({ id: 'a', namespace: 'implementation' }));
	await cs.upsertEntry(makeEntry({ id: 'b', namespace: 'designer' }));
	const impl = await cs.listEntries({ namespace: 'implementation' });
	assert.equal(impl.length, 1);
	assert.equal(impl[0]!.id, 'a');
});

test('listEntries filters by category', async () => {
	const cs = new ConfigStore(null);
	await cs.upsertEntry(makeEntry({ id: 'a', category: 'template' }));
	await cs.upsertEntry(makeEntry({ id: 'b', category: 'feedback' }));
	const tpl = await cs.listEntries({ category: 'template' });
	assert.equal(tpl.length, 1);
	assert.equal(tpl[0]!.id, 'a');
});

test('listEntries filters by scope (uses by_scope index)', async () => {
	const cs = new ConfigStore(null);
	await cs.upsertEntry(makeEntry({ id: 'g1', scope: { kind: 'global' } }));
	await cs.upsertEntry(makeEntry({ id: 'p1', scope: { kind: 'project', repoPath: '/repo/foo' } }));
	const globalOnly = await cs.listEntries({ scope: 'global' });
	assert.equal(globalOnly.length, 1);
	assert.equal(globalOnly[0]!.id, 'g1');
});

test('listEntries combines scope + namespace + category filters', async () => {
	const cs = new ConfigStore(null);
	await cs.upsertEntry(makeEntry({ id: 'a', scope: { kind: 'global' }, namespace: 'implementation', category: 'template' }));
	await cs.upsertEntry(makeEntry({ id: 'b', scope: { kind: 'global' }, namespace: 'implementation', category: 'feedback' }));
	await cs.upsertEntry(makeEntry({ id: 'c', scope: { kind: 'global' }, namespace: 'designer',       category: 'template' }));
	const filtered = await cs.listEntries({
		scope: 'global', namespace: 'implementation', category: 'template',
	});
	assert.equal(filtered.length, 1);
	assert.equal(filtered[0]!.id, 'a');
});

test('upsert that changes scope updates the by_scope index', async () => {
	const cs = new ConfigStore(null);
	await cs.upsertEntry(makeEntry({ scope: { kind: 'global' } }));
	// Change the scope on the next upsert
	await cs.upsertEntry(makeEntry({ scope: { kind: 'project', repoPath: '/repo/foo' } }));
	const oldScope = await cs.listEntries({ scope: 'global' });
	const newScope = await cs.listEntries({ scope: 'project:/repo/foo' });
	assert.equal(oldScope.length, 0, 'old by_scope index entry should be removed');
	assert.equal(newScope.length, 1);
});

// ---------------------------------------------------------------------------
// vectorSearch stub
// ---------------------------------------------------------------------------

test('vectorSearch returns [] (Phase 3.4 wires Lance)', async () => {
	const cs = new ConfigStore(null);
	await cs.upsertEntry(makeEntry());
	const r = await cs.vectorSearch([1, 2, 3], undefined, 5);
	assert.deepEqual(r, []);
});

// ---------------------------------------------------------------------------
// Persistence
// ---------------------------------------------------------------------------

test('entries survive close + reopen', async () => {
	{
		const cs = new ConfigStore(null);
		await cs.upsertEntry(makeEntry({ tags: ['x', 'y'] }));
	}
	await closeGraphStore();
	{
		const cs = new ConfigStore(null);
		const back = await cs.getEntry('cfg-1');
		assert.ok(back);
		assert.deepEqual(back.tags, ['x', 'y']);
	}
});
