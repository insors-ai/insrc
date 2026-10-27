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
import { isToolDenied } from '../tracker/tool-denied.js';
import type { Capability, IssueRef, PortResult, SignoffRequestRef, TrackerPort } from '../tracker/port.js';
import type { UnitRef } from '../tracker/refs.js';
import { ensureUnitIssue, resolveUnitIssueLocal, unitKey } from '../tracker/unit-issue.js';
import { artifactJsonPath, defineArtifactId, hldArtifactId, lldArtifactId, planArtifactId } from '../storage.js';
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
	constructor(outcome: RefusedOutcome, subject?: string) {
		const reason = subject !== undefined ? `${subject}: ${describeOutcome(outcome)}` : describeOutcome(outcome);
		super(reason);
		this.name = 'TeamGateRefusedError';
		this.outcome = outcome;
		this.reason = reason;
	}
}

/** One sentence for a non-allowed outcome, naming the holder when there is one. */
export function describeOutcome(o: RefusedOutcome): string {
	switch (o.kind) {
		case 'held-by-other':    return o.offerPark ? `held by ${o.holder}; you have unfinished work here, run 'team park <epicHash> [storyId]' to hand it over` : `held by ${o.holder}`;
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
	readonly loadTracker?: ((repo: string, needed: ReadonlySet<Capability>) => PortResult<TrackerPort> | Promise<PortResult<TrackerPort>>) | undefined;
	readonly resolveIssue?: ((unit: UnitRef) => IssueRef | null | Promise<IssueRef | null>) | undefined;
	readonly ensureIssue?: ((unit: UnitRef, port: TrackerPort) => PortResult<IssueRef> | Promise<PortResult<IssueRef>>) | undefined;
	readonly artifactExists?: ((unit: UnitRef) => boolean) | undefined;
	readonly now?:         (() => string) | undefined;
}

let testDeps: GateDeps = {};

/** Test seam: inject the policy reader, tracker loader and issue lookup; no argument resets. */
export function _setGateDepsForTests(deps: GateDeps = {}): void { testDeps = deps; }

// ---------------------------------------------------------------------------
// Completion hook (declared here, registered by s7)
// ---------------------------------------------------------------------------

/**
 * Called by the gate for author and build on a next stage and for open-signoff, revise and release. It also receives the action
 * and, for author, the authoring workflow (AMD-315d510cb28100e2-17), so it can tell which stage the attempt follows; a hook
 * written with the first three parameters only keeps working.
 */
export type CompletionHook = (repo: string, unit: UnitRef, port: TrackerPort, action: GuardedAction, authoring?: string) => GateOutcome | 'continue' | Promise<GateOutcome | 'continue'>;

let registeredHook: CompletionHook | undefined;
/** True while a hook runs: gate calls made by the hook itself (for example its release) skip the hook. */
let insideHook = false;

export function registerCompletionHook(hook: CompletionHook | undefined): void { registeredHook = hook; }

/** Says whether the acting user has unparked work for a unit (a live run or an uncommitted draft), so a refusal can offer to park it. */
export type ParkOfferProvider = (repo: string, unit: UnitRef, actor: string) => boolean;

let parkOfferProvider: ParkOfferProvider | undefined;
/** Register the park-offer provider (sc4 amendment AMD-315d510cb28100e2-13); none registered means offerPark is always false. */
export function registerParkOfferProvider(provider: ParkOfferProvider | undefined): void { parkOfferProvider = provider; }

/** The held-by-other outcome, with offerPark from the provider; a provider that throws counts as false. */
function heldByOther(repo: string, unit: UnitRef, holder: string, actor: string): GateOutcome {
	let offerPark = false;
	try { offerPark = parkOfferProvider?.(repo, unit, actor) === true; }
	catch (err) { log.warn({ unit: unitKey(unit), err: errorText(err) }, 'park-offer provider failed; no offer'); }
	return { kind: 'held-by-other', holder, offerPark };
}

const HOOKED: ReadonlySet<string> = new Set<GuardedAction>(['author', 'build', 'open-signoff', 'revise', 'release']);

/** The hook's answer for this action, or 'continue' when none is registered, the call came from the hook, or the action is not hooked. */
async function consultHook(repo: string, unit: UnitRef, action: GuardedAction, port: TrackerPort, authoring?: string): Promise<GateOutcome | 'continue'> {
	if (registeredHook === undefined || insideHook || !HOOKED.has(action)) return 'continue';
	insideHook = true;
	try { return await registeredHook(repo, unit, port, action, authoring); }
	catch (err) {
		// a denied tracker call inside the hook stops the stage; it is not "the hook failed"
		if (isToolDenied(err)) throw err;
		return refused(`the completion hook failed: ${errorText(err)}`);
	}
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

/**
 * Does this repo enforce claims? 'no' with no policy, teamMode false or claimsEnforced false (no tracker is
 * touched); a string is the reason the policy could not be read.
 */
export async function claimsEnforcedFor(repo: string): Promise<'yes' | 'no' | string> {
	try {
		const policy = (testDeps.readPolicy ?? policyReader)(repo);
		if (!policy.ok) return `the team policy cannot be read: ${policy.reason}`;
		return policy.value !== 'none' && policy.value.teamMode && policy.value.claimsEnforced ? 'yes' : 'no';
	} catch (err) { return `the team policy cannot be read: ${errorText(err)}`; }
}

/**
 * The signed-in tracker login when claims are enforced for the repo, otherwise undefined with no tracker call.
 * Never throws: any failure reading the user is undefined.
 */
export async function actingUser(repo: string): Promise<string | undefined> {
	try {
		if (await claimsEnforcedFor(repo) !== 'yes') return undefined;
		const loaded = await (testDeps.loadTracker ?? loadTracker)(repo, new Set<Capability>(['claim']));
		if (!loaded.ok) return undefined;
		const who = await loaded.value.whoAmI();
		return who.ok ? who.value : undefined;
	} catch (err) {
		// a denied tracker call stops the stage; it is never "nobody is signed in"
		if (isToolDenied(err)) throw err;
		return undefined;
	}
}

/**
 * The artifact being authored is on disk. `authoring` names the workflow that writes it (an HLD is
 * written against the Epic unit, a plan against the Story unit, so the unit's own artifact is the wrong
 * one to look for); without it the unit's own artifact (Define, LLD or plan) is looked for.
 */
function authoredArtifactExists(unit: UnitRef, authoring: string | undefined): boolean {
	if (testDeps.artifactExists !== undefined) return testDeps.artifactExists(unit);
	const story = unit.storyId ?? '';
	const id = authoring === 'define' ? defineArtifactId(unit.epicHash)
		: authoring === 'design.epic' ? hldArtifactId(unit.epicHash)
		: authoring === 'design.story' ? lldArtifactId(unit.epicHash, story)
		: authoring === 'plan' ? planArtifactId(unit.epicHash, story)
		: unit.unit === 'epic' ? defineArtifactId(unit.epicHash)
		: unit.unit === 'story' ? lldArtifactId(unit.epicHash, story)
		: planArtifactId(unit.epicHash, story);
	return existsSync(artifactJsonPath(unit.repoPath, id));
}

/**
 * Read the policy, then (team mode with claims enforced only) the tracker, the actor and the unit's issue. A missing issue is
 * created (the gate's usual behaviour) unless `createIssue` is false, for a read that must not write to the tracker.
 */
export async function teamContext(repo: string, unit: UnitRef, opts: { readonly createIssue?: boolean | undefined } = {}): Promise<TeamContext> {
	const policy = (testDeps.readPolicy ?? policyReader)(repo);
	if (!policy.ok) return { ok: false, outcome: refused(`the team policy cannot be read: ${policy.reason}`) };
	if (policy.value === 'none' || !policy.value.teamMode || !policy.value.claimsEnforced) return { ok: true, team: false };

	const loaded = await (testDeps.loadTracker ?? loadTracker)(repo, new Set<Capability>(['claim']));
	if (!loaded.ok) return { ok: false, outcome: refused(`the tracker cannot be used (${loaded.kind}): ${loaded.reason}`) };
	const who = await loaded.value.whoAmI();
	if (!who.ok) return { ok: false, outcome: refused(`cannot tell who is acting (${who.kind}): ${who.reason}`) };

	// The unit's issue: recorded, found, or created now. If it cannot be had, the stage has no issue yet.
	let issue = await (testDeps.resolveIssue ?? ((u: UnitRef) => resolveUnitIssueLocal(u)))(unit);
	let creationFailure: string | undefined;
	if (issue === null && opts.createIssue !== false) {
		const ensured = await (testDeps.ensureIssue ?? ensureUnitIssue)(unit, loaded.value);
		if (ensured.ok) issue = ensured.value; else creationFailure = ensured.reason;
	}
	if (issue === null) {
		return { ok: false, outcome: { kind: 'no-issue', allowFirstAuthor: false, creationFailure }, noIssue: true };
	}
	return { ok: true, team: true, port: loaded.value, issue, who: who.value, administrators: policy.value.administrators };
}

/** Who holds the unit's issue right now (null when nobody), or a refusal. */
export async function readHolder(ctx: Extract<TeamContext, { team: true }>, unit: UnitRef, now: () => string): Promise<{ ok: true; state: ClaimState } | { ok: false; outcome: GateOutcome }> {
	const a = await ctx.port.readAssignee(ctx.issue);
	if (!a.ok) return { ok: false, outcome: refused(`cannot read who holds the stage (${a.kind}): ${a.reason}`) };
	return { ok: true, state: { unit, holder: a.value, readAt: now() } };
}

/**
 * What the actor may do with a stage whose live holder was just read (null when nobody holds it): the holder passes, anyone
 * else is refused naming the holder, and an unassigned stage is taken with the add-only assignment, never removing another
 * claimant. The refusal wording and whether the take counts as an implicit claim differ by caller, so `words` carries them.
 */
async function decideOnHolder(
	repo: string, unit: UnitRef, action: GuardedAction | 'claim', ctx: Extract<TeamContext, { team: true }>, holder: string | null,
	words: { readonly failed: string; readonly contested: string; readonly implicit: boolean },
): Promise<GateOutcome> {
	if (holder !== null) return sameLogin(holder, ctx.who) ? allowed() : logOutcome(unit, action, heldByOther(repo, unit, holder, ctx.who));
	const added = await ctx.port.addAssignee(ctx.issue, ctx.who);
	if (!added.ok) return logOutcome(unit, action, refused(`${words.failed} (${added.kind}): ${added.reason}; the stage state is unknown, read it again before acting`));
	if (added.value.length > 1) return logOutcome(unit, action, refused(`the claim is contested: ${added.value.join(', ')} are all assigned; ${words.contested}`));
	return allowed(words.implicit);
}

/**
 * May `action` change this stage unit? Allowed with no tracker call outside team mode;
 * otherwise the live assignee decides. Never throws.
 */
export async function teamGate(repo: string, unit: UnitRef, action: GuardedAction, authoring?: string): Promise<GateOutcome> {
	try {
		if (!GUARDED.has(action)) return allowed();
		const ctx = await teamContext(repo, unit);
		if (!ctx.ok) {
			// The one exception: the first author turn of a stage that has no artifact yet can be written without its issue
			if (ctx.noIssue === true && ctx.outcome.kind === 'no-issue' && action === 'author' && !authoredArtifactExists(unit, authoring)) {
				return logOutcome(unit, action, { ...ctx.outcome, allowFirstAuthor: true });
			}
			return logOutcome(unit, action, ctx.outcome);
		}
		if (!ctx.team) return allowed();

		const hooked = await consultHook(repo, unit, action, ctx.port, authoring);
		if (hooked !== 'continue') return logOutcome(unit, action, hooked);

		const now = testDeps.now ?? ((): string => new Date().toISOString());
		const read = await readHolder(ctx, unit, now);
		if (!read.ok) return logOutcome(unit, action, read.outcome);
		const holder = read.state.holder;

		// Only author and build take an unassigned stage; the other actions leave it alone.
		if (holder === null && !CLAIMING.has(action)) return allowed();
		return await decideOnHolder(repo, unit, action, ctx, holder, { failed: 'the implicit claim failed', contested: 'ask an administrator to release the stage', implicit: true });
	} catch (err) {
		// a denied tracker call stops the stage; it is never a generic refusal
		if (isToolDenied(err)) throw err;
		return logOutcome(unit, action, refused(`the team gate failed: ${errorText(err)}`));
	}
}

// ---------------------------------------------------------------------------
// Claim, release and the review-fix decision
// ---------------------------------------------------------------------------

const notEnforced = (): GateOutcome => refused('this repository does not enforce claims (no team policy with claimsEnforced)');

/**
 * Take an unassigned stage. The actor is added through the add-only addAssignee, so no
 * other assignee is ever removed; the assignees read back afterwards decide whether the
 * claim is contested. GitHub cannot assign atomically: contention is reported when it is
 * observed, so an earlier claimant may discover it on a later gate read.
 */
export async function claim(repo: string, unit: UnitRef): Promise<GateOutcome> {
	try {
		const ctx = await teamContext(repo, unit);
		if (!ctx.ok) return logOutcome(unit, 'claim', ctx.outcome);
		if (!ctx.team) return logOutcome(unit, 'claim', notEnforced());
		const read = await readHolder(ctx, unit, testDeps.now ?? ((): string => new Date().toISOString()));
		if (!read.ok) return logOutcome(unit, 'claim', read.outcome);
		const holder = read.state.holder;
		return await decideOnHolder(repo, unit, 'claim', ctx, holder, { failed: 'the claim failed', contested: 'nobody was removed, ask an administrator to release the stage', implicit: false });
	} catch (err) {
		if (isToolDenied(err)) throw err;
		return logOutcome(unit, 'claim', refused(`the claim failed: ${errorText(err)}`));
	}
}

/**
 * Clear the stage's assignees so others can claim it. The holder or a policy administrator
 * may release; an administrator may release whoever holds it, including a contested claim
 * with several assignees. Anyone else is refused without a port write.
 */
export async function release(repo: string, unit: UnitRef): Promise<GateOutcome> {
	try {
		const ctx = await teamContext(repo, unit);
		if (!ctx.ok) return logOutcome(unit, 'release', ctx.outcome);
		if (!ctx.team) return logOutcome(unit, 'release', notEnforced());

		const hooked = await consultHook(repo, unit, 'release', ctx.port);
		if (hooked !== 'continue') return logOutcome(unit, 'release', hooked);

		const admin = ctx.administrators.some(a => sameLogin(a, ctx.who));
		if (!admin) {
			const read = await readHolder(ctx, unit, testDeps.now ?? ((): string => new Date().toISOString()));
			if (!read.ok) return logOutcome(unit, 'release', read.outcome);
			const holder = read.state.holder;
			if (holder === null) return allowed();   // nothing to release
			if (!sameLogin(holder, ctx.who)) return logOutcome(unit, 'release', refused(`only the holder (${holder}) or a policy administrator may release this stage`));
		}
		const cleared = await ctx.port.setAssignee(ctx.issue, null);
		if (!cleared.ok) return logOutcome(unit, 'release', refused(`the release failed (${cleared.kind}): ${cleared.reason}; the stage state is unknown, read it again before acting`));
		return allowed();
	} catch (err) {
		if (isToolDenied(err)) throw err;
		return logOutcome(unit, 'release', refused(`the release failed: ${errorText(err)}`));
	}
}

export type ReviewFixMode = 'apply-auto-fixes' | 'report-only';

/** A review is never refused; only whether it may write fixes changes. Report-only for a non-holder or a failed read. */
export async function reviewFixDecision(repo: string, unit: UnitRef): Promise<ReviewFixMode> {
	try { return (await teamGate(repo, unit, 'review-fix')).kind === 'allowed' ? 'apply-auto-fixes' : 'report-only'; }
	catch (err) {
		// a denied tracker call stops the review; it does not continue as a report-only review
		if (isToolDenied(err)) throw err;
		return 'report-only';
	}
}
