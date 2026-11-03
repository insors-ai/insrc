import test from 'node:test';
import assert from 'node:assert/strict';
import { reviewUnavailable } from '../review-unavailable.js';
import { runReview } from '../review/review.js';
import { reviewArtifactFile } from '../review/run-artifact.js';
import { resolveReviewFinding } from '../review/resolve.js';
import { workflowReviewStart } from '../../daemon/workflow-review-rpc.js';
import { codeReviewRunStart } from '../../daemon/code-review-rpc.js';
import { handleReviewArtifact, handleResolveFinding } from '../../daemon/team-review-handlers.js';
import { reviewArtifactStream, codeReviewStream } from '../../mcp/daemon-stream.js';
import { stepToolTable } from '../../daemon/steps/host.js';
const message = 'PENDING REVIEW RE-IMPLEMENTATION';
test('retired review operations throw the exact exception before parsing, providers or IO', async () => {
 const operations = [runReview, reviewArtifactFile, resolveReviewFinding, workflowReviewStart, codeReviewRunStart,
  () => handleReviewArtifact(null), () => handleResolveFinding(null)];
 for (const operation of operations) await assert.rejects(async () => operation(), {message});
 assert.throws(() => reviewUnavailable(), {message});
 assert.throws(() => reviewArtifactStream({artifactPath:'/missing'}, {timeoutMs:1}), {message});
 assert.throws(() => codeReviewStream({repo:'/missing',epicHash:'missing',storyId:'s1'}, {timeoutMs:1}), {message});
});
test('current step tools reject retired input shapes before provider work', async () => {
 const table=stepToolTable();
 for(const name of ['insrc_review_step','insrc_code_review_step'])for(const phase of ['start','claims','verdicts','findings','judgements']){
  await assert.rejects(table[name]!({phase},new AbortController().signal));
 }
});
