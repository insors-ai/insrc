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
 * The 'items' down-message (HLD amendment AMD-6a1315585c38c41c-1) carried s1's
 * interim item list; s2's board view model (sc5) replaces it, and the variant
 * stays declared but unsent. The 'show-more' up-message (AMD-6a1315585c38c41c-2)
 * asks for the next page of one column. The other view models are declared by
 * the stories that own them (s3, s4).
 */

import type { Envelope } from '../chat/protocol.js';
import type { DeliveryStage } from './delivery-contract.js';
import { isObject } from './guards.js';
import { STAGE_ORDER } from './labels.js';

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

/** One text-labelled signal on a card (sc5); colour comes from tone but the label always carries the meaning. */
export interface BadgeView {
  readonly kind: 'approval' | 'review' | 'validation' | 'conflict' | 'attention' | 'notice';
  /** Text from sc4; always present. */
  readonly label: string;
  readonly tone: 'neutral' | 'warning' | 'danger' | 'success';
}

export interface CardView {
  readonly itemId: string;
  readonly kind: 'story' | 'issue';
  readonly title: string;
  readonly standalone: boolean;
  readonly epicTitle: string | null;
  readonly badges: readonly BadgeView[];
  readonly needsAttention: boolean;
  /** One line naming every badge, for screen readers. */
  readonly accessibleLabel: string;
}

export interface ColumnView {
  readonly stage: DeliveryStage;
  readonly label: string;
  /** Matches in the selection, including cards behind show-more. */
  readonly total: number;
  readonly cards: readonly CardView[];
  readonly hiddenCount: number;
}

/** What the board view shows for a snapshot and selection (sc5, owned by s2). */
export interface BoardViewModel {
  readonly columns: readonly ColumnView[];
  readonly totals: { readonly items: number; readonly needsAttention: number };
  readonly scopeOptions: readonly { readonly epicItemId: string; readonly title: string }[];
  readonly emptySelection: boolean;
}

/** Declared by their owning stories: EpicRollupViewModel and IssueViewModel (s3), ItemDetailsViewModel (s4). */
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
  | { readonly type: 'set-density'; readonly density: Density }
  | { readonly type: 'show-more'; readonly stage: DeliveryStage };

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
    case 'show-more': {
      const stage = STAGE_ORDER.find(st => st === p['stage']);
      return stage === undefined ? null : { type: 'show-more', stage };
    }
    default:
      return null;
  }
}
