import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { appendFileSync, mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { appendSidecarLine, frameSidecarLine, MAX_SIDECAR_ENTRY_BYTES } from '../sidecar.js';
import { FileSidecarStore } from '../sidecar-store.js';
import { HistoryEntryError } from '../types.js';

const ID = 'LLD-0123456789abcdef-s4';

function withDir(fn: (dir: string) => void): void {
	const dir = mkdtempSync(join(tmpdir(), 'sidecar-append-'));
	try { fn(dir); } finally { rmSync(dir, { recursive: true, force: true }); }
}

/** Split a framed line into its declared length and json. */
function parse(line: string): { len: number; json: string } {
	const tab = line.indexOf('\t');
	return { len: Number(line.slice(0, tab)), json: line.slice(tab + 1) };
}

describe('sidecar-append', () => {
	it('appendRecord writes one framed line, counts bytes for multi-byte text, starts a new line after a torn one, and refuses an oversize entry', () => {
		withDir(dir => {
			const path = join(dir, 'nested', 'a.log.jsonl');
			appendSidecarLine(path, { artifactId: ID, entry: { id: 'e1', text: 'héllo €\n日本' } });
			const text = readFileSync(path, 'utf8');
			assert.ok(text.endsWith('\n'));
			const lines = text.split('\n');
			assert.equal(lines.length, 2, 'the escaped newline in the text stays inside the one line');
			const { len, json } = parse(lines[0] ?? '');
			assert.equal(len, Buffer.byteLength(json, 'utf8'));
			assert.ok(len > json.length, 'multi-byte text makes the byte length larger than the character count');
			assert.deepEqual(JSON.parse(json), { artifactId: ID, entry: { id: 'e1', text: 'héllo €\n日本' } });

			// A torn append leaves a fragment with no newline: the next record starts a line of its own.
			appendFileSync(path, '45\t{"artifactId":"torn');
			appendSidecarLine(path, { artifactId: ID, entry: { id: 'e2' } });
			const after = readFileSync(path, 'utf8').split('\n');
			assert.equal(after[1], '45\t{"artifactId":"torn');
			assert.equal(parse(after[2] ?? '').len, Buffer.byteLength(parse(after[2] ?? '').json, 'utf8'));
			assert.equal(after[3], '');

			// An oversize entry is refused and nothing is appended.
			const before = readFileSync(path, 'utf8');
			assert.throws(() => appendSidecarLine(path, { artifactId: ID, entry: { id: 'big', text: 'x'.repeat(MAX_SIDECAR_ENTRY_BYTES) } }), HistoryEntryError);
			assert.equal(readFileSync(path, 'utf8'), before);
			assert.throws(() => frameSidecarLine({ artifactId: ID, entry: { text: 'x'.repeat(MAX_SIDECAR_ENTRY_BYTES) } }), HistoryEntryError);
		});
	});

	it('a torn append, a later append, a re-read and a journal retry leave the entry once and the file readable', async () => {
		const dir = mkdtempSync(join(tmpdir(), 'sidecar-append-'));
		try {
			const store = new FileSidecarStore(dir);
			const path = join(dir, store.filesOf(ID).log);
			const e1 = { id: 'e1', timestamp: '2026-01-01' };
			const e2 = { id: 'e2', timestamp: '2026-01-02' };
			await store.appendRecord('log', { artifactId: ID, entry: e1 });
			// The process died part-way through the next append.
			appendFileSync(path, '77\t{"artifactId":"LLD');
			await store.appendRecord('log', { artifactId: ID, entry: e2 });
			assert.deepEqual(await store.readRecords('log', ID), [e1, e2]);
			// A re-read changes nothing; a journal retry appends the same entry again and it still counts once.
			assert.deepEqual(await store.readRecords('log', ID), [e1, e2]);
			await store.appendRecord('log', { artifactId: ID, entry: e2 });
			assert.deepEqual(await store.readRecords('log', ID), [e1, e2]);
		} finally { rmSync(dir, { recursive: true, force: true }); }
	});
});
