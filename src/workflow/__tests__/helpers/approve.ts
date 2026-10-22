/**
 * TEST HELPER: approve the artifact at `jsonPath` through the lifecycle of the repository that holds it, as the CLI and the daemon do.
 */

import { dirname } from 'node:path';

import { createRepoLifecycle } from '../../artifact-core/repo-lifecycle.js';
import { approveArtifactByJsonPath, approveWorkflowTarget, rejectArtifactByJsonPath } from '../../gates.js';
import type { ApprovalResult, RejectionResult, WorkflowApproveRequest } from '../../gates.js';

/** The repository root of a head at `<repo>/.insrc/artifacts/<id>.json`. */
export const repoOfHead = (jsonPath: string): string => dirname(dirname(dirname(jsonPath)));

export function approveJson(jsonPath: string, overrideReview?: string): Promise<ApprovalResult> {
	return approveArtifactByJsonPath(jsonPath, { lifecycle: createRepoLifecycle(repoOfHead(jsonPath)).service, ...(overrideReview !== undefined ? { overrideReview } : {}) });
}

export function rejectJson(jsonPath: string, reason: string): Promise<RejectionResult> {
	return rejectArtifactByJsonPath(jsonPath, reason, { lifecycle: createRepoLifecycle(repoOfHead(jsonPath)).service });
}

/** Approve a target the way the daemon's route does, through the lifecycle of the repository it names. */
export function approveTarget(req: Omit<WorkflowApproveRequest, 'lifecycle'>, opts?: Parameters<typeof approveWorkflowTarget>[1]): ReturnType<typeof approveWorkflowTarget> {
	return approveWorkflowTarget({ ...req, lifecycle: createRepoLifecycle(req.repoPath).service }, opts);
}
