import { ReviewOutputFailureError, diagnosticText } from '../../../shared/review-diagnostics.js';
import { DesignReviewError, DESIGN_LIMITS, requireDesign } from './contracts.js';
import type { DesignAttempt, DesignTechnicalFailure } from './contracts.js';

/** Only output/execution failures are retryable; domain/storage/request failures are not. */
export function designTechnicalFailure(error:unknown):DesignTechnicalFailure|undefined {
 let code:DesignTechnicalFailure['code'];
 if(error instanceof DesignReviewError){
  if(['process_failed','transport_failed','review_inactive','invalid_output'].includes(error.code))code=error.code as DesignTechnicalFailure['code'];
  else if(['invalid_result','invalid_plan','invalid_schema','invalid_json','input_too_large'].includes(error.code))code='invalid_output';
  else return undefined;
 }else if(error instanceof ReviewOutputFailureError)code='invalid_output';
 else if(error instanceof Error&&error.name!=='InputTooLargeError'&&error.name!=='ReviewActivityUnsupportedError')code='process_failed';
 else return undefined;
 const issues=error instanceof ReviewOutputFailureError?error.diagnostic.issues.map(i=>`${i.code} ${i.field}: ${i.correction}`).join('; '):'';
 return{code,summary:diagnosticText([error instanceof Error?error.message:'Review execution failed',issues].filter(Boolean).join('; '),DESIGN_LIMITS.text)};
}

export function finishDirectedExecution(attempt:DesignAttempt,code:string,summary:string):void {
 if(!attempt.unit?.userDirectedDispatches)return;
 const action=[...(attempt.actions??[])].reverse().find(a=>a.userDecision?.action==='retry_failed_unit'&&!a.outcome);
 if(action)action.outcome={code,summary:diagnosticText(summary,DESIGN_LIMITS.text)};
}

export function recordDesignFailure(attempt:DesignAttempt,failure:DesignTechnicalFailure):void {
 const unit=attempt.unit;requireDesign(unit,'invalid_checkpoint','Failed execution has no reservation');
 if(unit.userDirectedDispatches)finishDirectedExecution(attempt,failure.code,failure.summary);
 else unit.diagnostics.push({...failure});
}
