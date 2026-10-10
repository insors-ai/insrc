/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Procix Software India. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/** Snapshot builders for the board tests: items carry every field the board reads, overridable per item. */

import type { DeliveryEvidenceEntry, DeliveryItem, DeliverySnapshot } from '../delivery-contract.js';

/** stage is the stage id (null for none); reasonIds are the records its reason names. */
export type ItemSpec = Partial<Omit<DeliveryItem, 'stage'>> & { readonly id: string; readonly stage?: string | null; readonly reasonIds?: readonly string[] };

export function item(spec: ItemSpec): DeliveryItem {
  const { stage = spec.kind === 'epic' || spec.kind === 'task' ? null : 'scoped', reasonIds = [], ...rest } = spec;
  return {
    kind: 'story', title: `Title ${spec.id}`, standalone: false, sourceIds: [], parentId: null, childIds: [],
    evidence: [], tasks: [], validation: null, storyLevelResult: null, conflict: null, correctsRef: null,
    amendments: [], notices: [], needsAttention: false, attentionReasons: [],
    ...rest,
    stage: stage === null ? null : { stage, route: 'full-chain', reason: { text: '', artifactIds: reasonIds } },
  } as unknown as DeliveryItem;
}

export function snapshot(items: readonly DeliveryItem[], extra: Partial<DeliverySnapshot> = {}): DeliverySnapshot {
  const sorted = [...items].sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
  return {
    schemaVersion: 1, repo: '/ws', takenAt: '2026-10-09T10:00:00.000Z', recordCount: sorted.length, unreadableCount: 0,
    items: sorted, rootIds: [], notices: [], counts: {}, attentionRule: '', ...extra,
  } as unknown as DeliverySnapshot;
}

/** A review record on an evidence entry: a passing controller review unless overridden. */
export function review(over: Partial<NonNullable<DeliveryEvidenceEntry['review']>> = {}): NonNullable<DeliveryEvidenceEntry['review']> {
  return {
    verdict: 'pass', reviewedAt: '2026-10-09T08:00:00.000Z', reviewedBy: 'controller', counts: { high: 0, med: 0, low: 0 },
    override: null, resolvedFindings: 0, effectiveVerdict: 'pass', blocking: false, ...over,
  };
}

/** An evidence entry: approved, no review, read through evidence-read unless overridden. */
export function evidence(artifactId: string, kind: DeliveryEvidenceEntry['kind'], over: Partial<DeliveryEvidenceEntry> = {}): DeliveryEvidenceEntry {
  return {
    artifactId, kind, mdPath: null, openWith: 'evidence-read',
    approval: { state: 'approved', at: null }, review: null, reviewCurrency: null, ...over,
  };
}

/**
 * The E2 s5 performance fixture: 500 work items formed from 1,000 records, deterministic. 20 epics of 20 stories each
 * (400 stories, two evidence entries apiece, spread across the six stages, each with three planned tasks and recorded
 * results so the cards' task summaries and the rollup's task counts are exercised) and 80 standalone issues; every
 * seventh card needs attention.
 */
export function largeSnapshot(): DeliverySnapshot {
  const stages = ['scoped', 'design-plan', 'ready-design-approved', 'ready-plan-approved', 'build-recorded', 'complete'];
  const pad = (n: number, w: number) => String(n).padStart(w, '0');
  const items: DeliveryItem[] = [];
  let card = 0;
  const attention = () => (card++ % 7 === 0
    ? { needsAttention: true, attentionReasons: ['pending-decision'] as never }
    : {});
  for (let e = 1; e <= 20; e++) {
    const epicId = `E${pad(e, 2)}`;
    const storyIds = Array.from({ length: 20 }, (_, i) => `${epicId}:S${pad(i + 1, 3)}`);
    items.push(item({ id: epicId, kind: 'epic', title: `Epic ${e}`, childIds: storyIds }));
    storyIds.forEach((id, i) => {
      const n = (e - 1) * 20 + i;
      items.push(item({
        id, title: `Story ${n + 1} of epic ${e}`, parentId: epicId, stage: stages[n % 6]!, sourceIds: [`s${i + 1}`],
        evidence: [evidence(`LLD-${id}`, 'LLD'), evidence(`PLAN-${id}`, 'PLAN')], ...attention(),
        tasks: [1, 2, 3].map(t => ({ taskItemId: `${id}:T00${t}`, result: t <= n % 4 ? 'passed' : 'unrecorded', planned: true })) as never,
        validation: { passed: Math.min(3, n % 4), failed: 0, unrecorded: 3 - Math.min(3, n % 4), unplanned: 0 },
      }));
    });
  }
  for (let i = 1; i <= 80; i++) {
    items.push(item({ id: `I${pad(i, 3)}`, kind: 'issue', title: `Issue ${i}`, standalone: true, stage: stages[i % 6]!, ...attention() }));
  }
  return snapshot(items, { recordCount: 1000 });
}
