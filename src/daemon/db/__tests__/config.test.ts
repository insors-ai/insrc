/**
 * Tests for daemon/db/config.ts -- connections file load + validate.
 *
 * Uses a tmp HOME so the production `~/.insrc/repos/...` path is not
 * disturbed. The config module reads `PATHS.insrc` which is
 * computed at import time from `homedir()` -- we override it by
 * setting HOME BEFORE the first import of the config module.
 */

import { describe, it, before, beforeEach, after } from 'node:test';
import { strict as assert } from 'node:assert';
import { mkdtempSync, rmSync } from 'node:fs';
import { mkdir, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const originalHome = process.env['HOME'];
const tmpHome = mkdtempSync(join(tmpdir(), 'insrc-db-config-'));
process.env['HOME'] = tmpHome;

// Imports AFTER HOME override so PATHS.insrc picks up the tmp dir.
const { connectionsPath, loadConnections, repoIdOf, saveConnections } =
	await import('../config.js');
const { _resetRegistryForTests, registerDriver } =
	await import('../registry.js');
const { Driver } = await import('../../../shared/db-driver.js')
	.then(m => ({ Driver: m }))
	.catch(() => ({ Driver: null as never }));
void Driver;

const stubFactory = async () => ({} as never);

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const REPO = '/fake/repo/alpha';

async function writeConfig(doc: unknown): Promise<void> {
	const path = connectionsPath(REPO);
	await mkdir(join(path, '..'), { recursive: true });
	await writeFile(path, JSON.stringify(doc, null, 2), 'utf8');
}

// ---------------------------------------------------------------------------
// repoIdOf
// ---------------------------------------------------------------------------

describe('repoIdOf', () => {
	it('produces a 32-hex deterministic id', () => {
		const id = repoIdOf(REPO);
		assert.equal(id.length, 32);
		assert.match(id, /^[0-9a-f]+$/);
		assert.equal(repoIdOf(REPO), id);
	});

	it('differs per path', () => {
		assert.notEqual(repoIdOf('/a/b'), repoIdOf('/a/c'));
	});
});

// ---------------------------------------------------------------------------
// loadConnections
// ---------------------------------------------------------------------------

describe('loadConnections', () => {
	beforeEach(() => {
		_resetRegistryForTests();
		registerDriver({ kind: 'postgres', family: 'rdbms', factory: stubFactory });
		registerDriver({ kind: 'redis', family: 'kv', factory: stubFactory });
		registerDriver({ kind: 'csv', family: 'file', factory: stubFactory });
	});

	it('returns empty list when the file is missing', async () => {
		const loaded = await loadConnections('/no/such/repo/ever');
		assert.deepEqual(loaded.resolved, []);
		assert.deepEqual(loaded.warnings, []);
	});

	it('loads + infers family from the registered driver', async () => {
		await writeConfig({
			connections: [
				{ id: 'primary', kind: 'postgres', url: 'postgres://u@h/d' },
				{ id: 'cache', kind: 'redis', url: 'redis://localhost:6379' },
				{ id: 'orders', kind: 'csv', path: 'data/orders.csv' },
			],
		});
		const { resolved } = await loadConnections(REPO);
		assert.equal(resolved.length, 3);
		assert.equal(resolved[0]?.family, 'rdbms');
		assert.equal(resolved[1]?.family, 'kv');
		assert.equal(resolved[2]?.family, 'file');
	});

	it('honors user-pinned family but warns on mismatch', async () => {
		await writeConfig({
			connections: [
				{ id: 'mongo', kind: 'postgres', family: 'kv', url: 'postgres://u@h/d' },
			],
		});
		const { resolved, warnings } = await loadConnections(REPO);
		assert.equal(resolved[0]?.family, 'kv');
		assert.equal(warnings.length, 1);
		assert.match(warnings[0] ?? '', /user pinned family='kv'/);
	});

	it('rejects duplicate ids', async () => {
		await writeConfig({
			connections: [
				{ id: 'a', kind: 'postgres', url: 'postgres://u@h/d' },
				{ id: 'a', kind: 'redis', url: 'redis://h:1' },
			],
		});
		await assert.rejects(loadConnections(REPO), /duplicate id 'a'/);
	});

	it('rejects unknown driver kinds', async () => {
		await writeConfig({
			connections: [
				{ id: 'primary', kind: 'cobol-db', url: 'cobol://h' },
			],
		});
		await assert.rejects(loadConnections(REPO), /unknown driver kind 'cobol-db'/);
	});

	it('rejects connections with neither url nor path', async () => {
		await writeConfig({
			connections: [{ id: 'primary', kind: 'postgres' }],
		});
		await assert.rejects(loadConnections(REPO), /must set `url` \(rdbms\/kv\) or `path` \(file\)/);
	});

	it('rejects invalid family strings', async () => {
		await writeConfig({
			connections: [
				{ id: 'primary', kind: 'postgres', family: 'columnar', url: 'postgres://u@h/d' },
			],
		});
		await assert.rejects(loadConnections(REPO), /invalid family 'columnar'/);
	});

	it('rejects invalid JSON with a typed message', async () => {
		const path = connectionsPath(REPO);
		await mkdir(join(path, '..'), { recursive: true });
		await writeFile(path, 'not valid json', 'utf8');
		await assert.rejects(loadConnections(REPO), /invalid JSON/);
	});

	it('rejects missing connections array', async () => {
		await writeConfig({ stuff: 'here' });
		await assert.rejects(loadConnections(REPO), /expected \{ connections: \[\.\.\.\] \}/);
	});
});

// ---------------------------------------------------------------------------
// saveConnections
// ---------------------------------------------------------------------------

describe('saveConnections', () => {
	beforeEach(() => {
		_resetRegistryForTests();
		registerDriver({ kind: 'postgres', family: 'rdbms', factory: stubFactory });
	});

	it('writes + round-trips a config file', async () => {
		const wrote = await saveConnections('/fake/repo/save', {
			connections: [
				{ id: 'primary', kind: 'postgres', url: 'postgres://u@h/d' },
			],
		});
		assert.ok(wrote.endsWith('db-connections.json'));
		const { resolved } = await loadConnections('/fake/repo/save');
		assert.equal(resolved.length, 1);
		assert.equal(resolved[0]?.id, 'primary');
	});
});

// ---------------------------------------------------------------------------
// Cleanup
// ---------------------------------------------------------------------------

before(() => { /* tmpHome already created above */ });
after(() => {
	if (originalHome !== undefined) { process.env['HOME'] = originalHome; }
	else { delete process.env['HOME']; }
	try { rmSync(tmpHome, { recursive: true, force: true }); } catch { /* ignore */ }
});
