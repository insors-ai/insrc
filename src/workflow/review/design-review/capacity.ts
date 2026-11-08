/* Copyright (c) Procix Software India. Licensed under the MIT License. */
import { DESIGN_LIMITS, requireDesign } from './contracts.js';
import type { DesignReviewCheckpoint } from './contracts.js';

/** Checkpoints use compact JSON so embedded JSON values cost their encoded bytes exactly once. */
export const serializeDesignCheckpoint = (checkpoint: DesignReviewCheckpoint): string => JSON.stringify(checkpoint) + '\n';
const bytes = (value: unknown): number => Buffer.byteLength(JSON.stringify(value));
const maxText = '\u0000'.repeat(DESIGN_LIMITS.text); // six encoded bytes per character
const maxId = 'x'.repeat(128), maxNumber = Number.MAX_SAFE_INTEGER;
const diagnostic = { code: maxId, summary: maxText };
// One execution can add a unit summary and bounded diagnostics, one action outcome,
// progress/recovery/failure state and model attribution. Existing metadata is already
// counted below; this envelope bounds all fields which can grow before the next admission.
const terminalEnvelope = {
 status: maxText,
 model: maxText, failure: diagnostic, outcome: diagnostic,
 progress: { checkpointPath: 'x'.repeat(DESIGN_LIMITS.path), failedUnit: { unitId: maxId, phase: maxText, retriesUsed: maxNumber, ...diagnostic }, recovery: { reason: maxText, completedChunkIds: Array(DESIGN_LIMITS.chunks).fill(maxId) }, ...Object.fromEntries(Array.from({length:32},(_,i)=>['counter'+i,maxNumber])) },
 recovery: { failedUnit: diagnostic, completedChunkIds: Array(DESIGN_LIMITS.chunks).fill(maxId) },
 unit: { unitId: maxId, executionId: maxId, diagnostics: Array(DESIGN_LIMITS.automaticDispatches).fill(diagnostic) },
 summary: { unitId: maxId, diagnostics: Array(DESIGN_LIMITS.automaticDispatches).fill(diagnostic), actionIds: Array(DESIGN_LIMITS.actions).fill(maxId) },
 current: { kind: maxText, executionId: maxId, chunkId: maxId, issuedAt: maxText, sequence: maxNumber },
 finishedAt: maxText,
};

/** Conservative encoded bound, shared with the writer; no percentages or character estimates.
 * A result may occur in completedChunks, report.chunks and report.limitations. Include
 * the already accepted prefix's two future copies and all possible prior origin data.
 * Accepted results (including host additions) remain capped at resultBytes.
 */
export function designDispatchCapacity(checkpoint: DesignReviewCheckpoint): number {
 const attempt = checkpoint.attempts.at(-1)!;
 // Current observer/dispatch fields are covered at their upper bounds below, not
 // charged again at their variable instantaneous sizes. This makes an admission
 // stable while progress, model attribution and the reserved generation are saved.
 const { progress: _progress, current: _current, unit: _unit, model: _model,
  status: _status, finishedAt: _finishedAt, failure: _failure, recovery: _recovery, ...stable } = attempt;
 const admitted = {...checkpoint,attempts:[...checkpoint.attempts.slice(0,-1),stable]} as DesignReviewCheckpoint;
 const prefix = bytes(attempt.completedChunks);
 const historicalOrigins = checkpoint.attempts.flatMap(a => a.completedChunks.flatMap(r => r.findings.map(f => ({ attempt: a.number, chunkId: r.chunkId, findingId: f.id }))));
 const nextOrigins = Array(DESIGN_LIMITS.findings).fill({ attempt: DESIGN_LIMITS.attempts, chunkId: maxId, findingId: maxId });
 const reportEnvelope = { reviewId: maxId, artifactId: 'x'.repeat(DESIGN_LIMITS.path), attempt: maxNumber, status: maxText, counts: { HIGH: maxNumber, MED: maxNumber, LOW: maxNumber }, reviewedContentIdentity: 'x'.repeat(64), reviewer: maxText,
  impact: { baselineAttempt: maxNumber, mode: maxText, effectiveFindingOrigins: [...historicalOrigins, ...nextOrigins], coverageOrigins: Array(DESIGN_LIMITS.chunks).fill({ chunkId: maxId, kind: maxText, fromAttempt: maxNumber, fromChunkId: maxId, justification: maxText }) } };
 const response = attempt.plan ? DESIGN_LIMITS.resultBytes * 3 : DESIGN_LIMITS.requestBytes * 2;
 return Buffer.byteLength(serializeDesignCheckpoint(admitted)) + prefix * 2 + response + bytes(terminalEnvelope) + bytes(reportEnvelope);
}
export function assertDesignDispatchCapacity(checkpoint: DesignReviewCheckpoint, limit: number = DESIGN_LIMITS.checkpointBytes): void {
 requireDesign(limit <= DESIGN_LIMITS.checkpointBytes && designDispatchCapacity(checkpoint) <= limit,
  'checkpoint_capacity', 'Checkpoint cannot reserve the next response, consolidation and terminal metadata; no model work dispatched');
}
