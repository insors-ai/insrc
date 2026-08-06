/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Procix Software India. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/**
 * sc2 (E20260806914cbf5e:S002) — daemon-side adapter integration (t4).
 *
 * Proves resolve(repo, …) discovers config files via listEntitiesForRepo AND
 * reads repo-root .env* at rest (the .env-not-indexed gotcha), matches the pure
 * core over the equivalent map, and degrades gracefully on an empty-config repo.
 *
 * Run: npx tsx --test src/indexer/target-resolution/__tests__/adapter.test.ts
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync, writeFileSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createHash } from 'node:crypto';

import { closeGraphStore, setGraphStorePath } from '../../../db/graph/store.js';
import { addRepo } from '../../../db/repos.js';
import { upsertEntities } from '../../../db/entities.js';
import type { Entity } from '../../../shared/types.js';
import { resolve, resolveAgainst, invalidateRepoConfig } from '../resolver.js';
import { buildConfigSourceMap } from '../config-sources.js';

function entId(repo: string, file: string, name: string): string {
	return createHash('sha256').update(`${repo}\x00${file}\x00config\x00${name}`).digest('hex').slice(0, 32);
}

function configEntity(repo: string, file: string, name: string): Entity {
	return {
		id: entId(repo, file, name),
		kind: 'config', name,
		language: 'dockerfile',
		repoId: 1, repo, file,
		startLine: 1, endLine: 1,
		body: '', embedding: [],
		indexedAt: '2026-08-06T10:00:00.000Z',
	};
}

let store: string;
let repo: string;

test.beforeEach(async () => {
	await closeGraphStore();
	invalidateRepoConfig();
	store = mkdtempSync(join(tmpdir(), 'insrc-sc2-store-'));
	setGraphStorePath(join(store, 'graph.lmdb'));
	repo = mkdtempSync(join(tmpdir(), 'insrc-sc2-repo-'));
});
test.afterEach(async () => {
	await closeGraphStore();
	invalidateRepoConfig();
	rmSync(store, { recursive: true, force: true });
	rmSync(repo, { recursive: true, force: true });
});

test('t4: adapter discovers a config-entity Dockerfile AND reads repo-root .env at rest; matches the pure core', async () => {
	// Dockerfile is indexed (a config entity points at it); .env is NOT indexed
	// (dropped by gitignore + IGNORE_SET) — the adapter must scan it at rest.
	writeFileSync(join(repo, 'Dockerfile'), 'FROM node:20\nENV API_HOST=api.example.com\n');
	writeFileSync(join(repo, '.env'), 'DB_HOST=db.example.com\n');

	await addRepo(null, { path: repo, name: '', addedAt: new Date().toISOString(), status: 'pending' });
	await upsertEntities(null, [configEntity(repo, join(repo, 'Dockerfile'), 'Dockerfile')]);

	// resolved from the indexed Dockerfile (docker layer)
	assert.deepEqual(await resolve(repo, 'http', '${API_HOST}/v1'), {
		resolved: true, protocol: 'http', identity: 'api.example.com/v1',
	});
	// resolved from the NOT-indexed .env, read at rest by path (envFile layer)
	assert.deepEqual(await resolve(repo, 'http', '${DB_HOST}'), {
		resolved: true, protocol: 'http', identity: 'db.example.com',
	});

	// adapter result equals resolveAgainst over the hand-built map of the same sources
	const builtMap = buildConfigSourceMap([
		{ path: join(repo, 'Dockerfile'), text: readFileSync(join(repo, 'Dockerfile'), 'utf8') },
		{ path: join(repo, '.env'), text: readFileSync(join(repo, '.env'), 'utf8') },
	]);
	assert.deepEqual(
		await resolve(repo, 'http', '${API_HOST}/v1'),
		resolveAgainst(builtMap, 'http', '${API_HOST}/v1'),
	);
	assert.deepEqual(
		await resolve(repo, 'messaging', '${MISSING_KEY}'),
		resolveAgainst(builtMap, 'messaging', '${MISSING_KEY}'),
	);
});

test('t4: an empty-config repo yields an empty map — literals pin, indirect exprs resolve unresolved, no throw', async () => {
	await addRepo(null, { path: repo, name: '', addedAt: new Date().toISOString(), status: 'pending' });

	assert.deepEqual(await resolve(repo, 'http', 'https://literal.example.com'), {
		resolved: true, protocol: 'http', identity: 'https://literal.example.com',
	});
	assert.deepEqual(await resolve(repo, 'http', '${UNDEFINED}'), {
		resolved: false, rawExpression: '${UNDEFINED}',
	});
});

test('t4: resolution never executes a config source — a Dockerfile RUN / shell is inert text', async () => {
	// A Dockerfile containing a RUN that would delete a sentinel if executed.
	const sentinel = join(repo, 'SENTINEL');
	writeFileSync(sentinel, 'present');
	writeFileSync(join(repo, 'Dockerfile'), `FROM node:20\nENV H=safe.example.com\nRUN rm -f ${sentinel}\n`);
	await addRepo(null, { path: repo, name: '', addedAt: new Date().toISOString(), status: 'pending' });
	await upsertEntities(null, [configEntity(repo, join(repo, 'Dockerfile'), 'Dockerfile')]);

	assert.deepEqual(await resolve(repo, 'http', '${H}'), {
		resolved: true, protocol: 'http', identity: 'safe.example.com',
	});
	assert.equal(readFileSync(sentinel, 'utf8'), 'present'); // RUN never executed
});
