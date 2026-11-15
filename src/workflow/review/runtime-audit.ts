/* Copyright (c) Procix Software India. Licensed under the MIT License. */
import { createHash } from 'node:crypto';
import { constants } from 'node:fs';
import { open, realpath } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { Type } from '@sinclair/typebox';
import { Value } from '@sinclair/typebox/value';
import { isDeepStrictEqual as same } from 'node:util';
import { ReviewRuntimeSchema, ReviewRuntimeReferenceSchema, PreparedContextReferenceSchema, decodeReviewRuntime } from '../../shared/review-preparation.js';
import { ReviewKeySchema } from '../../shared/review-resources.js';
import type { ReviewKey } from '../../shared/review-resources.js';
import type { InactiveRuntimeAudit } from '../../daemon/threads/review-runtime-store.js';
import type { ArtifactStore } from '../artifact-core/store.js';
import type { ChangeLogEntry } from '../artifact-core/types.js';
import { PublicationProofSchema } from './publication-proof.js';
import { FileSidecarStore } from '../artifact-core/sidecar-store.js';

const schema = Type.Object({ kind: Type.Literal('review-runtime-audit'), schemaVersion: Type.Literal(1),
 key: ReviewKeySchema, artifactId: Type.String({ minLength: 1, maxLength: 256 }), runtime: ReviewRuntimeSchema,
 checkpointDigest: Type.String({ pattern: '^[a-f0-9]{64}$' }), checkpointRuntime: ReviewRuntimeReferenceSchema,
 context: Type.Optional(PreparedContextReferenceSchema), publication:Type.Optional(PublicationProofSchema),publicationError:Type.Optional(Type.String({minLength:1,maxLength:65536})),
}, { additionalProperties: false });
const digest = (data: unknown) => createHash('sha256').update(JSON.stringify(data)).digest('hex');
function validate(input: unknown, artifactId: string, key: ReviewKey) {
 if (!Value.Check(schema, input) || input.artifactId !== artifactId || !same(input.key, key)) throw new Error('Unsupported or foreign runtime audit');
 const runtime = decodeReviewRuntime(input.runtime, key);
 if (runtime.state === 'initializing' || runtime.resourceGuard.openLeases.length || input.checkpointRuntime.runtimeId !== runtime.runtimeId
  || input.checkpointRuntime.inputDigest !== runtime.checkpointBinding.inputDigest) throw new Error('Runtime audit does not preserve closed operational proof');
 if(input.publicationError&&!input.publication)throw new Error('Publication diagnostic requires its closed phase proof');
 if(input.publication&&(!same(input.publication.runtime,runtime)||!same(input.context,{generationId:input.publication.binding.generationId,manifestDigest:input.publication.manifestDigest,historyBindingDigest:input.publication.binding.bindingDigest})))throw new Error('Publication audit binding mismatch');
 return input;
}
export function reviewRuntimeAudits(log: readonly ChangeLogEntry[], artifactId: string, key: ReviewKey) {
 return log.flatMap(entry => {
  const data = entry.outcome?.data as { kind?: unknown; key?: { family?: unknown; reviewId?: unknown } } | undefined;
  if (data?.kind !== 'review-runtime-audit' || data.key?.reviewId !== key.reviewId || data.key.family !== key.family) return [];
  const audit = validate(data, artifactId, key);
  if (entry.id !== digest(audit)) throw new Error('Runtime audit identity changed');
  return [audit];
 });
}
/** A revision-less entry in the existing artifact journal, not a second
 * execution ledger. Main calls this under its exact inactive-review fence.
 * Even an existing lost-ack entry is synchronized before replacing runtime. */
export async function persistReviewRuntimeAudit(store: ArtifactStore, artifactId: string, key: ReviewKey, proof: InactiveRuntimeAudit): Promise<void> {
 const data = validate({ kind: 'review-runtime-audit', schemaVersion: 1, key, artifactId, ...structuredClone(proof) }, artifactId, key), id = digest(data);
 await store.exclusive(artifactId, async () => {
  const existing = (await store.history.log(artifactId)).find(entry => entry.id === id);
  if (existing) { if (!same(existing.outcome?.data, data)) throw new Error('Conflicting runtime audit'); }
  else await store.history.appendLog(artifactId, { id, actor: { id: 'insrc:review-runtime-audit', kind: 'system', properties: {} }, timestamp: new Date().toISOString(), operation: 'request-review',
   outcome: { result: 'runtime-audit', summary: `Inactive ${key.family} review runtime ${proof.runtime.runtimeId}`, data } });
  const readback = (await store.history.log(artifactId)).find(entry => entry.id === id);
  if (!same(readback?.outcome?.data, data)) throw new Error('Runtime audit durability readback failed');
  const path = join(key.project, new FileSidecarStore(key.project).filesOf(artifactId).log);
  const file = await open(path, constants.O_RDONLY | constants.O_NOFOLLOW | constants.O_NONBLOCK);
  try { if (!(await file.stat()).isFile()) throw new Error('Invalid runtime audit journal'); await file.sync(); } finally { await file.close(); }
  for (let parent = dirname(path); ; parent = dirname(parent)) {
   if (await realpath(parent) !== parent) throw new Error('Noncanonical runtime audit directory');
   const directory = await open(parent, constants.O_RDONLY | constants.O_DIRECTORY | constants.O_NOFOLLOW);
   try { await directory.sync(); } finally { await directory.close(); }
   if (parent === key.project) break;
   if (dirname(parent) === parent) throw new Error('Runtime audit escaped project');
  }
 });
}
