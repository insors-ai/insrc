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
import type { EvidenceRowView, ItemDetailsViewModel, TaskRowView } from './board-protocol.js';
import { indexItems, titleOf, type ItemIndex } from './board-model.js';

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

/** A label from the table, or the code itself when the daemon publishes one the plugin does not know. */
function labelOf<K extends string>(table: Readonly<Record<K, string>>, code: K): string {
  return Object.hasOwn(table, code) ? table[code] : String(code);
}

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
      title: taskItem?.title ?? null,
      resultLabel: t.planned ? labelOf(labels.taskResult, t.result) : labels.unplanned,
      planned: t.planned,
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
  if (failed.length > 0) parts.push(`${failed.length} task result${failed.length === 1 ? '' : 's'} failed (${failed.join(', ')})`);
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
  };
}

function linkedItems(item: DeliveryItemView, byId: ItemIndex): ItemDetailsViewModel['linked'] {
  const linked: { itemId: string; title: string; relation: 'parent' | 'child' | 'corrects' }[] = [];
  const add = (id: string | null, relation: 'parent' | 'child' | 'corrects'): void => {
    const other = id === null ? undefined : byId.get(id);
    if (other !== undefined) linked.push({ itemId: other.id, title: titleOf(other), relation });
  };
  add(item.parentId, 'parent');
  for (const id of item.childIds) add(id, 'child');
  add(item.correctsRef?.resolvedItemId ?? null, 'corrects');
  return linked;
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
  return {
    itemId: item.id,
    title: titleOf(item),
    stageLabel: stage === null ? null : labelOf(labels.stage, stage.stage),
    stageReason: stage === null ? null : { text: stage.reason.text, artifactIds: [...stage.reason.artifactIds] },
    tasks: taskRows(item, plan, byId, labels),
    taskCounts: item.validation === null ? null : { ...item.validation },
    conflict: conflictSentence(item, byId),
    evidence: item.evidence.map(e => evidenceRow(e, labels)),
    notices: item.notices.map(n => `${labelOf(labels.notice, n.code)}: ${n.message}`),
    linked: linkedItems(item, byId),
    sourceIds: [...item.sourceIds],
    planNotice: plan.state === 'failed' ? `The plan could not be read: ${plan.message}` : null,
    openedRecord: opened !== null && item.evidence.some(e => e.artifactId === opened.artifactId) ? opened : null,
  };
}
