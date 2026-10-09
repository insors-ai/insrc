/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Procix Software India. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/** Snapshot builders for the board tests: items carry every field the board reads, overridable per item. */

import type { DeliveryItem, DeliverySnapshot } from '../delivery-contract.js';

export type ItemSpec = Partial<Omit<DeliveryItem, 'stage'>> & { readonly id: string; readonly stage?: string | null };

export function item(spec: ItemSpec): DeliveryItem {
  const { stage = spec.kind === 'epic' || spec.kind === 'task' ? null : 'scoped', ...rest } = spec;
  return {
    kind: 'story', title: `Title ${spec.id}`, standalone: false, sourceIds: [], parentId: null, childIds: [],
    evidence: [], tasks: [], validation: null, storyLevelResult: null, conflict: null, correctsRef: null,
    amendments: [], notices: [], needsAttention: false, attentionReasons: [],
    ...rest,
    stage: stage === null ? null : { stage, route: 'full-chain', reason: { text: '', artifactIds: [] } },
  } as unknown as DeliveryItem;
}

export function snapshot(items: readonly DeliveryItem[], extra: Partial<DeliverySnapshot> = {}): DeliverySnapshot {
  const sorted = [...items].sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
  return {
    schemaVersion: 1, repo: '/ws', takenAt: '2026-10-09T10:00:00.000Z', recordCount: sorted.length, unreadableCount: 0,
    items: sorted, rootIds: [], notices: [], counts: {}, attentionRule: '', ...extra,
  } as unknown as DeliverySnapshot;
}
