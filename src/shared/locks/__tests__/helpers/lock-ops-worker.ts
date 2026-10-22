/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Procix Software India. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

// Worker for lock-manager-threads.test.ts: joins the test's lock block and runs
// scripted lock operations, reporting each outcome as an event. A held lock is
// kept until a 'release' message; 'pause-at' blocks the thread at a grant
// point (Atomics.wait on a shared word) so the test can terminate it there.
import { parentPort, workerData } from 'node:worker_threads';

import { installLockManager, setLockGrantHookForTests } from '../../lock-manager.js';
import type { LockGrantPoint, LockOptions } from '../../lock-manager.js';

const { block, pause } = workerData as { block: SharedArrayBuffer; pause: SharedArrayBuffer };
const locks = installLockManager(block);

type Op =
	| { op: 'hold'; name: string; options: LockOptions }
	| { op: 'release'; name: string }
	| { op: 'probe'; name: string; mode: 'shared' | 'exclusive' }
	| { op: 'query' }
	| { op: 'nested'; outer: string; inner: string; timeoutMs: number }
	| { op: 'go'; outer: string }
	| { op: 'pause-at'; point: LockGrantPoint; name: string };

const post = (m: Record<string, unknown>): void => parentPort!.postMessage(m);
const errorOf = (e: unknown): { name: string; message: string } =>
	e instanceof Error ? { name: e.name, message: e.message } : { name: 'unknown', message: String(e) };

const releases = new Map<string, () => void>();
const gates = new Map<string, () => void>();

async function handle(m: Op): Promise<void> {
	if (m.op === 'hold') {
		try {
			await locks.request(m.name, m.options, async (lock, blockedBy) => {
				if (lock === null) { post({ event: 'refused', name: m.name, blockedBy }); return; }
				post({ event: 'granted', name: m.name, mode: lock.mode, at: Date.now() });
				await new Promise<void>(r => releases.set(m.name, r));
			});
			post({ event: 'released', name: m.name, at: Date.now() });
		} catch (e) {
			post({ event: 'error', name: m.name, error: errorOf(e) });
		}
	} else if (m.op === 'release') {
		releases.get(m.name)?.();
		releases.delete(m.name);
	} else if (m.op === 'probe') {
		const outcome = await locks.request(m.name, { mode: m.mode, ifAvailable: true }, (lock, blockedBy) => ({ granted: lock?.mode ?? null, blockedBy }));
		post({ event: 'probe', name: m.name, ...outcome });
	} else if (m.op === 'query') {
		post({ event: 'query', snapshot: locks.query() });
	} else if (m.op === 'nested') {
		await locks.request(m.outer, {}, async () => {
			post({ event: 'outer-held', outer: m.outer });
			await new Promise<void>(r => gates.set(m.outer, r));
			try {
				await locks.request(m.inner, { timeoutMs: m.timeoutMs }, () => undefined);
				post({ event: 'nested-result', outer: m.outer, outcome: 'completed' });
			} catch (e) {
				post({ event: 'nested-result', outer: m.outer, outcome: 'error', error: errorOf(e) });
			}
		});
		post({ event: 'nested-done', outer: m.outer });
	} else if (m.op === 'go') {
		gates.get(m.outer)?.();
	} else if (m.op === 'pause-at') {
		setLockGrantHookForTests((point, name) => {
			if (point !== m.point || name !== m.name) return;
			post({ event: 'paused', point });
			// Blocks this thread until the test terminates it.
			Atomics.wait(new Int32Array(pause), 0, 0);
		});
		post({ event: 'pause-armed', point: m.point });
	}
}

parentPort!.on('message', (m: Op) => { void handle(m); });
post({ event: 'ready' });
