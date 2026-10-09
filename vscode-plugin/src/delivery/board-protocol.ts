/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Procix Software India. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/**
 * The delivery board's webview message protocol (E2 s1, sc3): the only traffic
 * between the board's host and its webview, in the plugin's versioned
 * envelope. View models go down; the reader's intents come up as ids only, which
 * the host resolves against its current snapshot, so a crafted message cannot
 * name a path. parseBoardUpMessage is the gate every inbound message passes.
 *
 * The 'items' down-message (HLD amendment AMD-6a1315585c38c41c-1) carries s1's
 * interim item list until s2's board view model replaces it. The other view
 * models are declared by the stories that own them (s2, s3, s4).
 */

import type { Envelope } from '../chat/protocol.js';

export type { Envelope };

export interface StatusView {
  readonly state: 'loading' | 'ready' | 'empty' | 'unavailable' | 'failed';
  readonly takenAt: string | null;
  readonly message: string | null;
  readonly partialNotice: string | null;
  readonly stale: boolean;
}

export interface ItemListEntry {
  readonly itemId: string;
  readonly kind: 'epic' | 'story' | 'task' | 'issue';
  readonly title: string | null;
  readonly stageLabel: string | null;
}

/** Declared by their owning stories: BoardViewModel (s2), EpicRollupViewModel and IssueViewModel (s3), ItemDetailsViewModel (s4). */
export type BoardViewModel = unknown;
export type EpicRollupViewModel = unknown;
export type IssueViewModel = unknown;
export type ItemDetailsViewModel = unknown;

/** Host -> webview. Each message replaces what it names; nothing is merged. */
export type BoardDownMessage =
  | { readonly type: 'status'; readonly status: StatusView }
  | { readonly type: 'items'; readonly items: readonly ItemListEntry[] }
  | { readonly type: 'board'; readonly model: BoardViewModel }
  | { readonly type: 'epics'; readonly model: EpicRollupViewModel }
  | { readonly type: 'issues'; readonly model: IssueViewModel }
  | { readonly type: 'details'; readonly model: ItemDetailsViewModel | null }
  | { readonly type: 'announce'; readonly text: string };

export type BoardView = 'board' | 'epics' | 'issues';
export type BoardScope = { readonly kind: 'all' } | { readonly kind: 'epic'; readonly epicItemId: string } | { readonly kind: 'standalone' };
export type Density = 'compact' | 'comfortable';

/** Webview -> host. Ids only; the host resolves them against the current snapshot. */
export type BoardUpMessage =
  | { readonly type: 'ready' }
  | { readonly type: 'refresh' }
  | { readonly type: 'set-view'; readonly view: BoardView }
  | { readonly type: 'set-scope'; readonly scope: BoardScope }
  | { readonly type: 'set-search'; readonly search: string }
  | { readonly type: 'set-attention'; readonly on: boolean }
  | { readonly type: 'select-item'; readonly itemId: string }
  | { readonly type: 'close-details' }
  | { readonly type: 'open-evidence'; readonly itemId: string; readonly artifactId: string }
  | { readonly type: 'set-density'; readonly density: Density };

const isObject = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v);
const isNonEmptyString = (v: unknown): v is string => typeof v === 'string' && v.length > 0;

function parseScope(v: unknown): BoardScope | null {
  if (!isObject(v)) return null;
  if (v['kind'] === 'all') return { kind: 'all' };
  if (v['kind'] === 'standalone') return { kind: 'standalone' };
  if (v['kind'] === 'epic' && isNonEmptyString(v['epicItemId'])) return { kind: 'epic', epicItemId: v['epicItemId'] };
  return null;
}

/** The typed intent when raw is a v1 envelope carrying a known, well-typed up-message; null otherwise. */
export function parseBoardUpMessage(raw: unknown): BoardUpMessage | null {
  if (!isObject(raw) || raw['v'] !== 1 || !isObject(raw['payload'])) return null;
  const p = raw['payload'];
  switch (p['type']) {
    case 'ready': return { type: 'ready' };
    case 'refresh': return { type: 'refresh' };
    case 'close-details': return { type: 'close-details' };
    case 'set-view':
      return p['view'] === 'board' || p['view'] === 'epics' || p['view'] === 'issues' ? { type: 'set-view', view: p['view'] } : null;
    case 'set-scope': {
      const scope = parseScope(p['scope']);
      return scope === null ? null : { type: 'set-scope', scope };
    }
    case 'set-search':
      return typeof p['search'] === 'string' ? { type: 'set-search', search: p['search'] } : null;
    case 'set-attention':
      return typeof p['on'] === 'boolean' ? { type: 'set-attention', on: p['on'] } : null;
    case 'select-item':
      return isNonEmptyString(p['itemId']) ? { type: 'select-item', itemId: p['itemId'] } : null;
    case 'open-evidence':
      return isNonEmptyString(p['itemId']) && isNonEmptyString(p['artifactId'])
        ? { type: 'open-evidence', itemId: p['itemId'], artifactId: p['artifactId'] }
        : null;
    case 'set-density':
      return p['density'] === 'compact' || p['density'] === 'comfortable' ? { type: 'set-density', density: p['density'] } : null;
    default:
      return null;
  }
}
