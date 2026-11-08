import type { AdmittedReview } from './execution.js';
import type { ReviewAttempt } from './contracts.js';
import type { FailureDiagnostic } from './diagnostic-schema.js';

interface FeedbackError { code: string; field: string; correction: string; }
interface FeedbackRow { attempt: number; taskId: string; phase: FailureDiagnostic['phase']; errors: FeedbackError[]; }
export interface PreviousRoundFeedback { previousRoundFeedback: FeedbackRow[]; previousRoundFeedbackTruncated?: true; }

/** Corrections are host templates, never instructions copied from native prose. */
function correction(code: string, field: string): string {
 switch (code) {
  case 'MISSING_REQUIRED_FIELD': return field === 'findings' ? 'Return findings as a top-level JSON array.' : 'Return the required JSON field.';
  case 'INVALID_JSON': return 'Return one valid JSON object.';
  case 'INVALID_FIELD_TYPE': return field === 'findings' ? 'Return findings as a top-level JSON array.' : 'Use the field type required by the supplied schema.';
  case 'UNEXPECTED_FIELD': return 'Remove the undeclared JSON field.';
  case 'SCHEMA_CONFIGURATION_ERROR': return 'Correct the supplied review schema before resubmitting.';
  case 'SCHEMA_CONSTRAINT': case 'NATIVE_VALIDATION_ERROR': return 'Return this field according to the supplied schema.';
  case 'HOST_VALIDATION_ERROR':
   if (/^origins\/tasks\/\d+\/sourceAttempt\/\d+$/.test(field)) return 'Set action to "reassess" and omit sourceAttempt for this task. Its exact inputs changed; retain eligible reuse for other tasks.';
   if (field === 'attribution') return 'Return every selected task and cover all submitted changes and tests.';
   if (field === 'location') return 'Keep finding locations inside the submitted change selection.';
   if (field === 'taskId') return 'Use the assigned task ID.';
   if (field === 'evidence' || field === 'evidenceReferences') return 'Use resolved committed evidence references.';
   return 'Correct the host-rejected review field.';
  case 'NATIVE_CLI_FAILURE': return 'Check the saved native CLI error before resubmitting feedback.';
  case 'NATIVE_PROTOCOL_ERROR': return 'Return valid native review output within the protocol limits.';
  default: return 'Correct the reported review-output error.';
 }
}
const resolved = (entry: ReviewAttempt, taskId: string) => entry['review-response'].tasks.some(task => task.taskId === taskId && ['passed', 'changes_requested'].includes(task.status));

/** Derive prompt data without mutating saved history or guessing old errors. */
export function previousRoundFeedback(review?: AdmittedReview, onlyTaskId?: string): PreviousRoundFeedback {
 const output: PreviousRoundFeedback = { previousRoundFeedback: [] };
 if (!review) return output;
 const history = review.checkpoint.attempts.filter(entry => entry.header.attempt < review.attempt.header.attempt && entry.header.reviewer === review.attempt.header.reviewer);
 const latest = history.at(-1);
 if (!latest) return output;
 const taskIds = review.prepared.tasks.filter(task => (!review.prepared.packet.taskId || task.id === review.prepared.packet.taskId) && (!onlyTaskId || task.id === onlyTaskId)).sort((a,b) => a.order-b.order).map(task => task.id);
 const fits = (rows: FeedbackRow[]) => Buffer.byteLength(JSON.stringify({ previousRoundFeedback: rows, previousRoundFeedbackTruncated: true })) <= 4096;
 for (const taskId of taskIds) {
  if (resolved(latest, taskId)) continue;
  let source = latest;
  // Exact result origins may reference the original failed assessment. This
  // is proven reuse provenance, not a search for arbitrary older failures.
  for (let n = 0; n < history.length; n++) {
   if (source['review-response'].failureDiagnostics?.some(entry => entry.phase === 'assessment' && entry.taskId === taskId)) break;
   const origin = source['review-response'].origins?.find(entry => entry.taskId === taskId);
   const prior = origin && history.find(entry => entry.header.attempt === origin.sourceAttempt && entry.header.attempt < source.header.attempt);
   if (!prior) break;
   source = prior;
  }
  const entries = [
   ...(latest['review-response'].failureDiagnostics ?? []).filter(entry => entry.phase === 'attribution'),
   ...(source['review-response'].failureDiagnostics ?? []).filter(entry => entry.phase === 'assessment' && entry.taskId === taskId),
  ];
  let count = 0;
  const seen = new Set<string>();
  // Controller repair has host-owned feedback even when no CLI diagnostic was sent.
  // Project only the structured field and a host template, never arbitrary prose.
  const hostReuse=/^(origins\/tasks\/(\d+)\/sourceAttempt\/\d+):/.exec(latest.header.attributionRepair?.feedback??'');
  if(hostReuse&&latest.header.selectedTaskIds[Number(hostReuse[2])]===taskId){
   const field=hostReuse[1]!,error={code:'HOST_VALIDATION_ERROR',field,correction:correction('HOST_VALIDATION_ERROR',field)};
   const row:FeedbackRow={attempt:latest.header.attempt,taskId,phase:'attribution',errors:[error]};
   if(!fits([...output.previousRoundFeedback,row])){output.previousRoundFeedbackTruncated=true;return output;}
   output.previousRoundFeedback.push(row);seen.add(JSON.stringify(['attribution',error.code,field]));count++;
  }
  for (const entry of entries) {
   if (entry.resolved) continue;
   const row: FeedbackRow = { attempt: entry.phase === 'attribution' ? latest.header.attempt : source.header.attempt, taskId, phase: entry.phase, errors: [] };
   // A concrete schema/host failure is more useful than its generic CLI exit.
   const specific = entry.diagnostic.issues.some(issue => !['NATIVE_CLI_FAILURE','NATIVE_VALIDATION_ERROR'].includes(issue.code));
   for (const issue of entry.diagnostic.issues) {
    const reuse=issue.code==='HOST_VALIDATION_ERROR'?/^origins\/tasks\/(\d+)\/sourceAttempt\/(\d+)$/.exec(issue.field):null;
    if(reuse&&latest.header.selectedTaskIds[Number(reuse[1])]!==taskId)continue;
    if (specific && ['NATIVE_CLI_FAILURE','NATIVE_VALIDATION_ERROR'].includes(issue.code)) continue;
    const key = JSON.stringify([entry.phase,issue.code,issue.field]);
    if (seen.has(key)) continue;
    seen.add(key);
    if (count === 8) { output.previousRoundFeedbackTruncated = true; break; }
    const error = { code: issue.code, field: issue.field, correction: correction(issue.code,issue.field) };
    const candidate = { ...row, errors: [...row.errors,error] };
    const previousRows = row.errors.length ? output.previousRoundFeedback.slice(0,-1) : output.previousRoundFeedback;
    if (!fits([...previousRows,candidate])) { output.previousRoundFeedbackTruncated = true; return output; }
    output.previousRoundFeedback = [...previousRows,candidate]; row.errors.push(error); count++;
   }
   if (entry.diagnostic.truncated) output.previousRoundFeedbackTruncated = true;
  }
 }
 return output;
}

/** Keep raw evidence available on disk without duplicating it in model input. */
export function feedbackHistory(review: AdmittedReview) {
 return { reviewId: review.checkpoint.reviewId, attempts: review.checkpoint.attempts.filter(entry => entry.header.attempt < review.attempt.header.attempt).map(entry => {
  const { failureDiagnostics: _diagnostics, ...response } = entry['review-response'];
  return { header: entry.header, 'review-response': response };
 }) };
}
