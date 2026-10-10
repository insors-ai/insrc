/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Procix Software India. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/**
 * The Epics and Issues screens (E2 s3; screens, ISSUE-348d4663), and an epic's
 * row, which is also the summary on its board. Both build from the board's own
 * match step (selectMatches), so the same snapshot and filter give the same
 * matches, in the same order, as a board screen. Pure and vscode-free.
 */

import { attentionCount, attentionLabel, compactIdOf, foldOf, groupByStage, indexItems, isPlaceable, sectionDefaults, selectionPanel, selectMatches, titleOf, totalsLabel, type MatchedCard, type MatchFilter } from './board-model.js';
import type { EpicRollupRowView, EpicsBody, IssueEntryView, IssueSectionView, IssuesBody, LinkView } from './board-protocol.js';
import type { DeliveryItemView, DeliverySnapshot } from './delivery-contract.js';
import { labelOf, STAGE_ORDER, type DisplayLabels } from './labels.js';

/** Shown when an issue's recorded parent is not in the snapshot and the daemon gave no notice for it. */
export const PARENT_NOT_ON_BOARD = 'Parent not on the board';

/** 'N of M stories complete', naming its denominator; singular when M is 1. */
export function completionLabel(complete: number, total: number): string {
  return `${complete} of ${total} ${total === 1 ? 'story' : 'stories'} complete`;
}

export { attentionLabel };

function rowOf(epicItemId: string, title: string, matches: readonly MatchedCard[]): EpicRollupRowView {
  const stories = matches.filter(m => m.item.kind === 'story');
  const storiesComplete = stories.filter(m => m.stage === 'complete').length;
  const needing = attentionCount(matches);
  return {
    epicItemId,
    compactId: compactIdOf(epicItemId),
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

/** Everything in scope, unfiltered: the rows and the epic header count an epic's whole scope. */
const WHOLE = { search: '', needsAttentionOnly: false } as const;

/** One epic's row, counted over the epic's whole scope; the epic board's header shows the same numbers. */
export function epicRowOf(snapshot: DeliverySnapshot, epic: DeliveryItemView, labels: DisplayLabels): EpicRollupRowView {
  return rowOf(epic.id, titleOf(epic), selectMatches(snapshot, { scope: { kind: 'epic', epicItemId: epic.id }, ...WHOLE }, labels));
}

/**
 * The Epics screen: one row per epic in snapshot order, each counted over the epic's whole scope under the epic
 * membership rule (standalone work counts towards no epic). The search keeps the epics whose title or id contains it;
 * Needs attention keeps the epics with something needing attention. Work outside every epic is on Standalone, not a row.
 */
export function buildEpicRollup(snapshot: DeliverySnapshot, filter: Pick<MatchFilter, 'search' | 'needsAttentionOnly'>, labels: DisplayLabels): EpicsBody {
  const byId = indexItems(snapshot);
  const byEpic = new Map<string, MatchedCard[]>();
  for (const m of selectMatches(snapshot, { scope: { kind: 'all' }, ...WHOLE }, labels, byId)) {
    if (m.item.standalone || m.epic === null) continue;
    const list = byEpic.get(m.epic.id);
    if (list === undefined) byEpic.set(m.epic.id, [m]);
    else list.push(m);
  }
  const needle = filter.search.trim().toLowerCase();
  const epics = snapshot.items.filter(i => i.kind === 'epic');
  const rows: EpicRollupRowView[] = [];
  for (const e of epics) {
    if (needle.length > 0 && !titleOf(e).toLowerCase().includes(needle) && !e.id.toLowerCase().includes(needle)) continue;
    const row = rowOf(e.id, titleOf(e), byEpic.get(e.id) ?? []);
    if (filter.needsAttentionOnly && row.attentionCount === 0) continue;
    rows.push(row);
  }
  return {
    kind: 'epics',
    totalsLabel: `${rows.length} ${rows.length === 1 ? 'epic' : 'epics'} \u00b7 completion counts stories at Complete`,
    rows,
    emptyPanel: epics.length > 0 && rows.length === 0 ? selectionPanel('no-matches', labels) : null,
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

/** An issue's row: the story or epic its correctsRef resolves to, or its unresolved-parent notice, and its fix stories. */
function issueEntryOf(m: MatchedCard, byId: ReturnType<typeof indexItems>, labels: DisplayLabels): IssueEntryView {
  const ref = m.item.correctsRef;
  const parentItem = ref === null || ref.resolvedItemId === null ? undefined : byId.get(ref.resolvedItemId);
  const notice = m.item.notices.find(n => n.code === 'unresolved-parent')?.message ?? null;
  const recordedButMissing = ref !== null && ref.resolvedItemId !== null && parentItem === undefined;
  const fixStories: LinkView[] = [];
  for (const childId of m.item.childIds) {
    const child = byId.get(childId);
    if (child?.kind === 'story') fixStories.push(linkOf(child, labels));
  }
  return {
    card: m.card,
    stageLabel: labelOf(labels.stage, m.stage),
    parent: parentItem === undefined ? null : linkOf(parentItem, labels),
    parentNotice: parentItem !== undefined ? null : notice ?? (recordedButMissing ? PARENT_NOT_ON_BOARD : null),
    fixStories,
  };
}

/**
 * The Issues screen: the matching issues in six stage sections, snapshot order within a stage, opened and folded by
 * the board screens' rule (sectionDefaults, foldOf). Each row carries the story or epic its correctsRef resolves to,
 * or its unresolved-parent notice (a fixed text when a recorded parent is not in the snapshot and the daemon gave no
 * notice), and every fix story among its children with its own stage, whether or not the fix story itself matches.
 */
export function buildIssueView(snapshot: DeliverySnapshot, filter: MatchFilter, labels: DisplayLabels): IssuesBody {
  const byId = indexItems(snapshot);
  const attentionOnly = filter.needsAttentionOnly;
  const issueMatches = selectMatches(snapshot, filter, labels, byId).filter(m => m.item.kind === 'issue');
  const byStage = groupByStage(issueMatches);
  const sections: IssueSectionView[] = STAGE_ORDER.map(stage => {
    const inStage = byStage.get(stage) ?? [];
    const needing = attentionCount(inStage);
    return {
      stage, label: labelOf(labels.stage, stage), total: inStage.length, attentionCount: needing,
      ...sectionDefaults(stage, inStage.length, needing, attentionOnly, labels),
      issues: inStage.map(m => issueEntryOf(m, byId, labels)),
    };
  });
  const anyIssue = snapshot.items.some(i => i.kind === 'issue' && isPlaceable(i));
  const unfiltered = attentionOnly
    ? selectMatches(snapshot, { ...filter, needsAttentionOnly: false }, labels, byId).filter(m => m.item.kind === 'issue').length
    : issueMatches.length;
  return {
    kind: 'issues',
    totalsLabel: totalsLabel(issueMatches.length, attentionCount(issueMatches), attentionOnly, unfiltered, ['issue', 'issues']),
    showAll: attentionOnly,
    sections,
    fold: foldOf(sections, attentionOnly),
    // 'Nothing matches' only when there are issues to match: a board with no issues says so instead.
    emptyPanel: issueMatches.length > 0 ? null : anyIssue ? selectionPanel('no-matches', labels) : selectionPanel('no-issues', labels),
  };
}

/** Every issue row of an Issues body, in stage order. */
export function issueEntries(body: IssuesBody): readonly IssueEntryView[] {
  return body.sections.flatMap(sec => sec.issues);
}
