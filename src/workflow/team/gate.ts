/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Procix Software India. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/**
 * The team gate (sc4): before a developer changes a stage, ask who holds the
 * stage unit's tracker issue. The holder is the issue's assignee, read live; only
 * an unassigned stage is claimed and a claim never removes another assignee.
 * GitHub cannot assign atomically, so two simultaneous claims are detected after
 * the fact, not prevented (docs/plans/team-workflow.md, "s5 claim atomicity").
 *
 * A repo with no policy, teamMode false or claimsEnforced false is allowed with no
 * tracker call (k4). Every failure is a `refused` outcome; the gate never throws.
 */

import { existsSync } from 'node:fs';

import { getLogger } from '../../shared/logger.js';
import { loadTracker } from '../tracker/github-adapter.js';
import type { Capability, IssueRef, PortResult, SignoffRequestRef, TrackerPort } from '../tracker/port.js';
import type { UnitRef } from '../tracker/refs.js';
import { ensureUnitIssue, resolveUnitIssueLocal, unitKey } from '../tracker/unit-issue.js';
import { artifactJsonPath, defineArtifactId, lldArtifactId, planArtifactId } from '../storage.js';
import { policyReader } from './policy-reader.js';
import type { PolicyReader } from './types.js';

const log = getLogger('workflow:team-gate');

export type GuardedAction = 'author' | 'build' | 'approve-local' | 'open-signoff' | 'revise' | 'release' | 'claim' | 'review-fix';

export type GateOutcome =
	| { readonly kind: 'allowed'; readonly implicitClaim: boolean }
	| { readonly kind: 'held-by-other'; readonly holder: string; readonly offerPark: boolean }
	| { readonly kind: 'awaiting-signoff'; readonly request: SignoffRequestRef }
	| { readonly kind: 'no-issue'; readonly allowFirstAuthor: boolean; readonly creationFailure?: string | undefined }
	| { readonly kind: 'refused'; readonly reason: string };

/** The assignee read live for one call; never stored. */
export interface ClaimState {
	readonly unit:   UnitRef;
	readonly holder: string | null;
	readonly readAt: string;
}

export type RefusedOutcome = Exclude<GateOutcome, { kind: 'allowed' }>;

/** What a guarded entry point throws when the gate does not allow its action. */
export class TeamGateRefusedError extends Error {
	readonly outcome: RefusedOutcome;
	readonly reason:  string;
	constructor(outcome: RefusedOutcome) {
		const reason = describeOutcome(outcome);
		super(reason);
		this.name = 'TeamGateRefusedError';
		this.outcome = outcome;
		this.reason = reason;
	}
}

/** One sentence for a non-allowed outcome, naming the holder when there is one. */
export function describeOutcome(o: RefusedOutcome): string {
	switch (o.kind) {
		case 'held-by-other':    return `held by ${o.holder}`;
		case 'awaiting-signoff': return `awaiting signoff (${o.request.ref})`;
		case 'no-issue':         return o.creationFailure !== undefined ? `no tracker issue for this stage yet: ${o.creationFailure}` : 'no tracker issue for this stage yet';
		case 'refused':          return o.reason;
	}
}

// ---------------------------------------------------------------------------
// Test seams
// ---------------------------------------------------------------------------

export interface GateDeps {
	readonly readPolicy?:  PolicyReader | undefined;
	readonly loadTracker?: ((repo: string, needed: ReadonlySet<Capability>) => PortResult<TrackerPort>) | undefined;
	readonly resolveIssue?: ((unit: UnitRef) => IssueRef | null) | undefined;
	readonly ensureIssue?: ((unit: UnitRef, port: TrackerPort) => PortResult<IssueRef>) | undefined;
	readonly artifactExists?: ((unit: UnitRef) => boolean) | undefined;
	readonly now?:         (() => string) | undefined;
}

let testDeps: GateDeps = {};

/** Test seam: inject the policy reader, tracker loader and issue lookup; no argument resets. */
export function _setGateDepsForTests(deps: GateDeps = {}): void { testDeps = deps; }

// ---------------------------------------------------------------------------
// Completion hook (declared here, registered by s7)
// ---------------------------------------------------------------------------

/** Called by the gate for author and build on a next stage and for open-signoff, revise and release. */
export type CompletionHook = (repo: string, unit: UnitRef, port: TrackerPort) => GateOutcome | 'continue';

let registeredHook: CompletionHook | undefined;
/** True while a hook runs: gate calls made by the hook itself (for example its release) skip the hook. */
let insideHook = false;

export function registerCompletionHook(hook: CompletionHook | undefined): void { registeredHook = hook; }

const HOOKED: ReadonlySet<string> = new Set<GuardedAction>(['author', 'build', 'open-signoff', 'revise', 'release']);

/** The hook's answer for this action, or 'continue' when none is registered, the call came from the hook, or the action is not hooked. */
function consultHook(repo: string, unit: UnitRef, action: GuardedAction, port: TrackerPort): GateOutcome | 'continue' {
	if (registeredHook === undefined || insideHook || !HOOKED.has(action)) return 'continue';
	insideHook = true;
	try { return registeredHook(repo, unit, port); }
	catch (err) { return refused(`the completion hook failed: ${errorText(err)}`); }
	finally { insideHook = false; }
}

// ---------------------------------------------------------------------------
// The gate
// ---------------------------------------------------------------------------

const GUARDED: ReadonlySet<string> = new Set<GuardedAction>(['author', 'build', 'approve-local', 'open-signoff', 'revise', 'release', 'claim', 'review-fix']);

/** Actions that take the claim when nobody holds the stage. */
const CLAIMING: ReadonlySet<string> = new Set<GuardedAction>(['author', 'build']);

const sameLogin = (a: string, b: string): boolean => a.toLowerCase() === b.toLowerCase();

/** The message of anything that was thrown, including a non-Error value. */
const errorText = (err: unknown): string => (err instanceof Error ? err.message : typeof err === 'string' ? err : String(err));

const allowed = (implicitClaim = false): GateOutcome => ({ kind: 'allowed', implicitClaim });
const refused = (reason: string): GateOutcome => ({ kind: 'refused', reason });

function logOutcome(unit: UnitRef, action: string, outcome: GateOutcome): GateOutcome {
	if (outcome.kind !== 'allowed') log.info({ unit: unitKey(unit), action, outcome: outcome.kind, reason: describeOutcome(outcome) }, 'team gate: action not allowed');
	return outcome;
}

/** The team-mode context shared by the gate, claim and release: policy, tracker, actor and issue. */
export type TeamContext =
	| { readonly ok: false; readonly outcome: GateOutcome; readonly noIssue?: true | undefined }
	| { readonly ok: true; readonly team: false }
	| { readonly ok: true; readonly team: true; readonly port: TrackerPort; readonly issue: IssueRef; readonly who: string; readonly administrators: readonly string[] };

/** The unit's own artifact (Define, LLD or plan) is on disk. */
function unitArtifactExists(unit: UnitRef): boolean {
	if (testDeps.artifactExists !== undefined) return testDeps.artifactExists(unit);
	const id = unit.unit === 'epic' ? defineArtifactId(unit.epicHash)
		: unit.unit === 'story' ? lldArtifactId(unit.epicHash, unit.storyId ?? '')
		: planArtifactId(unit.epicHash, unit.storyId ?? '');
	return existsSync(artifactJsonPath(unit.repoPath, id));
}

/** Read the policy, then (team mode with claims enforced only) the tracker, the actor and the unit's issue. */
export function teamContext(repo: string, unit: UnitRef): TeamContext {
	const policy = (testDeps.readPolicy ?? policyReader)(repo);
	if (!policy.ok) return { ok: false, outcome: refused(`the team policy cannot be read: ${policy.reason}`) };
	if (policy.value === 'none' || !policy.value.teamMode || !policy.value.claimsEnforced) return { ok: true, team: false };

	const loaded = (testDeps.loadTracker ?? loadTracker)(repo, new Set<Capability>(['claim']));
	if (!loaded.ok) return { ok: false, outcome: refused(`the tracker cannot be used (${loaded.kind}): ${loaded.reason}`) };
	const who = loaded.value.whoAmI();
	if (!who.ok) return { ok: false, outcome: refused(`cannot tell who is acting (${who.kind}): ${who.reason}`) };

	// The unit's issue: recorded, found, or created now. If it cannot be had, the stage has no issue yet.
	let issue = (testDeps.resolveIssue ?? ((u: UnitRef) => resolveUnitIssueLocal(u)))(unit);
	let creationFailure: string | undefined;
	if (issue === null) {
		const ensured = (testDeps.ensureIssue ?? ensureUnitIssue)(unit, loaded.value);
		if (ensured.ok) issue = ensured.value; else creationFailure = ensured.reason;
	}
	if (issue === null) {
		return { ok: false, outcome: { kind: 'no-issue', allowFirstAuthor: false, creationFailure }, noIssue: true };
	}
	return { ok: true, team: true, port: loaded.value, issue, who: who.value, administrators: policy.value.administrators };
}

/** Who holds the unit's issue right now (null when nobody), or a refusal. */
export function readHolder(ctx: Extract<TeamContext, { team: true }>, unit: UnitRef, now: () => string): { ok: true; state: ClaimState } | { ok: false; outcome: GateOutcome } {
	const a = ctx.port.readAssignee(ctx.issue);
	if (!a.ok) return { ok: false, outcome: refused(`cannot read who holds the stage (${a.kind}): ${a.reason}`) };
	return { ok: true, state: { unit, holder: a.value, readAt: now() } };
}

/**
 * May `action` change this stage unit? Allowed with no tracker call outside team mode;
 * otherwise the live assignee decides. Never throws.
 */
export function teamGate(repo: string, unit: UnitRef, action: GuardedAction): GateOutcome {
	try {
		if (!GUARDED.has(action)) return allowed();
		const ctx = teamContext(repo, unit);
		if (!ctx.ok) {
			// The one exception: the first author turn of a stage that has no artifact yet can be written without its issue
			if (ctx.noIssue === true && ctx.outcome.kind === 'no-issue' && action === 'author' && !unitArtifactExists(unit)) {
				return logOutcome(unit, action, { ...ctx.outcome, allowFirstAuthor: true });
			}
			return logOutcome(unit, action, ctx.outcome);
		}
		if (!ctx.team) return allowed();

		const hooked = consultHook(repo, unit, action, ctx.port);
		if (hooked !== 'continue') return logOutcome(unit, action, hooked);

		const now = testDeps.now ?? ((): string => new Date().toISOString());
		const read = readHolder(ctx, unit, now);
		if (!read.ok) return logOutcome(unit, action, read.outcome);
		const holder = read.state.holder;

		if (holder !== null) {
			return sameLogin(holder, ctx.who) ? allowed() : logOutcome(unit, action, { kind: 'held-by-other', holder, offerPark: false });
		}
		if (!CLAIMING.has(action)) return allowed();

		// Nobody holds the stage: take it with an add-only assignment, never removing another claimant.
		const added = ctx.port.addAssignee(ctx.issue, ctx.who);
		if (!added.ok) return logOutcome(unit, action, refused(`the implicit claim failed (${added.kind}): ${added.reason}; the stage state is unknown, read it again before acting`));
		if (added.value.length > 1) {
			return logOutcome(unit, action, refused(`the claim is contested: ${added.value.join(', ')} are all assigned; ask an administrator to release the stage`));
		}
		return allowed(true);
	} catch (err) {
		return logOutcome(unit, action, refused(`the team gate failed: ${errorText(err)}`));
	}
}
