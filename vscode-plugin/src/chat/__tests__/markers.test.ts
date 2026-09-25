/**
 * Story E20260925edb76e2e:S004 — markerFor mapper + host<->webview single-source parity.
 *
 * Pure unit tests (no vscode runtime): markerFor totality over the sc2 TurnEvent
 * union + mcp enrichment; the eval'd markerWebviewSource() computes the identical
 * {cssClass,label} as markerFor for every kind (drift fails the build); and the
 * webview source stays CSP-safe.
 *
 * Run: npx tsx --test vscode-plugin/src/chat/__tests__/markers.test.ts
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { markerFor, markerWebviewSource, MARKER_CLASS, type MarkerLine } from '../markers.js';
import type { TurnEvent } from '../stream-events.js';

/** One sample TurnEvent per kind (incl. tool-call with and without mcp, done ok true/false). */
const SAMPLES: TurnEvent[] = [
  { kind: 'assistant-delta', turnId: 't', text: 'hi' },
  { kind: 'status', turnId: 't', phase: 'thinking' },
  { kind: 'status', turnId: 't', phase: 'streaming' },
  { kind: 'status', turnId: 't', phase: 'tool' },
  { kind: 'status', turnId: 't', phase: 'editing' },
  { kind: 'tool-call', turnId: 't', tool: 'grep' },
  { kind: 'tool-call', turnId: 't', tool: 'x', mcp: { server: 'insrc', name: 'insrc_analyze_step' } },
  { kind: 'file-edit', turnId: 't', path: 'src/a.ts', diff: { path: 'src/a.ts', hunks: [] } },
  { kind: 'done', turnId: 't', ok: true },
  { kind: 'done', turnId: 't', ok: false },
  { kind: 'error', turnId: 't', message: 'boom' },
];

const ALL_CLASSES = new Set(Object.values(MARKER_CLASS));

test('markerFor maps every sc2 status phase to the right class + label', () => {
  assert.deepEqual(markerFor({ kind: 'status', turnId: 't', phase: 'thinking' }), {
    cssClass: MARKER_CLASS.pending,
    label: 'thinking…',
  });
  assert.deepEqual(markerFor({ kind: 'status', turnId: 't', phase: 'streaming' }), {
    cssClass: MARKER_CLASS.pending,
    label: 'streaming…',
  });
  assert.deepEqual(markerFor({ kind: 'status', turnId: 't', phase: 'tool' }), {
    cssClass: MARKER_CLASS.tool,
    label: 'running tool…',
  });
  assert.deepEqual(markerFor({ kind: 'status', turnId: 't', phase: 'editing' }), {
    cssClass: MARKER_CLASS.edit,
    label: 'editing…',
  });
});

test('markerFor(tool-call): bare ev.tool with no mcp, `${server} · ${name}` with mcp (ac2)', () => {
  assert.deepEqual(markerFor({ kind: 'tool-call', turnId: 't', tool: 'grep' }), {
    cssClass: MARKER_CLASS.tool,
    label: 'grep',
  });
  assert.deepEqual(
    markerFor({ kind: 'tool-call', turnId: 't', tool: 'x', mcp: { server: 'insrc', name: 'insrc_analyze_step' } }),
    { cssClass: MARKER_CLASS.tool, label: 'insrc · insrc_analyze_step' },
  );
});

test('markerFor: file-edit/done(ok true+false)/error map to the right class + label', () => {
  assert.deepEqual(markerFor({ kind: 'file-edit', turnId: 't', path: 'src/a.ts', diff: { path: 'src/a.ts', hunks: [] } }), {
    cssClass: MARKER_CLASS.edit,
    label: 'src/a.ts',
  });
  assert.deepEqual(markerFor({ kind: 'done', turnId: 't', ok: true }), { cssClass: MARKER_CLASS.done, label: 'done' });
  assert.deepEqual(markerFor({ kind: 'done', turnId: 't', ok: false }), {
    cssClass: MARKER_CLASS.done,
    label: 'done (failed)',
  });
  assert.deepEqual(markerFor({ kind: 'error', turnId: 't', message: 'boom' }), {
    cssClass: MARKER_CLASS.error,
    label: 'boom',
  });
});

test('markerFor(assistant-delta) -> null; an unknown/forward kind -> null (no throw)', () => {
  assert.equal(markerFor({ kind: 'assistant-delta', turnId: 't', text: 'x' }), null);
  // A future sc2 kind added before S004 catches up: cast past the closed union.
  const future = { kind: 'reasoning', turnId: 't' } as unknown as TurnEvent;
  assert.doesNotThrow(() => markerFor(future));
  assert.equal(markerFor(future), null);
});

test('every markerFor cssClass is one of the five sc1 insrc-term__marker--* stems', () => {
  for (const ev of SAMPLES) {
    const m = markerFor(ev);
    if (m !== null) assert.ok(ALL_CLASSES.has(m.cssClass), `${ev.kind} -> unknown class ${m.cssClass}`);
  }
});

test('parity: eval(markerWebviewSource()) computes {cssClass,label} deepEqual to markerFor for every sample (drift fails build)', () => {
  // eslint-disable-next-line no-eval
  const webviewMarkerFor = eval(`(${markerWebviewSource()})`) as (e: unknown) => MarkerLine | null;
  for (const ev of SAMPLES) {
    assert.deepEqual(webviewMarkerFor(ev), markerFor(ev), `webview/host drift on kind=${ev.kind}`);
  }
  // The webview mapper is also defensive: a malformed event -> null (no throw).
  assert.equal(webviewMarkerFor(null), null);
  assert.equal(webviewMarkerFor({}), null);
});

test('markerWebviewSource() is CSP-safe: only the five marker classes, no import/remote/asWebviewUri/vscode', () => {
  const src = markerWebviewSource();
  assert.doesNotMatch(src, /\bimport\b/, 'no import');
  assert.doesNotMatch(src, /https?:\/\//, 'no remote origin');
  assert.doesNotMatch(src, /asWebviewUri/, 'no asWebviewUri');
  assert.doesNotMatch(src, /\bvscode\b/, 'no vscode reference');
  const classes = src.match(/insrc-term__marker--[a-z]+/g) ?? [];
  for (const c of classes) assert.ok(ALL_CLASSES.has(c), `webview source references unknown class ${c}`);
});
