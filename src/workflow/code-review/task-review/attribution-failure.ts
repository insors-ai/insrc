/* Copyright (c) Procix Software India. Licensed under the MIT License. */
import { diagnosticText } from '../../../shared/review-diagnostics.js';
import { requireReview } from './contracts.js';
import type { ReviewAttempt, TaskReviewResult } from './contracts.js';
import { attributionIdentity, validateSavedAttribution } from './attribution-binding.js';
import { taskFailure } from './assessment.js';

/** One shared bounded diagnostic; task outcomes point here instead of copying it. */
export function failAttribution(attempt: ReviewAttempt, error: unknown, timedOut: boolean): void {
 const h=attempt.header;
 requireReview(h.attributionState==='pending'||h.attributionState==='failed','attribution','Accepted attribution cannot be downgraded');
 if(h.attributionState==='failed'){validateSavedAttribution(attempt);return;}
 requireReview(h.finalScopeIdentity,'attribution','Failure lacks verified final projection');
 const failure={code:timedOut?'attribution_inactive':'attribution_failed',summary:diagnosticText(error instanceof Error?error.message:String(error),8192)||'Unknown attribution failure'};
 h.attributionState='failed';h.attributionFailure=failure;
 h.attributionIdentity=attributionIdentity('unmapped_failure',h.finalScopeIdentity,h.selectedTaskIds,attempt.submitted.tests.length,[]);
 validateSavedAttribution(attempt);
}
export function unmappedTaskFailure(taskId:string,timedOut:boolean):TaskReviewResult {
 return taskFailure(taskId,'No task scope was accepted. See the shared attribution failure and review diagnostics.',timedOut);
}
export function attributionTimedOut(attempt:ReviewAttempt):boolean{return attempt.header.attributionFailure?.code==='attribution_inactive';}
