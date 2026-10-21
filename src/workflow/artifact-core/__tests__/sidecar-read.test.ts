import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { appendFileSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { FileSidecarStore } from '../sidecar-store.js';
import { HistoryReadError } from '../types.js';

const H = '2f27754d4ad00b8e';
const ID = `LLD-${H}-s4`;
const OTHER = `LLD-${H}-s5`;

function frame(record: unknown): string {
	const json = JSON.stringify(record);
	return `${Buffer.byteLength(json, 'utf8')}\t${json}\n`;
}

async function withRepo(fn: (repo: string, store: FileSidecarStore, path: string) => Promise<void>): Promise<void> {
	const repo = mkdtempSync(join(tmpdir(), 'sidecar-read-'));
	try {
		mkdirSync(join(repo, '.insrc/artifacts'), { recursive: true });
		const store = new FileSidecarStore(repo);
		await fn(repo, store, join(repo, store.filesOf(ID).log));
	} finally { rmSync(repo, { recursive: true, force: true }); }
}

describe('sidecar-read', () => {
	it('readRecords filters by artifact id, collapses repeated entries, orders by timestamp then id, skips an abandoned fragment and merge debris, and refuses a complete frame with bad json and a conflicting duplicate', async () => {
		await withRepo(async (_repo, store, path) => {
			assert.deepEqual(await store.readRecords('log', ID), [], 'a missing file is an empty list');

			const e = (id: string, timestamp: string) => ({ id, timestamp });
			writeFileSync(path, [
				frame({ artifactId: ID, entry: e('b', '2026-01-02') }),
				frame({ artifactId: OTHER, entry: e('x', '2026-01-01') }),
				'<<<<<<< HEAD\n',
				frame({ artifactId: ID, entry: e('a', '2026-01-02') }),
				'=======\n',
				'99\t{"artifactId":"torn\n',
				frame({ artifactId: ID, entry: e('c', '2026-01-01') }),
				frame({ artifactId: ID, entry: e('a', '2026-01-02') }),
				'>>>>>>> branch\n',
			].join(''));
			appendFileSync(path, '20\t{"artifactId"');
			const got = await store.readRecords<{ id: string }>('log', ID);
			assert.deepEqual(got.map(g => g.id), ['c', 'a', 'b']);

			// A complete frame holding invalid json is corruption and names the file and line.
			writeFileSync(path, frame({ artifactId: ID, entry: e('a', '1') }) + '5\tnope!\n');
			await assert.rejects(store.readRecords('log', ID), (err: Error) => err instanceof HistoryReadError && err.message.includes(`${ID}.log.jsonl:2`));

			// A complete frame that is not a record is refused as well.
			writeFileSync(path, frame([1, 2]));
			await assert.rejects(store.readRecords('log', ID), HistoryReadError);

			// The same (artifactId, entry id) with different content is a conflict.
			writeFileSync(path, frame({ artifactId: ID, entry: { id: 'a', timestamp: '1', note: 'one' } }) + frame({ artifactId: ID, entry: { id: 'a', timestamp: '1', note: 'two' } }));
			await assert.rejects(store.readRecords('log', ID), HistoryReadError);
		});
	});
});
