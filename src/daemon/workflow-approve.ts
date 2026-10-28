/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Procix Software India. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/**
 * The `workflow.approve` handler: in-CLI, controller-driven approval of one artifact by path, or of every pending artifact
 * under an epic. It runs through the repository's durable LifecycleService (s4), so an approval refuses a head that is
 * ahead of its log, and records the request's person as the actor (the gate's own `insrc:approval` otherwise).
 */

import { approveWorkflowTarget } from '../workflow/gates.js';
import type { WorkflowApproveResult } from '../workflow/gates.js';
import type { LifecycleService } from '../workflow/artifact-core/lifecycle-service.js';
import { approvalActorOf } from '../workflow/artifact-core/approval-actor.js';
import { lifecycleFor, repoOfArtifactPath } from './lifecycle-registry.js';

export interface WorkflowApproveDeps {
	/** The repository's service. The daemon's registry by default. */
	readonly lifecycleFor?: ((repoPath: string) => LifecycleService) | undefined;
	readonly approve?:      typeof approveWorkflowTarget | undefined;
	/** The post-approval seam (the bugfix advance); bound by the daemon, which owns the graph it reads. */
	readonly followOn?:     ((approved: WorkflowApproveResult['approved'], repoPath: string) => Promise<WorkflowApproveResult['followOn']>) | undefined;
}

export async function handleWorkflowApprove(
	params: unknown,
	repoEnv: string | undefined,
	deps: WorkflowApproveDeps = {},
): Promise<WorkflowApproveResult | { error: string }> {
	const p = (params ?? {}) as { repo?: string; artifactPath?: string; epicHash?: string; overrideReview?: string; actor?: unknown };
	const repoPath = (p.repo !== undefined && p.repo.length > 0 ? p.repo : repoEnv) ?? '';
	// repo is only needed to locate the epic's artifacts dir for a batch; a single artifactPath names its own repository.
	if (p.epicHash !== undefined && repoPath.length === 0) {
		return { error: 'workflow.approve: `repo` is required for an epicHash batch' };
	}
// The repository whose store holds the artifact: for a single artifact, the one its path sits in (the request's or the
	// environment's repo may name another); for an epic batch, the request's repo.
	const ofPath = p.artifactPath !== undefined ? repoOfArtifactPath(p.artifactPath) : undefined;
	const repoForStore = ofPath ?? repoPath;
	let lifecycle: LifecycleService;
	let actor;
	try {
		actor = approvalActorOf(p.actor);
		lifecycle = (deps.lifecycleFor ?? (r => lifecycleFor(r).service))(repoForStore);
	} catch (err) {
		return { error: `workflow.approve: ${(err as Error).message}` };
	}
	const result = await (deps.approve ?? approveWorkflowTarget)({
		repoPath: repoForStore.length > 0 ? repoForStore : repoPath,
		...(p.artifactPath !== undefined ? { artifactPath: p.artifactPath } : {}),
		...(p.epicHash !== undefined ? { epicHash: p.epicHash } : {}),
		...(p.overrideReview !== undefined ? { overrideReview: p.overrideReview } : {}),
		lifecycle,
		actor,
	});
	// Post-approval bugfix seam: approveWorkflowTarget is awaited (its completion hook writes the BUILD ledger); the async
	// advance/close run here over the artifacts it actually completed. A seam throw is captured as an `ok:false` followOn by
	// the seam itself, never failing the approval. Skipped when there is nothing completed or no repo to resolve inference.
	if (result.approved.length === 0 || repoForStore.length === 0 || deps.followOn === undefined) return result;
	const followOn = await deps.followOn(result.approved, repoForStore);
	return followOn !== undefined && followOn.length > 0 ? { ...result, followOn } : result;
}

/**
 * `workflow.approvePipeline` (Story s10): one artifact approved and carried through the approve pipeline. `withTracker` (default true)
 * false stops after the approval and the Task reconciliation. Answers the approval and every follow-on entry, or `{ error }` when the
 * approval was refused (a review block, a team refusal, a missing artifact) so the client reports it as it reported the thrown error.
 */
export async function handleApprovePipeline(
	params: unknown,
	repoEnv: string | undefined,
	followOnFor: (withTracker: boolean) => NonNullable<WorkflowApproveDeps['followOn']>,
	deps: Omit<WorkflowApproveDeps, 'followOn'> = {},
): Promise<{ readonly approval: WorkflowApproveResult['approved'][number]['result']; readonly followOn: NonNullable<WorkflowApproveResult['followOn']>; readonly codeReview: WorkflowApproveResult['codeReview'] } | { error: string }> {
	const p = (params ?? {}) as { artifactPath?: unknown; withTracker?: unknown };
	if (typeof p.artifactPath !== 'string' || p.artifactPath.length === 0) return { error: 'workflow.approvePipeline: `artifactPath` is required' };
	if (p.withTracker !== undefined && typeof p.withTracker !== 'boolean') return { error: 'workflow.approvePipeline: `withTracker` must be a boolean' };
	const withTracker = p.withTracker !== false;
	const r = await handleWorkflowApprove({ ...(params as object), epicHash: undefined }, repoEnv, { ...deps, followOn: followOnFor(withTracker) });
	if ('error' in r) return r;
	const first = r.approved[0];
	if (first === undefined) return { error: r.skipped[0]?.reason ?? `workflow.approvePipeline: ${p.artifactPath} was not approved` };
	return { approval: first.result, followOn: r.followOn ?? [], codeReview: r.codeReview };
}
