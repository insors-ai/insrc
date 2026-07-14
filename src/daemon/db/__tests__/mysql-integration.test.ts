/**
 * MysqlDriver integration test.
 *
 *   INSRC_DB_TESTS=1
 *   INSRC_TEST_MYSQL_URL=mysql://insrc:insrc@localhost:3344/insrc_test
 */

import { describe, it, before, after } from 'node:test';
import { strict as assert } from 'node:assert';

import { configFor, skipUnless } from './integration-helpers.js';

const cfg = configFor('INSRC_TEST_MYSQL_URL');
skipUnless(cfg, 'MysqlDriver integration');

if (cfg.enabled) {
	const { createConnection } = await import('mysql2/promise');
	await import('../drivers/mysql.js');
	const { acquirePool } = await import('../pool-cache.js');
	const { connectionsPath } = await import('../config.js');
	const { mkdtempSync, rmSync } = await import('node:fs');
	const { mkdir, writeFile } = await import('node:fs/promises');
	const { tmpdir } = await import('node:os');
	const { join } = await import('node:path');

	const repoRoot = mkdtempSync(join(tmpdir(), 'insrc-mysql-int-'));
	const URL = cfg.url!;

	before(async () => {
		const conn = await createConnection({ uri: URL, multipleStatements: true });
		await conn.query(`
			DROP TABLE IF EXISTS posts;
			DROP TABLE IF EXISTS users;
			CREATE TABLE users (
				id    INT PRIMARY KEY AUTO_INCREMENT,
				email VARCHAR(255) UNIQUE NOT NULL,
				name  VARCHAR(255)
			) ENGINE=InnoDB;
			CREATE TABLE posts (
				id      INT PRIMARY KEY AUTO_INCREMENT,
				user_id INT NOT NULL,
				title   VARCHAR(255) NOT NULL,
				body    TEXT,
				CONSTRAINT fk_posts_user FOREIGN KEY (user_id) REFERENCES users(id)
			) ENGINE=InnoDB;
			INSERT INTO users (email, name) VALUES ('a@x.io','alice'),('b@x.io','bob'),('c@x.io',NULL);
			INSERT INTO posts (user_id, title, body) VALUES (1,'first','hello'),(1,'second','world'),(2,'third',NULL);
		`);
		await conn.end();

		const path = connectionsPath(repoRoot);
		await mkdir(join(path, '..'), { recursive: true });
		await writeFile(path, JSON.stringify({
			connections: [{ id: 'live', kind: 'mysql', url: URL }],
		}), 'utf8');
	});

	after(() => {
		try { rmSync(repoRoot, { recursive: true, force: true }); } catch { /* ignore */ }
	});

	describe('MysqlDriver (integration)', () => {
		it('describe returns columns + PK + FK', async () => {
			const pool = await acquirePool(repoRoot);
			const driver = await pool.acquire('live');

			const usersSchema = await (driver as { describe: (t: string) => Promise<unknown> }).describe('users');
			const usersCols = (usersSchema as { columns: { name: string; primaryKey?: boolean }[] }).columns;
			assert.equal(usersCols.find(c => c.name === 'id')?.primaryKey, true);

			const postsSchema = await (driver as { describe: (t: string) => Promise<unknown> }).describe('posts');
			const fk = (postsSchema as { columns: { name: string; foreignKey?: { table: string; column: string } }[] })
				.columns.find(c => c.name === 'user_id')?.foreignKey;
			assert.deepEqual(fk, { table: 'users', column: 'id' });
		});

		it('sample with where + limit', async () => {
			const pool = await acquirePool(repoRoot);
			const driver = await pool.acquire('live');
			const res = await (driver as { sample: (t: string, o: unknown) => Promise<unknown> }).sample(
				'posts',
				{ limit: 10, where: [{ column: 'user_id', op: '=', value: 1 }] },
			);
			assert.equal((res as { rows: unknown[] }).rows.length, 2);
		});

		it('explain returns a non-empty plan string', async () => {
			const pool = await acquirePool(repoRoot);
			const driver = await pool.acquire('live');
			const r = await (driver as { explain: (q: unknown) => Promise<unknown> }).explain({
				kind: 'select', target: 'users',
			});
			assert.ok((r as { plan: string }).plan.length > 0);
		});
	});
}
