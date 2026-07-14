/**
 * PostgresDriver integration test.
 *
 * Bring up the docker-compose fixture (see
 * `test/fixtures/db-driver/docker-compose.yml`) + run with:
 *
 *   INSRC_DB_TESTS=1
 *   INSRC_TEST_PG_URL=postgres://insrc:insrc@localhost:5544/insrc_test
 *   npm run test:data-driver --prefix src/insrc
 */

import { describe, it, before, after } from 'node:test';
import { strict as assert } from 'node:assert';

import { configFor, skipUnless } from './integration-helpers.js';

const cfg = configFor('INSRC_TEST_PG_URL');
skipUnless(cfg, 'PostgresDriver integration');

if (cfg.enabled) {
	const { default: pgMod } = await import('pg');
	await import('../drivers/pg.js'); // self-registers
	const { acquirePool } = await import('../pool-cache.js');
	const { connectionsPath } = await import('../config.js');
	const { mkdtempSync, rmSync } = await import('node:fs');
	const { mkdir, writeFile } = await import('node:fs/promises');
	const { tmpdir } = await import('node:os');
	const { join } = await import('node:path');

	const repoRoot = mkdtempSync(join(tmpdir(), 'insrc-pg-int-'));
	const URL = cfg.url!;

	before(async () => {
		// Seed schema in the live DB.
		const client = new pgMod.Client({ connectionString: URL });
		await client.connect();
		await client.query(`
			DROP TABLE IF EXISTS posts CASCADE;
			DROP TABLE IF EXISTS users CASCADE;
			CREATE TABLE users (
				id    SERIAL PRIMARY KEY,
				email TEXT UNIQUE NOT NULL,
				name  TEXT
			);
			CREATE TABLE posts (
				id      SERIAL PRIMARY KEY,
				user_id INT NOT NULL REFERENCES users(id),
				title   TEXT NOT NULL,
				body    TEXT
			);
			INSERT INTO users (email, name) VALUES
				('a@x.io', 'alice'),
				('b@x.io', 'bob'),
				('c@x.io', NULL);
			INSERT INTO posts (user_id, title, body) VALUES
				(1, 'first',  'hello'),
				(1, 'second', 'world'),
				(2, 'third',  NULL);
		`);
		await client.end();

		// Write the connections file pointing at the live DB.
		const path = connectionsPath(repoRoot);
		await mkdir(join(path, '..'), { recursive: true });
		await writeFile(path, JSON.stringify({
			connections: [{ id: 'live', kind: 'postgres', url: URL }],
		}), 'utf8');
	});

	after(() => {
		try { rmSync(repoRoot, { recursive: true, force: true }); } catch { /* ignore */ }
	});

	describe('PostgresDriver (integration)', () => {
		it('describe returns columns + PK + FK', async () => {
			const pool = await acquirePool(repoRoot);
			const driver = await pool.acquire('live');
			const schema = await (driver as { describe: (t: string) => Promise<unknown> }).describe('users');
			const cols = (schema as { columns: { name: string; primaryKey?: boolean }[] }).columns;
			const byName = new Map(cols.map(c => [c.name, c]));
			assert.equal(byName.get('id')?.primaryKey, true);
			assert.ok(byName.has('email'));

			const postsSchema = await (driver as { describe: (t: string) => Promise<unknown> }).describe('posts');
			const fk = (postsSchema as { columns: { name: string; foreignKey?: { table: string; column: string } }[] })
				.columns.find(c => c.name === 'user_id')?.foreignKey;
			assert.deepEqual(fk, { table: 'users', column: 'id' });
		});

		it('sample returns rows + respects WHERE + limit', async () => {
			const pool = await acquirePool(repoRoot);
			const driver = await pool.acquire('live');
			const res = await (driver as { sample: (t: string, o: unknown) => Promise<unknown> }).sample(
				'posts',
				{ limit: 10, where: [{ column: 'user_id', op: '=', value: 1 }] },
			);
			const rows = (res as { rows: { id: number }[] }).rows;
			assert.equal(rows.length, 2);
		});

		it('explain returns a plan string', async () => {
			const pool = await acquirePool(repoRoot);
			const driver = await pool.acquire('live');
			const result = await (driver as { explain: (q: unknown) => Promise<unknown> }).explain({
				kind: 'select', target: 'users',
			});
			assert.ok(typeof (result as { plan: string }).plan === 'string');
			assert.ok((result as { plan: string }).plan.length > 0);
		});

		it('rejects unknown column in where', async () => {
			const pool = await acquirePool(repoRoot);
			const driver = await pool.acquire('live');
			await assert.rejects(
				(driver as { sample: (t: string, o: unknown) => Promise<unknown> }).sample(
					'users',
					{ limit: 10, where: [{ column: 'nope', op: '=', value: 1 }] },
				),
				/unknown column 'nope'/,
			);
		});
	});
}
