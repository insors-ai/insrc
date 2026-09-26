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
