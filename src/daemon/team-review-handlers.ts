/**
 * The team and review operations at the daemon (Story s10): team.refresh, team.claim, team.release, workflow.reviewArtifact and
 * workflow.resolveFinding. Each returns what the terminal's service returned and reaches the tracker and git only through the registry
 * tools here; a ToolDenied is thrown and reaches the client as the error of the call.
 */

import { homedir } from 'node:os';
import { join, resolve } from 'node:path';

import { createRoleRouter } from '../analyze/context/role-router.js';
import { runWithRoutingContext } from '../analyze/context/shaper-provider.js';
import { loadAnalyzeConfig } from '../config/analyze.js';
import { jsonPathForMd } from '../workflow/gates.js';
import { reviewArtifactFile, resolveReviewFinding } from '../workflow/review/index.js';
import type { ReviewAction, ReviewArtifactResult, ResolveReviewResult } from '../workflow/review/index.js';
import { claim, describeOutcome, release, TeamGateRefusedError } from '../workflow/team/gate.js';
import type { GateOutcome } from '../workflow/team/gate.js';
import { refreshPolicy } from '../workflow/team/policy-refresh.js';
import type { UnitRef } from '../workflow/tracker/refs.js';
import { lifecycleFor } from './lifecycle-registry.js';

const absPath = (path: string): string => resolve(path === '~' ? homedir() : path.startsWith('~/') ? join(homedir(), path.slice(2)) : path);

function repoOf(method: string, p: { repoPath?: unknown }): string {
	if (typeof p.repoPath !== 'string' || p.repoPath.length === 0) throw new Error(`${method}: \`repoPath\` is required`);
	return absPath(p.repoPath);
}

/** Printable name of a claim unit: "epic <hash>", "story <hash>/s1" or "task <hash>/s1/t2". */
export function unitLabel(unit: UnitRef): string {
	return [unit.unit, [unit.epicHash, unit.storyId, unit.taskId].filter(x => x !== undefined).join('/')].join(' ');
}

/** The claim and release outcome as the terminal prints it: a tick line, or a cross line naming the reason (the holder for a held stage). */
function outcomeLine(outcome: GateOutcome, unit: UnitRef, done: string, failed: string): string {
	return outcome.kind === 'allowed' ? `✓ ${done} ${unitLabel(unit)}` : `✗ not ${failed} — ${describeOutcome(outcome)}`;
}

function unitOf(method: string, p: { repoPath?: unknown; unit?: unknown }): UnitRef {
	const repoPath = repoOf(method, p);
	const u = p.unit as { unit?: unknown; epicHash?: unknown } | undefined;
	if (u === undefined || u === null || typeof u !== 'object' || typeof u.epicHash !== 'string' || (u.unit !== 'epic' && u.unit !== 'story' && u.unit !== 'task')) {
		throw new Error(`${method}: \`unit\` {unit, epicHash, storyId?, taskId?} is required`);
	}
	return { ...(u as object), repoPath } as UnitRef;
}

/** `team.refresh` {repoPath, branch?} -> the result line; a refused refresh is the error of the call. */
export async function handleTeamRefresh(params: unknown): Promise<string> {
	const p = (params ?? {}) as { repoPath?: unknown; branch?: unknown };
	const refreshed = await refreshPolicy(repoOf('team.refresh', p), { branch: typeof p.branch === 'string' ? p.branch : undefined });
	if (!refreshed.ok) throw new Error(refreshed.reason);
	const out = refreshed.value;
	const warn = out.warnings.length > 0 ? `  ⚠ ${out.warnings.join('; ')}` : '';
	switch (out.kind) {
		case 'fetched': return `✓ fetched ${out.branch} @ ${out.sha.slice(0, 7)} — team policy applied${warn}`;
		case 'absent':  return `• no policy file on ${out.branch} — this repository is treated as solo${warn}`;
		case 'invalid': return `⚠ the policy file on ${out.branch} is invalid and team actions will be refused until it is fixed: ${out.reason}${warn}`;
	}
}

/** `team.claim` {repoPath, unit} -> the result line. */
export async function handleTeamClaim(params: unknown): Promise<string> {
	const unit = unitOf('team.claim', (params ?? {}) as object);
	return outcomeLine(await claim(unit.repoPath, unit), unit, 'claimed', 'claimed');
}

/** `team.release` {repoPath, unit} -> the result line. */
export async function handleTeamRelease(params: unknown): Promise<string> {
	const unit = unitOf('team.release', (params ?? {}) as object);
	return outcomeLine(await release(unit.repoPath, unit), unit, 'released', 'released');
}

/** What `workflow.reviewArtifact` reviews with; a test replaces them. */
export interface ReviewArtifactDeps {
	readonly review?: typeof reviewArtifactFile | undefined;
}

/**
 * `workflow.reviewArtifact` {repoPath, artifactPath}: review the artifact (its .md path) with the provider the role router resolves for the
 * `review` role, in the daemon. The resulting `block` verdict is what an approval then enforces.
 */
export async function handleReviewArtifact(params: unknown, deps: ReviewArtifactDeps = {}): Promise<ReviewArtifactResult> {
	const p = (params ?? {}) as { repoPath?: unknown; artifactPath?: unknown };
	const repoPath = repoOf('workflow.reviewArtifact', p);
	if (typeof p.artifactPath !== 'string' || p.artifactPath.length === 0) throw new Error('workflow.reviewArtifact: `artifactPath` is required');
	const artifactPath = p.artifactPath;
	const router = createRoleRouter({});
	return await runWithRoutingContext({ router, repoPath }, async () => {
		const { provider, resolution } = router.resolveProviderForRole('review', loadAnalyzeConfig(), repoPath);
		return await (deps.review ?? reviewArtifactFile)({
			mdPath:     artifactPath,
			jsonPath:   jsonPathForMd(artifactPath),
			repo:       repoPath,
			lifecycle:  lifecycleFor(repoPath).service,
			provider,
			model:      `${resolution.runner}:${resolution.model}`,
			reviewedAt: new Date().toISOString(),
		});
	});
}

/** `workflow.resolveFinding` {artifactPath, findingId, action, note?}: resolve one review finding (apply | accept | override | defer). */
export async function handleResolveFinding(params: unknown): Promise<ResolveReviewResult | { error: string; refusal: { kind: 'team-refused'; text: string } }> {
	const p = (params ?? {}) as { artifactPath?: unknown; findingId?: unknown; action?: unknown; note?: unknown };
	if (typeof p.artifactPath !== 'string' || p.artifactPath.length === 0) throw new Error('workflow.resolveFinding: `artifactPath` is required');
	if (typeof p.findingId !== 'string' || p.findingId.length === 0) throw new Error('workflow.resolveFinding: `findingId` is required');
	if (p.action !== 'apply' && p.action !== 'accept' && p.action !== 'override' && p.action !== 'defer') throw new Error('workflow.resolveFinding: `action` must be apply, accept, override or defer');
	try {
		return await resolveReviewFinding(p.artifactPath, jsonPathForMd(p.artifactPath), p.findingId, p.action as ReviewAction, typeof p.note === 'string' ? p.note : undefined);
	} catch (err) {
		// applying a finding changes the stage: a team repo refuses it for anyone but the holder, and the terminal prints that in its own words
		if (err instanceof TeamGateRefusedError) return { error: err.message, refusal: { kind: 'team-refused', text: err.reason } };
		throw err;
	}
}
