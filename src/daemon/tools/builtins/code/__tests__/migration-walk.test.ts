/**
 * Tests for `code_migration_walk` (code-analyzer-skills.md Phase 0.5).
 *
 * Coverage:
 *   - Pure SQL DDL parser: CREATE TABLE / DROP TABLE / ALTER TABLE
 *     (ADD / DROP / RENAME) / CREATE INDEX / DROP INDEX, plus
 *     `execute_raw` fallback for unrecognised statements
 *   - Pure Rails DSL parser: create_table block / inline t.string
 *     fields / add_column / remove_column / rename_column /
 *     rename_table / add_index / remove_index
 *   - End-to-end against tmpdir repos:
 *       - prisma-migrate mode reads migration.sql files in
 *         lex-order
 *       - rails mode reads .rb files in lex-order
 *       - auto mode picks the first detected tool
 *       - empty repo -> { detected: false, migrations: [] }
 *       - missing repoPath -> success: false
 *       - unknown tool value -> success: false
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync, mkdirSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { _resetRegistryForTests, getTool } from '../../../registry.js';
import { registerCodeMigrationWalkTool } from '../migration-walk.js';
import { extractDdlOps } from '../migration/sql.js';
import { extractRubyOps } from '../migration/rails.js';
import type { Tool, ToolDeps, ToolResult } from '../../../types.js';

// ---------------------------------------------------------------------------
// Pure parser: SQL DDL
// ---------------------------------------------------------------------------

test('extractDdlOps: CREATE TABLE -> create_table with table name', () => {
	const ops = extractDdlOps(`CREATE TABLE "users" (id INT PRIMARY KEY, email TEXT NOT NULL);`);
	assert.equal(ops.length, 1);
	assert.equal(ops[0]!.kind, 'create_table');
	assert.equal(ops[0]!.table, 'users');
});

test('extractDdlOps: DROP TABLE IF EXISTS -> drop_table', () => {
	const ops = extractDdlOps('DROP TABLE IF EXISTS "old_orders";');
	assert.equal(ops[0]!.kind, 'drop_table');
	assert.equal(ops[0]!.table, 'old_orders');
});

test('extractDdlOps: ALTER TABLE ADD COLUMN -> add_column with type + nullable + default', () => {
	const ops = extractDdlOps(`ALTER TABLE "users" ADD COLUMN "status" TEXT NOT NULL DEFAULT 'open';`);
	const op = ops[0]!;
	assert.equal(op.kind, 'add_column');
	assert.equal(op.table, 'users');
	assert.equal(op.column, 'status');
	assert.equal(op.type, 'TEXT');
	assert.equal(op.nullable, false);
	assert.match(op.default ?? '', /'open'/);
});

test('extractDdlOps: ALTER TABLE DROP COLUMN', () => {
	const ops = extractDdlOps('ALTER TABLE "users" DROP COLUMN "legacy_field";');
	assert.equal(ops[0]!.kind, 'drop_column');
	assert.equal(ops[0]!.column, 'legacy_field');
});

test('extractDdlOps: ALTER TABLE RENAME TO -> rename_table', () => {
	const ops = extractDdlOps('ALTER TABLE "old" RENAME TO "new";');
	assert.equal(ops[0]!.kind, 'rename_table');
	assert.equal(ops[0]!.table, 'old');
	assert.equal(ops[0]!.column, 'new');
});

test('extractDdlOps: CREATE UNIQUE INDEX -> add_index', () => {
	const ops = extractDdlOps('CREATE UNIQUE INDEX "users_email_idx" ON "users" ("email");');
	assert.equal(ops[0]!.kind, 'add_index');
	assert.equal(ops[0]!.table, 'users');
	assert.equal(ops[0]!.column, 'users_email_idx');
});

test('extractDdlOps: unrecognised statement -> execute_raw', () => {
	const ops = extractDdlOps(`GRANT SELECT ON "users" TO "reporter";`);
	assert.equal(ops[0]!.kind, 'execute_raw');
	assert.match(ops[0]!.raw ?? '', /GRANT/);
});

test('extractDdlOps: multiple statements in one file split correctly', () => {
	const ops = extractDdlOps(
		`CREATE TABLE "users" (id INT);\nALTER TABLE "users" ADD COLUMN "email" TEXT;\n`,
	);
	assert.equal(ops.length, 2);
	assert.equal(ops[0]!.kind, 'create_table');
	assert.equal(ops[1]!.kind, 'add_column');
});

// ---------------------------------------------------------------------------
// Pure parser: Rails DSL
// ---------------------------------------------------------------------------

test('extractRubyOps: create_table block + inline t.string fields', () => {
	const ruby = `class CreateUsers < ActiveRecord::Migration[7.0]
  def change
    create_table :users do |t|
      t.string :email, null: false
      t.string :name
      t.boolean :active, default: true
      t.timestamps
    end
  end
end`;
	const ops = extractRubyOps(ruby);
	const ct = ops.find(o => o.kind === 'create_table');
	assert.ok(ct);
	assert.equal(ct!.table, 'users');

	const cols = ops.filter(o => o.kind === 'add_column' && o.table === 'users');
	const byName = new Map(cols.map(c => [c.column, c]));
	assert.equal(byName.get('email')?.type, 'string');
	assert.equal(byName.get('email')?.nullable, false);
	assert.equal(byName.get('active')?.default, 'true');
	// t.timestamps -> created_at + updated_at synthetic op
	assert.ok(ops.some(o => o.kind === 'add_column' && o.column === 'created_at,updated_at'));
});

test('extractRubyOps: add_column / remove_column standalone', () => {
	const ruby = `add_column :users, :status, :string, null: false, default: 'open'
remove_column :users, :legacy`;
	const ops = extractRubyOps(ruby);
	const add = ops.find(o => o.kind === 'add_column')!;
	assert.equal(add.table, 'users');
	assert.equal(add.column, 'status');
	assert.equal(add.type, 'string');
	assert.equal(add.nullable, false);
	assert.equal(add.default, "'open'");

	const drop = ops.find(o => o.kind === 'drop_column')!;
	assert.equal(drop.column, 'legacy');
});

test('extractRubyOps: rename_column / rename_table / add_index / remove_index', () => {
	const ruby = `rename_column :users, :status, :state
rename_table :old_users, :users
add_index :users, :email, unique: true
remove_index :users, :name`;
	const ops = extractRubyOps(ruby);
	assert.ok(ops.some(o => o.kind === 'rename_column' && o.column === 'status'));
	assert.ok(ops.some(o => o.kind === 'rename_table'));
	assert.ok(ops.some(o => o.kind === 'add_index'   && o.column === 'email'));
	assert.ok(ops.some(o => o.kind === 'drop_index'  && o.column === 'name'));
});

test('extractRubyOps: comment lines are stripped before parsing', () => {
	const ruby = `# This migration creates users.
add_column :users, :email, :string`;
	const ops = extractRubyOps(ruby);
	assert.equal(ops.length, 1);
	assert.equal(ops[0]!.kind, 'add_column');
});

// ---------------------------------------------------------------------------
// End-to-end -- tool execute()
// ---------------------------------------------------------------------------

let dir: string;
let repoDir: string;
let tool: Tool;

const stubDeps = {
	session: {} as ToolDeps['session'],
	send: () => { /* drop */ },
	requestId: 0,
} as unknown as ToolDeps;

test.beforeEach(() => {
	_resetRegistryForTests();
	dir = mkdtempSync(join(tmpdir(), 'insrc-mig-walk-'));
	repoDir = join(dir, 'repo');
	mkdirSync(repoDir, { recursive: true });
	registerCodeMigrationWalkTool();
	const t = getTool('code_migration_walk');
	assert.ok(t);
	tool = t;
});

test.afterEach(() => {
	rmSync(dir, { recursive: true, force: true });
});

test('execute: missing repoPath returns 400', async () => {
	const r: ToolResult = await tool.execute({ tool: 'auto', repoPath: '' }, stubDeps);
	assert.equal(r.success, false);
	assert.match(r.error ?? '', /repoPath is required/);
});

test('execute: unknown tool returns 400 with supported list', async () => {
	const r = await tool.execute({ tool: 'sqitch', repoPath: repoDir }, stubDeps);
	assert.equal(r.success, false);
	assert.match(r.error ?? '', /unknown tool/);
});

test('execute: empty repo (no migration dirs) -> { detected: false, migrations: [] }', async () => {
	const r = await tool.execute({ tool: 'auto', repoPath: repoDir }, stubDeps);
	assert.equal(r.success, true);
	const data = r.data as Record<string, unknown>;
	assert.equal(data['detected'], false);
	assert.deepEqual(data['migrations'], []);
});

test('execute: prisma-migrate picks up migration.sql files in lex order', async () => {
	const root = join(repoDir, 'prisma', 'migrations');
	mkdirSync(join(root, '20240601120000_create_users'), { recursive: true });
	mkdirSync(join(root, '20240615133000_add_email'), { recursive: true });
	writeFileSync(join(root, '20240601120000_create_users', 'migration.sql'),
		`CREATE TABLE "users" (id INT PRIMARY KEY);`);
	writeFileSync(join(root, '20240615133000_add_email', 'migration.sql'),
		`ALTER TABLE "users" ADD COLUMN "email" TEXT NOT NULL;`);

	const r = await tool.execute({ tool: 'prisma-migrate', repoPath: repoDir }, stubDeps);
	assert.equal(r.success, true);
	const data = r.data as Record<string, unknown>;
	assert.equal(data['detected'], true);
	assert.equal(data['tool'], 'prisma-migrate');
	const migrations = data['migrations'] as Array<Record<string, unknown>>;
	assert.equal(migrations.length, 2);
	assert.equal(migrations[0]!['id'], '20240601120000');
	assert.equal(migrations[1]!['id'], '20240615133000');

	const ops0 = migrations[0]!['operations'] as Array<Record<string, unknown>>;
	assert.equal(ops0[0]!['kind'], 'create_table');
	assert.equal(ops0[0]!['table'], 'users');
});

test('execute: rails mode reads .rb files', async () => {
	const root = join(repoDir, 'db', 'migrate');
	mkdirSync(root, { recursive: true });
	writeFileSync(join(root, '20240601120000_create_users.rb'),
		`class CreateUsers < ActiveRecord::Migration[7.0]
  def change
    create_table :users do |t|
      t.string :email, null: false
    end
  end
end`);

	const r = await tool.execute({ tool: 'rails', repoPath: repoDir }, stubDeps);
	assert.equal(r.success, true);
	const data = r.data as Record<string, unknown>;
	assert.equal(data['detected'], true);
	assert.equal(data['tool'], 'rails');
	const migrations = data['migrations'] as Array<Record<string, unknown>>;
	assert.equal(migrations.length, 1);
	const ops = migrations[0]!['operations'] as Array<Record<string, unknown>>;
	assert.ok(ops.some(o => o['kind'] === 'create_table' && o['table'] === 'users'));
	assert.ok(ops.some(o => o['kind'] === 'add_column'  && o['column'] === 'email'));
});

test('execute: auto mode picks the first detected tool (registry order)', async () => {
	// Both Prisma migrate dir and Rails dir present; registry order
	// is Prisma first.
	mkdirSync(join(repoDir, 'prisma', 'migrations'), { recursive: true });
	mkdirSync(join(repoDir, 'db', 'migrate'), { recursive: true });

	const r = await tool.execute({ tool: 'auto', repoPath: repoDir }, stubDeps);
	assert.equal(r.success, true);
	const data = r.data as Record<string, unknown>;
	assert.equal(data['detected'], true);
	assert.equal(data['tool'], 'prisma-migrate');
});
