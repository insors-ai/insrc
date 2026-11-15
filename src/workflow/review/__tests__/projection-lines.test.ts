import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { ProjectionLineWindow } from '../projection-lines.js';
import { ReviewMemoryBudget } from '../preparation-memory.js';
import { projectIntervals } from '../../code-review/task-review/projection-intervals.js';
import { canonicalTaskDigest } from '../../code-review/task-review/canonical-digest.js';
import { reviewMetadataJsonBytes } from '../../code-review/task-review/json-size.js';

test('bounded byte lines preserve the string oracle for Unicode BOM CRLF and final newlines', () => {
 for (const text of ['', '\n', 'a', 'a\n', 'a\n\n', '\ufeff漢字\r\n🙂\nlast', '🙂'.repeat(8193) + '\r\n']) {
  const memory = new ReviewMemoryBudget(1024 * 1024);
  const window = ProjectionLineWindow.open({ oid: 'fixture', bytes: new TextEncoder().encode(text) }, memory);
  const expected = text.match(/[^\n]*\n|[^\n]+$/g) ?? [], lines = window.lines;
  assert.ok('line' in lines);
  assert.equal(lines.length, expected.length);
  for (let i = 0; i < lines.length; i++) assert.equal(new TextDecoder('utf8', { ignoreBOM: true }).decode(lines.line(i)), expected[i]);
  if (lines.length) assert.deepEqual(projectIntervals([{ after: [1, lines.length] }], 0, lines, lines, []), projectIntervals([{ after: [1, lines.length] }], 0, expected, expected, []));
  assert.ok(memory.snapshot().bytes > 0);
  window.release(); window.release();
  assert.equal(memory.snapshot().bytes, 0);
  assert.throws(() => lines.length, /released/);
 }
});

test('bounded lines reject invalid UTF-8 binary input and insufficient capacity without leaked ownership', () => {
 for (const bytes of [new Uint8Array([0]), new Uint8Array([0xff]), new Uint8Array([0xe2, 0x82])]) {
  const memory = new ReviewMemoryBudget(4096);
  assert.throws(() => ProjectionLineWindow.open({ oid: 'bad', bytes }, memory), /UTF-8|Binary/);
  assert.equal(memory.snapshot().bytes, 0);
 }
 const memory = new ReviewMemoryBudget(1024);
 assert.throws(() => ProjectionLineWindow.open({ oid: 'large', bytes: new Uint8Array(2048) }, memory), /capacity/);
 assert.equal(memory.snapshot().bytes, 0);
});

function canonical(value: unknown): string | undefined {
 if (Array.isArray(value)) return `[${value.map(canonical).join(',')}]`;
 if (value !== null && typeof value === 'object') return `{${Object.keys(value).sort().filter(key => Reflect.get(value, key) !== undefined).map(key => `${JSON.stringify(key)}:${canonical(Reflect.get(value, key))}`).join(',')}}`;
 return JSON.stringify(value);
}
test('streamed task metadata digest matches the previous canonical identity bytes', () => {
 for (const value of [null, true, -0, 1e30, { z: undefined, a: [undefined, null, 'x'] }, { document: 'a'.repeat(2047) + '🙂' + '\u0000\\\"\ud800漢字'.repeat(3000), nested: { b: 2, a: 1 } }]) {
  assert.equal(canonicalTaskDigest(value), createHash('sha256').update(canonical(value)!).digest('hex'));
 }
 assert.throws(() => canonicalTaskDigest(new Uint8Array([1])), /source bytes/);
 assert.throws(() => canonicalTaskDigest(undefined), /undefined/);
});

test('streamed review JSON size preserves exact metadata escaping and rejects source payloads', () => {
 for (const value of [null, -0, NaN, Infinity, '\ufeff🙂漢字\ud800\udc00\ud800\udc00\u0000\b\t\n\f\r\\"', [undefined, , 3], { a: undefined, b: '🙂'.repeat(10000), c: [false, null, 1e30] }]) {
  assert.equal(reviewMetadataJsonBytes(value), Buffer.byteLength(JSON.stringify(value)));
 }
 assert.throws(() => reviewMetadataJsonBytes(new Uint8Array([1])), /metadata/);
 const cycle: { child?: unknown } = {}; cycle.child = cycle;
 assert.throws(() => reviewMetadataJsonBytes(cycle), /acyclic/);
 assert.throws(() => reviewMetadataJsonBytes({ get value() { throw new Error('must not run'); } }), /accessors/);
});
