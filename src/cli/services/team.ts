/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Procix Software India. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/**
 * Team service (Story s2) — the two command-bar commands behind
 * `team init [path]` and `team refresh [path] [--branch <name>]`.
 * Each returns one result line and throws a plain Error on failure, which
 * the command bar renders as a cross-prefixed line.
 */

import { claim, release, describeOutcome, type GateOutcome } from '../../workflow/team/gate.js';
import type { UnitRef } from '../../workflow/tracker/refs.js';
import { refreshPolicy } from '../../workflow/team/policy-refresh.js';
import { writeStarterPolicy } from '../../workflow/team/starter-policy.js';
import { rpc } from '../client.js';
import { toAbsPath } from './repo.js';

export async function teamInit(repoPath: string): Promise<string> {
	const written = writeStarterPolicy(toAbsPath(repoPath));
	if (!written.ok) throw new Error(written.reason);
	return `✓ wrote ${written.value.path} — review it, then commit it and merge it to the default branch`;
}

export async function teamRefresh(repoPath: string, branch?: string): Promise<string> {
	const refreshed = await refreshPolicy(toAbsPath(repoPath), { branch });
	if (!refreshed.ok) throw new Error(refreshed.reason);
	const out = refreshed.value;
	const warn = out.warnings.length > 0 ? `  ⚠ ${out.warnings.join('; ')}` : '';
	switch (out.kind) {
		case 'fetched': return `✓ fetched ${out.branch} @ ${out.sha.slice(0, 7)} — team policy applied${warn}`;
		case 'absent':  return `• no policy file on ${out.branch} — this repository is treated as solo${warn}`;
		case 'invalid': return `⚠ the policy file on ${out.branch} is invalid and team actions will be refused until it is fixed: ${out.reason}${warn}`;
	}
}

/** Printable name of a claim unit: "epic <hash>", "story <hash>/s1" or "task <hash>/s1/t2". */
export function unitLabel(unit: UnitRef): string {
	return [unit.unit, [unit.epicHash, unit.storyId, unit.taskId].filter(x => x !== undefined).join('/')].join(' ');
}

/** The claim and release outcome as the terminal prints it: a tick line, or a cross line naming the reason (the holder for a held stage). */
function outcomeLine(outcome: GateOutcome, unit: UnitRef, done: string, failed: string): string {
	return outcome.kind === 'allowed' ? `✓ ${done} ${unitLabel(unit)}` : `✗ not ${failed} — ${describeOutcome(outcome)}`;
}

export async function teamClaim(repoPath: string, unit: Omit<UnitRef, 'repoPath'>): Promise<string> {
	const full = { ...unit, repoPath: toAbsPath(repoPath) } as UnitRef;
	return outcomeLine(await claim(full.repoPath, full), full, 'claimed', 'claimed');
}

export async function teamRelease(repoPath: string, unit: Omit<UnitRef, 'repoPath'>): Promise<string> {
	const full = { ...unit, repoPath: toAbsPath(repoPath) } as UnitRef;
	return outcomeLine(await release(full.repoPath, full), full, 'released', 'released');
}

/** The daemon call a park or resume goes through; the real IPC rpc by default. */
type DaemonCall = (method: string, params: Record<string, unknown>) => Promise<unknown>;
const viaDaemon: DaemonCall = (method, params) => rpc<unknown>(method, params);

/** What `team.park` and `team.resume` answer (the workflow-step outputs, as JSON), and `team.settle` (Story s7). */
interface HandoffReply {
	readonly recorded?: ReadonlyArray<{ readonly artifactId: string; readonly from: string; readonly to: string }> | undefined;
	readonly statuses?: Readonly<Record<string, string>> | undefined;
	readonly problems?: readonly string[] | undefined;
	readonly next: string;
	readonly branch?: string; readonly variant?: string; readonly noted?: boolean; readonly noteFailure?: string; readonly cleanupWarning?: string;
	readonly stepId?: string; readonly state?: string;
	readonly workflow?: string; readonly reason?: string; readonly draftRestored?: boolean;
	readonly error?: { readonly code: string; readonly message: string };
}

const unitArgs = (repoPath: string, unit: Omit<UnitRef, 'repoPath'>): Record<string, unknown> =>
	({ repo: toAbsPath(repoPath), epicHash: unit.epicHash, ...(unit.storyId !== undefined ? { storyId: unit.storyId } : {}) });

/** A refusal or failure of the daemon operation, as the terminal prints it. */
const failureLine = (what: string, reply: HandoffReply): string => `✗ not ${what} — ${reply.error?.message ?? reply.reason ?? reply.next}`;

/** Hand the unit's unfinished work to whoever takes it over (the daemon commits the drafts and a checkpoint to the handoff branch). */
export async function teamPark(repoPath: string, unit: Omit<UnitRef, 'repoPath'>, call: DaemonCall = viaDaemon): Promise<string> {
	const reply = await call('team.park', unitArgs(repoPath, unit)) as HandoffReply;
	if (reply.next !== 'parked') return failureLine('parked', reply);
	const warnings = [
		reply.noted === false ? `the issue note was not added${reply.noteFailure !== undefined ? ` (${reply.noteFailure})` : ''}` : undefined,
		reply.cleanupWarning,
	].filter((w): w is string => w !== undefined);
	return `✓ parked ${unitLabel(unit as UnitRef)} on ${reply.branch ?? '?'} (${reply.variant === 'run' ? 'the run and its drafts' : 'the drafts'}) — the next owner runs 'team resume ${unit.epicHash}${unit.storyId !== undefined ? ` ${unit.storyId}` : ''}'${warnings.length > 0 ? `  ⚠ ${warnings.join('; ')}` : ''}`;
}

/** Take over parked work: the daemon restores it and stores the run, and this prints where it stopped. */
export async function teamResume(repoPath: string, unit: Omit<UnitRef, 'repoPath'>, workflow?: string, call: DaemonCall = viaDaemon): Promise<string> {
	const reply = await call('team.resume', { ...unitArgs(repoPath, unit), ...(workflow !== undefined ? { workflow } : {}) }) as HandoffReply;
	const label = unitLabel(unit as UnitRef);
	switch (reply.next) {
		case 'emit_plan':       return `✓ resumed ${label} at the plan turn — the run is stored in the daemon; continue it with insrc_workflow_step (state ${reply.state ?? '?'})`;
		case 'emit_step':       return `✓ resumed ${label} at step ${reply.stepId ?? '?'} — the run is stored in the daemon; continue it with insrc_workflow_step (state ${reply.state ?? '?'})`;
		case 'emit_synthesize': return `✓ resumed ${label} at the synthesis turn — the run is stored in the daemon; continue it with insrc_workflow_step (state ${reply.state ?? '?'})`;
		case 'restart':         return `✓ ${label}: ${reply.reason ?? 'no run to continue'} — start ${reply.workflow ?? 'the stage'} afresh${reply.draftRestored === true ? ' (the parked draft is back in your working tree)' : ''}`;
		case 'nothing_to_resume': return `• nothing to resume for ${label} — ${reply.reason ?? ''}`;
		default:                return failureLine('resumed', reply);
	}
}

/**
 * Settle a unit's signoff requests now (Story s7): the daemon reads each open request, records what the tracker reports and runs a
 * completion the signoff was holding. It is how a BUILD's request is read, since no stage start reads it.
 */
export async function teamSettle(repoPath: string, unit: Omit<UnitRef, 'repoPath'>, call: DaemonCall = viaDaemon): Promise<string> {
	const reply = await call('team.settle', unitArgs(repoPath, unit)) as HandoffReply;
	const label = unitLabel(unit as UnitRef);
	if (reply.next !== 'settled') return failureLine('settled', reply);
	const recorded = reply.recorded ?? [];
	const problems = reply.problems ?? [];
	if (problems.length > 0) {
		const done = recorded.length > 0 ? `recorded ${recorded.map(r => `${r.artifactId} ${r.from} → ${r.to}`).join('; ')}; ` : '';
		return `! ${label}: ${done}could not settle completely — ${problems.join('; ')}`;
	}
	if (recorded.length === 0) {
		const open = Object.entries(reply.statuses ?? {}).filter(([, status]) => status === 'in-signoff').map(([id]) => id);
		return open.length > 0
			? `• ${label}: nothing to record yet — still awaiting signoff: ${open.join(', ')}`
			: `• ${label}: no signoff request is waiting`;
	}
	return `✓ settled ${label} — ${recorded.map(r => `${r.artifactId} ${r.from} → ${r.to}`).join('; ')}`;
}
