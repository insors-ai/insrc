/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Procix Software India. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/**
 * Story E20261016f52996c2:S001 / t1 — a call frame is labelled with its repo-relative path and
 * line, so the diagram text holds a code reference the review pane can open.
 *
 * Run: npx tsx --test src/docgen/extract/__tests__/call-sequence-label.test.ts
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { buildCallSequenceIR, type CallFrameRef, type CallWalk } from '../call-sequence.js';

const ROOT = '/home/user/repo';
const frame = (id: string, name: string, file: string, line: number): CallFrameRef =>
  ({ entityId: id, name, file, startLine: line });

const walkOf = (a: CallFrameRef, b: CallFrameRef): CallWalk => ({
  entry: a,
  frames: [a, b],
  steps: [{ from: a.entityId, to: b.entityId, repeat: false }],
  truncatedFrameIds: [],
  depthUsed: 12,
});

test('src/docgen/extract/__tests__/call-sequence-label.test.ts: a call frame is labelled with its path relative to the repo root and its line', () => {
  const a = frame('a', 'main', `${ROOT}/src/workflow/synthesizer.ts`, 207);
  const b = frame('b', 'helper', `${ROOT}/src/docgen/extract/call-sequence.ts`, 87);
  const ir = buildCallSequenceIR(walkOf(a, b), 'rev1', 'scope', ROOT);
  assert.deepEqual(ir.derived.nodes.map(n => n.label), [
    'main (src/workflow/synthesizer.ts:207)',
    'helper (src/docgen/extract/call-sequence.ts:87)',
  ]);
});

test('src/docgen/extract/__tests__/call-sequence-label.test.ts: a frame outside the root, or a build with no root, keeps the base-name label', () => {
  const inside  = frame('a', 'main', `${ROOT}/src/a.ts`, 1);
  const outside = frame('b', 'other', '/elsewhere/lib/b.ts', 9);
  const sibling = frame('c', 'near', `${ROOT}-old/src/c.ts`, 3);
  const withRoot = buildCallSequenceIR({ ...walkOf(inside, outside), frames: [inside, outside, sibling] }, 'rev1', 'scope', ROOT);
  assert.deepEqual(withRoot.derived.nodes.map(n => n.label), ['main (src/a.ts:1)', 'other (b.ts:9)', 'near (c.ts:3)']);
  const noRoot = buildCallSequenceIR(walkOf(inside, outside), 'rev1', 'scope');
  assert.deepEqual(noRoot.derived.nodes.map(n => n.label), ['main (a.ts:1)', 'other (b.ts:9)']);
  assert.deepEqual(buildCallSequenceIR(walkOf(inside, outside), 'rev1', 'scope', '').derived.nodes.map(n => n.label), ['main (a.ts:1)', 'other (b.ts:9)']);
});

test('src/docgen/extract/__tests__/call-sequence-label.test.ts: node ids, edge ids and citations do not change with the label', () => {
  const a = frame('a', 'main', `${ROOT}/src/a.ts`, 1);
  const b = frame('b', 'helper', `${ROOT}/src/b.ts`, 5);
  const plain = buildCallSequenceIR(walkOf(a, b), 'rev1', 'scope');
  const rooted = buildCallSequenceIR(walkOf(a, b), 'rev1', 'scope', ROOT);
  assert.deepEqual(rooted.derived.nodes.map(n => [n.id, n.kind, n.citation]), plain.derived.nodes.map(n => [n.id, n.kind, n.citation]));
  assert.deepEqual(rooted.derived.edges, plain.derived.edges);
  assert.notDeepEqual(rooted.derived.nodes.map(n => n.label), plain.derived.nodes.map(n => n.label));
});
