/* Copyright (c) Procix Software India. Licensed under the MIT License. */
import type { ReviewBootstrapInput } from './review-worker-contract.js';
import type { DesignAdmissionAttempt } from '../../workflow/review/design-review/contracts.js';
export function submission(input: ReviewBootstrapInput): DesignAdmissionAttempt['submitted'] {
 const raw = input.submitted as { phase?: string; artifactPath?: string; attempt?: number; operation?: 'resume' | 'restart_full' | 'retry_publication'; userDecision?: NonNullable<DesignAdmissionAttempt['submitted']['recovery']>['userDecision'] };
 if (raw?.phase === 'recover' && raw.operation) return { attempt: raw.attempt!, recovery: { operation: raw.operation, ...(raw.userDecision ? { userDecision: raw.userDecision } : {}) } };
 return { artifactPath: raw.artifactPath!, attempt: input.attempt };
}
