/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Procix Software India. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/**
 * The authoring routes' call into the team gate (sc4, action author): the daemon's
 * workflow-step phases and its server-side workflow driver each derive the stage unit
 * from the run's intent and ask before they change anything. A stage held by someone
 * else throws TeamGateRefusedError; the first author turn of a stage with no issue is
 * let through (the gate says so with allowFirstAuthor). Analyze and code review never
 * call this.
 */

import type { WorkflowIntent } from '../types.js';
import type { UnitRef } from '../tracker/refs.js';
import { readHolder, teamContext, teamGate, TeamGateRefusedError } from './gate.js';
import type { GuardedAction, RefusedOutcome } from './gate.js';
import { isUnderSignoff, settleForAttempt } from './signoff.js';

/**
 * The stage unit an authoring run changes: a design.epic run changes the Epic, a design.story
 * or plan run its Story. A define mints a fresh Epic (no unit yet), and the other workflows
 * (build, tracker, brainstorm, stub...) are not claim units here.
 */
export function authorUnitOf(intent: Pick<WorkflowIntent, 'workflow' | 'repoPath' | 'params'>): UnitRef | undefined {
	const epicHash = intent.params['epicHash'];
	if (typeof epicHash !== 'string' || epicHash.length === 0) return undefined;
	if (intent.workflow === 'design.epic') return { unit: 'epic', repoPath: intent.repoPath, epicHash };
	if (intent.workflow === 'design.story' || intent.workflow === 'plan') {
		const storyId = intent.params['storyId'];
		if (typeof storyId !== 'string' || storyId.length === 0) return undefined;
		return { unit: 'story', repoPath: intent.repoPath, epicHash, storyId };
	}
	return undefined;
}

/**
 * The action an authoring run asks the gate for. A design.epic run writes the HLD and a design.story run the LLD: while that artifact
 * is in signoff or was sent back from it, the run revises work other people are reviewing, which is the 'revise' action (Story s8).
 * A define run and a plan run are not covered: neither has a signoff stage of its own to revise.
 */
function authorActionOf(intent: Pick<WorkflowIntent, 'workflow' | 'repoPath'>, unit: UnitRef): GuardedAction {
	const stage = intent.workflow === 'design.epic' ? 'HLD' : intent.workflow === 'design.story' ? 'LLD' : undefined;
	return stage !== undefined && isUnderSignoff(intent.repoPath, unit, stage) ? 'revise' : 'author';
}

/** Throws TeamGateRefusedError when the actor may not author this run's stage. A repo with no policy is untouched. */
export async function assertMayAuthor(intent: Pick<WorkflowIntent, 'workflow' | 'repoPath' | 'params'>): Promise<void> {
	const unit = authorUnitOf(intent);
	if (unit === undefined) return;
	const action = authorActionOf(intent, unit);
	const outcome = await teamGate(intent.repoPath, unit, action, intent.workflow);
	if (outcome.kind === 'no-issue' && outcome.allowFirstAuthor) return;   // the first draft is what creates the issue
	if (outcome.kind !== 'allowed') throw new TeamGateRefusedError(outcome);
	if (action === 'revise') await assertHeld(intent.repoPath, unit);
}

/** The gate lets 'revise' through on an unassigned stage, as it does every action but the claiming ones; revising must not take the claim, so nobody holding the stage is refused. */
async function assertHeld(repo: string, unit: UnitRef): Promise<void> {
	const ctx = await teamContext(repo, unit, { createIssue: false });
	if (!ctx.ok) throw new TeamGateRefusedError(ctx.outcome as RefusedOutcome);
	if (!ctx.team) return;
	const read = await readHolder(ctx, unit, () => new Date().toISOString());
	if (!read.ok) throw new TeamGateRefusedError(read.outcome as RefusedOutcome);
	if (read.state.holder === null) {
		throw new TeamGateRefusedError({ kind: 'refused', reason: `nobody holds ${ctx.issue}: claim it before revising work that is in signoff` });
	}
}

/**
 * The build route's call into the team gate (sc4, action build): the Task of a planned build,
 * or the Story of a standalone one. Throws TeamGateRefusedError for anyone but the holder;
 * a stage with no issue is refused as the gate says (only the first author turn is let through).
 */
export async function assertMayBuild(repoPath: string, ref: BuildRef): Promise<void> {
	const outcome = await teamGate(repoPath, buildUnitOf(repoPath, ref), 'build');
	if (outcome.kind !== 'allowed') throw new TeamGateRefusedError(outcome);
}

type BuildRef = { readonly epicHash: string; readonly storyId: string; readonly taskId?: string | undefined };

const buildUnitOf = (repoPath: string, ref: BuildRef): UnitRef => ref.taskId !== undefined
	? { unit: 'task', repoPath, epicHash: ref.epicHash, storyId: ref.storyId, taskId: ref.taskId }
	: { unit: 'story', repoPath, epicHash: ref.epicHash, storyId: ref.storyId };

/**
 * The async partner of assertMayAuthor, awaited just before it at the entries that start a stage (Story s7): settle the signoff of
 * the stage this run follows and refuse (TeamGateRefusedError) while signoff still blocks it. A run that follows nothing is untouched.
 */
export async function settleBeforeAuthor(intent: Pick<WorkflowIntent, 'workflow' | 'repoPath' | 'params'>): Promise<void> {
	const unit = authorUnitOf(intent);
	if (unit === undefined) return;
	await settleForAttempt(intent.repoPath, unit, 'author', intent.workflow);
}

/** The async partner of assertMayBuild: settle and refuse for the stage a build follows (the Story's LLD). */
export async function settleBeforeBuild(repoPath: string, ref: BuildRef): Promise<void> {
	await settleForAttempt(repoPath, buildUnitOf(repoPath, ref), 'build');
}
