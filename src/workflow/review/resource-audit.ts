/* Copyright (c) Procix Software India. Licensed under the MIT License. */
import { createHash } from 'node:crypto';
import { Type } from '@sinclair/typebox';
import { Value } from '@sinclair/typebox/value';
import { ReviewResourceGuardSchema, ReviewKeySchema, validateReviewResourceGuard } from '../../shared/review-resources.js';
import type { ReviewResourceGuard, ReviewKey } from '../../shared/review-resources.js';
import type { ArtifactStore } from '../artifact-core/store.js';
import type { ChangeLogEntry } from '../artifact-core/types.js';
import type { Static } from '@sinclair/typebox';

/** Exclude exactly operational lifetime metadata, not input, results or pins. */
export function withoutReviewResourceGuard<T extends object>(attempt: T): Omit<T, 'resourceGuard'> {
 const { resourceGuard: _guard, ...evidence } = attempt as T & { resourceGuard?: unknown };
 return evidence;
}
const ResourceAuditSchema = Type.Object({
 kind: Type.Literal('review-resource-audit'), schemaVersion: Type.Literal(1),
 key: ReviewKeySchema, artifactId: Type.String({ minLength: 1, maxLength: 256 }),
 guards: Type.Array(Type.Object({ attempt: Type.Integer({ minimum: 1, maximum: Number.MAX_SAFE_INTEGER }), resourceGuard: ReviewResourceGuardSchema }, { additionalProperties: false }), { minItems: 1, maxItems: 10000 }),
}, { additionalProperties: false });
export function reviewResourceAudits(log: readonly ChangeLogEntry[], artifactId: string, key: ReviewKey): readonly Static<typeof ResourceAuditSchema>[] {
 const audits: Static<typeof ResourceAuditSchema>[] = [];
 for (const entry of log) {
  const data = entry.outcome?.data as { kind?: unknown; key?: { family?: unknown; reviewId?: unknown } } | undefined;
  if (data?.kind !== 'review-resource-audit' || data.key?.reviewId !== key.reviewId || data.key.family !== key.family) continue;
  if (!Value.Check(ResourceAuditSchema, data) || data.artifactId !== artifactId || data.key.project !== key.project) throw new Error('Unsupported or foreign review resource audit');
  for (const guard of data.guards) validateReviewResourceGuard(guard.resourceGuard, key);
  audits.push(data);
 }
 return audits;
}

/** Revision-less audit in the SAME artifact log. It never changes a review or
 * approval binding. A receipt saved after publication must survive cleanup even
 * though mutable guards are deliberately excluded from preservation identity. */
export async function persistReviewResourceAudit(store: ArtifactStore, artifactId: string, key: ReviewKey,
 guards: readonly { attempt: number; resourceGuard: ReviewResourceGuard }[]): Promise<void> {
 if (!guards.length) return;
 const data = { kind: 'review-resource-audit', schemaVersion: 1, key, artifactId, guards };
 if (!Value.Check(ResourceAuditSchema, data)) throw new Error('Invalid review resource audit');
 for (const guard of guards) validateReviewResourceGuard(guard.resourceGuard, key);
 if (new Set(guards.map(g => g.attempt)).size !== guards.length) throw new Error('Duplicate review resource audit attempt');
 const id = createHash('sha256').update(JSON.stringify(data)).digest('hex');
 await store.exclusive(artifactId, async () => {
  const existing = (await store.history.log(artifactId)).find(entry => entry.id === id);
  if (existing) {
   if (JSON.stringify(existing.outcome?.data) !== JSON.stringify(data)) throw new Error('Conflicting review resource audit');
   return;
  }
  await store.history.appendLog(artifactId, { id, actor: { id: 'agent:review-resource-audit', kind: 'agent', properties: {} },
   timestamp: new Date().toISOString(), operation: 'request-review',
   outcome: { result: 'resource-audit', summary: `Resource lifetime audit for ${key.family} review ${key.reviewId}`, data },
  });
 });
}
