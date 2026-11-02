import type { TaskReviewRpcDeps } from '../task-review-rpc.js';
import type { TrustedRpcContext } from '../request-context.js';
import { startTaskReview, exchangeControllerTaskReview, publishStoredTaskReview, readTaskReviewProgress } from '../task-review-rpc.js';
import { requireReview, MAX_REVIEW_JSON_BYTES } from '../../workflow/code-review/task-review/contracts.js';
import { currentStepContext } from '../../shared/step-context.js';

export async function handleTaskReviewStep(raw: unknown, trusted?: TrustedRpcContext, deps: TaskReviewRpcDeps = {}) {
 requireReview(raw && typeof raw === 'object' && !Array.isArray(raw), 'request', 'Expected task review request');
 const input = raw as Record<string,unknown>;
 requireReview(Buffer.byteLength(JSON.stringify(input)) <= MAX_REVIEW_JSON_BYTES, 'request', 'JSON exceeds limit');
 const allowed = new Set(['phase','repo','epicHash','reviewId','attempt','packet','scope','result','taskId','executionId','sequence','event']);
 requireReview(Object.keys(input).every(key=>allowed.has(key)), 'request', 'Unsupported review field; old review engine inputs are not accepted');
 const phase=input['phase'];
 requireReview(typeof phase==='string'&&['start','resume','progress','publish','assignment','scope','activity','result'].includes(phase),'phase','Expected current task review phase');
 const fields = new Set(['phase','repo','epicHash','reviewId','attempt',...(phase==='start'||phase==='resume'?['packet']:[]),...(['scope','activity','result'].includes(phase)?['taskId','executionId','sequence',phase==='activity'?'event':phase]:[])]);
 requireReview(Object.keys(input).every(key=>fields.has(key)), 'request', 'Unexpected field for review phase');
 requireReview(typeof input['epicHash']==='string'&&/^[a-f0-9]{16}$/.test(input['epicHash']), 'epicHash', 'Expected canonical epic hash');
 const common={repo:input['repo'],epicHash:input['epicHash'],reviewId:input['reviewId'],attempt:input['attempt']};
 let output:unknown;
 if(phase==='start'||phase==='resume'){
  requireReview(phase!=='start'||input['packet']!==undefined,'packet','Create a committed packet before review start');
  output=await startTaskReview({...common,operation:phase,...(input['packet']!==undefined?{packet:input['packet']}:{}),timingProtocol:'activity-v1',client:currentStepContext()?.client},trusted,deps);
 }else if(phase==='progress')output=await readTaskReviewProgress(common);
 else if(phase==='publish')output=await publishStoredTaskReview(common);
 else output=await exchangeControllerTaskReview({...common,taskId:input['taskId'],executionId:input['executionId'],sequence:input['sequence'],scope:input['scope'],event:input['event'],result:input['result']},trusted,phase as 'assignment'|'scope'|'activity'|'result');
 return {content:[{type:'text' as const,text:JSON.stringify(output)}]};
}
