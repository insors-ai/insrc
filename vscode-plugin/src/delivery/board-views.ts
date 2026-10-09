/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Procix Software India. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/**
 * The delivery board's other two views (E2 s3): the epic rollup and the issue
 * view. Both build from the board's own match step (selectMatches), so the
 * same snapshot and selection give the same matches, in the same order, as the
 * board. Pure and vscode-free.
 */

import { placeableCount, selectMatches, type MatchedCard } from './board-model.js';
import type { CardView, EpicGroupView, EpicRollupViewModel, IssueEntryView, IssueViewModel, LinkView, StageGroupView } from './board-protocol.js';
import type { BoardSelection } from './board-state.js';
import type { DeliveryItemView, DeliverySnapshot } from './delivery-contract.js';
import { STAGE_ORDER, type DisplayLabels } from './labels.js';

export const NOT_IN_EPIC_TITLE = 'Not in an epic';

/** Shown when an issue's recorded parent is not in the snapshot and the daemon gave no notice for it. */
export const PARENT_NOT_ON_BOARD = 'Parent not on the board';

/** 'N of M stories complete', naming its denominator; singular when M is 1. */
export function completionLabel(complete: number, total: number): string {
  return `${complete} of ${total} ${total === 1 ? 'story' : 'stories'} complete`;
}

function groupOf(epicItemId: string | null, title: string, matches: readonly MatchedCard[], labels: DisplayLabels): EpicGroupView {
  const stories = matches.filter(m => m.item.kind === 'story');
  const storiesComplete = stories.filter(m => m.stage === 'complete').length;
  const stages: StageGroupView[] = [];
  for (const stage of STAGE_ORDER) {
    const cards: CardView[] = matches.filter(m => m.stage === stage).map(m => m.card);
    if (cards.length > 0) stages.push({ stage, label: labels.stage[stage], cards });
  }
  return {
    epicItemId,
    title,
    completionLabel: completionLabel(storiesComplete, stories.length),
    storiesComplete,
    storiesTotal: stories.length,
    issueCount: matches.filter(m => m.item.kind === 'issue').length,
    total: matches.length,
    stages,
  };
}

/** Nothing narrows the selection: every epic is listed, even one with no matching work. */
function unnarrowed(selection: BoardSelection): boolean {
  return selection.scope.kind === 'all' && selection.search.trim().length === 0 && !selection.needsAttentionOnly;
}

/**
 * The epic rollup: one group per listed epic in snapshot order, then 'Not in
 * an epic'. A match flagged standalone always goes to 'Not in an epic', so
 * standalone work never counts towards an epic; any other match goes to its
 * epic's group, or to 'Not in an epic' when it has none. Every match is in
 * exactly one group, so totals equal the board's for the same selection.
 */
export function buildEpicRollup(snapshot: DeliverySnapshot, selection: BoardSelection, labels: DisplayLabels): EpicRollupViewModel {
  const matches = selectMatches(snapshot, selection, labels);
  const byEpic = new Map<string, MatchedCard[]>();
  const notInEpic: MatchedCard[] = [];
  for (const m of matches) {
    if (m.item.standalone || m.epic === null) {
      notInEpic.push(m);
      continue;
    }
    const list = byEpic.get(m.epic.id);
    if (list === undefined) byEpic.set(m.epic.id, [m]);
    else list.push(m);
  }
  const scopedEpic = selection.scope.kind === 'epic' ? selection.scope.epicItemId : null;
  const listAll = unnarrowed(selection);
  const epics: EpicGroupView[] = [];
  for (const e of snapshot.items) {
    if (e.kind !== 'epic') continue;
    const own = byEpic.get(e.id) ?? [];
    if (own.length === 0 && !listAll && e.id !== scopedEpic) continue;
    epics.push(groupOf(e.id, e.title ?? e.id, own, labels));
  }
  return {
    epics,
    notInEpic: groupOf(null, NOT_IN_EPIC_TITLE, notInEpic, labels),
    totals: { items: matches.length, needsAttention: matches.filter(m => m.item.needsAttention).length },
    selectedItemId: selection.selectedItemId,
    emptySelection: placeableCount(snapshot) > 0 && matches.length === 0,
  };
}

/** A followable reference: ids only; the stage label is null for an epic or an item with no stage. */
function linkOf(item: DeliveryItemView, labels: DisplayLabels): LinkView {
  const stage = item.stage?.stage;
  return {
    itemId: item.id,
    kind: item.kind,
    title: item.title ?? item.id,
    stageLabel: stage === undefined ? null : Object.hasOwn(labels.stage, stage) ? labels.stage[stage] : String(stage),
  };
}

/**
 * The issue view: each matching issue in snapshot order with the story or
 * epic its correctsRef resolves to, or its unresolved-parent notice (a fixed
 * text when a recorded parent is not in the snapshot and the daemon gave no
 * notice), and every fix story among its children with its own stage, whether
 * or not the fix story itself matches the search.
 */
export function buildIssueView(snapshot: DeliverySnapshot, selection: BoardSelection, labels: DisplayLabels): IssueViewModel {
  const byId = new Map(snapshot.items.map(i => [i.id, i]));
  const issues: IssueEntryView[] = [];
  let needsAttention = 0;
  for (const m of selectMatches(snapshot, selection, labels)) {
    if (m.item.kind !== 'issue') continue;
    const ref = m.item.correctsRef;
    const parentItem = ref === null || ref.resolvedItemId === null ? undefined : byId.get(ref.resolvedItemId);
    const notice = m.item.notices.find(n => n.code === 'unresolved-parent')?.message ?? null;
    const recordedButMissing = ref !== null && ref.resolvedItemId !== null && parentItem === undefined;
    const fixStories: LinkView[] = [];
    for (const childId of m.item.childIds) {
      const child = byId.get(childId);
      if (child?.kind === 'story') fixStories.push(linkOf(child, labels));
    }
    issues.push({
      card: m.card,
      stageLabel: labels.stage[m.stage],
      parent: parentItem === undefined ? null : linkOf(parentItem, labels),
      parentNotice: parentItem !== undefined ? null : notice ?? (recordedButMissing ? PARENT_NOT_ON_BOARD : null),
      fixStories,
    });
    if (m.item.needsAttention) needsAttention++;
  }
  return {
    issues,
    totals: { issues: issues.length, needsAttention },
    selectedItemId: selection.selectedItemId,
    emptySelection: placeableCount(snapshot) > 0 && issues.length === 0,
  };
}
