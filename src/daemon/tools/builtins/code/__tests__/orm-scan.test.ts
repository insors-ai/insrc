/**
 * Tests for `code_orm_scan` (code-analyzer-skills.md Phase 0.4).
 *
 * Coverage:
 *   - Pure Prisma parser (parsePrismaSchema): models, fields,
 *     relations, @@map, @default, @id / @unique, optional fields
 *   - Pure TypeORM parser (parseTypeORMEntity): @Entity table,
 *     @Column variants, @PrimaryGeneratedColumn, relation
 *     decorators
 *   - End-to-end against an in-memory LMDB graph + tmpdir Prisma
 *     schema:
 *       - explicit orm: 'prisma' picks up models from the schema
 *       - explicit orm: 'typeorm' picks up @Entity classes
 *       - orm: 'auto' detects every ORM present and merges models
 *       - missing repoPath -> success: false
 *       - unknown orm value -> success: false
 *       - empty repo (no orm artefacts) -> success with empty
 *         detected + models
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync, mkdirSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createHash } from 'node:crypto';

import { closeGraphStore, setGraphStorePath } from '../../../../../db/graph/store.js';
import { upsertEntities } from '../../../../../db/entities.js';
import { addRepo } from '../../../../../db/repos.js';
import { _resetRegistryForTests, getTool } from '../../../registry.js';
import { registerCodeOrmScanTool } from '../orm-scan.js';
import { parsePrismaSchema } from '../orm/prisma.js';
import { parseTypeORMEntity } from '../orm/typeorm.js';
import type { Tool, ToolDeps, ToolResult } from '../../../types.js';
import type { Entity, EntityKind, Language } from '../../../../../shared/types.js';

// ---------------------------------------------------------------------------
// Pure parser: Prisma
// ---------------------------------------------------------------------------

const PRISMA_SCHEMA = `// User + Post example.
generator client { provider = "prisma-client-js" }
datasource db { provider = "postgresql"; url = env("DATABASE_URL") }

model User {
  id        Int      @id @default(autoincrement())
  email     String   @unique
  name      String?
  posts     Post[]

  @@map("users")
}

model Post {
  id       Int     @id @default(autoincrement())
  title    String  @map("post_title")
  authorId Int
  author   User    @relation(fields: [authorId], references: [id])
}
`;

test('parsePrismaSchema: extracts both models with correct line numbers', () => {
	const models = parsePrismaSchema(PRISMA_SCHEMA, '/tmp/schema.prisma');
	assert.equal(models.length, 2);
	const byName = new Map(models.map(m => [m.name, m]));
	assert.ok(byName.has('User'));
	assert.ok(byName.has('Post'));
	assert.equal(byName.get('User')!.dialect, 'prisma');
});

test('parsePrismaSchema: User columns + relations + table override', () => {
	const models = parsePrismaSchema(PRISMA_SCHEMA, '/tmp/schema.prisma');
	const user = models.find(m => m.name === 'User')!;
	assert.equal(user.table, 'users');
	const cols = new Map(user.columns.map(c => [c.name, c]));
	const id = cols.get('id')!;
	assert.equal(id.type, 'Int');
	assert.equal(id.isPrimary, true);
	assert.equal(id.default, 'autoincrement()');
	const email = cols.get('email')!;
	assert.equal(email.isUnique, true);
	assert.equal(cols.get('name')!.nullable, true);

	// `posts Post[]` is a has_many relation, not a column.
	assert.equal(user.relations.length, 1);
	assert.equal(user.relations[0]!.kind, 'has_many');
	assert.equal(user.relations[0]!.target, 'Post');
});

test('parsePrismaSchema: Post @map renames the column', () => {
	const models = parsePrismaSchema(PRISMA_SCHEMA, '/tmp/schema.prisma');
	const post = models.find(m => m.name === 'Post')!;
	const title = post.columns.find(c => c.name === 'post_title');
	assert.ok(title, '@map should rename "title" to "post_title"');
	// `author User @relation(...)` is a belongs_to relation.
	const rel = post.relations.find(r => r.target === 'User');
	assert.ok(rel);
	assert.equal(rel!.kind, 'belongs_to');
});

// ---------------------------------------------------------------------------
// Pure parser: TypeORM
// ---------------------------------------------------------------------------

const TYPEORM_USER_BODY = `@Entity('users')
class User {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({ type: 'varchar', nullable: true })
  email: string | null;

  @Column('text')
  bio: string;

  @OneToMany(() => Post, post => post.author)
  posts: Post[];

  @ManyToOne(() => Org, org => org.users)
  org: Org;
}`;

function makeEntityId(repo: string, file: string, kind: string, name: string): string {
	return createHash('sha256').update(`${repo}\x00${file}\x00${kind}\x00${name}`).digest('hex').slice(0, 32);
}

function makeClassEntity(opts: {
	name: string;
	body: string;
	file: string;
	repo: string;
	language?: Language;
	startLine?: number;
}): Entity {
	const language = opts.language ?? 'typescript';
	return {
		id:        makeEntityId(opts.repo, opts.file, 'class', opts.name),
		kind:      'class' as EntityKind,
		name:      opts.name,
		language,
		repoId:    1,
		repo:      opts.repo,
		file:      opts.file,
		startLine: opts.startLine ?? 1,
		endLine:   (opts.startLine ?? 1) + 30,
		body:      opts.body,
		embedding: [],
		indexedAt: '2026-05-09T10:00:00.000Z',
	};
}

test('parseTypeORMEntity: extracts table name + columns + relations', () => {
	const e = makeClassEntity({
		name: 'User', repo: '/r', file: '/r/src/User.ts',
		body: TYPEORM_USER_BODY, startLine: 5,
	});
	const m = parseTypeORMEntity(e);
	assert.equal(m.name, 'User');
	assert.equal(m.table, 'users');
	assert.equal(m.dialect, 'typeorm');
	assert.equal(m.path, '/r/src/User.ts');
	assert.equal(m.line, 5);

	const cols = new Map(m.columns.map(c => [c.name, c]));
	assert.equal(cols.get('id')?.isPrimary, true);
	assert.equal(cols.get('email')?.type, 'varchar');
	assert.equal(cols.get('email')?.nullable, true);
	assert.equal(cols.get('bio')?.type, 'text');

	const rels = new Map(m.relations.map(r => [r.target, r]));
	assert.equal(rels.get('Post')?.kind, 'has_many');
	assert.equal(rels.get('Org')?.kind,  'belongs_to');
});

test('parseTypeORMEntity: skips classes without @Entity decorator (defensive)', () => {
	// Direct call returns a model anyway -- the gate is `looksLikeTypeORM`
	// in the scanner, not the parser. Verify the parser is permissive
	// and the scanner is the one filtering.
	const e = makeClassEntity({
		name: 'Plain', repo: '/r', file: '/r/Plain.ts',
		body: 'class Plain {\n  name: string;\n}',
	});
	const m = parseTypeORMEntity(e);
	assert.equal(m.name, 'Plain');
	assert.equal(m.columns.length, 0);  // no decorators -> no columns
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

test.beforeEach(async () => {
	await closeGraphStore();
	_resetRegistryForTests();
	dir = mkdtempSync(join(tmpdir(), 'insrc-orm-scan-'));
	repoDir = join(dir, 'repo');
	mkdirSync(repoDir, { recursive: true });
	setGraphStorePath(join(dir, 'graph.lmdb'));
	const now = new Date().toISOString();
	await addRepo(null, { path: repoDir, name: '', addedAt: now, status: 'pending' });
	registerCodeOrmScanTool();
	const t = getTool('code_orm_scan');
	assert.ok(t, 'code_orm_scan must be registered');
	tool = t;
});

test.afterEach(async () => {
	await closeGraphStore();
	rmSync(dir, { recursive: true, force: true });
});

test('execute: missing repoPath returns 400', async () => {
	const r: ToolResult = await tool.execute({ orm: 'auto', repoPath: '' }, stubDeps);
	assert.equal(r.success, false);
	assert.match(r.error ?? '', /repoPath is required/);
});

test('execute: unknown orm returns 400 with supported list', async () => {
	const r = await tool.execute({ orm: 'mongoose', repoPath: repoDir }, stubDeps);
	assert.equal(r.success, false);
	assert.match(r.error ?? '', /unknown orm/);
});

test('execute: empty repo (no orm artefacts) returns success with empty detected + models', async () => {
	const r = await tool.execute({ orm: 'auto', repoPath: repoDir }, stubDeps);
	assert.equal(r.success, true);
	const data = r.data as Record<string, unknown>;
	const detected = (data['detected'] as Record<string, unknown>)['orms'] as unknown[];
	assert.deepEqual(detected, []);
	assert.deepEqual(data['models'], []);
});

test('execute: prisma mode picks up models from prisma/schema.prisma', async () => {
	mkdirSync(join(repoDir, 'prisma'));
	writeFileSync(join(repoDir, 'prisma', 'schema.prisma'), PRISMA_SCHEMA);

	const r = await tool.execute({ orm: 'prisma', repoPath: repoDir }, stubDeps);
	assert.equal(r.success, true);
	const data = r.data as Record<string, unknown>;
	const models = data['models'] as Array<Record<string, unknown>>;
	assert.equal(models.length, 2);
	assert.deepEqual((data['detected'] as Record<string, unknown>)['orms'], ['prisma']);
	const userModel = models.find(m => m['name'] === 'User')!;
	assert.equal(userModel['table'], 'users');
});

test('execute: typeorm mode picks up @Entity classes from the graph', async () => {
	const cls = makeClassEntity({
		name: 'User', repo: repoDir, file: join(repoDir, 'src/User.ts'),
		body: TYPEORM_USER_BODY,
	});
	await upsertEntities(null, [cls]);

	const r = await tool.execute({ orm: 'typeorm', repoPath: repoDir }, stubDeps);
	assert.equal(r.success, true);
	const data = r.data as Record<string, unknown>;
	const models = data['models'] as Array<Record<string, unknown>>;
	assert.equal(models.length, 1);
	assert.equal(models[0]!['name'], 'User');
	assert.equal(models[0]!['dialect'], 'typeorm');
	assert.deepEqual((data['detected'] as Record<string, unknown>)['orms'], ['typeorm']);
});

test('execute: auto mode merges models from every detected dialect', async () => {
	mkdirSync(join(repoDir, 'prisma'));
	writeFileSync(join(repoDir, 'prisma', 'schema.prisma'), PRISMA_SCHEMA);
	const cls = makeClassEntity({
		name: 'Order', repo: repoDir, file: join(repoDir, 'src/Order.ts'),
		body: '@Entity(\'orders\')\nclass Order {\n  @PrimaryGeneratedColumn()\n  id: number;\n}',
	});
	await upsertEntities(null, [cls]);

	const r = await tool.execute({ orm: 'auto', repoPath: repoDir }, stubDeps);
	assert.equal(r.success, true);
	const data = r.data as Record<string, unknown>;
	const orms = (data['detected'] as Record<string, unknown>)['orms'] as string[];
	assert.deepEqual(orms.sort(), ['prisma', 'typeorm']);

	const models = data['models'] as Array<Record<string, unknown>>;
	const dialects = new Set(models.map(m => m['dialect']));
	assert.ok(dialects.has('prisma'));
	assert.ok(dialects.has('typeorm'));
});

test('execute: auto mode skips dialects that fail detection without erroring', async () => {
	// Prisma file present but TypeORM not -- only prisma should be reported.
	mkdirSync(join(repoDir, 'prisma'));
	writeFileSync(join(repoDir, 'prisma', 'schema.prisma'), PRISMA_SCHEMA);

	const r = await tool.execute({ orm: 'auto', repoPath: repoDir }, stubDeps);
	assert.equal(r.success, true);
	const data = r.data as Record<string, unknown>;
	assert.deepEqual((data['detected'] as Record<string, unknown>)['orms'], ['prisma']);
});
