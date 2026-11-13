/* Copyright (c) Procix Software India. Licensed under the MIT License. */
import { Type } from '@sinclair/typebox';
import type { Static } from '@sinclair/typebox';
import { Value } from '@sinclair/typebox/value';
import { createHash } from 'node:crypto';

// A bound is a refusal boundary, never permission to discard an open lease.
export const MAX_REVIEW_OPEN_LEASES = 128;
const id = Type.String({ minLength: 1, maxLength: 256 });
const timestamp = Type.String({ minLength: 20, maxLength: 30, pattern: '^\\d{4}-\\d{2}-\\d{2}T.*Z$' });
const object = Type.Object;
export const ReviewKeySchema = object({
 project: Type.String({ minLength: 1, maxLength: 4096 }),
 family: Type.Union([Type.Literal('code'), Type.Literal('design')]),
 reviewId: Type.String({ pattern: '^[a-zA-Z0-9][a-zA-Z0-9_-]{0,127}$' }),
}, { additionalProperties: false });
export type ReviewKey = Static<typeof ReviewKeySchema>;
export const ReviewResourceRecoveryInputSchema=object({
 reason:Type.String({minLength:1,maxLength:2048}),
 leaseIds:Type.Optional(Type.Array(id,{minItems:1,maxItems:MAX_REVIEW_OPEN_LEASES,uniqueItems:true})),
},{additionalProperties:false});
export const ReviewResourceGuardSchema = object({
 daemonInstance: id,
 openLeases: Type.Array(object({
  operationId: id, workerIncarnation: id, kind: id, openedAt: timestamp,
 }, { additionalProperties: false }), { maxItems: MAX_REVIEW_OPEN_LEASES }),
 clearance: Type.Optional(object({
  at: timestamp, reason: Type.String({ minLength: 1, maxLength: 2048 }),
  approvalReceipt: object({
   requestId: id, decision: Type.Literal('approve'), reviewKey: ReviewKeySchema,
   guardDigest: Type.String({ pattern: '^[0-9a-f]{64}$' }),
   leaseIds: Type.Array(id, { minItems: 1, maxItems: MAX_REVIEW_OPEN_LEASES, uniqueItems: true }),
  }, { additionalProperties: false }),
 }, { additionalProperties: false })),
}, { additionalProperties: false });
export type ReviewResourceGuard = Static<typeof ReviewResourceGuardSchema>;
export type ReviewAuthorizedClearance=NonNullable<ReviewResourceGuard['clearance']>;
export interface ReviewGuardRow {readonly attempt:number;readonly resourceGuard:ReviewResourceGuard;}
/** Exact semantic snapshot, independent of object key or lease-set ordering. */
export function reviewGuardDigest(key:ReviewKey,guards:readonly ReviewGuardRow[]):string{
 const ordered=guards.map(row=>({...row,resourceGuard:{...row.resourceGuard,openLeases:[...row.resourceGuard.openLeases].sort((a,b)=>a.operationId.localeCompare(b.operationId))}})).sort((a,b)=>a.attempt-b.attempt);
 const bytes=JSON.stringify({key,guards:ordered},(_k,item:unknown)=>item&&typeof item==='object'&&!Array.isArray(item)?Object.fromEntries(Object.entries(item).sort(([a],[b])=>a.localeCompare(b))):item);
 return createHash('sha256').update(bytes).digest('hex');
}

/** Contract validation only. A receipt is NOT authorization: the host must
 * verify its pending broker outcome, exact guard digest and lease set. */
export function validateReviewResourceGuard(input: unknown, key: ReviewKey): asserts input is ReviewResourceGuard {
 if (!Value.Check(ReviewKeySchema, key) || !Value.Check(ReviewResourceGuardSchema, input)) throw new Error('Invalid review resource guard');
 const ids = input.openLeases.map(lease => lease.operationId);
 if (new Set(ids).size !== ids.length) throw new Error('Duplicate open review lease');
 for (const lease of input.openLeases) if (!Number.isFinite(Date.parse(lease.openedAt))) throw new Error('Invalid review lease timestamp');
 const clearance = input.clearance;
 if (clearance) {
  const bound = clearance.approvalReceipt.reviewKey;
  if (bound.project !== key.project || bound.family !== key.family || bound.reviewId !== key.reviewId) throw new Error('Foreign review clearance receipt');
  if (!Number.isFinite(Date.parse(clearance.at))) throw new Error('Invalid review clearance timestamp');
 }
}
