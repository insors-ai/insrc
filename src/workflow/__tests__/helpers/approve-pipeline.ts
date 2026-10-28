/**
 * The terminal's approve as the daemon runs it, in one process: the daemon's handler and pipeline, and the client's adapter (Story s10).
 * For tests of what an approval does to the repository; the client's call over the socket is tested in src/cli/__tests__.
 */

import { handleApprovePipeline } from '../../../daemon/workflow-approve.js';
import { approvePipelineFollowOn } from '../../../daemon/approve-pipeline.js';
import { approveOutcomeOf, refusalErrorOf } from '../../../cli/services/workflow.js';
import type { ApproveOutcome } from '../../../cli/services/workflow.js';

/** Approve `artifactPath` through the pipeline; a refusal throws an Error carrying the daemon's reason, as the client does. */
export async function approveThroughPipeline(artifactPath: string, withTracker = true, overrideReview?: string): Promise<ApproveOutcome> {
	const reply = await handleApprovePipeline(
		{ artifactPath, withTracker, ...(overrideReview !== undefined ? { overrideReview } : {}) }, undefined,
		wt => async approved => await approvePipelineFollowOn(approved, { withTracker: wt }),
	);
	if ('error' in reply) throw refusalErrorOf(reply);
	return approveOutcomeOf(reply);
}
