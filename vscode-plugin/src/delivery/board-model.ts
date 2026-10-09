/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Procix Software India. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/**
 * The delivery board's view model (E2 s2, sc5): a pure function from the shown
 * snapshot, the reader's selection and the host's paging to six stage columns
 * of cards.
 *
 * Cards are the stories and issues whose stage is one of the six. An item
 * matches when it is in scope, contains the search and, with Needs attention
 * on, the daemon says it needs attention. Matches go to the column of their
 * stage in snapshot order (sorted by id, so equal timestamps cannot reorder
 * them), every count is taken before paging, and each column then shows its
 * first page. Nothing the daemon decided (stage, attention, conflict) is
 * derived here. The same arguments always give an equal model.
 */

import type { BadgeView, BoardViewModel, CardView, ColumnView } from './board-protocol.js';
import type { BoardSelection } from './board-state.js';
import type { AttentionReason, DeliveryItemView, DeliverySnapshot, DeliveryStage } from './delivery-contract.js';
import { STAGE_ORDER, type DisplayLabels } from './labels.js';

/** Cards shown per column before show-more, and how many each show-more adds. */
export const BOARD_PAGE_SIZE = 50;

/** The visible card limit per column; a missing stage means BOARD_PAGE_SIZE. Host memory only. */
export type BoardPaging = Readonly<Partial<Record<DeliveryStage, number>>>;

export function showMore(paging: BoardPaging, stage: DeliveryStage): BoardPaging {
  return { ...paging, [stage]: (paging[stage] ?? BOARD_PAGE_SIZE) + BOARD_PAGE_SIZE };
}

const KNOWN_STAGES: ReadonlySet<string> = new Set(STAGE_ORDER);

/** A story or issue: the kinds the daemon assigns a stage to. */
function isCardKind(item: DeliveryItemView): item is DeliveryItemView & { readonly kind: 'story' | 'issue' } {
  return item.kind === 'story' || item.kind === 'issue';
}

/** Every stage id on a story or issue that is not one of the six, with how many items carry it, in id order. */
export function unknownStages(snapshot: DeliverySnapshot): ReadonlyMap<string, number> {
  const counts = new Map<string, number>();
  for (const item of snapshot.items) {
    if (!isCardKind(item) || item.stage === null || KNOWN_STAGES.has(item.stage.stage)) continue;
    counts.set(item.stage.stage, (counts.get(item.stage.stage) ?? 0) + 1);
  }
  return new Map([...counts].sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0)));
}

type ItemIndex = ReadonlyMap<string, DeliveryItemView>;

/**
 * The epic an item belongs to: its parent when that is an epic; for an issue,
 * otherwise the epic it corrects, or the epic of the story it corrects.
 */
export function epicOf(item: DeliveryItemView, byId: ItemIndex): DeliveryItemView | null {
  const parent = item.parentId === null ? undefined : byId.get(item.parentId);
  if (parent?.kind === 'epic') return parent;
  if (item.kind !== 'issue' || item.correctsRef === null || item.correctsRef.resolvedItemId === null) return null;
  const target = byId.get(item.correctsRef.resolvedItemId);
  if (target === undefined) return null;
  if (target.kind === 'epic') return target;
  if (target.kind !== 'story' || target.parentId === null) return null;
  const targetParent = byId.get(target.parentId);
  return targetParent?.kind === 'epic' ? targetParent : null;
}

const titleOf = (item: DeliveryItemView): string => item.title ?? item.id;

function inScope(item: DeliveryItemView, epic: DeliveryItemView | null, selection: BoardSelection): boolean {
  switch (selection.scope.kind) {
    case 'all': return true;
    case 'standalone': return item.standalone;
    case 'epic': return epic !== null && epic.id === selection.scope.epicItemId;
  }
}

/** A plain, case-insensitive substring match; nothing in the search is interpreted. */
function matchesSearch(item: DeliveryItemView, epic: DeliveryItemView | null, needle: string): boolean {
  if (needle.length === 0) return true;
  const haystacks = [item.title ?? '', item.id, ...item.sourceIds, epic === null ? '' : titleOf(epic)];
  return haystacks.some(h => h.toLowerCase().includes(needle));
}

type CardItem = DeliveryItemView & { readonly kind: 'story' | 'issue' };
type Tone = BadgeView['tone'];

const APPROVAL_RANK = { rejected: 0, pending: 1, approved: 2 } as const;
const APPROVAL_TONE: Readonly<Record<keyof typeof APPROVAL_RANK, Tone>> = { rejected: 'danger', pending: 'warning', approved: 'success' };
const VERDICT_RANK = { block: 0, warn: 1, pass: 2 } as const;
const ATTENTION_TONE: Readonly<Record<AttentionReason, Tone>> = {
  'pending-decision': 'warning',
  'rejected': 'danger',
  'review-blocked': 'danger',
  'validation-failed': 'danger',
  'validation-conflict': 'danger',
};

const isAttentionReason = (r: string, labels: DisplayLabels): r is AttentionReason => Object.hasOwn(labels.attention, r);

/**
 * The card's signals in a fixed order: approval, review, validation, conflict,
 * attention, notice. Each reads a published field only; a badge whose label is
 * already on the card is dropped.
 */
function badgesOf(item: CardItem, labels: DisplayLabels): readonly BadgeView[] {
  const out: BadgeView[] = [];
  const add = (kind: BadgeView['kind'], label: string, tone: Tone): void => {
    if (!out.some(b => b.label === label)) out.push({ kind, label, tone });
  };
  const deciding = new Set(item.stage?.reason.artifactIds ?? []);
  const named = item.evidence.filter(e => deciding.has(e.artifactId));

  // Approval: the worst approval among the records the stage reason names.
  const approval = named.map(e => e.approval.state).sort((a, b) => APPROVAL_RANK[a] - APPROVAL_RANK[b])[0];
  if (approval !== undefined) add('approval', labels.approval[approval], APPROVAL_TONE[approval]);

  // Review: any blocking review blocks; otherwise the worst effective verdict among the named records.
  if (item.evidence.some(e => e.review?.blocking === true)) {
    add('review', labels.reviewVerdict.block, 'danger');
  } else {
    const verdict = named.flatMap(e => (e.review === null ? [] : [e.review.effectiveVerdict])).sort((a, b) => VERDICT_RANK[a] - VERDICT_RANK[b])[0];
    // A 'block' that no longer blocks (overridden, or its gate approved) is shown, but not as danger.
    if (verdict !== undefined) add('review', labels.reviewVerdict[verdict], verdict === 'pass' ? 'success' : verdict === 'warn' ? 'warning' : 'neutral');
  }

  // Validation: task results and the story-level result together.
  const v = item.validation;
  const slr = item.storyLevelResult;
  const hasResults = slr !== null || (v !== null && v.passed + v.failed + v.unrecorded > 0);
  if (hasResults) {
    if ((v?.failed ?? 0) > 0 || slr === 'failed') add('validation', labels.attention['validation-failed'], 'danger');
    else if ((v?.unrecorded ?? 0) > 0 || slr === 'unrecorded') add('validation', labels.taskResult.unrecorded, 'neutral');
    else add('validation', labels.taskResult.passed, 'success');
  }

  if (item.conflict !== null) add('conflict', labels.attention['validation-conflict'], 'danger');

  for (const r of item.attentionReasons) {
    if (isAttentionReason(r, labels)) add('attention', labels.attention[r], ATTENTION_TONE[r]);
  }

  const codes = new Set<string>();
  for (const n of item.notices) {
    if (codes.has(n.code)) continue;
    codes.add(n.code);
    // A code this build has no label for (a newer daemon) shows its id rather than nothing.
    const label = Object.hasOwn(labels.notice, n.code) ? labels.notice[n.code] : String(n.code);
    add('notice', label, n.attention ? 'warning' : 'neutral');
  }
  return out;
}

const KIND_TEXT = { story: 'Story', issue: 'Issue' } as const;

function cardOf(item: CardItem, stage: DeliveryStage, epic: DeliveryItemView | null, labels: DisplayLabels): CardView {
  const title = titleOf(item);
  const epicTitle = epic === null ? null : titleOf(epic);
  const badges = badgesOf(item, labels);
  const parts = [`${KIND_TEXT[item.kind]}: ${title}.`, `Stage: ${labels.stage[stage]}.`];
  if (item.standalone) parts.push('Standalone.');
  else if (epicTitle !== null) parts.push(`Epic: ${epicTitle}.`);
  if (item.needsAttention) parts.push('Needs attention.');
  if (badges.length > 0) parts.push(`Signals: ${badges.map(b => b.label).join(', ')}.`);
  return {
    itemId: item.id,
    kind: item.kind,
    title,
    standalone: item.standalone,
    epicTitle,
    badges,
    needsAttention: item.needsAttention,
    accessibleLabel: parts.join(' '),
  };
}

/** One story or issue that matches the selection: its item, its epic, its (known) stage and its card. */
export interface MatchedCard {
  readonly item: DeliveryItemView;
  readonly epic: DeliveryItemView | null;
  readonly stage: DeliveryStage;
  readonly card: CardView;
}

/** A story or issue whose stage is one of the six: what can be a card at all. */
function isPlaceable(item: DeliveryItemView): item is CardItem & { readonly stage: NonNullable<DeliveryItemView['stage']> } {
  return isCardKind(item) && item.stage !== null && KNOWN_STAGES.has(item.stage.stage);
}

/** How many items in the snapshot can be cards, whatever the selection; zero means an empty board, not an empty selection. */
export function placeableCount(snapshot: DeliverySnapshot): number {
  return snapshot.items.filter(isPlaceable).length;
}

/**
 * Every story and issue with a known stage that matches the selection's scope,
 * search and attention filter, in snapshot order. The board, the epic rollup
 * and the issue view all build from this one step, so they count the same
 * matches (E2 s3).
 */
export function selectMatches(snapshot: DeliverySnapshot, selection: BoardSelection, labels: DisplayLabels): readonly MatchedCard[] {
  const byId: ItemIndex = new Map(snapshot.items.map(i => [i.id, i]));
  const needle = selection.search.trim().toLowerCase();
  const out: MatchedCard[] = [];
  for (const item of snapshot.items) {
    if (!isPlaceable(item)) continue;   // an unknown stage is left off every view (unknownStages reports it)
    const epic = epicOf(item, byId);
    if (!inScope(item, epic, selection) || !matchesSearch(item, epic, needle)) continue;
    if (selection.needsAttentionOnly && !item.needsAttention) continue;
    out.push({ item, epic, stage: item.stage.stage, card: cardOf(item, item.stage.stage, epic, labels) });
  }
  return out;
}

export function buildBoardViewModel(snapshot: DeliverySnapshot, selection: BoardSelection, paging: BoardPaging, labels: DisplayLabels): BoardViewModel {
  const matches = new Map<DeliveryStage, CardView[]>(STAGE_ORDER.map(s => [s, []]));
  let needsAttention = 0;
  for (const m of selectMatches(snapshot, selection, labels)) {
    matches.get(m.stage)?.push(m.card);
    if (m.item.needsAttention) needsAttention++;
  }
  const columns: ColumnView[] = STAGE_ORDER.map(stage => {
    const all = matches.get(stage) ?? [];
    const shown = all.slice(0, Math.max(0, paging[stage] ?? BOARD_PAGE_SIZE));
    return { stage, label: labels.stage[stage], total: all.length, cards: shown, hiddenCount: all.length - shown.length };
  });
  const items = columns.reduce((n, c) => n + c.total, 0);
  return {
    columns,
    totals: { items, needsAttention },
    scopeOptions: snapshot.items.filter(i => i.kind === 'epic').map(e => ({ epicItemId: e.id, title: titleOf(e) })),
    emptySelection: placeableCount(snapshot) > 0 && items === 0,
  };
}
