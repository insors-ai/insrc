/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Procix Software India. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/**
 * The board's details memory (E2 s4): the selected story's PLAN reads and the
 * one record the reader opened, never persisted. vscode-free.
 *
 * One invalidation rule. The memory follows the board through kept(), which
 * the host calls only after a state is kept, so a state that could not be
 * rendered never changes it. A new snapshot clears the PLAN reads; a new
 * snapshot or a new selection clears the opened record; and either, like an
 * accepted open, supersedes every read still in flight. An answer for a
 * superseded read is dropped. A disposed memory (the panel closed) drops every
 * answer silently; the host starts a new memory with each panel.
 */

import type { ChatPanelLogger } from '../chat/chat-panel.js';
import { buildItemDetails, type OpenedRecord, type PlanRead, type PlanTaskView } from './board-details.js';
import type { ItemDetailsViewModel } from './board-protocol.js';
import type { DeliveryClient, DeliveryResult } from './delivery-client.js';
import type { DeliveryEvidenceRecord, DeliveryItemView, DeliverySnapshot } from './delivery-contract.js';
import { errorText, isObject } from './guards.js';
import type { DisplayLabels } from './labels.js';

export const NO_TASK_LIST = 'The plan record has no task list';

/**
 * A PLAN record's task list. Entries without a string id are skipped; a dependsOn or acceptanceChecks that is not
 * a string array reads as empty, so the task keeps its row.
 */
export function planTasksOf(record: DeliveryEvidenceRecord): PlanRead {
  const tasks = isObject(record.body) ? record.body['tasks'] : undefined;
  if (!Array.isArray(tasks)) return { state: 'failed', message: NO_TASK_LIST };
  const strings = (v: unknown): string[] => (Array.isArray(v) && v.every(x => typeof x === 'string') ? v : []);
  const out: PlanTaskView[] = [];
  for (const t of tasks) {
    if (!isObject(t) || typeof t['id'] !== 'string') continue;
    out.push({ id: t['id'], dependsOn: strings(t['dependsOn']), acceptanceChecks: strings(t['acceptanceChecks']) });
  }
  return { state: 'ok', tasks: out };
}

/** The text shown for an opened read-only record: its rendered markdown, else its meta and body as JSON. */
function recordText(record: DeliveryEvidenceRecord): string {
  return record.renderedMarkdown ?? JSON.stringify({ meta: record.meta, body: record.body }, null, 2);
}

/** The PLAN evidence entry a story's details read, or null for anything else. */
function planIdOf(item: DeliveryItemView | undefined): string | null {
  if (item === undefined || item.kind !== 'story') return null;
  const plans = item.evidence.filter(e => e.kind === 'PLAN');
  return plans.length === 0 ? null : plans[plans.length - 1]!.artifactId;
}

export interface DetailsMemoryDeps {
  readonly client: Pick<DeliveryClient, 'evidence'>;
  readonly log: ChatPanelLogger;
  readonly labels: DisplayLabels;
  /** The review pane, when there is one; a review-view record opens there. */
  readonly reviewPane?: { openArtifact(target: { readonly artifactId: string; readonly mdPath: string }): void } | undefined;
  /** Re-derive the board after an answer changed what the details show. */
  readonly rerender: (what: string) => void;
}

export interface DetailsMemory {
  /** The details for an item of a snapshot, from what the memory holds; a read for another snapshot does not apply. */
  model(snapshot: DeliverySnapshot, itemId: string): ItemDetailsViewModel | null;
  /** Follow a kept state: apply the invalidation rule, then read the selected story's PLAN once. */
  kept(snapshot: DeliverySnapshot | null, selectedItemId: string | null): void;
  /** open-evidence for the kept selection: only one of its own records is opened. */
  openEvidence(itemId: string, artifactId: string): void;
  dispose(): void;
}

export function createDetailsMemory(deps: DetailsMemoryDeps): DetailsMemory {
  const { log } = deps;
  let snapshot: DeliverySnapshot | null = null;
  let selected: string | null = null;
  let plans = new Map<string, PlanRead>();
  /** The opened record; it belongs to `selected`. */
  let opened: OpenedRecord | null = null;
  /** Bumped by every invalidation and accepted open; a record read made under an older value is dropped. */
  let epoch = 0;
  let disposed = false;

  const itemOf = (id: string | null): DeliveryItemView | undefined =>
    id === null || snapshot === null ? undefined : snapshot.items.find(i => i.id === id);

  /** One evidence read, a throw turned into a typed failure; null once the memory is disposed. */
  async function readEvidence(artifactId: string): Promise<DeliveryResult<DeliveryEvidenceRecord> | null> {
    let result: DeliveryResult<DeliveryEvidenceRecord>;
    try {
      result = await deps.client.evidence(artifactId);
    } catch (err) {
      result = { ok: false, failure: { kind: 'read-failed', message: errorText(err) } };
    }
    return disposed ? null : result;
  }

  async function readPlan(planId: string, madeFor: DeliverySnapshot): Promise<void> {
    const result = await readEvidence(planId);
    if (result === null) return;
    if (madeFor !== snapshot) {
      log.warn(`delivery board: dropped the plan read of ${planId}; a newer snapshot is shown`);
      return;
    }
    let read: PlanRead;
    if (result.ok) {
      read = planTasksOf(result.value);
      if (read.state === 'failed') log.error(`delivery board: plan ${planId}: ${read.message}`);
    } else {
      log.error(`delivery board: plan ${planId} ${result.failure.kind}: ${result.failure.message}`);
      read = { state: 'failed', message: result.failure.message };
    }
    plans.set(planId, read);
    if (planIdOf(itemOf(selected)) === planId) deps.rerender(`plan ${planId}`);
  }

  async function readRecord(artifactId: string, madeAt: number): Promise<void> {
    const result = await readEvidence(artifactId);
    if (result === null || madeAt !== epoch) return;   // superseded by a later open, selection or snapshot
    let text: string;
    if (result.ok) {
      text = recordText(result.value);
    } else {
      log.error(`delivery board: record ${artifactId} ${result.failure.kind}: ${result.failure.message}`);
      text = `Could not read ${artifactId}: ${result.failure.message}`;
    }
    opened = { artifactId, text };
    deps.rerender(`record ${artifactId}`);
  }

  return {
    model(snap, itemId) {
      const planId = planIdOf(snap.items.find(i => i.id === itemId));
      const plan: PlanRead = planId === null ? { state: 'none' }
        : (snap === snapshot ? plans.get(planId) : undefined) ?? { state: 'loading' };
      const record = snap === snapshot && itemId === selected ? opened : null;
      return buildItemDetails(snap, itemId, plan, record, deps.labels);
    },

    kept(snap, selectedItemId) {
      if (disposed) return;
      if (snap !== snapshot) {
        snapshot = snap;
        plans = new Map();
        opened = null;
        epoch++;
      }
      if (selectedItemId !== selected) {
        selected = selectedItemId;
        opened = null;
        epoch++;
      }
      const planId = planIdOf(itemOf(selected));
      if (snapshot === null || planId === null || plans.has(planId)) return;
      plans.set(planId, { state: 'loading' });
      void readPlan(planId, snapshot);
    },

    openEvidence(itemId, artifactId) {
      const item = itemId === selected ? itemOf(itemId) : undefined;
      const entry = item?.evidence.find(e => e.artifactId === artifactId);
      if (entry === undefined) {
        log.warn('delivery board: ignored a request to open a record that is not the selected item\'s evidence');
        return;
      }
      // Only an accepted open supersedes a read still in flight.
      const madeAt = ++epoch;
      if (entry.openWith === 'review-view' && entry.mdPath !== null && deps.reviewPane !== undefined) {
        deps.reviewPane.openArtifact({ artifactId, mdPath: entry.mdPath });
        return;
      }
      void readRecord(artifactId, madeAt);
    },

    dispose() {
      disposed = true;
    },
  };
}
