import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, writeFileSync } from 'node:fs';

import { artifactJsonPath, writeArtifact } from '../../storage.js';
import { History } from '../history.js';
import { LifecycleConflictError } from '../types.js';
import type { IntegrityReason } from '../types.js';
import { H, alice, artifact, bob, kit } from './store-kit.js';
import { service, stubEvidence } from './lifecycle-kit.js';

const ID = `PLAN-${H}-s1`;

function editHead(repo: string, id: string, edit: (head: { meta: { lifecycle: { revision: { number: number; contentHash: string } } }; body: unknown }) => void): void {
	const path = artifactJsonPath(repo, id);
	const head = JSON.parse(readFileSync(path, 'utf8'));
	edit(head);
	writeFileSync(path, JSON.stringify(head, null, 2) + '\n');
}

describe('LifecycleService.apply integrity', () => {
	it('apply refuses approve, review and complete on each Integrity reason and writes nothing, while unhashed and unlogged heads are approved normally', async () => {
		const k = kit();
		try {
			const svc = service(k, stubEvidence([]));
			await k.store.write(artifact(`DEF-${H}`), alice);
			const reasons: Record<IntegrityReason, (id: string) => Promise<void>> = {
				'hash-mismatch': async id => editHead(k.repo, id, h => { h.body = { text: 'edited by hand' }; }),
				'head-ahead-of-log': async id => editHead(k.repo, id, h => { h.meta.lifecycle.revision.number = 5; }),
				'log-ahead-of-head': async id => new History(k.sidecar).appendLog(id, { id: 'e-ahead', actor: bob, timestamp: 't', operation: 'update', revision: { number: 3, contentHash: H } }),
			};
			let n = 0;
			for (const [reason, damage] of Object.entries(reasons) as [IntegrityReason, (id: string) => Promise<void>][]) {
				const id = `PLAN-${H}-s${++n + 2}`;
				await k.store.write(artifact(id), alice);
				await damage(id);
				const before = { bytes: readFileSync(artifactJsonPath(k.repo, id), 'utf8'), log: (await new History(k.sidecar).log(id)).length };
				const review = { reviewer: bob, party: 'controller' as const, verdict: 'pass' as const, counts: {} };
				for (const op of ['approve', 'review', 'complete'] as const) {
					await assert.rejects(
						svc.apply(id, op, bob, op === 'review' ? { review } : {}),
						(e: unknown) => e instanceof LifecycleConflictError && e.reason === reason && e.artifactId === id,
						`${op} on ${reason}`,
					);
				}
				assert.equal(readFileSync(artifactJsonPath(k.repo, id), 'utf8'), before.bytes, `${reason}: the head is untouched`);
				assert.equal((await new History(k.sidecar).log(id)).length, before.log, `${reason}: nothing was logged`);
			}

			// the store refuses every ordinary write on a conflicted head, so an operation that needs no integrity check is refused there
			await assert.rejects(svc.apply(`PLAN-${H}-s3`, 'withdraw', bob, { reason: 'not needed' }), LifecycleConflictError);

			// a head with no stored hash is approved normally
			await k.store.write(artifact(ID), alice);
			editHead(k.repo, ID, h => { h.meta.lifecycle.revision.contentHash = ''; });
			const unhashed = await svc.apply(ID, 'approve', bob);
			assert.equal(unhashed.lifecycle.status, 'approved');
			assert.deepEqual(unhashed.entry.status, { from: 'draft', to: 'approved' });
			assert.equal(unhashed.entry.operation, 'approve');
			assert.equal(unhashed.recorded, true);

			// a head whose log holds no revision-bearing entry (written outside the store, so nothing was logged) is approved normally
			const raw = `PLAN-${H}-s9`;
			writeArtifact(artifactJsonPath(k.repo, raw), {
				meta: { workflow: 'plan', envelope: { description: 'd', references: [], attachments: [] }, lifecycle: { status: 'draft', revision: { number: 0, contentHash: '', at: '', by: alice }, signoffs: [] } },
				body: { text: 'one' }, citations: [],
			}, 'content');
			assert.equal((await new History(k.sidecar).log(raw)).length, 0);
			const approved = await svc.apply(raw, 'approve', bob, { override: { reason: 'no log baseline' } });
			assert.equal(approved.lifecycle.approval?.override?.reason, 'no log baseline');
			assert.deepEqual(approved.entry.outcome, { result: 'override', summary: 'no log baseline' });
			assert.deepEqual(approved.entry.status, { from: 'draft', to: 'approved' });
		} finally { k.done(); }
	});
});
