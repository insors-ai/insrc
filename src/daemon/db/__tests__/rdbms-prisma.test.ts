/**
 * Tests for daemon/db/drivers/rdbms-prisma.ts -- the prisma-schema
 * fast path used by RDBMS drivers' describe(). Uses a fixture
 * .prisma file in a tmp dir + asserts the SchemaDescription shape.
 */

import { describe, it, before, after, beforeEach } from 'node:test';
import { strict as assert } from 'node:assert';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import {
	_resetPrismaCacheForTests,
	prismaSchemaDescription,
} from '../drivers/rdbms-prisma.js';

const tmp = mkdtempSync(join(tmpdir(), 'insrc-rdbms-prisma-'));
const SCHEMA_PATH = join(tmp, 'schema.prisma');

const SAMPLE_SCHEMA = `
// blog.prisma -- minimal fixture
generator client { provider = "prisma-client-js" }
datasource db    { provider = "postgresql" url = env("DATABASE_URL") }

model User {
  id        Int      @id @default(autoincrement())
  email     String   @unique
  name      String?
  createdAt DateTime @default(now()) @map("created_at")
  posts     Post[]
}

model Post {
  id      Int     @id
  title   String
  body    String? @map("body_text")
  userId  Int
  user    User    @relation(fields: [userId], references: [id])

  @@map("posts")
}

model Tag {
  id   Int    @id
  name String
}

model PostTag {
  postId Int
  tagId  Int

  @@id([postId, tagId])
}
`;

before(() => {
	writeFileSync(SCHEMA_PATH, SAMPLE_SCHEMA, 'utf8');
});

beforeEach(() => {
	_resetPrismaCacheForTests();
});

after(() => {
	try { rmSync(tmp, { recursive: true, force: true }); } catch { /* ignore */ }
});

// ---------------------------------------------------------------------------

describe('prismaSchemaDescription', () => {
	it('describes a simple model by Prisma name', async () => {
		const schema = await prismaSchemaDescription('User', SCHEMA_PATH);
		assert.equal(schema.target, 'User');
		assert.equal(schema.source, 'prisma');
		const byName = new Map(schema.columns.map(c => [c.name, c]));
		assert.equal(byName.get('id')?.primaryKey, true);
		assert.equal(byName.get('id')?.type, 'integer');
		assert.equal(byName.get('email')?.nullable, false);
		assert.equal(byName.get('name')?.nullable, true);
		// `createdAt` has @map("created_at") -> column name is the SQL one.
		assert.ok(byName.has('created_at'));
		assert.equal(byName.get('created_at')?.type, 'timestamp without time zone');
	});

	it('skips relation virtual fields + emits FK on the local scalar column', async () => {
		const schema = await prismaSchemaDescription('Post', SCHEMA_PATH);
		const byName = new Map(schema.columns.map(c => [c.name, c]));
		assert.ok(!byName.has('user'), 'virtual `user` field should not be a column');
		assert.ok(byName.has('userId'), 'scalar `userId` column should be present');
		// `userId` references User (the model); User has no @@map so the
		// SQL table name == the Prisma model name.
		assert.deepEqual(byName.get('userId')?.foreignKey, { table: 'User', column: 'id' });
	});

	it('honours @@map for table name resolution (lookup by SQL name)', async () => {
		// `Post` has @@map("posts"); we should be able to describe it by
		// either its model name or the mapped table name.
		const byPrisma = await prismaSchemaDescription('Post', SCHEMA_PATH);
		const bySql = await prismaSchemaDescription('posts', SCHEMA_PATH);
		assert.deepEqual(byPrisma.columns, bySql.columns);
	});

	it('honours @map for column name overrides', async () => {
		const schema = await prismaSchemaDescription('Post', SCHEMA_PATH);
		const cols = schema.columns.map(c => c.name);
		assert.ok(cols.includes('body_text'), `expected body_text column, got: ${cols.join(', ')}`);
		assert.ok(!cols.includes('body'), 'body column should be replaced by body_text');
	});

	it('marks composite-PK columns as primaryKey:true', async () => {
		const schema = await prismaSchemaDescription('PostTag', SCHEMA_PATH);
		const byName = new Map(schema.columns.map(c => [c.name, c]));
		assert.equal(byName.get('postId')?.primaryKey, true);
		assert.equal(byName.get('tagId')?.primaryKey, true);
	});

	it('throws a typed error for an unknown target', async () => {
		await assert.rejects(
			prismaSchemaDescription('NoSuchModel', SCHEMA_PATH),
			/has no model matching target 'NoSuchModel'/,
		);
	});
});
