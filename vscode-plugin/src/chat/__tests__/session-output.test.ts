/**
 * Story E202610101d04e560:S001 — session output file unit suite.
 *
 * Run: npx tsx --test vscode-plugin/src/chat/__tests__/session-output.test.ts
 *
 * Drives createSessionOutput on a real temp directory; the test appends lines to the session
 * file itself, as the CLI does through its stdout. No vscode runtime, no child processes.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { appendFileSync, existsSync, mkdtempSync, readdirSync, readFileSync, rmSync, utimesSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createSessionOutput, nodeSessionOutputFs, parseMarker, SegmentGone, type SegmentCursor, type SessionOutputFs } from '../session-output.js';
import { tick, waitFor } from './fixtures.js';

const root = (): string => join(mkdtempSync(join(tmpdir(), 'chat-output-')), 'chat-output');
const json = (o: unknown): string => JSON.stringify(o);

/** Collects a tail into an array while it runs. */
function follow(it: AsyncIterable<{ line: string; cursor: SegmentCursor }>): { lines: string[]; cursors: SegmentCursor[]; done: Promise<void> } {
  const lines: string[] = [];
  const cursors: SegmentCursor[] = [];
  const done = (async () => {
    for await (const { line, cursor } of it) {
      lines.push(line);
      cursors.push(cursor);
    }
  })();
  return { lines, cursors, done };
}

test("a turn's segment is the lines between its turn-start and turn-end markers; tail yields only complete CLI lines with the cursor after each, skips marker lines, holds back a half-written line until its newline, and follows growth until the writer finishes", async () => {
  const out = createSessionOutput({ root: root(), pollMs: 5 });
  // An earlier, finished turn: its lines must not leak into the next segment.
  const first = await out.beginTurn('s1', 'turn-1');
  appendFileSync(first.outPath, `${json({ type: 'old' })}\n`);
  await out.endTurn('s1', 'turn-1', { code: 0, signal: null });

  const seg = await out.beginTurn('s1', 'turn-2');
  assert.equal(seg.cursor.turnId, 'turn-2');
  let finished = false;
  const f = follow(out.tail(seg.cursor, { finished: () => finished }));

  appendFileSync(seg.outPath, `${json({ type: 'a' })}\n`);
  await waitFor(() => f.lines.length === 1);
  // Half a line: held back until its newline arrives.
  appendFileSync(seg.outPath, '{"type":"b","text":"hal');
  await tick(30);
  assert.equal(f.lines.length, 1, 'a half-written line is not yielded');
  appendFileSync(seg.outPath, 'f"}\n');
  await waitFor(() => f.lines.length === 2);
  // A CLI line that only mentions the marker key inside a string is a CLI line.
  const mention = json({ type: 'assistant', text: 'the key "insrc.marker" is reserved' });
  appendFileSync(seg.outPath, `${mention}\n`);
  await waitFor(() => f.lines.length === 3);

  finished = true;
  await f.done;
  assert.deepEqual(f.lines, [json({ type: 'a' }), '{"type":"b","text":"half"}', mention], 'only this turn, only CLI lines, nothing from turn-1');
  const size = readFileSync(seg.outPath).length;
  assert.equal(f.cursors.at(-1)?.offset, size, 'the last cursor is just after the last line');
  for (const c of f.cursors) assert.equal(c.turnId, 'turn-2');

  // The file carries the markers; the reader never yielded them.
  const markers = readFileSync(seg.outPath, 'utf8').split('\n').map(parseMarker).filter((m) => m !== undefined);
  assert.deepEqual(markers.map((m) => m!.kind), ['file', 'turn-start', 'turn-end', 'turn-start']);

  // A segment ends at its own turn-end marker even if the writer is not finished.
  await out.endTurn('s1', 'turn-2', { code: 0, signal: null });
  const again = follow(out.tail(seg.cursor, { finished: () => false }));
  await again.done;
  assert.equal(again.lines.length, 3);

  // A final unterminated line is yielded once the writer has finished.
  const seg3 = await out.beginTurn('s1', 'turn-3');
  appendFileSync(seg3.outPath, '{"type":"last"}');
  const last = follow(out.tail(seg3.cursor, { finished: () => true }));
  await last.done;
  assert.deepEqual(last.lines, ['{"type":"last"}']);
});

test('tailing again from a yielded cursor resumes exactly after that line; a segment without a turn-end marker ends at the next turn-start or once the writer is finished', async () => {
  const dir = root();
  const out = createSessionOutput({ root: dir, pollMs: 5 });
  const seg = await out.beginTurn('s1', 't1');
  appendFileSync(seg.outPath, ['{"n":1}', '{"n":2}', '{"n":3}', ''].join('\n'));

  // Read two lines, stop (the reader goes away), then resume from the second cursor.
  const firstTwo: SegmentCursor[] = [];
  for await (const { cursor } of out.tail(seg.cursor, { finished: () => true })) {
    firstTwo.push(cursor);
    if (firstTwo.length === 2) break;
  }
  const resumed = follow(out.tail(firstTwo[1]!, { finished: () => true }));
  await resumed.done;
  assert.deepEqual(resumed.lines, ['{"n":3}'], 'resumes exactly after the second line');

  // The host went away: no turn-end for t1. The next turn closes it (code unknown) and
  // a reader of t1 stops at t2's turn-start.
  appendFileSync(seg.outPath, '{"n":4'); // the CLI died mid-line
  const seg2 = await out.beginTurn('s1', 't2');
  const text = readFileSync(seg2.outPath, 'utf8');
  const lines = text.split('\n');
  const closeIdx = lines.findIndex((l) => parseMarker(l)?.kind === 'turn-end');
  assert.ok(closeIdx > 0, 'the open segment was closed');
  assert.match(lines[closeIdx]!, /"turnId":"t1".*"code":null.*"unknown":true/);
  assert.equal(lines[closeIdx - 1], '{"n":4', 'the half line was terminated, not joined to the marker');

  const t1Reader = follow(out.tail(firstTwo[1]!, { finished: () => false }));
  await t1Reader.done;
  assert.deepEqual(t1Reader.lines, ['{"n":3}', '{"n":4'], 't1 ends at its (late) turn-end without waiting for the writer');

  // Without any closing marker, a segment ends at the next turn-start.
  const raw = root();
  const out2 = createSessionOutput({ root: raw, pollMs: 5 });
  const a = await out2.beginTurn('s2', 'a');
  appendFileSync(a.outPath, `{"x":1}\n${json({ 'insrc.marker': 'turn-start', turnId: 'b' })}\n{"x":2}\n`);
  const r = follow(out2.tail(a.cursor, { finished: () => false }));
  await r.done;
  assert.deepEqual(r.lines, ['{"x":1}'], 'stops at the next turn-start');

  // endTurn writes only for the open turn.
  await out.endTurn('s1', 't1', { code: 0, signal: null });
  assert.equal(readFileSync(seg2.outPath, 'utf8').split('\n').filter((l) => parseMarker(l)?.kind === 'turn-end').length, 1, 'no second turn-end for t1');
});

test('the err log keeps only the current turn, and errTail returns its end', async () => {
  const out = createSessionOutput({ root: root(), pollMs: 5 });
  const a = await out.beginTurn('s1', 'a');
  appendFileSync(a.errPath, 'first turn failed\n');
  assert.equal(out.errTail('s1'), 'first turn failed\n');
  await out.beginTurn('s1', 'b');
  assert.equal(out.errTail('s1'), '', 'truncated at the next turn');
  assert.equal(out.errTail('never-seen'), '');
});

test('the file rolls over at a turn start once past maxBytes, keeping one previous generation, and a cursor in the previous generation is still read from <sessionId>.1.ndjson', async () => {
  const dir = root();
  const warns: string[] = [];
  const out = createSessionOutput({ root: dir, pollMs: 5, maxBytes: 200, logger: { warn: (m) => warns.push(m) } });
  const big = `{"pad":"${'x'.repeat(150)}"}\n`;

  // Generation 1: a turn that grows past maxBytes. It is not split while it runs.
  const a = await out.beginTurn('s1', 'a');
  assert.equal(a.cursor.generation, 1);
  appendFileSync(a.outPath, big);
  appendFileSync(a.outPath, big);
  assert.ok(readFileSync(a.outPath).length > 200, 'past the cap mid-turn, still one file');
  await out.endTurn('s1', 'a', { code: 0, signal: null });

  // The next turn start rolls the file over: generation 2 begins, generation 1 is .1.ndjson.
  const b = await out.beginTurn('s1', 'b');
  assert.equal(b.cursor.generation, 2);
  assert.ok(existsSync(join(dir, 's1.1.ndjson')));
  const prev = readFileSync(join(dir, 's1.1.ndjson'), 'utf8');
  assert.match(prev, /"turnId":"a"/);
  assert.doesNotMatch(prev, /"turnId":"b"/, 'turn b starts in the new generation');
  assert.match(readFileSync(b.outPath, 'utf8').split('\n')[0]!, /"generation":2/);

  // A cursor saved in generation 1 is still read, now from .1.ndjson.
  const r = follow(out.tail(a.cursor, { finished: () => true }));
  await r.done;
  assert.equal(r.lines.length, 2);

  // Rolling over again drops generation 1: its cursor reports the segment gone.
  appendFileSync(b.outPath, big);
  appendFileSync(b.outPath, big);
  await out.endTurn('s1', 'b', { code: 0, signal: null });
  const c = await out.beginTurn('s1', 'c');
  assert.equal(c.cursor.generation, 3);
  const files = readdirSync(dir).filter((f) => f.startsWith('s1')).sort();
  assert.deepEqual(files, ['s1.1.ndjson', 's1.err.log', 's1.ndjson'], 'exactly one previous generation is kept');
  await assert.rejects(async () => {
    for await (const _ of out.tail(a.cursor, { finished: () => true })) void _;
  }, SegmentGone);

  // A cursor past the end of its (truncated) file re-reads its turn from the start, with a warning.
  const d = await out.beginTurn('s2', 'd');
  appendFileSync(d.outPath, '{"k":1}\n');
  const past = { ...d.cursor, offset: d.cursor.offset + 10_000 };
  const re = follow(out.tail(past, { finished: () => true }));
  await re.done;
  assert.deepEqual(re.lines, ['{"k":1}']);
  assert.match(warns.join('\n'), /cursor past the end of its file/);
});

test("remove deletes a session's files; sweep removes old files of sessions not in keep and leaves the rest; one session uses one file pair however many turns it runs", async () => {
  const dir = root();
  let clock = Date.now();
  const out = createSessionOutput({ root: dir, pollMs: 5, now: () => clock });

  // Many turns, one file pair.
  for (let i = 0; i < 50; i++) {
    const seg = await out.beginTurn('busy', `t${i}`);
    appendFileSync(seg.outPath, `{"i":${i}}\n`);
    await out.endTurn('busy', `t${i}`, { code: 0, signal: null });
  }
  assert.deepEqual(readdirSync(dir).sort(), ['busy.err.log', 'busy.ndjson'], 'fifty turns, one file pair');

  await out.beginTurn('gone', 'x');
  await out.beginTurn('kept', 'y');
  await out.beginTurn('fresh', 'z');
  writeFileSync(join(dir, 'unrelated.txt'), 'not ours');
  const old = (Date.now() - 40 * 24 * 3600 * 1000) / 1000;
  for (const f of ['gone.ndjson', 'gone.err.log', 'kept.ndjson', 'kept.err.log']) utimesSync(join(dir, f), old, old);

  await out.sweep({ olderThanMs: 30 * 24 * 3600 * 1000, keep: new Set(['busy', 'kept']) });
  const left = readdirSync(dir).sort();
  assert.ok(!left.includes('gone.ndjson') && !left.includes('gone.err.log'), 'an old session not in keep is swept');
  assert.ok(left.includes('kept.ndjson'), 'a kept session stays even when old');
  assert.ok(left.includes('fresh.ndjson'), 'a recently written session stays even when not in keep');
  assert.ok(left.includes('unrelated.txt'), 'files that are not session output are left alone');

  await out.remove('busy');
  assert.ok(!readdirSync(dir).some((f) => f.startsWith('busy')), 'remove deletes the session files');
  await out.remove('never-existed');
  clock += 1;
  await createSessionOutput({ root: join(dir, 'missing') }).sweep({ olderThanMs: 1, keep: new Set() });
});

test('E202611031bd72813:S001 t5: a registered cursor pins its generation across rollover (archived, not discarded); unregister drops it; oldestRetainedGeneration reflects it', async () => {
  const root = join(mkdtempSync(join(tmpdir(), 'out-t5-')), 'out');
  const so = createSessionOutput({ root, maxBytes: 1, pollMs: 5 }); // tiny cap: every beginTurn rolls over
  const seg1 = await so.beginTurn('s1', 't1');
  const p = { current: `${root}/s1.ndjson`, previous: `${root}/s1.1.ndjson` };
  // pin generation 1 (the current file's generation)
  so.registerCursor(seg1.cursor);
  assert.equal(await so.oldestRetainedGeneration('s1'), 1);
  // write a line into gen 1, then start a second turn: rollover must archive gen 1, not discard it
  await so.endTurn('s1', 't1', { code: 0, signal: null });
  const seg2 = await so.beginTurn('s1', 't2');
  assert.notEqual(seg2.cursor.generation, seg1.cursor.generation, 'rolled over to a new generation');
  // the pinned generation is still readable from the tail (no SegmentGone), even after a SECOND
  // rollover that would normally discard it
  await so.endTurn('s1', 't2', { code: 0, signal: null });
  const seg3 = await so.beginTurn('s1', 't3');
  let threw = false;
  for await (const _ of so.tail(seg1.cursor, { finished: () => true })) { /* drain */ }
  try {
    for await (const _ of so.tail(seg1.cursor, { finished: () => true })) { /* drain */ }
  } catch (e) {
    threw = e instanceof SegmentGone;
  }
  assert.equal(threw, false, 'the pinned generation survived a second rollover (archived, readable)');
  assert.equal(await so.oldestRetainedGeneration('s1'), seg1.cursor.generation, 'oldest retained is the pinned one');
  // unregister: the archive is dropped
  so.unregisterCursor(seg1.cursor);
  await waitFor(() => !existsSync(`${root}/s1.pinned.1.ndjson`), 3000); // the archive is removed once the last unregister lands
  let gone = false;
  try {
    for await (const _ of so.tail(seg1.cursor, { finished: () => true })) { /* drain */ }
  } catch (e) {
    gone = e instanceof SegmentGone;
  }
  assert.ok(gone, 'after unregister the archived generation is gone (SegmentGone)');
  await so.remove('s1');
  rmSync(root, { recursive: true, force: true });
});

test('E202611031bd72813:S001 t5: a pinned generation replays its payload losslessly after rollover, and recoverTurn re-anchors a lost turn into it', async () => {
  const dir = join(mkdtempSync(join(tmpdir(), 'out-t5r-')), 'out');
  const so = createSessionOutput({ root: dir, maxBytes: 1, pollMs: 5 }); // tiny cap: every beginTurn rolls over
  const seg1 = await so.beginTurn('s1', 't1');
  // payload written by the CLI into generation 1 (two NDJSON lines)
  appendFileSync(seg1.outPath, json({ type: 'assistant', message: { content: [{ type: 'text', text: 'hello' }] } }) + '\n');
  appendFileSync(seg1.outPath, json({ type: 'result', subtype: 'success', is_error: false }) + '\n');
  await so.endTurn('s1', 't1', { code: 0, signal: null });
  so.registerCursor(seg1.cursor); // the observer's pin
  // roll over twice: without the pin, generation 1 would be discarded at the second rollover
  const seg2 = await so.beginTurn('s1', 't2');
  await so.endTurn('s1', 't2', { code: 0, signal: null });
  const seg3 = await so.beginTurn('s1', 't3');
  assert.ok(seg3.cursor.generation > seg1.cursor.generation + 1 || seg3.cursor.generation !== seg1.cursor.generation);
  // lossless replay: tail from the pinned cursor returns BOTH payload lines, not SegmentGone
  const lines: string[] = [];
  for await (const { line } of so.tail(seg1.cursor, { finished: () => true })) lines.push(line);
  assert.deepEqual(lines.map((l) => JSON.parse(l).type), ['assistant', 'result'], 'the archived generation replays its full payload');
  // recoverTurn re-anchors the lost turn into the oldest retained generation that holds it
  const rc = await so.recoverTurn('s1', 't1');
  assert.ok(rc !== undefined, 'recoverTurn finds the turn in a retained generation');
  assert.equal(rc!.generation, seg1.cursor.generation, 're-anchored into the archived generation');
  const replay: string[] = [];
  for await (const { line } of so.tail(rc!, { finished: () => true })) replay.push(line);
  assert.deepEqual(replay.map((l) => JSON.parse(l).type), ['assistant', 'result'], 'tail from the recovered cursor replays the turn from its start');
  assert.equal(await so.recoverTurn('s1', 'no-such-turn'), undefined, 'a turn no retained file holds is unrecoverable');
  so.unregisterCursor(seg1.cursor);
  await so.remove('s1');
  rmSync(dir, { recursive: true, force: true });
});

test('E202611031bd72813:S001 t5: pinned archives are discovered from disk by a RECREATED store (lossless recovery across reloads)', async () => {
  const dir = join(mkdtempSync(join(tmpdir(), 'out-t5d-')), 'out');
  const so1 = createSessionOutput({ root: dir, maxBytes: 1, pollMs: 5 });
  const seg1 = await so1.beginTurn('s1', 't1');
  appendFileSync(seg1.outPath, json({ type: 'result', subtype: 'success', is_error: false }) + '\n');
  await so1.endTurn('s1', 't1', { code: 0, signal: null });
  so1.registerCursor(seg1.cursor);
  await so1.beginTurn('s1', 't2'); // rolls gen 1 into previous
  await so1.endTurn('s1', 't2', { code: 0, signal: null });
  await so1.beginTurn('s1', 't3'); // rolls gen 1 out of previous -> archived on disk (pinned)
  assert.ok(readdirSync(dir).some((f) => f === 's1.pinned.1.ndjson'), 'the pinned generation is archived on disk');
  // a NEW store over the same root (window reload): its in-memory map starts empty
  const so2 = createSessionOutput({ root: dir, pollMs: 5 });
  const lines: string[] = [];
  for await (const { line } of so2.tail(seg1.cursor, { finished: () => true })) lines.push(line);
  assert.deepEqual(lines.map((l) => JSON.parse(l).type), ['result'], 'the recreated store discovers the on-disk archive and replays losslessly');
  const rc = await so2.recoverTurn('s1', 't1');
  assert.ok(rc !== undefined && rc.generation === seg1.cursor.generation, 'recoverTurn works on the recreated store too');
  assert.equal(await so2.oldestRetainedGeneration('s1'), seg1.cursor.generation, 'oldestRetainedGeneration sees the on-disk archive');
  await so2.remove('s1');
  rmSync(dir, { recursive: true, force: true });
});

test('E202611031bd72813:S001 t5: an in-progress pinned reader follows a rollover rename (re-resolves its generation every read) and never switches generations mid-read', async () => {
  const dir = join(mkdtempSync(join(tmpdir(), 'out-t5n-')), 'out');
  // a slow readRange keeps the reader genuinely MID-FILE when the rename happens (a fast reader
  // would drain the whole file between two polls)
  const slowFs: SessionOutputFs = { ...nodeSessionOutputFs, readRange: async (p, st, len) => { await new Promise((r) => setTimeout(r, 40)); return nodeSessionOutputFs.readRange(p, st, len); } };
  const so = createSessionOutput({ root: dir, maxBytes: 1, pollMs: 5, fs: slowFs });
  const seg1 = await so.beginTurn('s1', 't1');
  // >64 KiB (READ_CHUNK) of payload: chunk 1 read, chunk 2 still unread when the rename happens
  appendFileSync(seg1.outPath, Array.from({ length: 6000 }, (_, i) => json({ g: 1, i }) + '\n').join(''));
  so.registerCursor(seg1.cursor); // pin gen 1
  const lines: string[] = [];
  const read = (async () => {
    for await (const { line } of so.tail(seg1.cursor, { finished: () => false })) lines.push(line);
  })();
  await waitFor(() => lines.length > 0, 5000, 'the reader consumed the first chunk of gen 1');
  assert.ok(lines.length < 6000, 'the reader is mid-file, not done, when the rollover happens');
  // rollover: gen 1 (current) closes t1 and is renamed to previous; a second rollover archives
  // it to .pinned.1.ndjson — the new generations' files are larger than the reader's offset, so
  // a stale path resolution would silently read THEIR bytes instead of erroring
  const seg2 = await so.beginTurn('s1', 't2');
  appendFileSync(seg2.outPath, Array.from({ length: 6000 }, (_, i) => json({ g: 2, i }) + '\n').join(''));
  const seg3 = await so.beginTurn('s1', 't3');
  assert.ok(seg3.cursor.generation > seg2.cursor.generation);
  await read; // returns at t1's turn-end marker inside the archived generation
  assert.equal(lines.length, 6000, 'the reader got every payload line of gen 1');
  assert.ok(lines.every((l) => JSON.parse(l).g === 1), 'no line came from another generation — the renames were followed, not crossed');
  await so.remove('s1');
  rmSync(dir, { recursive: true, force: true });
});

test('E202611031bd72813:S001 t5: a registered cursor writes a durable pin marker, so a RECREATED WRITER also archives the pinned generation instead of discarding it', async () => {
  const dir = join(mkdtempSync(join(tmpdir(), 'out-t5p-')), 'out');
  const so1 = createSessionOutput({ root: dir, maxBytes: 1, pollMs: 5 });
  const seg1 = await so1.beginTurn('s1', 't1');
  await so1.endTurn('s1', 't1', { code: 0, signal: null });
  so1.registerCursor(seg1.cursor);
  await waitFor(() => existsSync(join(dir, 's1.pin.1.default')), 3000, 'the pin marker is on disk');
  await so1.beginTurn('s1', 't2'); // gen 1 -> previous (so1)
  await so1.endTurn('s1', 't2', { code: 0, signal: null });
  // a NEW writer process over the same root: its in-memory pin set is empty, only the marker exists
  const so2 = createSessionOutput({ root: dir, maxBytes: 1, pollMs: 5 });
  await so2.beginTurn('s1', 't3'); // must archive gen 1 (marker on disk), not discard it
  assert.ok(existsSync(join(dir, 's1.pinned.1.ndjson')), 'the recreated writer honored the durable pin marker and archived gen 1');
  // and unregister drops the marker
  so1.unregisterCursor(seg1.cursor);
  await waitFor(() => !existsSync(join(dir, 's1.pin.1.default')), 3000, 'unregister removes the marker');
  await so2.remove('s1');
  rmSync(dir, { recursive: true, force: true });
});

test('E202611031bd72813:S001 t5: pins are refcounted PER READER — one unregister keeps another reader\'s archive alive', async () => {
  const dir = join(mkdtempSync(join(tmpdir(), 'out-t5c-')), 'out');
  const so = createSessionOutput({ root: dir, maxBytes: 1, pollMs: 5 });
  const seg1 = await so.beginTurn('s1', 't1');
  appendFileSync(seg1.outPath, json({ type: 'result', subtype: 'success', is_error: false }) + '\n');
  await so.endTurn('s1', 't1', { code: 0, signal: null });
  so.registerCursor(seg1.cursor, 'reader-a');
  so.registerCursor(seg1.cursor, 'reader-b');
  await so.beginTurn('s1', 't2'); // gen 1 -> previous
  await so.endTurn('s1', 't2', { code: 0, signal: null });
  await so.beginTurn('s1', 't3'); // gen 1 archived (both readers pin it)
  assert.ok(existsSync(join(dir, 's1.pinned.1.ndjson')), 'archived while pinned');
  so.unregisterCursor(seg1.cursor, 'reader-a');
  await waitFor(() => existsSync(join(dir, 's1.pin.1.reader-b')) && !existsSync(join(dir, 's1.pin.1.reader-a')), 3000, 'only reader-a\'s marker is removed');
  // reader-b is still pinned: the archive survives and stays readable
  const lines: string[] = [];
  for await (const { line } of so.tail(seg1.cursor, { finished: () => true })) lines.push(line);
  assert.deepEqual(lines.map((l) => JSON.parse(l).type), ['result'], 'the archive survived reader-a\'s unregister');
  assert.ok(existsSync(join(dir, 's1.pinned.1.ndjson')), 'archive still on disk for reader-b');
  so.unregisterCursor(seg1.cursor, 'reader-b');
  await waitFor(() => !existsSync(join(dir, 's1.pinned.1.ndjson')), 3000, 'the archive is dropped only when the LAST reader unregisters');
  let gone = false;
  try {
    for await (const _ of so.tail(seg1.cursor, { finished: () => true })) { /* drain */ }
  } catch (e) {
    gone = e instanceof SegmentGone;
  }
  assert.ok(gone, 'then SegmentGone');
  await so.remove('s1');
  rmSync(dir, { recursive: true, force: true });
});

test('E202611031bd72813:S001 t5: register -> unregister -> register keeps the durable pin — the queued deletion cannot erase the new marker, and a recreated writer still archives the generation', async () => {
  const dir = join(mkdtempSync(join(tmpdir(), 'out-t5q-')), 'out');
  const so1 = createSessionOutput({ root: dir, maxBytes: 1, pollMs: 5 });
  const seg1 = await so1.beginTurn('s1', 't1');
  appendFileSync(seg1.outPath, json({ type: 'result', subtype: 'success', is_error: false }) + '\n');
  await so1.endTurn('s1', 't1', { code: 0, signal: null });
  so1.registerCursor(seg1.cursor);
  so1.unregisterCursor(seg1.cursor);
  so1.registerCursor(seg1.cursor); // re-register BEFORE the queued unregister deletion runs
  await new Promise((r) => setTimeout(r, 200)); // let the queued pin-IO task run
  assert.ok(existsSync(join(dir, 's1.pin.1.default')), 'the re-registered pin marker survives the queued unregister deletion');
  await so1.beginTurn('s1', 't2'); // gen 1 -> previous
  await so1.endTurn('s1', 't2', { code: 0, signal: null });
  // a NEW writer process over the same root: empty in-memory pin set, only the on-disk marker
  const so2 = createSessionOutput({ root: dir, maxBytes: 1, pollMs: 5 });
  await so2.beginTurn('s1', 't3'); // must archive gen 1, not discard it
  assert.ok(existsSync(join(dir, 's1.pinned.1.ndjson')), 'the recreated writer honored the surviving marker and archived gen 1');
  const lines: string[] = [];
  for await (const { line } of so2.tail(seg1.cursor, { finished: () => true })) lines.push(line);
  assert.deepEqual(lines.map((l) => JSON.parse(l).type), ['result'], 'the archived generation is still readable');
  await so2.remove('s1');
  rmSync(dir, { recursive: true, force: true });
});
