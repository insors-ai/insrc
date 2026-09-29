/**
 * Story E20260926f9563bf5:S001 / t2 — sc2 additive widening.
 *
 * Pins the additive-only contract change: ToolCallEvent gains an optional
 * `command`, and TURN_EVENT_KINDS reserves 'approval-request' (TurnEventKind
 * derives it) — with every existing kind unchanged (k2).
 *
 * Run: npx tsx --test vscode-plugin/src/chat/__tests__/stream-events.test.ts
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { TURN_EVENT_KINDS, type TurnEvent, type TurnEventKind } from '../stream-events.js';

test("TURN_EVENT_KINDS reserves 'approval-request' alongside every prior kind (additive)", () => {
  // Every pre-S001 kind is still present, unchanged.
  for (const k of ['assistant-delta', 'tool-call', 'file-edit', 'status', 'done', 'error']) {
    assert.ok(TURN_EVENT_KINDS.includes(k as TurnEventKind), `existing kind ${k} still present (k2)`);
  }
  assert.ok(TURN_EVENT_KINDS.includes('approval-request'), "'approval-request' is reserved");
  // TurnEventKind derives from the array, so the reserved string is part of the type.
  const reserved: TurnEventKind = 'approval-request';
  assert.equal(reserved, 'approval-request');
});

test('ToolCallEvent accepts an optional command; a command-less tool-call is still valid (additive)', () => {
  // With a command (the new field).
  const withCmd: TurnEvent = { kind: 'tool-call', turnId: 't', tool: 'Bash', command: 'ls -la' };
  assert.equal(withCmd.kind === 'tool-call' ? withCmd.command : undefined, 'ls -la');
  // Without a command — the pre-S001 shape still typechecks and carries no command (k2).
  const noCmd: TurnEvent = { kind: 'tool-call', turnId: 't', tool: 'grep' };
  assert.equal(noCmd.kind === 'tool-call' ? noCmd.command : 'x', undefined);
  // An MCP tool-call is unchanged and may also carry a command.
  const mcp: TurnEvent = { kind: 'tool-call', turnId: 't', tool: 'x', mcp: { server: 'insrc', name: 'insrc_analyze_step' } };
  assert.equal(mcp.kind === 'tool-call' ? mcp.command : 'x', undefined);
});

test('every existing TurnEvent kind still constructs with its original shape (no shape drift, k2)', () => {
  const samples: TurnEvent[] = [
    { kind: 'assistant-delta', turnId: 't', text: 'hi' },
    { kind: 'tool-call', turnId: 't', tool: 'grep' },
    { kind: 'file-edit', turnId: 't', path: 'a.ts', diff: { path: 'a.ts', hunks: [] } },
    { kind: 'status', turnId: 't', phase: 'thinking' },
    { kind: 'done', turnId: 't', ok: true },
    { kind: 'error', turnId: 't', message: 'boom' },
  ];
  assert.equal(samples.length, 6);
});

test('S004: ApprovalRequestEvent is a valid TurnEvent member with its reserved kind + correlation fields', () => {
  // The kind was reserved by S001; S004 fills the concrete union member.
  const ev: TurnEvent = {
    kind: 'approval-request',
    turnId: 't',
    requestId: 'req-1',
    title: 'Run a shell command',
    detail: 'rm -rf build/',
  };
  assert.equal(ev.kind, 'approval-request');
  // Narrow and read the correlation key + card fields.
  if (ev.kind === 'approval-request') {
    assert.equal(ev.requestId, 'req-1');
    assert.equal(ev.title, 'Run a shell command');
    assert.equal(ev.detail, 'rm -rf build/');
    assert.equal(ev.toolName, undefined);
  }
  // toolName is optional-additive: present form still typechecks.
  const withTool: TurnEvent = {
    kind: 'approval-request',
    turnId: 't',
    requestId: 'req-2',
    title: 'Edit a file',
    detail: 'src/a.ts',
    toolName: 'Edit',
  };
  assert.equal(withTool.kind === 'approval-request' ? withTool.toolName : undefined, 'Edit');
});

test('S001 (bugfix): ApprovalRequestEvent admits an optional command field; other kinds unaffected', () => {
  // WITH the new command field.
  const withCmd: TurnEvent = {
    kind: 'approval-request',
    turnId: 't',
    requestId: 'req-3',
    title: 'Permission: Bash',
    detail: 'needs your permission',
    toolName: 'Bash',
    command: 'rm -rf build',
  };
  assert.equal(withCmd.kind === 'approval-request' ? withCmd.command : undefined, 'rm -rf build');
  // WITHOUT it — the pre-fix shape still typechecks and carries no command (k2, byte-identical).
  const noCmd: TurnEvent = {
    kind: 'approval-request',
    turnId: 't',
    requestId: 'req-4',
    title: 'Permission: Write',
    detail: 'needs your permission',
    toolName: 'Write',
  };
  assert.equal(noCmd.kind === 'approval-request' ? noCmd.command : 'x', undefined);
  // Another kind is entirely unaffected by the widening.
  const other: TurnEvent = { kind: 'tool-call', turnId: 't', tool: 'grep' };
  assert.equal(other.kind, 'tool-call');
});
