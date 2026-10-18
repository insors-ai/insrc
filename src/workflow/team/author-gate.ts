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
import { teamGate, TeamGateRefusedError } from './gate.js';

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

/** Throws TeamGateRefusedError when the actor may not author this run's stage. A repo with no policy is untouched. */
export function assertMayAuthor(intent: Pick<WorkflowIntent, 'workflow' | 'repoPath' | 'params'>): void {
	const unit = authorUnitOf(intent);
	if (unit === undefined) return;
	const outcome = teamGate(intent.repoPath, unit, 'author');
	if (outcome.kind === 'allowed') return;
	if (outcome.kind === 'no-issue' && outcome.allowFirstAuthor) return;   // the first draft is what creates the issue
	throw new TeamGateRefusedError(outcome);
}
