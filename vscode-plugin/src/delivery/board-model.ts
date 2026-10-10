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

import type { BadgeView, BoardScope, BoardViewModel, CardView, StagesBody, StageSectionView, StatePanelView } from './board-protocol.js';
import type { AttentionReason, DeliveryItemView, DeliverySnapshot, DeliveryStage } from './delivery-contract.js';
import { approvalTone, labelOf, STAGE_ORDER, verdictTone, type DisplayLabels } from './labels.js';

/** Cards shown per column before show-more, and how many each show-more adds. */
export const BOARD_PAGE_SIZE = 50;

/** The visible card limit per column; a missing stage means BOARD_PAGE_SIZE. Host memory only. */
export type BoardPaging = Readonly<Partial<Record<DeliveryStage, number>>>;

export function showMore(paging: BoardPaging, stage: DeliveryStage): BoardPaging {
  return { ...paging, [stage]: (paging[stage] ?? BOARD_PAGE_SIZE) + BOARD_PAGE_SIZE };
}

const KNOWN_STAGES: ReadonlySet<string> = new Set(STAGE_ORDER);

/** A story or issue: the kinds the daemon assigns a stage to. */
export function isCardKind(item: DeliveryItemView): item is DeliveryItemView & { readonly kind: 'story' | 'issue' } {
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

export type ItemIndex = ReadonlyMap<string, DeliveryItemView>;

/** The snapshot's items by id. */
export function indexItems(snapshot: DeliverySnapshot): ItemIndex {
  return new Map(snapshot.items.map(i => [i.id, i]));
}

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

/** An item's title, or its id when it has none; every view shows titles through this. */
export const titleOf = (item: DeliveryItemView): string => item.title ?? item.id;

/** What a screen matches: its scope, and the search and attention filter of its trail entry. */
export interface MatchFilter {
  readonly scope: BoardScope;
  readonly search: string;
  readonly needsAttentionOnly: boolean;
}

/**
 * The epic membership rule: an item belongs to epic X exactly when it is not flagged standalone and epicOf(item) is
 * X, so a standalone issue that corrects one of X's stories is on Standalone and Issues, never on X's board.
 */
function inScope(item: DeliveryItemView, epic: DeliveryItemView | null, filter: MatchFilter): boolean {
  switch (filter.scope.kind) {
    case 'all': return true;
    case 'standalone': return item.standalone;
    case 'epic': return !item.standalone && epic !== null && epic.id === filter.scope.epicItemId;
  }
}

/** A plain, case-insensitive substring match; nothing in the search is interpreted. */
function matchesSearch(item: DeliveryItemView, epic: DeliveryItemView | null, needle: string): boolean {
  if (needle.length === 0) return true;
  const haystacks = [item.title ?? '', item.id, ...item.sourceIds, epic === null ? '' : titleOf(epic)];
  return haystacks.some(h => h.toLowerCase().includes(needle));
}

export type CardItem = DeliveryItemView & { readonly kind: 'story' | 'issue' };
type Tone = BadgeView['tone'];

const APPROVAL_RANK: Readonly<Record<string, number>> = { rejected: 0, pending: 1, approved: 2 };
const VERDICT_RANK: Readonly<Record<string, number>> = { block: 0, warn: 1, pass: 2 };
/** A code's rank, worst first; a code this build does not know ranks worst, so it is the one shown. */
const rankOf = (table: Readonly<Record<string, number>>, code: string): number => (Object.hasOwn(table, code) ? table[code]! : -1);
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
export function badgesOf(item: CardItem, labels: DisplayLabels): readonly BadgeView[] {
  const out: BadgeView[] = [];
  const add = (kind: BadgeView['kind'], label: string, tone: Tone): void => {
    if (!out.some(b => b.label === label)) out.push({ kind, label, tone });
  };
  const deciding = new Set(item.stage?.reason.artifactIds ?? []);
  const named = item.evidence.filter(e => deciding.has(e.artifactId));

  // Approval: the worst approval among the records the stage reason names.
  const approval = named.map(e => e.approval.state).sort((a, b) => rankOf(APPROVAL_RANK, a) - rankOf(APPROVAL_RANK, b))[0];
  if (approval !== undefined) add('approval', labelOf(labels.approval, approval), approvalTone(approval));

  // Review: any blocking review blocks; otherwise the worst effective verdict among the named records.
  if (item.evidence.some(e => e.review?.blocking === true)) {
    add('review', labels.reviewVerdict.block, 'danger');
  } else {
    const verdict = named.flatMap(e => (e.review === null ? [] : [e.review.effectiveVerdict])).sort((a, b) => rankOf(VERDICT_RANK, a) - rankOf(VERDICT_RANK, b))[0];
    // A 'block' that no longer blocks (overridden, or its gate approved) is shown, but not as danger.
    if (verdict !== undefined) add('review', labelOf(labels.reviewVerdict, verdict), verdictTone(verdict));
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
    const label = labelOf(labels.notice, n.code);
    add('notice', label, n.attention ? 'warning' : 'neutral');
  }
  return out;
}

const KIND_TEXT = { story: 'Story', issue: 'Issue' } as const;

const CANONICAL_ID = /^E\d{8}([0-9a-f]{8})(?::(S\d+))?$/i;
const H_FORM_ID = /^H([0-9a-f]{8})[0-9a-f]*(?::(S\d+))?$/i;

/**
 * An item id in short form, per the published id format ('E<date><hash8>[:S<nnn>]', or the 'H<hash>' fallback): the
 * 8-character hash in upper case, then ' / S<nnn>' when the id names a story. Any other id (a ':R(<raw>)' fallback, a
 * task id, an id of unknown shape) is returned whole.
 */
export function compactIdOf(id: string): string {
  const m = CANONICAL_ID.exec(id) ?? H_FORM_ID.exec(id);
  if (m === null) return id;
  const hash = (m[1] ?? '').toUpperCase();
  return m[2] === undefined ? hash : `${hash} / ${m[2].toUpperCase()}`;
}

/** The recorded task results as 'n/N tasks passed'; unplanned tasks are not counted, and no recorded task gives null. */
export function taskSummaryOf(item: DeliveryItemView): CardView['taskSummary'] {
  const v = item.validation;
  if (v === null) return null;
  const total = v.passed + v.failed + v.unrecorded;
  return total === 0 ? null : { passed: v.passed, total, label: `${v.passed}/${total} tasks passed` };
}

function cardOf(item: CardItem, stage: DeliveryStage, epic: DeliveryItemView | null, labels: DisplayLabels): CardView {
  const title = titleOf(item);
  const epicTitle = epic === null ? null : titleOf(epic);
  const badges = badgesOf(item, labels);
  const compactId = compactIdOf(item.id);
  const taskSummary = taskSummaryOf(item);
  const parts = [`${KIND_TEXT[item.kind]}: ${title}.`, `Id: ${compactId}.`, `Stage: ${labelOf(labels.stage, stage)}.`];
  if (taskSummary !== null) parts.push(`${taskSummary.label}.`);
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
    compactId,
    taskSummary,
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
export function isPlaceable(item: DeliveryItemView): item is CardItem & { readonly stage: NonNullable<DeliveryItemView['stage']> } {
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
export function selectMatches(snapshot: DeliverySnapshot, filter: MatchFilter, labels: DisplayLabels, byId: ItemIndex = indexItems(snapshot)): readonly MatchedCard[] {
  const needle = filter.search.trim().toLowerCase();
  const out: MatchedCard[] = [];
  for (const item of snapshot.items) {
    if (!isPlaceable(item)) continue;   // an unknown stage is left off every view (unknownStages reports it)
    const epic = epicOf(item, byId);
    if (!inScope(item, epic, filter) || !matchesSearch(item, epic, needle)) continue;
    if (filter.needsAttentionOnly && !item.needsAttention) continue;
    out.push({ item, epic, stage: item.stage.stage, card: cardOf(item, item.stage.stage, epic, labels) });
  }
  return out;
}

/** The epics the scope control offers, in snapshot order; every view carries the same list. */
export function scopeOptionsOf(snapshot: DeliverySnapshot): BoardViewModel['scopeOptions'] {
  return snapshot.items.filter(i => i.kind === 'epic').map(e => ({ epicItemId: e.id, title: titleOf(e) }));
}

/** How many matches the daemon says need attention; every view counts it this way. */
export function attentionCount(matches: readonly MatchedCard[]): number {
  return matches.filter(m => m.item.needsAttention).length;
}

/** Matches bucketed by stage, every stage present, in STAGE_ORDER; each bucket keeps snapshot order. The board's columns use it. */
export function groupByStage(matches: readonly MatchedCard[]): ReadonlyMap<DeliveryStage, readonly MatchedCard[]> {
  const out = new Map<DeliveryStage, MatchedCard[]>(STAGE_ORDER.map(s => [s, []]));
  for (const m of matches) out.get(m.stage)?.push(m);
  return out;
}

/** The panel a view shows when its selection matches nothing, or (issues only) when the board has no issues. */
export function selectionPanel(kind: 'no-matches' | 'no-issues', labels: DisplayLabels): StatePanelView {
  return kind === 'no-matches'
    ? { kind, title: labels.noMatchesTitle, text: labels.noMatchesText, action: 'clear-filters', stale: false, affected: [], placement: 'body' }
    : { kind, title: labels.noIssuesTitle, text: labels.noIssuesText, action: null, stale: false, affected: [], placement: 'body' };
}

/** 'No open gates' at 0, otherwise how many need attention. */
export function attentionLabel(count: number): string {
  if (count === 0) return 'No open gates';
  return count === 1 ? '1 needs attention' : `${count} need attention`;
}

const plural = (n: number, one: string, many: string): string => `${n} ${n === 1 ? one : many}`;

/** 'N items · M need attention'; with Needs attention on, 'M of N items need attention' (N counted without the toggle). */
export function totalsLabel(matched: number, needing: number, attentionOnly: boolean, unfiltered: number, noun: readonly [string, string]): string {
  if (attentionOnly) return `${needing} of ${plural(unfiltered, noun[0], noun[1])} ${needing === 1 ? 'needs' : 'need'} attention`;
  return `${plural(matched, noun[0], noun[1])} \u00b7 ${needing} ${needing === 1 ? 'needs' : 'need'} attention`;
}

/**
 * A board screen's body: six stage sections in workflow order. A section with matches starts open, except Complete,
 * which starts closed (with how many need attention) unless Needs attention is on; an empty section starts closed and
 * says so. Under Needs attention the empty stages always fold into one line; in a narrow pane the webview folds them
 * too. The epic header is filled in by the screen that knows the epic.
 */
export function buildBoardViewModel(snapshot: DeliverySnapshot, filter: MatchFilter, paging: BoardPaging, labels: DisplayLabels): StagesBody {
  const byId = indexItems(snapshot);
  const matches = selectMatches(snapshot, filter, labels, byId);
  const byStage = groupByStage(matches);
  const attentionOnly = filter.needsAttentionOnly;
  const sections: StageSectionView[] = STAGE_ORDER.map(stage => {
    const inStage = byStage.get(stage) ?? [];
    const all = inStage.map(m => m.card);
    const shown = all.slice(0, Math.max(0, paging[stage] ?? BOARD_PAGE_SIZE));
    const needing = attentionCount(inStage);
    const defaultOpen = all.length > 0 && (stage !== 'complete' || attentionOnly);
    return {
      stage, label: labelOf(labels.stage, stage), total: all.length, cards: shown, hiddenCount: all.length - shown.length,
      attentionCount: needing, defaultOpen,
      emptyText: all.length === 0 ? labels.nothingAtStage : null,
      hint: !defaultOpen && all.length > 0 && needing > 0 ? attentionLabel(needing) : null,
    };
  });
  const empty = sections.filter(sec => sec.total === 0);
  const foldText = empty.length === 0 ? ''
    : attentionOnly
      ? `${plural(empty.length, 'stage has', 'stages have')} nothing needing attention: ${empty.map(sec => sec.label).join(', ')}.`
      : empty.map(sec => `${sec.label} 0`).join(' \u00b7 ');
  const unfiltered = attentionOnly ? selectMatches(snapshot, { ...filter, needsAttentionOnly: false }, labels, byId).length : matches.length;
  const noMatches = placeableCount(snapshot) > 0 && matches.length === 0;
  return {
    kind: 'stages',
    epic: null,
    totalsLabel: totalsLabel(matches.length, attentionCount(matches), attentionOnly, unfiltered, ['item', 'items']),
    showAll: attentionOnly,
    sections,
    fold: { always: attentionOnly, text: foldText },
    emptyPanel: noMatches ? selectionPanel('no-matches', labels) : null,
  };
}
