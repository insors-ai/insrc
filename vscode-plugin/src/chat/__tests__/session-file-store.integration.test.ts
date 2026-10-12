/**
 * Story E20261012c96a97a2:S001 — the file-backed chat session store over the REAL file system.
 *
 * The unit suite (session-file-store.test.ts) runs over a recording fake. These tests run the same
 * store over node's fs in a temporary directory, and the start-up sweep of the session output
 * files with the ids the migration left in globalState.
 *
 *   npx tsx --test src/chat/__tests__/session-file-store.integration.test.ts
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { appendFileSync, mkdtempSync, readdirSync, readFileSync, rmSync, statSync, utimesSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createFileChatSessionStore, HEAD_SUFFIX, migrateChatSessionsFromMemento, nodeSessionFilesFs, ROWS_SUFFIX, type SessionFilesFs } from '../session-file-store.js';
import { createSessionOutput, sessionFileName } from '../session-output.js';
import { createMementoChatSessionStore, type MementoLike, type TranscriptEntry } from '../session-store.js';

const say = (text: string): TranscriptEntry => ({ role: 'user', text, at: '2026-02-01T00:00:00.000Z' });
const texts = (rows: readonly unknown[]): string[] => rows.map((r) => (r as { text: string }).text);
function tempDir(): string {
  return mkdtempSync(join(tmpdir(), 'insrc-chat-sessions-'));
}
const diskRows = (path: string): unknown[] => readFileSync(path, 'utf8').split('\n').filter((l) => l !== '').map((l) => JSON.parse(l) as unknown);

test('over a real temporary directory with two store instances on one session: each appends, then the first saves its held object twice more with a get between; the rows file holds every row of both, was never replaced, and a torn last line written by hand is dropped and cut back', () => {
  const dir = tempDir();
  try {
    const root = join(dir, 'not-made-yet'); // the store makes its directory
    const a = createFileChatSessionStore({ root }); // this window
    const b = createFileChatSessionStore({ root }); // another window
    const held = a.draft('claude');
    held.transcript.push(say('a1'), say('a2 with ünïcödé ✓ and a\nnewline'));
    a.save(held);
    const rowsFile = join(root, `${sessionFileName(held.id)}${ROWS_SUFFIX}`);
    const headFile = join(root, `${sessionFileName(held.id)}${HEAD_SUFFIX}`);
    const inode = statSync(rowsFile).ino;
    assert.deepEqual(readdirSync(root).sort(), [`${sessionFileName(held.id)}${HEAD_SUFFIX}`, `${sessionFileName(held.id)}${ROWS_SUFFIX}`].sort(), 'two files, no temporary file left behind');

    // Each appends.
    const theirs = b.get(held.id)!;
    assert.deepEqual(theirs, JSON.parse(JSON.stringify(held)), 'the other window reads an equal session');
    theirs.transcript.push(say('b1'));
    b.save(theirs);
    held.transcript.push(say('a3'));
    a.save(held);
    // The first saves its held object twice more, with a get between.
    held.title = 'renamed by the first window';
    a.save(held);
    const fresh = a.get(held.id)!;
    assert.notEqual(fresh, held);
    assert.deepEqual(texts(fresh.transcript), ['a1', 'a2 with ünïcödé ✓ and a\nnewline', 'b1', 'a3']);
    held.transcript.push(say('a4'));
    a.save(held);

    assert.deepEqual(texts(diskRows(rowsFile)), ['a1', 'a2 with ünïcödé ✓ and a\nnewline', 'b1', 'a3', 'a4'], 'every row of both, in save order');
    assert.equal(statSync(rowsFile).ino, inode, 'the rows file was appended to, never replaced');
    assert.equal((JSON.parse(readFileSync(headFile, 'utf8')) as { title: string }).title, 'renamed by the first window');
    assert.deepEqual(a.list().map((x) => [x.id, x.title]), [[held.id, 'renamed by the first window']]);

    // A crash leaves half a row at the end of the file.
    const sizeBefore = statSync(rowsFile).size;
    appendFileSync(rowsFile, '{"role":"assistant","text":"half a ro');
    const c = createFileChatSessionStore({ root });
    const read = c.get(held.id)!;
    assert.deepEqual(texts(read.transcript), ['a1', 'a2 with ünïcödé ✓ and a\nnewline', 'b1', 'a3', 'a4'], 'the torn line is dropped');
    assert.equal(statSync(rowsFile).size, sizeBefore, 'the file is cut back to the last complete line');
    read.transcript.push(say('after the crash'));
    c.save(read);
    assert.deepEqual(texts(diskRows(rowsFile)).at(-1), 'after the crash');
    assert.equal(statSync(rowsFile).ino, inode, 'still the same file');
    assert.equal(createFileChatSessionStore({ root }).get(held.id)!.transcript.length, 6);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('a session the migration kept in globalState keeps its output files through the start-up sweep', async () => {
  const dir = tempDir();
  try {
    const sessionsRoot = join(dir, 'chat-sessions');
    const outputRoot = join(dir, 'chat-output');
    // Two sessions in the old store; `stuck` cannot be migrated because its files cannot be written.
    const map = new Map<string, unknown>();
    const memento: MementoLike = { get: <T>(k: string) => map.get(k) as T | undefined, update: (k, v) => { if (v === undefined) map.delete(k); else map.set(k, v); } };
    let n = 0;
    const old = createMementoChatSessionStore({ memento, genId: () => ['moved', 'stuck'][n++]! });
    for (const id of ['moved', 'stuck']) {
      const s = old.create('claude');
      assert.equal(s.id, id);
      s.transcript.push(say(`${id} row`));
      old.save(s);
    }
    const failing: SessionFilesFs = {
      ...nodeSessionFilesFs,
      writeText: (path, data) => {
        if (path.includes('/stuck.')) throw new Error('EACCES');
        nodeSessionFilesFs.writeText(path, data);
      },
    };

    // Every session has output files a turn wrote long ago, and so does one no store knows.
    const out = createSessionOutput({ root: outputRoot });
    for (const id of ['moved', 'stuck', 'orphan']) await out.beginTurn(id, 't1');
    const longAgo = (Date.now() - 40 * 24 * 3600 * 1000) / 1000;
    for (const f of readdirSync(outputRoot)) utimesSync(join(outputRoot, f), longAgo, longAgo);

    // What extension.ts does at start: migrate, build the store, sweep with both sets of ids.
    const warns: string[] = [];
    const migrated = migrateChatSessionsFromMemento({ memento, root: sessionsRoot, fs: failing, logger: { warn: (m) => warns.push(m) } });
    assert.deepEqual(migrated, { migrated: 1, kept: ['stuck'] });
    assert.ok(map.has('insrc.chat.session.stuck'), 'the kept session is still in globalState');
    assert.ok(warns.some((w) => /stuck/.test(w) && /EACCES/.test(w)));
    const store = createFileChatSessionStore({ root: sessionsRoot });
    assert.deepEqual(texts(store.get('moved')!.transcript), ['moved row']);
    // The kept session is not in the file store, so the store's list alone would not protect it.
    assert.deepEqual(store.list().map((c) => c.id), ['moved']);
    await out.sweep({ olderThanMs: 30 * 24 * 3600 * 1000, keep: new Set([...store.list().map((c) => c.id), ...migrated.kept]) });
    const left = readdirSync(outputRoot);
    assert.ok(left.some((f) => f.startsWith('moved.')), 'a migrated session keeps its output files');
    assert.ok(left.some((f) => f.startsWith('stuck.')), 'a session kept in globalState keeps its output files');
    assert.equal(left.some((f) => f.startsWith('orphan.')), false, 'a session no store knows is swept');

    // The same sweep with the store's ids alone removes them: the kept ids are what protect them.
    await out.sweep({ olderThanMs: 30 * 24 * 3600 * 1000, keep: new Set(store.list().map((c) => c.id)) });
    assert.equal(readdirSync(outputRoot).some((f) => f.startsWith('stuck.')), false);
    // Once the fault is gone, the next start migrates it.
    assert.deepEqual(migrateChatSessionsFromMemento({ memento, root: sessionsRoot }), { migrated: 1, kept: [] });
    assert.deepEqual(texts(createFileChatSessionStore({ root: sessionsRoot }).get('stuck')!.transcript), ['stuck row']);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
