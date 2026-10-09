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

import type { BoardViewModel, CardView, ColumnView } from './board-protocol.js';
import type { BoardSelection } from './board-state.js';
import type { DeliveryItemView, DeliverySnapshot, DeliveryStage } from './delivery-contract.js';
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

function cardOf(item: DeliveryItemView & { readonly kind: 'story' | 'issue' }, epic: DeliveryItemView | null): CardView {
  const title = titleOf(item);
  return {
    itemId: item.id,
    kind: item.kind,
    title,
    standalone: item.standalone,
    epicTitle: epic === null ? null : titleOf(epic),
    badges: [],
    needsAttention: item.needsAttention,
    accessibleLabel: title,
  };
}

export function buildBoardViewModel(snapshot: DeliverySnapshot, selection: BoardSelection, paging: BoardPaging, labels: DisplayLabels): BoardViewModel {
  const byId: ItemIndex = new Map(snapshot.items.map(i => [i.id, i]));
  const needle = selection.search.trim().toLowerCase();
  const matches = new Map<DeliveryStage, CardView[]>(STAGE_ORDER.map(s => [s, []]));
  let placeable = 0;
  let needsAttention = 0;
  for (const item of snapshot.items) {
    if (!isCardKind(item) || item.stage === null) continue;
    const column = matches.get(item.stage.stage);
    if (column === undefined) continue;   // an unknown stage: left off the board (unknownStages reports it)
    placeable++;
    const epic = epicOf(item, byId);
    if (!inScope(item, epic, selection) || !matchesSearch(item, epic, needle)) continue;
    if (selection.needsAttentionOnly && !item.needsAttention) continue;
    column.push(cardOf(item, epic));
    if (item.needsAttention) needsAttention++;
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
    emptySelection: placeable > 0 && items === 0,
  };
}
