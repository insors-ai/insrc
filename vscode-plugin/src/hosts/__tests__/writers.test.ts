/**
 * Story E20260921ad0d45c9:S003 / t1 — the reversible writers + composeMcpEntry.
 * Over an in-memory fake HostFileSystem — no real fs.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';

import { HostFileAccessError } from '../fs.js';
import { composeMcpEntry, createMcpConfigWriter } from '../mcp-writer.js';
import {
  STEERING_MARKER_START,
  STEERING_MARKER_END,
  createSteeringWriter,
} from '../steering-writer.js';
import { fakeFs } from './fakes.js';

const MCP = '/home/u/.claude.json';
const ENTRY = { command: 'node' as const, args: ['/home/u/.insrc/daemon/out/bin/insrc-mcp.js'] };

// ---- McpConfigWriter -------------------------------------------------------

test('writeInsrcServer sets mcpServers.insrc preserving every other key/server; idempotent; creates {} when absent', () => {
  const fs = fakeFs({
    [MCP]: JSON.stringify({ theme: 'dark', mcpServers: { other: { command: 'x' } } }, null, 2),
  });
  const w = createMcpConfigWriter(fs);
  w.writeInsrcServer(MCP, ENTRY);

  const parsed = JSON.parse(fs.files.get(MCP)!);
  assert.equal(parsed.theme, 'dark', 'unrelated top-level keys preserved');
  assert.deepEqual(parsed.mcpServers.other, { command: 'x' }, 'other servers preserved');
  assert.deepEqual(parsed.mcpServers.insrc, ENTRY, 'insrc entry set');

  // idempotent: a second identical write does not rewrite the file.
  const before = fs.files.get(MCP)!;
  let wrote = false;
  const spyFs = { ...fs, write: (p: string, c: string) => { wrote = true; fs.files.set(p, c); } };
  createMcpConfigWriter(spyFs).writeInsrcServer(MCP, ENTRY);
  assert.equal(wrote, false, 'idempotent re-run does not write');
  assert.equal(fs.files.get(MCP), before);

  // absent file → creates {} + mcpServers.insrc.
  const fs2 = fakeFs();
  createMcpConfigWriter(fs2).writeInsrcServer(MCP, ENTRY);
  assert.deepEqual(JSON.parse(fs2.files.get(MCP)!), { mcpServers: { insrc: ENTRY } });
});

test('writeInsrcServer throws HostFileAccessError (no write) when mcpServers is present-but-non-object (never clobber)', () => {
  const original = JSON.stringify({ mcpServers: 'oops-a-string' });
  const fs = fakeFs({ [MCP]: original });
  const w = createMcpConfigWriter(fs);
  assert.throws(() => w.writeInsrcServer(MCP, ENTRY), HostFileAccessError);
  assert.equal(fs.files.get(MCP), original, 'malformed config left byte-unchanged');
});

test('removeInsrcServer deletes only the insrc key (other servers intact) and is a no-op when absent', () => {
  const fs = fakeFs({
    [MCP]: JSON.stringify({ mcpServers: { insrc: ENTRY, other: { command: 'x' } } }, null, 2),
  });
  const w = createMcpConfigWriter(fs);
  w.removeInsrcServer(MCP);
  const parsed = JSON.parse(fs.files.get(MCP)!);
  assert.equal('insrc' in parsed.mcpServers, false, 'insrc key removed');
  assert.deepEqual(parsed.mcpServers.other, { command: 'x' }, 'other server intact');

  // no-op when the file is absent.
  const fs2 = fakeFs();
  createMcpConfigWriter(fs2).removeInsrcServer(MCP);
  assert.equal(fs2.files.has(MCP), false, 'absent file untouched');
});

// ---- SteeringWriter --------------------------------------------------------

const STEER = '/home/u/.claude/CLAUDE.md';
const block = { beginMarker: STEERING_MARKER_START, endMarker: STEERING_MARKER_END, body: 'insrc guidance' };

test('SteeringWriter.upsert: no-markers→append; markers→replace; malformed/duplicate→untouched; idempotent; remove deletes/absent no-op', () => {
  // no markers → append, preserving prior content.
  const fs = fakeFs({ [STEER]: '# My notes\n' });
  const w = createSteeringWriter(fs);
  w.upsert(STEER, block);
  const after = fs.files.get(STEER)!;
  assert.match(after, /^# My notes/, 'prior content preserved');
  assert.match(after, /insrc:steering:start[\s\S]*insrc guidance[\s\S]*insrc:steering:end/);

  // idempotent: re-upsert of the identical block does not rewrite.
  let wrote = false;
  const spyFs = { ...fs, write: (p: string, c: string) => { wrote = true; fs.files.set(p, c); } };
  createSteeringWriter(spyFs).upsert(STEER, block);
  assert.equal(wrote, false, 'idempotent re-run does not write');

  // markers present → replace ONLY between them.
  createSteeringWriter(fs).upsert(STEER, { ...block, body: 'updated guidance' });
  const replaced = fs.files.get(STEER)!;
  assert.match(replaced, /^# My notes/, 'surrounding content still preserved');
  assert.match(replaced, /updated guidance/);
  assert.doesNotMatch(replaced, /insrc guidance\n/, 'old body replaced');

  // duplicate markers → left untouched (guarded no-op).
  const dup = `${STEERING_MARKER_START}\na\n${STEERING_MARKER_END}\n${STEERING_MARKER_START}\nb\n${STEERING_MARKER_END}\n`;
  const fsDup = fakeFs({ [STEER]: dup });
  createSteeringWriter(fsDup).upsert(STEER, block);
  assert.equal(fsDup.files.get(STEER), dup, 'duplicate-marker file left untouched');

  // malformed (open without close) → untouched.
  const mal = `intro\n${STEERING_MARKER_START}\nno close\n`;
  const fsMal = fakeFs({ [STEER]: mal });
  createSteeringWriter(fsMal).upsert(STEER, block);
  assert.equal(fsMal.files.get(STEER), mal, 'malformed-marker file left untouched');
});

test('SteeringWriter.remove deletes the marker block (restoring prior content) and is a no-op when no markers exist', () => {
  const fs = fakeFs({ [STEER]: '# My notes\n' });
  const w = createSteeringWriter(fs);
  w.upsert(STEER, block);
  w.remove(STEER);
  assert.equal(fs.files.get(STEER), '# My notes\n', 'restored to pre-insrc content');

  // no markers → no-op.
  const fs2 = fakeFs({ [STEER]: 'plain\n' });
  createSteeringWriter(fs2).remove(STEER);
  assert.equal(fs2.files.get(STEER), 'plain\n', 'file without markers untouched');
});

// ---- no-partial-write on fs failure ---------------------------------------

test('both writers leave the file byte-unchanged when HostFileSystem.write throws (no partial write)', () => {
  const mcpOriginal = JSON.stringify({ mcpServers: { other: { command: 'x' } } }, null, 2);
  const fs = fakeFs({ [MCP]: mcpOriginal, [STEER]: '# notes\n' });
  fs.failWrites.add(MCP);
  fs.failWrites.add(STEER);

  assert.throws(() => createMcpConfigWriter(fs).writeInsrcServer(MCP, ENTRY), HostFileAccessError);
  assert.equal(fs.files.get(MCP), mcpOriginal, 'mcp config unchanged after failed write');

  assert.throws(() => createSteeringWriter(fs).upsert(STEER, block), HostFileAccessError);
  assert.equal(fs.files.get(STEER), '# notes\n', 'steering file unchanged after failed write');
});

// ---- composeMcpEntry -------------------------------------------------------

test('composeMcpEntry(path) = { command:node, args:[path] } and returns undefined for an undefined/empty target (no cloud/env/argv)', () => {
  assert.deepEqual(composeMcpEntry('/x/insrc-mcp.js'), { command: 'node', args: ['/x/insrc-mcp.js'] });
  assert.equal(composeMcpEntry(undefined), undefined);
  assert.equal(composeMcpEntry(''), undefined);
  // no cloud/env/argv beyond the local stdio launch.
  const entry = composeMcpEntry('/x/insrc-mcp.js')!;
  assert.deepEqual(Object.keys(entry).sort(), ['args', 'command']);
});
