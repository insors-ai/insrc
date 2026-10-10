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
import { appendFileSync, mkdtempSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createSessionOutput, parseMarker, type SegmentCursor } from '../session-output.js';
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
