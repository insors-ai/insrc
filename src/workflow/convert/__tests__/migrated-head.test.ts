import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';

import { durableKit } from '../../artifact-core/__tests__/durable-kit.js';
import type { DurableKit } from '../../artifact-core/__tests__/durable-kit.js';
import { History } from '../../artifact-core/history.js';
import { checkHeadIntegrity, checkIntegrity } from '../../artifact-core/lifecycle.js';
import type { Actor, Lifecycle } from '../../artifact-core/types.js';
import { artifactJsonPath } from '../../storage.js';
import { backfillHead } from '../backfill.js';
import { migratedEntryId } from '../entry-ids.js';
import { writeMigratedHead } from '../migrated-head.js';
import { ConversionIncomplete } from '../types.js';
import type { ConversionDeps, ConvertedHead, RawHead } from '../types.js';

const H = 'aaaaaaaaaaaaaaaa';
const ID = `LLD-${H}-s1`;
const NOW = '2026-10-23T09:00:00.000Z';
const MIGRATION: Actor = { id: 'insrc:migration', kind: 'system', properties: {} };

const legacyHead = (meta: Record<string, unknown> = {}): RawHead => ({
	artifactId: ID,
	json: {
		meta: { workflow: 'design.story', epicHash: H, storyId: 's1', createdAt: '2026-10-20T10:00:00.000Z', revision: 3, approvedAt: '2026-10-21T10:00:00.000Z', ...meta },
		body: { goal: 'g', feedback: [{ id: 'f1' }] }, citations: [],
	},
});

interface Rig { readonly kit: DurableKit; readonly history: History; readonly deps: ConversionDeps; readonly path: string; readonly raw: RawHead; readonly converted: ConvertedHead; failAppendAt(n: number): void }

function rig(raw: RawHead = legacyHead()): Rig {
	const kit = durableKit();
	const path = artifactJsonPath(kit.repo, ID);
	mkdirSync(dirname(path), { recursive: true });
	writeFileSync(path, JSON.stringify(raw.json, null, 2) + '\n');
	const history = new History(kit.sidecar);
	let failAt = 0;
	let calls = 0;
	const real = history.appendLog.bind(history);
	history.appendLog = async (id, e) => { calls += 1; if (calls === failAt) throw new Error(`injected append failure at ${calls}`); return real(id, e); };
	const deps = { store: kit.store, history, now: () => new Date(NOW), actor: MIGRATION } as unknown as ConversionDeps;
	const converted = backfillHead({ head: raw, hasLog: false, now: NOW, actor: MIGRATION }).converted;
	return { kit, history, deps, path, raw, converted, failAppendAt: n => { failAt = n; calls = 0; } };
}

const outcome = async (r: Rig) => ({ bytes: readFileSync(r.path, 'utf8'), ids: (await r.history.log(ID)).map(e => e.id) });

describe('migrated-head', () => {
	it('migrated-head.test.ts: an approved head keeps its revision number, status and approval and a crash at each step then a rerun leaves one entry per id', async () => {
		// an uninterrupted run is the reference
		const ref = rig();
		try {
			assert.equal(await writeMigratedHead(ref.kit.repo, ref.converted, ref.deps), 'written');
			const head = JSON.parse(readFileSync(ref.path, 'utf8')) as { meta: { revision: number; lifecycle: Lifecycle }; body: Record<string, unknown>; citations: unknown[] };
			assert.equal(head.meta.revision, 3, 'meta.revision is kept');
			assert.deepEqual([head.meta.lifecycle.status, head.meta.lifecycle.revision.number, head.meta.lifecycle.approval?.at], ['approved', 3, '2026-10-21T10:00:00.000Z']);
			assert.equal(head.body['feedback'], undefined);
			const log = await ref.history.log(ID);
			assert.deepEqual(log.map(e => e.id), [migratedEntryId(ID, 'approve'), migratedEntryId(ID)]);
			const view = { description: '', payload: { body: head.body, citations: head.citations }, lifecycle: head.meta.lifecycle };
			assert.deepEqual(checkHeadIntegrity(view), { ok: true });
			assert.deepEqual(checkIntegrity(view, log), { ok: true });
			const read = await ref.kit.store.read(ID);
			assert.deepEqual([read.lifecycle.status, read.lifecycle.revision.number], ['approved', 3], 'the store reads the converted head');
			assert.equal(await writeMigratedHead(ref.kit.repo, ref.converted, ref.deps), 'unchanged', 'a repeat writes nothing');
			assert.deepEqual(await outcome(ref), { bytes: ref.converted.bytes, ids: log.map(e => e.id) });
		} finally { ref.kit.done(); }
		const expected = await (async () => { const r = rig(); try { await writeMigratedHead(r.kit.repo, r.converted, r.deps); return outcome(r); } finally { r.kit.done(); } })();

		// a crash after each step, then a rerun, gives the result of the uninterrupted run
		const steps = expected.ids.length + 1; // each append, then the head replace
		for (let crashAt = 1; crashAt <= steps; crashAt++) {
			const r = rig();
			try {
				if (crashAt <= expected.ids.length) r.failAppendAt(crashAt);
				await assert.rejects(writeMigratedHead(r.kit.repo, r.converted, r.deps, crashAt > expected.ids.length ? { beforeHeadWrite: () => { throw new Error('crash before the head replace'); } } : {}), /injected|crash/);
				assert.equal(readFileSync(r.path, 'utf8') === r.converted.bytes, false, `step ${crashAt}: the head is not replaced yet`);
				r.failAppendAt(0);
				await writeMigratedHead(r.kit.repo, r.converted, r.deps);
				const got = await outcome(r);
				assert.deepEqual(got.ids, expected.ids, `crash at step ${crashAt}: one entry per id`);
				assert.equal(got.bytes, expected.bytes, `crash at step ${crashAt}: the same bytes as an uninterrupted run`);
			} finally { r.kit.done(); }
		}
	});

	it('migrated-head.test.ts: a write that would change the revision, the status or the approval is refused and nothing is written', async () => {
		const r = rig();
		try {
			const tamper = (change: (head: { meta: Record<string, any> }) => void): ConvertedHead => {
				const head = JSON.parse(r.converted.bytes) as { meta: Record<string, any> };
				change(head);
				return { ...r.converted, bytes: JSON.stringify(head, null, 2) + '\n' };
			};
			const before = readFileSync(r.path, 'utf8');
			const cases: Array<[string, ConvertedHead, RegExp]> = [
				['a moved meta.revision', tamper(h => { h.meta['revision'] = 4; }), /meta\.revision/],
				['a moved lifecycle revision number', tamper(h => { h.meta['lifecycle'].revision.number = 4; }), /revision number/],
				['a status the stamps do not give', tamper(h => { h.meta['lifecycle'].status = 'draft'; }), /status/],
				['a head with no lifecycle', tamper(h => { delete h.meta['lifecycle']; }), /no lifecycle/],
			];
			for (const [name, converted, why] of cases) {
				await assert.rejects(writeMigratedHead(r.kit.repo, converted, r.deps), (err: unknown) => err instanceof ConversionIncomplete && why.test(err.message), name);
				assert.equal(readFileSync(r.path, 'utf8'), before, `${name}: the head is untouched`);
				assert.deepEqual((await r.history.log(ID)), [], `${name}: no entry was appended`);
			}
			// the approval of an existing lifecycle is not replaced either
			const actor: Actor = { id: 'github:alice', kind: 'person', properties: {} };
			const withLifecycle = legacyHead({ lifecycle: { status: 'approved', revision: { number: 3, contentHash: 'x', at: 'a', by: actor }, approval: { revision: 3, by: actor, at: '2026-10-21T10:00:00.000Z' }, signoffs: [] } });
			const r2 = rig(withLifecycle);
			try {
				const other = JSON.parse(r2.converted.bytes) as { meta: Record<string, any> };
				other.meta['lifecycle'].approval = { revision: 3, by: MIGRATION, at: NOW };
				await assert.rejects(writeMigratedHead(r2.kit.repo, { ...r2.converted, bytes: JSON.stringify(other, null, 2) + '\n' }, r2.deps), /approval/);
			} finally { r2.kit.done(); }
		} finally { r.kit.done(); }
	});
});
