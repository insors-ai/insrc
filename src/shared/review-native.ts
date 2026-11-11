/* Copyright (c) Procix Software India. Licensed under the MIT License. */
import type { ReviewKey } from './review-resources.js';
import type { ProcessDisposal } from './process-group.js';

export interface ReviewNativeCommand {
 readonly kind: string;
 readonly command: string;
 readonly args: readonly string[];
 readonly cwd: string;
 readonly env?: Readonly<Record<string, string>> | undefined;
 readonly stdin?: Uint8Array | undefined;
 readonly keepStdinOpen?: boolean | undefined;
 readonly timeoutMs?: number | undefined;
}
export interface ReviewProcessOwner { readonly key: Readonly<ReviewKey>; readonly incarnation: string; }
export interface ReviewProcessReservation {
 readonly key: Readonly<ReviewKey>; readonly daemonInstance: string;
 readonly operationId: string; readonly workerIncarnation: string; readonly kind: string;
 readonly openedAt: string; readonly commandDigest: string;
}
/** A correlated save acknowledgment, verified by the main's registered worker
 * bridge. A worker-supplied boolean or arbitrary client receipt is insufficient. */
export interface ReviewIntentReceipt {
 readonly checkpointPath: string; readonly attempt: number;
 readonly operationId: string; readonly workerIncarnation: string; readonly daemonInstance: string;
}
export interface ReviewProcessOutput {
 readonly operationId: string; readonly workerIncarnation: string;
 readonly sequence: number; readonly stream: 'stdout' | 'stderr'; readonly bytes: Uint8Array;
}
export interface ReviewProcessOutcome {
 readonly code: number | null; readonly signal: string | null;
 readonly aborted: boolean; readonly timedOut: boolean; readonly spawnError: boolean;
 readonly disposal: ProcessDisposal;
 readonly stdoutBytes: number; readonly stderrBytes: number;
 readonly error?: { readonly code: string; readonly detail?: string | undefined } | undefined;
}
export interface ReviewProcessRun {
 readonly started: Promise<{ readonly spawned: boolean; readonly pid?: number | undefined }>;
 readonly result: Promise<ReviewProcessOutcome>;
}
/** Only the registered main host sends this after observing owned disposal.
 * It is not accepted from submission packets or public review exchanges. */
export interface ConfirmedReviewLeaseClosure {
 readonly reservation:ReviewProcessReservation;
 readonly disposal:Extract<ProcessDisposal,{state:'confirmed'}>;
}
