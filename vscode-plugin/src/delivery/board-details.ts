/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Procix Software India. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/**
 * The item details view model (E2 s4, sc6): everything the board shows about
 * one selected item, built from the shown snapshot, the story's PLAN read and
 * the one record the reader opened. Every value is a published field or a
 * label for one; nothing is inferred. Pure; vscode-free.
 *
 * Join rule: a PLAN task belongs to the story's task item whose sourceIds
 * contain the PLAN task's id; a PLAN task with no such item is not a row, and a
 * dependency with no such item is shown by its raw plan id.
 */

import type { DeliveryEvidenceView, DeliveryItemView, DeliverySnapshot } from './delivery-contract.js';
import type { DisplayLabels } from './labels.js';
import type { BadgeView, ChainRowView, EvidenceRowView, ItemDetailsViewModel, LinkView, TaskRowView } from './board-protocol.js';
import { badgesOf, compactIdOf, indexItems, isCardKind, taskSummaryOf, titleOf, type ItemIndex } from './board-model.js';
import { approvalTone, labelOf, plural, readableTime, taskResultTone } from './labels.js';

export interface PlanTaskView {
  readonly id: string;
  readonly dependsOn: readonly string[];
  readonly acceptanceChecks: readonly string[];
}

/** The selected story's PLAN read: none (no PLAN evidence, or not a story), loading, ok or failed. */
export type PlanRead =
  | { readonly state: 'none' }
  | { readonly state: 'loading' }
  | { readonly state: 'ok'; readonly tasks: readonly PlanTaskView[] }
  | { readonly state: 'failed'; readonly message: string };

/** An evidence-read record the reader opened, as read-only text. */
export interface OpenedRecord { readonly artifactId: string; readonly text: string }


function taskRows(item: DeliveryItemView, plan: PlanRead, byId: ItemIndex, labels: DisplayLabels): TaskRowView[] {
  const taskItems = item.tasks.map(t => byId.get(t.taskItemId)).filter((t): t is DeliveryItemView => t !== undefined);
  const itemForPlanId = (planId: string): DeliveryItemView | undefined => taskItems.find(t => t.sourceIds.includes(planId));
  return item.tasks.map(t => {
    const taskItem = byId.get(t.taskItemId);
    const planTask = plan.state === 'ok' && taskItem !== undefined
      ? plan.tasks.find(p => taskItem.sourceIds.includes(p.id))
      : undefined;
    return {
      taskItemId: t.taskItemId,
      // titleOf, like the dependencies on the same row: a task with no title shows its id.
      title: taskItem === undefined ? null : titleOf(taskItem),
      resultLabel: t.planned ? labelOf(labels.taskResult, t.result) : labels.unplanned,
      planned: t.planned,
      resultTone: t.planned ? taskResultTone(t.result) : 'neutral',
      dependsOn: planTask === undefined ? null : planTask.dependsOn.map(d => {
        const dep = itemForPlanId(d);
        return dep === undefined ? d : titleOf(dep);
      }),
      acceptanceChecks: planTask === undefined ? null : [...planTask.acceptanceChecks],
    };
  });
}

function conflictSentence(item: DeliveryItemView, byId: ItemIndex): string | null {
  if (item.conflict === null) return null;
  const failed = item.conflict.failedTaskItemIds.map(id => {
    const t = byId.get(id);
    return t === undefined ? id : titleOf(t);
  });
  const parts: string[] = [];
  if (failed.length > 0) parts.push(`${plural(failed.length, 'task result', 'task results')} failed (${failed.join(', ')})`);
  if (item.conflict.storyLevelFailed) parts.push('the story-level result failed');
  if (parts.length === 0) return 'The build is approved while a validation result failed.';
  return `The build is approved while ${parts.join(' and ')}.`;
}

function evidenceRow(entry: DeliveryEvidenceView, labels: DisplayLabels): EvidenceRowView {
  const review = entry.review;
  let reviewLabel: string | null = null;
  if (review !== null) {
    reviewLabel = labelOf(labels.reviewVerdict, review.verdict);
    if (review.effectiveVerdict !== review.verdict) reviewLabel += ` (now ${labelOf(labels.reviewVerdict, review.effectiveVerdict)})`;
  }
  return {
    artifactId: entry.artifactId,
    kindLabel: entry.kind,
    approvalLabel: labelOf(labels.approval, entry.approval.state),
    reviewLabel,
    overrideLabel: review?.override == null ? null : `Overridden: ${review.override.reason}`,
    opensIn: entry.openWith === 'review-view' && entry.mdPath !== null ? 'review-pane' : 'read-only',
    approvedAt: entry.approval.at == null ? null : readableTime(entry.approval.at),
  };
}

type ChainKind = ChainRowView['kind'];
type DeliveryRoute = NonNullable<DeliveryItemView['stage']>['route'];

/** The chain's kinds, in the order they are shown. */
const CHAIN_ORDER: readonly ChainKind[] = ['DEF', 'HLD', 'ISSUE', 'LLD', 'PLAN', 'BUILD'];

/** The records each route expects; 'unknown' expects none, so it never claims a record is missing. */
const EXPECTED_BY_ROUTE: Readonly<Record<DeliveryRoute, readonly ChainKind[]>> = {
  'full-chain':   ['DEF', 'HLD', 'LLD', 'PLAN', 'BUILD'],
  'feature':      ['LLD', 'PLAN', 'BUILD'],
  'small':        ['LLD', 'BUILD'],
  'small-bugfix': ['ISSUE', 'BUILD'],
  'sized-bugfix': ['ISSUE', 'LLD', 'PLAN', 'BUILD'],
  'trivial':      ['BUILD'],
  'unknown':      [],
};

const isChainKind = (kind: string): kind is ChainKind => (CHAIN_ORDER as readonly string[]).includes(kind);


/**
 * The item's artifact chain: its own DEF/HLD/ISSUE/LLD/PLAN/BUILD records, the DEF and HLD of its parent epic, and the
 * ISSUE of its parent issue (a sized bugfix's fix story records its ISSUE on the issue it fixes), one row per record
 * (by artifactId within a kind), and a not-recorded row for each kind the route expects but nothing records. Records
 * of any other kind (SPEC, CR, EXT, AMD) are skipped here.
 */
function chainOf(item: DeliveryItemView, byId: ItemIndex, labels: DisplayLabels): ChainRowView[] {
  const parent = item.parentId === null ? undefined : byId.get(item.parentId);
  const inherited = parent === undefined ? []
    : parent.kind === 'epic' ? parent.evidence.filter(e => e.kind === 'DEF' || e.kind === 'HLD')
    : parent.kind === 'issue' ? parent.evidence.filter(e => e.kind === 'ISSUE')
    : [];
  const records = new Map<string, DeliveryEvidenceView>();
  for (const e of [...item.evidence, ...inherited]) if (isChainKind(e.kind) && !records.has(e.artifactId)) records.set(e.artifactId, e);
  const route = item.stage?.route;
  const expected = new Set<ChainKind>(route !== undefined && Object.hasOwn(EXPECTED_BY_ROUTE, route) ? EXPECTED_BY_ROUTE[route] : []);
  const rows: ChainRowView[] = [];
  for (const kind of CHAIN_ORDER) {
    const ofKind = [...records.values()].filter(e => e.kind === kind).sort((a, b) => (a.artifactId < b.artifactId ? -1 : a.artifactId > b.artifactId ? 1 : 0));
    for (const e of ofKind) {
      rows.push({
        kind, status: 'recorded', artifactId: e.artifactId,
        label: labelOf(labels.approval, e.approval.state),
        tone: approvalTone(e.approval.state),
        note: e.review === null ? null : labelOf(labels.reviewVerdict, e.review.verdict),
      });
    }
    if (ofKind.length === 0 && expected.has(kind)) {
      rows.push({ kind, status: 'not-recorded', artifactId: null, label: labels.chain.notRecorded, tone: 'neutral', note: null });
    }
  }
  return rows;
}

/** The stage pill, the task summary and, for a story or issue, its card badges. */
function chipsOf(item: DeliveryItemView, labels: DisplayLabels): BadgeView[] {
  const chips: BadgeView[] = [];
  if (item.stage !== null) chips.push({ kind: 'stage', label: labelOf(labels.stage, item.stage.stage), tone: 'neutral' });
  const summary = taskSummaryOf(item);
  if (summary !== null) {
    // Red whenever the card says Validation failed: a failed task or a failed story-level result.
    const failed = (item.validation?.failed ?? 0) > 0 || item.storyLevelResult === 'failed';
    chips.push({ kind: 'tasks', label: summary.label, tone: failed ? 'danger' : summary.passed === summary.total ? 'success' : 'neutral' });
  }
  if (isCardKind(item)) chips.push(...badgesOf(item, labels));
  return chips;
}

const KICKER_KIND = { epic: 'EPIC', story: 'STORY', task: 'TASK', issue: 'ISSUE' } as const;

function linkedItems(item: DeliveryItemView, byId: ItemIndex): ItemDetailsViewModel['linked'] {
  const linked: { itemId: string; kind: DeliveryItemView['kind']; title: string; relation: 'parent' | 'child' | 'corrects' }[] = [];
  const add = (id: string | null, relation: 'parent' | 'child' | 'corrects'): void => {
    const other = id === null ? undefined : byId.get(id);
    if (other !== undefined) linked.push({ itemId: other.id, kind: other.kind, title: titleOf(other), relation });
  };
  add(item.parentId, 'parent');
  for (const id of item.childIds) add(id, 'child');
  add(item.correctsRef?.resolvedItemId ?? null, 'corrects');
  return linked;
}

/** The issues whose recorded parent resolves to the item, in snapshot order, as followable links. */
function correctedByOf(item: DeliveryItemView, snapshot: DeliverySnapshot, labels: DisplayLabels): LinkView[] {
  return snapshot.items
    .filter(i => i.kind === 'issue' && i.correctsRef?.resolvedItemId === item.id)
    .map(i => ({ itemId: i.id, kind: i.kind, title: titleOf(i), stageLabel: i.stage === null ? null : labelOf(labels.stage, i.stage.stage) }));
}

/** The sc6 details for itemId, or null when the id is not in the snapshot. */
export function buildItemDetails(
  snapshot: DeliverySnapshot,
  itemId: string,
  plan: PlanRead,
  opened: OpenedRecord | null,
  labels: DisplayLabels,
  byId: ItemIndex = indexItems(snapshot),
): ItemDetailsViewModel | null {
  const item = byId.get(itemId);
  if (item === undefined) return null;
  const stage = item.stage;
  const conflictText = conflictSentence(item, byId);
  return {
    itemId: item.id,
    kicker: `${Object.hasOwn(KICKER_KIND, item.kind) ? KICKER_KIND[item.kind] : String(item.kind).toUpperCase()} \u00b7 ${compactIdOf(item.id)}`,
    title: titleOf(item),
    stageLabel: stage === null ? null : labelOf(labels.stage, stage.stage),
    stageReason: stage === null ? null : { text: stage.reason.text, artifactIds: [...stage.reason.artifactIds] },
    chips: chipsOf(item, labels),
    chain: chainOf(item, byId, labels),
    tasks: taskRows(item, plan, byId, labels),
    taskCounts: item.validation === null ? null : { ...item.validation },
    conflict: conflictText === null ? null : { headline: labels.conflictHeadline, text: conflictText },
    evidence: item.evidence.map(e => evidenceRow(e, labels)),
    notices: item.notices.map(n => `${labelOf(labels.notice, n.code)}: ${n.message}`),
    linked: linkedItems(item, byId),
    correctedBy: correctedByOf(item, snapshot, labels),
    sourceIds: [...item.sourceIds],
    planNotice: plan.state === 'failed' ? `The plan could not be read: ${plan.message}` : null,
    openedRecord: opened !== null && item.evidence.some(e => e.artifactId === opened.artifactId) ? opened : null,
  };
}
