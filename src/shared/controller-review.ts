import type { LLMMessage } from './types.js';
/** Wire description of an actual isolated controller helper, separate from tool arguments. */
export interface ControllerExecutionCapability {
 readonly adapterId: import('../agent/providers/cli-provider.js').BoundedCliAdapterId;
 readonly maxInputChars: number;
 readonly helperEpoch?: string | undefined;
 readonly modelLabel?: string | undefined;
}

export interface ControllerInputRequest { readonly mode: 'isolated-structured'; readonly maxInputChars: number; readonly adapterId: ControllerExecutionCapability['adapterId'] }
export type ControllerCallResult = { readonly callId: string } & (
 | { readonly answer: unknown; readonly failure?: never }
 | { readonly failure: { readonly cause: 'size-refusal' | 'invalid-answer' | 'transient' | 'stall'; readonly detail: string; readonly maxChars?: number | undefined }; readonly answer?: never });
export interface CodeReviewStepEmitCall {
 readonly next: 'emit_review_call';
 readonly state: string;
 readonly guidance: string;
 readonly call: { readonly callId: string; readonly dimension: import('../workflow/code-review/types.js').ReviewDimension; readonly stage: string; readonly role: import('../workflow/review-pipeline/types.js').CallRole; readonly messages: readonly LLMMessage[]; readonly schema: import('./types.js').StructuredSchema; readonly limitChars: number; readonly expiresAt: number };
 readonly timing: Pick<import('../workflow/code-review/types.js').ReviewTimingPlan, 'startedAt' | 'chunkCount' | 'budgetMs' | 'deadlineAt'>;
}
