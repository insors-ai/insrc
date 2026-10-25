/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Procix Software India. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

// Worker for cross-thread-stores.test.ts: runs one DuckDB query through
// withConnection that holds its connection for holdMs, and reports when it ran.
import { parentPort, workerData } from 'node:worker_threads';

import { withConnection } from '../../../daemon/db/duckdb-pool.js';
import { installStoreGuard } from '../../store-guard.js';

const { block, holdMs, value } = workerData as { block: SharedArrayBuffer; holdMs: number; value: number };
installStoreGuard(block);
try {
	const out = await withConnection(async (conn) => {
		const start = Date.now();
		const reader = await conn.runAndReadAll(`SELECT ${value}::INTEGER AS v`);
		await new Promise(r => setTimeout(r, holdMs));
		return { start, end: Date.now(), v: (reader.getRowObjects()[0] as { v: number }).v };
	});
	parentPort!.postMessage({ ok: true, ...out });
} catch (e) {
	parentPort!.postMessage({ ok: false, message: (e as Error).message });
}
