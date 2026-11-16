/** Read-only historical review compatibility. No live review execution. */
/* Copyright (c) Procix Software India. Licensed under the MIT License. */
import { Type } from '@sinclair/typebox';
import type { Static } from '@sinclair/typebox';
import { Value } from '@sinclair/typebox/value';
import { isDeepStrictEqual as same } from 'node:util';
import { ReviewRuntimeSchema, HistoryBindingSchema, decodeReviewRuntime } from "../shared/review-preparation.js";
import type { ReviewKey } from "../shared/review-resources.js";
import { preparationDigest } from "./prepared-context.js";
import { decodePreparationCheckpoint } from "./preparation-checkpoint.js";
import type { PreparationHistory } from "./history-binding.js";
/** A permanent, closed operational audit, not a cross-restart cache credential.
 * Only the private main owner issues this to a publication worker. */
export const PublicationProofSchema = Type.Object({
    schemaVersion: Type.Literal(1), runtime: ReviewRuntimeSchema, binding: HistoryBindingSchema,
    manifestDigest: Type.String({ pattern: '^[a-f0-9]{64}$' }),
    evidenceDigest: Type.String({ pattern: '^[a-f0-9]{64}$' }),
}, { additionalProperties: false });
export type PublicationProof = Static<typeof PublicationProofSchema>;
/** Publication receipt/progress changes are bookkeeping. Preserve every input,
 * action, diagnostic, attribution and result while making a lost-ack retry
 * compare against the same complete assessment history. */
export function publicationEvidence(history: PreparationHistory): unknown {
    const { runtime: _runtime, context: _context, ...root } = history;
    return { ...root, attempts: history.attempts.map(entry => {
            const { progress: _progress, ...attempt } = entry;
            if ('header' in attempt && 'review-response' in attempt) {
                const { activeTaskId: _active, status: _status, ...header } = attempt.header;
                const { crPublication: _publication, crPath: _path, summary: _summary, ...response } = attempt['review-response'];
                // This exact host-generated diagnostic is publication bookkeeping. Main
                // preserves it in the phase audit before a successful retry clears it.
                if (response.error?.startsWith('CR publication failed: '))
                    delete response.error;
                return { ...attempt, header, 'review-response': response };
            }
            if ('phase' in attempt && attempt.phase === 'admission')
                return attempt;
            const { current: _current, publication: _publication, ...review } = attempt as Exclude<typeof attempt, {
                phase: 'admission';
            }>;
            return review;
        }) };
}
export const publicationEvidenceDigest = (history: PreparationHistory): string => preparationDigest(publicationEvidence(history));
export function validatePublicationProof(input: unknown, history: PreparationHistory, key: ReviewKey): PublicationProof {
    if (!Value.Check(PublicationProofSchema, input))
        throw new Error('Unsupported permanent preparation proof');
    const proof = input, runtime = decodeReviewRuntime(proof.runtime, key), last = history.attempts.at(-1)!;
    const attempt = 'header' in last ? last.header.attempt : last.number, binding = proof.binding;
    decodePreparationCheckpoint(history, key);
    if (runtime.state !== 'terminal' || runtime.cancellation || runtime.resourceGuard.openLeases.length
        || !same(binding.key, key) || binding.attempt !== attempt || runtime.attempt !== attempt || runtime.runtimeId !== history.runtime.runtimeId
        || runtime.checkpointBinding.inputDigest !== history.runtime.inputDigest || binding.bindingDigest !== preparationDigest({ ...binding, bindingDigest: '' })
        || runtime.checkpointBinding.historyBindingDigest !== binding.bindingDigest || runtime.checkpointBinding.semanticSequence !== binding.semanticSequence
        || history.context?.generationId !== binding.generationId || history.context.manifestDigest !== proof.manifestDigest
        || history.context.historyBindingDigest !== binding.bindingDigest || proof.evidenceDigest !== publicationEvidenceDigest(history))
        throw new Error('Permanent preparation proof does not bind closed complete history');
    return proof;
}
