import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';

import { durableKit } from '../../artifact-core/__tests__/durable-kit.js';
import { History } from '../../artifact-core/history.js';
import type { Actor, Attachment } from '../../artifact-core/types.js';
import { artifactJsonPath } from '../../storage.js';
import { readAttachments, readBinding } from '../../tracker/binding.js';
import { readRawHeads } from '../raw-heads.js';
import { applyUnits, unitsRule } from '../units.js';
import type { ConversionDeps } from '../types.js';

const H = 'bbbbbbbbbbbbbbbb';
const MIGRATION: Actor = { id: 'insrc:migration', kind: 'system', properties: {} };
const ref = (entityId: string) => ({ entityId, type: 'github:issue', relation: 'tracked-by' });
const attach = (n: number): Attachment => ({ target: { entityId: `o/r#${n}`, type: 'github:issue', relation: 'attached' }, revision: 1, at: `2026-10-0${n}T00:00:00.000Z` });

function put(repo: string, id: string, meta: Record<string, unknown>, body: Record<string, unknown>): void {
	const path = artifactJsonPath(repo, id);
	mkdirSync(dirname(path), { recursive: true });
	writeFileSync(path, JSON.stringify({ meta: { createdAt: '2026-10-01T00:00:00.000Z', epicCreatedAt: '2026-10-01T00:00:00.000Z', epicHash: H, revision: 1, ...meta }, body, citations: [] }, null, 2) + '\n');
}

describe('convert-units', () => {
	it('convert-units.test.ts: EPIC and STORY heads hold the bindings and attachments moved from the Define and the LLD', async () => {
		const kit = durableKit();
		try {
			const deps = { store: kit.store, history: new History(kit.sidecar), now: () => new Date(), actor: MIGRATION } as unknown as ConversionDeps;
			put(kit.repo, `DEF-${H}`, { workflow: 'define', envelope: { description: '', references: [], binding: { reference: ref('o/r#1'), createdAtRevision: 1, posted: [{ kind: 'epic-issue', at: '2026-10-02T00:00:00.000Z' }] }, attachments: [attach(1)] } },
				{ stories: [{ id: 's1', title: 'First' }, { id: 's2', title: 'Second' }, { id: 's3', title: 'Never designed' }] });
			put(kit.repo, `LLD-${H}-s1`, { workflow: 'design.story', storyId: 's1', envelope: { description: '', references: [], binding: { reference: ref('o/r#2'), createdAtRevision: 1, posted: [] }, attachments: [attach(2), attach(3)] } }, { goal: 'g' });
			put(kit.repo, `LLD-${H}-s2`, { workflow: 'design.story', storyId: 's2', envelope: { description: '', references: [], attachments: [] } }, { goal: 'g' });

			const plan = await unitsRule({ repo: kit.repo, heads: readRawHeads(kit.repo).heads });
			assert.deepEqual((plan.changes ?? []).map(c => `${c.rule} ${c.artifactId}`), [
				`create-epic EPIC-${H}`, `move-binding DEF-${H}`, `create-story STORY-${H}-s1`, `move-binding LLD-${H}-s1`, `create-story STORY-${H}-s2`, `create-story STORY-${H}-s3`,
			]);

			const lldBytes = readFileSync(artifactJsonPath(kit.repo, `LLD-${H}-s1`), 'utf8');
			const result = await applyUnits(kit.repo, deps);
			assert.deepEqual(result.created, [`EPIC-${H}`, `STORY-${H}-s1`, `STORY-${H}-s2`, `STORY-${H}-s3`]);
			assert.deepEqual(result.moved, [{ from: `DEF-${H}`, to: `EPIC-${H}` }, { from: `LLD-${H}-s1`, to: `STORY-${H}-s1` }]);

			// the EPIC and STORY heads hold the bindings and attachments, the Define and the LLD no longer do
			const epic = readBinding(kit.repo, `EPIC-${H}`);
			assert.equal(epic?.reference.entityId, 'o/r#1');
			assert.deepEqual(epic?.posted, [{ kind: 'epic-issue', at: '2026-10-02T00:00:00.000Z' }]);
			assert.deepEqual(readAttachments(kit.repo, `EPIC-${H}`), [attach(1)]);
			assert.equal(readBinding(kit.repo, `STORY-${H}-s1`)?.reference.entityId, 'o/r#2');
			assert.deepEqual(readAttachments(kit.repo, `STORY-${H}-s1`), [attach(2), attach(3)]);
			for (const id of [`DEF-${H}`, `LLD-${H}-s1`]) { assert.equal(readBinding(kit.repo, id), undefined); assert.deepEqual(readAttachments(kit.repo, id), []); }

			// an unbound LLD, and a Story nobody designed, give heads with no binding
			for (const id of [`STORY-${H}-s2`, `STORY-${H}-s3`]) { assert.equal(readBinding(kit.repo, id), undefined); assert.deepEqual(readAttachments(kit.repo, id), []); }

			// the parent chain, the draft status and the title
			const art = await kit.store.read(`STORY-${H}-s1`);
			assert.deepEqual([art.parent?.entityId, art.lifecycle.status, art.description], [`EPIC-${H}`, 'draft', 'First']);
			assert.equal((await kit.store.read(`LLD-${H}-s1`)).parent?.entityId, `STORY-${H}-s1`);
			assert.deepEqual((await kit.store.childrenOf(`EPIC-${H}`)), [`STORY-${H}-s1`, `STORY-${H}-s2`, `STORY-${H}-s3`]);
			const lld = JSON.parse(readFileSync(artifactJsonPath(kit.repo, `LLD-${H}-s1`), 'utf8')) as { meta: { revision: number }; body: unknown };
			assert.equal(lld.meta.revision, 1, 'the LLD revision does not move');
			assert.deepEqual(lld.body, JSON.parse(lldBytes).body);

			// a repeat moves nothing again and creates nothing
			const files = ['DEF', 'EPIC'].map(k => `${k}-${H}`).concat([`LLD-${H}-s1`, `STORY-${H}-s1`]);
			const before = files.map(f => readFileSync(artifactJsonPath(kit.repo, f), 'utf8'));
			const again = await applyUnits(kit.repo, deps);
			assert.deepEqual([again.created, again.moved], [[], []]);
			assert.deepEqual(files.map(f => readFileSync(artifactJsonPath(kit.repo, f), 'utf8')), before);
			assert.deepEqual((await unitsRule({ repo: kit.repo, heads: readRawHeads(kit.repo).heads })).changes, []);
		} finally { kit.done(); }
	});
});
