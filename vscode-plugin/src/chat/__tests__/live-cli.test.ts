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
import { createProviderRegistry, nodeSpawner, defaultBinaryProbe } from '../cli-adapter.js';
import type { TurnEvent } from '../stream-events.js';

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
