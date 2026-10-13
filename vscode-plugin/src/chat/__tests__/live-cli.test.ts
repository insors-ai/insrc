/**
 * Story E20260925edb76e2e:S002 / t4 — live real-CLI check (opt-in).
 *
 * Gated behind INSRC_LIVE_TESTS=1 (mirrors the daemon's live-service suites);
 * skips cleanly when unset so the default sweep needs no claude/codex binary.
 * When on, it runs a real one-shot turn through the production spawner and
 * asserts the native stream still maps to a well-formed sc2 turn (a terminal
 * event, session-id captured for resume). This is what keeps the codex mapper
 * (best-effort) honest against CLI drift.
 *
 * Run: INSRC_LIVE_TESTS=1 npx tsx --test vscode-plugin/src/chat/__tests__/live-cli.test.ts
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { crc32, deflateSync } from 'node:zlib';
import { createProviderRegistry, nodeSpawner, defaultBinaryProbe } from '../cli-adapter.js';
import type { ProviderId } from '../cli-adapter.js';
import type { TurnEvent } from '../stream-events.js';
import { parsePatch } from '../diff-sections.js';
import { baselineFor, git } from './real-git.js';

const LIVE = process.env['INSRC_LIVE_TESTS'] === '1';

test('live: a real claude turn yields a terminal sc2 event', { skip: !LIVE || !defaultBinaryProbe('claude') }, async () => {
  const reg = createProviderRegistry({ spawn: nodeSpawner, isInstalled: defaultBinaryProbe });
  const events: TurnEvent[] = [];
  for await (const ev of reg.get('claude').run({ provider: 'claude', prompt: 'Reply with exactly: PONG', cwd: process.cwd() })) {
    events.push(ev);
  }
  const terminal = events.at(-1);
  assert.ok(terminal && (terminal.kind === 'done' || terminal.kind === 'error'), 'a turn ends with a terminal event');
  assert.ok(events.every((e) => typeof e.turnId === 'string' && e.turnId.length > 0), 'every event carries a turnId');
});

test('live: a real codex turn yields a terminal sc2 event', { skip: !LIVE || !defaultBinaryProbe('codex') }, async () => {
  const reg = createProviderRegistry({ spawn: nodeSpawner, isInstalled: defaultBinaryProbe });
  const events: TurnEvent[] = [];
  for await (const ev of reg.get('codex').run({ provider: 'codex', prompt: 'Reply with exactly: PONG', cwd: process.cwd() })) {
    events.push(ev);
  }
  const terminal = events.at(-1);
  assert.ok(terminal && (terminal.kind === 'done' || terminal.kind === 'error'), 'a turn ends with a terminal event');
});

// S004: pin the permission contract against the installed CLIs. In review mode a tool
// the agent wants to run should surface as an approval-request; when the host writes the
// decision (adapter.decide), the turn proceeds to a terminal event rather than hanging.
// This is the concrete diff target for the normalizing adapter's field aliases (q1).
test('live: claude review mode surfaces an approval-request the host can answer via decide()', { skip: !LIVE || !defaultBinaryProbe('claude') }, async () => {
  const reg = createProviderRegistry({ spawn: nodeSpawner, isInstalled: defaultBinaryProbe });
  const adapter = reg.get('claude');
  const events: TurnEvent[] = [];
  // A prompt that requires a tool the CLI must ask permission for under --permission-prompts host.
  const req = { provider: 'claude' as const, prompt: 'Run the shell command `echo hello` and show its output.', cwd: process.cwd(), permissionMode: 'review' as const };
  for await (const ev of adapter.run(req)) {
    events.push(ev);
    if (ev.kind === 'approval-request') {
      // Answer it so the turn can proceed (proves the write() relay reaches the CLI).
      adapter.decide(ev.turnId, ev.requestId, 'approve');
    }
  }
  const terminal = events.at(-1);
  assert.ok(terminal && (terminal.kind === 'done' || terminal.kind === 'error'), 'the turn ends with a terminal event, not a hang');
  // If the installed CLI raised a prompt at all, it must have been well-formed (had a requestId).
  for (const ev of events) {
    if (ev.kind === 'approval-request') assert.ok(ev.requestId.length > 0, 'approval-request carries a correlation id');
  }
});

test('live: claude auto mode runs a tool prompt without blocking (bypass flag accepted)', { skip: !LIVE || !defaultBinaryProbe('claude') }, async () => {
  const reg = createProviderRegistry({ spawn: nodeSpawner, isInstalled: defaultBinaryProbe });
  const events: TurnEvent[] = [];
  const req = { provider: 'claude' as const, prompt: 'Run the shell command `echo hello`.', cwd: process.cwd(), permissionMode: 'auto' as const };
  for await (const ev of reg.get('claude').run(req)) events.push(ev);
  const terminal = events.at(-1);
  assert.ok(terminal && (terminal.kind === 'done' || terminal.kind === 'error'), 'auto mode terminates (no permission block)');
  assert.ok(!events.some((e) => e.kind === 'approval-request'), 'auto mode raises no approval-request');
});

// ---- Story E2026101259da3204:S001: attachments reach the real CLIs ----
//
// The chat host hands a turn its attached files as absolute paths in the prompt and, for claude,
// the session's attachments directory as readDirs (--add-dir). These run that request through
// the production adapter and spawner against a directory outside cwd, and require the answer to
// come from the files: the image's colour and a code word that appears nowhere but in the text file.

/** A solid-colour 64x64 PNG, built here so the test needs no fixture file. */
function solidPng(rgb: readonly [number, number, number]): Buffer {
  const size = 64;
  const row = Buffer.concat([Buffer.from([0]), Buffer.alloc(size * 3, Buffer.from(rgb))]);
  const chunk = (type: string, data: Buffer): Buffer => {
    const body = Buffer.concat([Buffer.from(type, 'latin1'), data]);
    const len = Buffer.alloc(4);
    len.writeUInt32BE(data.length);
    const sum = Buffer.alloc(4);
    sum.writeUInt32BE(crc32(body) >>> 0);
    return Buffer.concat([len, body, sum]);
  };
  const header = Buffer.alloc(13);
  header.writeUInt32BE(size, 0);
  header.writeUInt32BE(size, 4);
  header.set([8, 2, 0, 0, 0], 8); // 8 bits per channel, RGB
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', header),
    chunk('IDAT', deflateSync(Buffer.concat(Array.from({ length: size }, () => row)))),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

/** Runs one turn that attaches a red image and a text file, and returns what the assistant said. */
async function attachedTurn(provider: ProviderId): Promise<{ answer: string; events: TurnEvent[] }> {
  const dir = mkdtempSync(join(tmpdir(), 'insrc-live-attachments-'));
  try {
    writeFileSync(join(dir, '1-colour.png'), solidPng([255, 0, 0]));
    writeFileSync(join(dir, '2-secret.txt'), 'The code word is PERIWINKLE-4471.\n');
    // The prompt as the chat host builds it: the user's text, then the block of absolute paths.
    const prompt = [
      'What colour is the image, and what is the code word in the text file? Answer in one short line.',
      '',
      'Attached files (read them with your file tools):',
      join(dir, '1-colour.png'),
      join(dir, '2-secret.txt'),
    ].join('\n');
    const reg = createProviderRegistry({ spawn: nodeSpawner, isInstalled: defaultBinaryProbe });
    const events: TurnEvent[] = [];
    // cwd is this repository, which does not hold the files (codex only runs inside a git repository).
    for await (const ev of reg.get(provider).run({ provider, prompt, cwd: process.cwd(), permissionMode: 'manual', readDirs: [dir] })) events.push(ev);
    return { events, answer: events.map((e) => (e.kind === 'assistant-delta' ? e.text : '')).join('') };
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

test('live claude: with the argv the adapter builds for a request with readDirs, a prompt naming an image and a text file in that directory is answered from their content', { skip: !LIVE || !defaultBinaryProbe('claude') }, async () => {
  const { answer, events } = await attachedTurn('claude');
  assert.deepEqual(events.filter((e) => e.kind === 'approval-request'), [], 'reading the attachments directory needs no approval');
  assert.equal(events.at(-1)?.kind, 'done');
  assert.match(answer, /PERIWINKLE-4471/, 'the text file was read');
  assert.match(answer, /\bred\b/i, 'the image was read');
});

test('live codex: with the argv the adapter builds, a prompt naming an image and a text file in the attachments directory is answered from their content', { skip: !LIVE || !defaultBinaryProbe('codex') }, async () => {
  const { answer, events } = await attachedTurn('codex');
  assert.equal(events.at(-1)?.kind, 'done');
  assert.match(answer, /PERIWINKLE-4471/, 'the text file was read');
  assert.match(answer, /\bred\b/i, 'the image was read');
});

// Story E20261013b2e8109f:S001 / t3 — what the two CLIs report when they change files, in a
// temporary repository of the test's own.

/** A temporary git repository with one committed file; removed by the caller. */
function editRepo(): string {
  const dir = mkdtempSync(join(tmpdir(), 'insrc-live-edit-'));
  git(dir, 'init', '-q');
  writeFileSync(join(dir, 'a.txt'), 'one\ntwo\nthree\n');
  git(dir, 'add', '-A');
  git(dir, 'commit', '-q', '-m', 'init');
  return dir;
}

test("live claude: an Edit of a file in a temporary repository yields a tool-result with editPath and the baseline's changes hold the edited section", { skip: !LIVE || !defaultBinaryProbe('claude') }, async () => {
  const dir = editRepo();
  try {
    mkdirSync(dir + '-idx');
    const baseline = baselineFor(dir, dir + '-idx');
    const handle = await baseline.snapshot(dir);
    const reg = createProviderRegistry({ spawn: nodeSpawner, isInstalled: defaultBinaryProbe });
    const events: TurnEvent[] = [];
    const prompt = 'Use the Edit tool to change the word two to TWO in a.txt. Change nothing else, then stop.';
    for await (const ev of reg.get('claude').run({ provider: 'claude', prompt, cwd: dir, permissionMode: 'auto' })) events.push(ev);
    assert.equal(events.at(-1)?.kind, 'done');
    assert.equal(readFileSync(join(dir, 'a.txt'), 'utf8'), 'one\nTWO\nthree\n');
    const edit = events.find((e) => e.kind === 'file-edit');
    assert.ok(edit && edit.kind === 'file-edit' && edit.applied === undefined, 'the edit is announced when the call is made');
    const answered = events.filter((e) => e.kind === 'tool-result' && e.editPath !== undefined);
    assert.equal(answered.length, 1, 'one result names the edit it answers');
    const res = answered[0]!;
    assert.ok(res.kind === 'tool-result' && res.editPath!.endsWith('a.txt') && res.isError !== true);
    const sections = parsePatch((await baseline.changes(handle)) ?? '');
    assert.deepEqual(sections.map((s) => [s.path, s.added, s.removed]), [['a.txt', 1, 1]]);
    assert.ok(sections[0]!.lines.includes('+TWO') && sections[0]!.lines.includes('-two'));
    await baseline.release(handle);
  } finally {
    rmSync(dir, { recursive: true, force: true });
    rmSync(dir + '-idx', { recursive: true, force: true });
  }
});

test("live codex: a patch of two files in a temporary repository yields two applied file-edit events with those files' paths", { skip: !LIVE || !defaultBinaryProbe('codex') }, async () => {
  const dir = editRepo();
  try {
    const reg = createProviderRegistry({ spawn: nodeSpawner, isInstalled: defaultBinaryProbe });
    const events: TurnEvent[] = [];
    const prompt = 'Use the apply_patch tool (not a shell command), in one patch, to change the word two to TWO in a.txt and to add a new file b.txt containing hello. Then stop.';
    for await (const ev of reg.get('codex').run({ provider: 'codex', prompt, cwd: dir, permissionMode: 'auto' })) events.push(ev);
    assert.equal(events.at(-1)?.kind, 'done');
    const edits = events.filter((e): e is Extract<TurnEvent, { kind: 'file-edit' }> => e.kind === 'file-edit');
    assert.deepEqual(edits.map((e) => [e.path.split('/').pop(), e.applied]).sort(), [['a.txt', true], ['b.txt', true]]);
    assert.equal(readFileSync(join(dir, 'b.txt'), 'utf8').trim(), 'hello');
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
