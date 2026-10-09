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
 * asks for the next page of one column. The epic rollup and issue view models
 * are s3's; the item details model (sc6) and its task and evidence rows are s4's.
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
  /** The item id in short form ('ABCDEF01 / S001'), or the full id when it has no canonical or H-form hash. */
  readonly compactId: string;
  /** Recorded task results ('n/N tasks passed'); null when the item records none. */
  readonly taskSummary: { readonly passed: number; readonly total: number; readonly label: string } | null;
  readonly badges: readonly BadgeView[];
  readonly needsAttention: boolean;
  /** One line naming the id, the task summary and every badge, for screen readers. */
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

/** One stage's cards inside an epic group (s3). */
export interface StageGroupView {
  readonly stage: DeliveryStage;
  readonly label: string;
  readonly cards: readonly CardView[];
}

export interface EpicGroupView {
  /** null for the 'Not in an epic' group. */
  readonly epicItemId: string | null;
  readonly title: string;
  /** e.g. '2 of 5 stories complete'; names its denominator. */
  readonly completionLabel: string;
  readonly storiesComplete: number;
  readonly storiesTotal: number;
  readonly issueCount: number;
  /** Matching cards in this group. */
  readonly total: number;
  /** Non-empty stages only, in STAGE_ORDER. */
  readonly stages: readonly StageGroupView[];
}

/** The epic rollup (s3): one group per listed epic, then the work that counts towards no epic. */
export interface EpicRollupViewModel {
  readonly epics: readonly EpicGroupView[];
  readonly notInEpic: EpicGroupView;
  readonly totals: { readonly items: number; readonly needsAttention: number };
  /** The epics the scope control offers, as on the board, so the control stays current on every tab. */
  readonly scopeOptions: BoardViewModel['scopeOptions'];
  readonly selectedItemId: string | null;
  readonly emptySelection: boolean;
}

/** A followable reference to another work item; ids only, resolved by the host. */
export interface LinkView {
  readonly itemId: string;
  readonly kind: 'epic' | 'story' | 'task' | 'issue';
  readonly title: string;
  /** null for an epic or an item with no stage. */
  readonly stageLabel: string | null;
}

export interface IssueEntryView {
  readonly card: CardView;
  readonly stageLabel: string;
  /** The story or epic the issue corrects; null when it names none or cannot be resolved. */
  readonly parent: LinkView | null;
  /** The issue's unresolved-parent notice message, or a fixed text when its resolved parent is not on the board. */
  readonly parentNotice: string | null;
  /** Each fix story among the issue's children, in childIds order. */
  readonly fixStories: readonly LinkView[];
}

/** The issue view (s3): each matching issue with its parent and its fix stories. */
export interface IssueViewModel {
  readonly issues: readonly IssueEntryView[];
  readonly totals: { readonly issues: number; readonly needsAttention: number };
  /** The epics the scope control offers, as on the board. */
  readonly scopeOptions: BoardViewModel['scopeOptions'];
  readonly selectedItemId: string | null;
  readonly emptySelection: boolean;
}

/** One task of the selected story (s4): its result, and its dependencies and checks from the story's PLAN. */
export interface TaskRowView {
  readonly taskItemId: string;
  readonly title: string | null;
  /** Result label from sc4, or the unplanned label. */
  readonly resultLabel: string;
  readonly planned: boolean;
  /** From the story's PLAN, read through workflow.deliveryEvidence; null when no PLAN or it could not be read. */
  readonly dependsOn: readonly string[] | null;
  readonly acceptanceChecks: readonly string[] | null;
}

/** One evidence record of the selected item (s4), and where opening it goes. */
export interface EvidenceRowView {
  readonly artifactId: string;
  readonly kindLabel: string;
  readonly approvalLabel: string;
  readonly reviewLabel: string | null;
  readonly overrideLabel: string | null;
  readonly opensIn: 'review-pane' | 'read-only';
}

/** The details of the selected item (s4, sc6), built from the shown snapshot alone. */
export interface ItemDetailsViewModel {
  readonly itemId: string;
  readonly title: string;
  readonly stageLabel: string | null;
  readonly stageReason: { readonly text: string; readonly artifactIds: readonly string[] } | null;
  readonly tasks: readonly TaskRowView[];
  readonly taskCounts: { readonly passed: number; readonly failed: number; readonly unrecorded: number; readonly unplanned: number } | null;
  readonly conflict: string | null;
  readonly evidence: readonly EvidenceRowView[];
  readonly notices: readonly string[];
  readonly linked: readonly { readonly itemId: string; readonly title: string; readonly relation: 'parent' | 'child' | 'corrects' }[];
  readonly sourceIds: readonly string[];
  /** Set when the PLAN read failed; the rest of the details still render. */
  readonly planNotice: string | null;
  /** The read-only text of an evidence-read record the reader opened, rendered as preformatted text. */
  readonly openedRecord: { readonly artifactId: string; readonly text: string } | null;
}

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
