/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Procix Software India. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

// Worker for worker-stores.test.ts. With `declare`, it starts as a daemon
// worker (startDaemonWorker) and uses the stores at their default paths, as a
// daemon thread does; without it, it is a thread of a process that never
// declared itself the owner. Each message runs one scripted operation and
// answers with its outcome.
import { parentPort, workerData } from 'node:worker_threads';
import type { MessagePort } from 'node:worker_threads';

import { ConfigStore } from '../../../../config/store.js';
import { loadLocalProviderConfig } from '../../../../config/local.js';
import { upsertEntities } from '../../../../db/entities.js';
import { getGraphStore, withWriteTxn } from '../../../../db/graph/store.js';
import { getArtifactById, upsertArtifactVec } from '../../../../db/lance/artifact-vec.js';
import { getLanceConn } from '../../../../db/lance/conn.js';
import { getLockManager } from '../../../../shared/locks/lock-manager.js';
import type { ConfigEntry, Entity } from '../../../../shared/types.js';
import { startDaemonWorker } from '../../worker-entry.js';

const { declare, guardBlock, lockBlock, hubPort } = workerData as { declare: boolean; guardBlock?: SharedArrayBuffer; lockBlock?: SharedArrayBuffer; hubPort?: MessagePort };
if (declare) startDaemonWorker({ guardBlock: guardBlock!, lockBlock: lockBlock!, hubPort: hubPort! });

const DIM = loadLocalProviderConfig().embeddingDim;
const vec = (seed: number): number[] => Array.from({ length: DIM }, (_, i) => Math.sin(seed * (i + 1) * 0.001) * 0.1);

function entity(repo: string, name: string, seed: number): Entity {
	return {
		id: `${seed.toString(16).padStart(8, '0')}${'e'.repeat(24)}`, kind: 'function', name, language: 'typescript',
		repoId: 1, repo, file: `${repo}/src/${name}.ts`, startLine: 1, endLine: 2, body: `function ${name}() {}`,
		embedding: vec(seed), embeddingModel: 'test-embed', indexedAt: '2026-10-21T00:00:00.000Z',
	};
}

function configEntry(id: string): ConfigEntry {
	return {
		id, scope: { kind: 'global' }, namespace: 'common', category: 'feedback', language: 'all', name: id, filePath: `/tmp/${id}.md`,
		body: `body of ${id}`, tags: [], updatedAt: '2026-10-21T00:00:00.000Z', contentHash: id, embedding: [],
	};
}

type Op =
	| { op: 'upsert'; repo: string; batches: number; batchSize: number }
	| { op: 'write-config-and-artifact'; tag: string }
	| { op: 'read-config-and-artifact'; tags: string[] }
	| { op: 'throwing-txn' }
	| { op: 'open-live' }
	| { op: 'lock-probe'; name: string }
	| { op: 'hold-write-txn'; ms: number };

const errorOf = (e: unknown): { name: string; message: string } =>
	e instanceof Error ? { name: e.name, message: e.message } : { name: 'unknown', message: String(e) };

parentPort!.on('message', async (m: Op) => {
	try {
		if (m.op === 'upsert') {
			// One LMDB transaction per batch; each batch's vectors go to Lance after its commit.
			for (let b = 0; b < m.batches; b++) {
				const batch = Array.from({ length: m.batchSize }, (_, i) => entity(m.repo, `f${b}_${i}`, 1 + b * m.batchSize + i));
				await upsertEntities(null, batch);
			}
			parentPort!.postMessage({ op: m.op, ok: true });
		} else if (m.op === 'write-config-and-artifact') {
			await new ConfigStore(null).upsertEntry(configEntry(`cfg-${m.tag}`));
			await upsertArtifactVec({
				id: `art-${m.tag}`, embedding: vec(7), session_id: 's', intent: 'i', skill_id: 'k',
				timestamp: 1n, path: `/tmp/${m.tag}`, preview: m.tag,
			});
			parentPort!.postMessage({ op: m.op, ok: true });
		} else if (m.op === 'read-config-and-artifact') {
			const configs: string[] = [];
			const artifacts: string[] = [];
			for (const tag of m.tags) {
				const c = await new ConfigStore(null).getEntry(`cfg-${tag}`);
				if (c !== null) configs.push(c.body);
				const a = await getArtifactById(`art-${tag}`);
				if (a !== null) artifacts.push(a.preview);
			}
			parentPort!.postMessage({ op: m.op, ok: true, configs, artifacts });
		} else if (m.op === 'throwing-txn') {
			try {
				await withWriteTxn(s => {
					s.meta.put('ac4-meta', 'written-then-thrown');
					s.configEntry.put('ac4-config', Buffer.from('written-then-thrown'));
					throw new Error('the callback fails after writing');
				});
				parentPort!.postMessage({ op: m.op, ok: false, message: 'withWriteTxn resolved' });
			} catch (e) {
				parentPort!.postMessage({ op: m.op, ok: true, thrown: errorOf(e) });
			}
		} else if (m.op === 'lock-probe') {
			// An ifAvailable exclusive request on this worker's installed lock manager.
			const outcome = await getLockManager().request(m.name, { ifAvailable: true }, (lock, blockedBy) => ({
				granted: lock?.mode ?? null,
				blockedBy: blockedBy.map(b => ({ mode: b.mode, threadId: b.threadId })),
			}));
			parentPort!.postMessage({ op: m.op, ok: true, ...outcome });
		} else if (m.op === 'hold-write-txn') {
			// An LMDB write transaction kept open for `ms` (this thread is blocked meanwhile).
			const s = await getGraphStore();
			parentPort!.postMessage({ op: m.op, started: true });
			s.root.transactionSync(() => {
				s.meta.put('held-write-txn', Buffer.from([1]));
				const end = Date.now() + m.ms;
				while (Date.now() < end) { /* the transaction stays open */ }
			});
			parentPort!.postMessage({ op: m.op, ok: true });
		} else if (m.op === 'open-live') {
			const graph = await getGraphStore().then(() => null, errorOf);
			const lance = await getLanceConn().then(() => null, errorOf);
			parentPort!.postMessage({ op: m.op, ok: true, graph, lance });
		}
	} catch (e) {
		parentPort!.postMessage({ op: m.op, ok: false, ...errorOf(e) });
	}
});
parentPort!.postMessage({ op: 'ready', ok: true });
// Started by a supervisor (maintenance.test.ts), which waits for this.
if ((workerData as { supervised?: boolean }).supervised === true) parentPort!.postMessage('worker-ready');
