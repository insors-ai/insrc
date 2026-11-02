/**
 * Epic c2ba6fa6, Story s9, t8 (ac2) -- SQL files defining tables and views,
 * indexed through IndexerService, store a table or view entity per
 * definition and a REFERENCES per foreign key and per relation a view selects
 * from, beside the document entity. The real full index (readers, resolver,
 * cross-file pass) over a temporary store; no embedding backend is set, so no
 * model runs. A same-file reference is stored 'extracted'; one to a table of
 * another file stays pending by name (user decision 2026-11-02).
 *
 * Run: npx tsx --test src/indexer/__tests__/sql-index.test.ts
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync, realpathSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { closeGraphStore, setGraphStorePath } from '../../db/graph/store.js';
import { useTemporaryLance } from '../../db/lance/__tests__/helpers/temp-lance.js';
import { addRepo } from '../../db/repos.js';
import { entityU64ForId, findEntitiesByFile } from '../../db/entities.js';
import { outNeighbors } from '../../db/graph/edges.js';
import { listUnresolvedRelations } from '../../db/relations.js';
import type { DbClient } from '../../db/client.js';
import { IndexQueue } from '../../daemon/queue.js';
import type { Watcher } from '../watcher.js';
import { IndexerService } from '../index.js';
import { makeEntityId } from '../parser/base.js';

useTemporaryLance();

const FILES: Record<string, string> = {
	'db/schema.sql': 'CREATE TABLE orgs (id int PRIMARY KEY);\nCREATE TABLE users (id int, org_id int REFERENCES orgs (id));\n',
	'db/views.sql':  'CREATE VIEW org_users AS SELECT u.id FROM users u JOIN orgs o ON o.id = u.org_id;\nCREATE VIEW top AS SELECT * FROM org_users;\n',
};

let store: string;
let repo: string;
test.before(async () => {
	await closeGraphStore();
	store = mkdtempSync(join(tmpdir(), 'insrc-s9-sql-store-'));
	setGraphStorePath(join(store, 'graph.lmdb'));
	repo = realpathSync(mkdtempSync(join(tmpdir(), 'insrc-s9-sql-repo-')));
	mkdirSync(join(repo, 'db'));
	for (const [f, text] of Object.entries(FILES)) writeFileSync(join(repo, f), text);
	await addRepo(null, { path: repo, name: 'sql', addedAt: '2026-11-02T00:00:00.000Z', status: 'pending' });
	const watcher = { onEvents() {}, async addRepo() {}, async removeRepo() {}, async addConfigDir() {} } as unknown as Watcher;
	await new IndexerService(null as unknown as DbClient, new IndexQueue(), watcher, undefined, 600_000).processJob({ kind: 'full', repoPath: repo });
});
test.after(async () => {
	await closeGraphStore();
	rmSync(store, { recursive: true, force: true });
	rmSync(repo, { recursive: true, force: true });
});

const at = (rel: string) => join(repo, rel);

test('s9 t8 (ac2): SQL files indexed through IndexerService store a table or view per definition beside the document, and REFERENCES per foreign key and per relation a view selects from', async () => {
	const schema = await findEntitiesByFile(null, at('db/schema.sql'));
	const views = await findEntitiesByFile(null, at('db/views.sql'));
	assert.deepEqual(schema.map(e => `${e.kind} ${e.name}`).sort(), ['document schema.sql', 'file schema.sql', 'table orgs', 'table users']);
	assert.deepEqual(views.map(e => `${e.kind} ${e.name}`).sort(), ['document views.sql', 'file views.sql', 'view org_users', 'view top']);

	const all = [...schema, ...views];
	const byU64 = new Map<number, string>();
	for (const e of all) byU64.set((await entityU64ForId(e.id))!, e.name);
	const stored: string[] = [];
	for (const e of all) {
		for (const n of await outNeighbors((await entityU64ForId(e.id))!, { kindFilter: ['REFERENCES'], withEvidence: true })) {
			stored.push(`${e.name} -> ${byU64.get(n.u64)}: ${n.evidence}`);
		}
	}
	assert.deepEqual(stored.sort(), ['top -> org_users: extracted', 'users -> orgs: extracted']);

	const pending = (await listUnresolvedRelations(null, repo)).filter(r => r.kind === 'REFERENCES')
		.map(r => `${all.find(e => e.id === r.fromEntity)?.name} -> ${r.rawTo}`).sort();
	assert.deepEqual(pending, ['org_users -> orgs', 'org_users -> users'], 'references to tables of another file stay pending by name');
	assert.ok(views.some(e => e.id === makeEntityId(repo, at('db/views.sql'), 'document', 'views.sql')));
});
