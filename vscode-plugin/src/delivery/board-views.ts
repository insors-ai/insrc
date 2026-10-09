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

import { attentionCount, compactIdOf, indexItems, isPlaceable, placeableCount, scopeOptionsOf, selectionPanel, selectMatches, titleOf, type MatchedCard } from './board-model.js';
import type { EpicRollupRowView, EpicRollupViewModel, IssueEntryView, IssueViewModel, LinkView } from './board-protocol.js';
import type { BoardSelection } from './board-state.js';
import type { DeliveryItemView, DeliverySnapshot } from './delivery-contract.js';
import { labelOf, type DisplayLabels } from './labels.js';

export const NOT_IN_EPIC_TITLE = 'Not in an epic';

/** Shown when an issue's recorded parent is not in the snapshot and the daemon gave no notice for it. */
export const PARENT_NOT_ON_BOARD = 'Parent not on the board';

/** 'N of M stories complete', naming its denominator; singular when M is 1. */
export function completionLabel(complete: number, total: number): string {
  return `${complete} of ${total} ${total === 1 ? 'story' : 'stories'} complete`;
}

/** 'No open gates' at 0, otherwise how many matches need attention. */
export function attentionLabel(count: number): string {
  if (count === 0) return 'No open gates';
  return count === 1 ? '1 needs attention' : `${count} need attention`;
}

function rowOf(epicItemId: string | null, title: string, matches: readonly MatchedCard[]): EpicRollupRowView {
  const stories = matches.filter(m => m.item.kind === 'story');
  const storiesComplete = stories.filter(m => m.stage === 'complete').length;
  const needing = attentionCount(matches);
  return {
    epicItemId,
    compactId: epicItemId === null ? null : compactIdOf(epicItemId),
    title,
    storiesTotal: stories.length,
    storiesComplete,
    completionLabel: completionLabel(storiesComplete, stories.length),
    taskCount: stories.reduce((n, m) => n + m.item.tasks.filter(t => t.planned).length, 0),
    issueCount: matches.filter(m => m.item.kind === 'issue').length,
    total: matches.length,
    attentionCount: needing,
    attentionLabel: attentionLabel(needing),
    attentionTone: needing === 0 ? 'success' : 'warning',
  };
}

/** Nothing narrows the selection: every epic is listed, even one with no matching work. */
function unnarrowed(selection: BoardSelection): boolean {
  return selection.scope.kind === 'all' && selection.search.trim().length === 0 && !selection.needsAttentionOnly;
}

/**
 * The epic rollup: one row per listed epic in snapshot order, then 'Not in
 * an epic'. A match flagged standalone always goes to 'Not in an epic', so
 * standalone work never counts towards an epic; any other match goes to its
 * epic's row, or to 'Not in an epic' when it has none. Every match is counted
 * in exactly one row, so the row totals sum to the board's for the same selection.
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
  const epics: EpicRollupRowView[] = [];
  for (const e of snapshot.items) {
    if (e.kind !== 'epic') continue;
    const own = byEpic.get(e.id) ?? [];
    if (own.length === 0 && !listAll && e.id !== scopedEpic) continue;
    epics.push(rowOf(e.id, titleOf(e), own));
  }
  return {
    epics,
    notInEpic: rowOf(null, NOT_IN_EPIC_TITLE, notInEpic),
    totals: { items: matches.length, needsAttention: attentionCount(matches) },
    scopeOptions: scopeOptionsOf(snapshot),
    selectedItemId: selection.selectedItemId,
    emptySelection: placeableCount(snapshot) > 0 && matches.length === 0,
    emptyPanel: placeableCount(snapshot) > 0 && matches.length === 0 ? selectionPanel('no-matches', labels) : null,
  };
}

/** A followable reference: ids only; the stage label is null for an epic or an item with no stage. */
function linkOf(item: DeliveryItemView, labels: DisplayLabels): LinkView {
  const stage = item.stage?.stage;
  return {
    itemId: item.id,
    kind: item.kind,
    title: titleOf(item),
    stageLabel: stage === undefined ? null : labelOf(labels.stage, stage),
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
  const byId = indexItems(snapshot);
  const issues: IssueEntryView[] = [];
  const issueMatches = selectMatches(snapshot, selection, labels, byId).filter(m => m.item.kind === 'issue');
  for (const m of issueMatches) {
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
      stageLabel: labelOf(labels.stage, m.stage),
      parent: parentItem === undefined ? null : linkOf(parentItem, labels),
      parentNotice: parentItem !== undefined ? null : notice ?? (recordedButMissing ? PARENT_NOT_ON_BOARD : null),
      fixStories,
    });
  }
  return {
    issues,
    totals: { issues: issues.length, needsAttention: attentionCount(issueMatches) },
    scopeOptions: scopeOptionsOf(snapshot),
    selectedItemId: selection.selectedItemId,
    // 'Nothing matches' only when there are issues to match: a board with no issues is not an empty selection.
    emptySelection: issues.length === 0 && snapshot.items.some(i => i.kind === 'issue' && isPlaceable(i)),
    emptyPanel: issues.length > 0 ? null
      : snapshot.items.some(i => i.kind === 'issue' && isPlaceable(i)) ? selectionPanel('no-matches', labels) : selectionPanel('no-issues', labels),
  };
}
