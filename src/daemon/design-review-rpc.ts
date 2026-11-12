/* Copyright (c) Procix Software India. Licensed under the MIT License. */
import { productionReviews } from './review-service.js';
import type { TrustedRpcContext } from './request-context.js';
import { currentStepContext } from '../shared/step-context.js';
import { requireDesign } from '../workflow/review/design-review/contracts.js';
import type { DesignReviewRequest } from '../workflow/review/design-review/contracts.js';
export function designReviewStep(raw:unknown,trusted?:TrustedRpcContext):Promise<unknown>{
 return productionReviews().design(raw,trusted,currentStepContext()?.client);
}
export async function designReviewOperation(phase:DesignReviewRequest['phase'],raw:unknown,trusted?:TrustedRpcContext):Promise<unknown>{
 requireDesign(raw&&typeof raw==='object'&&!Array.isArray(raw),'invalid_request','Expected operation parameters');
 const fields=raw as Record<string,unknown>;
 requireDesign(fields['phase']===undefined||fields['phase']===phase,'invalid_phase','Operation and phase disagree');
 return designReviewStep({...fields,phase},trusted);
}
