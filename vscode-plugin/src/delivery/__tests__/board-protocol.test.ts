/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Procix Software India. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/** E2 s1 / sc3 — only well-formed v1 up-messages get past the parser. */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { parseBoardUpMessage, type BoardUpMessage } from '../board-protocol.js';
import { STAGE_ORDER } from '../labels.js';

const env = (payload: unknown, v: unknown = 1): unknown => ({ v, payload });

test('every valid up-message parses and a wrong version, unknown type or mistyped field gives null', () => {
  const valid: BoardUpMessage[] = [
    { type: 'ready' },
    { type: 'refresh' },
    { type: 'set-view', view: 'board' },
    { type: 'set-view', view: 'epics' },
    { type: 'set-view', view: 'issues' },
    { type: 'set-scope', scope: { kind: 'all' } },
    { type: 'set-scope', scope: { kind: 'standalone' } },
    { type: 'set-scope', scope: { kind: 'epic', epicItemId: 'E20261007aaaaaaaa' } },
    { type: 'set-search', search: '' },
    { type: 'set-search', search: 'board' },
    { type: 'set-attention', on: true },
    { type: 'select-item', itemId: 'E20261007aaaaaaaa:S001' },
    { type: 'close-details' },
    { type: 'open-evidence', itemId: 'E20261007aaaaaaaa:S001', artifactId: 'LLD-aaaaaaaaaaaaaaaa-s1' },
    { type: 'set-density', density: 'compact' },
    { type: 'set-density', density: 'comfortable' },
  ];
  for (const m of valid) assert.deepEqual(parseBoardUpMessage(env(m)), m, m.type);

  // Extra fields are dropped rather than passed through.
  assert.deepEqual(parseBoardUpMessage(env({ type: 'refresh', path: '/etc/passwd' })), { type: 'refresh' });

  const invalid: unknown[] = [
    null, 'refresh', [], { payload: { type: 'refresh' } },
    env({ type: 'refresh' }, 2),
    env({ type: 'approve', artifactId: 'LLD-x' }),
    env({ type: 'set-view', view: 'kanban' }),
    env({ type: 'set-scope', scope: { kind: 'epic' } }),
    env({ type: 'set-scope', scope: 'all' }),
    env({ type: 'set-search', search: 3 }),
    env({ type: 'set-attention', on: 'yes' }),
    env({ type: 'select-item', itemId: '' }),
    env({ type: 'open-evidence', itemId: 'x' }),
    env({ type: 'set-density', density: 'cozy' }),
    env('refresh'),
  ];
  for (const raw of invalid) assert.equal(parseBoardUpMessage(raw), null, JSON.stringify(raw));
});

test('show-more is accepted only for one of the six stages', () => {
  for (const stage of STAGE_ORDER) assert.deepEqual(parseBoardUpMessage(env({ type: 'show-more', stage })), { type: 'show-more', stage });
  for (const bad of [{ type: 'show-more' }, { type: 'show-more', stage: 'shipped' }, { type: 'show-more', stage: 'Complete' }, { type: 'show-more', stage: 3 }]) {
    assert.equal(parseBoardUpMessage(env(bad)), null, JSON.stringify(bad));
  }
});

test('parseBoardUpMessage accepts { type: \'clear-filters\' } and rejects it with extra fields', () => {
  assert.deepEqual(parseBoardUpMessage(env({ type: 'clear-filters' })), { type: 'clear-filters' });
  for (const bad of [{ type: 'clear-filters', search: '' }, { type: 'clear-filters', scope: { kind: 'all' } }, { type: 'clear-filters', on: false }]) {
    assert.equal(parseBoardUpMessage(env(bad)), null, JSON.stringify(bad));
  }
  assert.equal(parseBoardUpMessage(env({ type: 'clear-filters' }, 2)), null, 'a wrong version is still rejected');
});
