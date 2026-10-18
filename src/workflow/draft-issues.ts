/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Procix Software India. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/**
 * The draft hook (sc3): right after a Define, HLD, LLD or plan draft is written,
 * make sure every unit it covers has its tracker issue, so the stage can be
 * claimed (ac15 to ac18). Team mode only; a repo with no policy, or with
 * teamMode false, is untouched and sees no tracker call (k4).
 *
 *   Define / HLD  the Epic
 *   LLD           the Epic, then the Story
 *   plan          the Epic, the Story, then each Task in plan order
 *
 * It never throws and never undoes the draft: every failure becomes `not-ready`
 * with a message for the author. A failure before the create call means nothing
 * was created (`outcomeKnown` true); a failed create is unconfirmed
 * (`outcomeKnown` false) and the message never says that no issue exists.
 */

import { readFileSync } from 'node:fs';

import { getLogger } from '../shared/logger.js';
import { loadTracker } from './tracker/github-adapter.js';
import type { Capability, IssueRef, PortFailureKind, PortResult, TrackerPort } from './tracker/port.js';
import type { UnitRef } from './tracker/refs.js';
import { ensureUnitIssueDetailed, resolveUnitIssueLocal, unitKey, type EnsureIssueDeps } from './tracker/unit-issue.js';
import { policyReader } from './team/policy-reader.js';
import type { PolicyReader } from './team/types.js';

const log = getLogger('workflow:draft-issues');

export interface ReadyUnit {
	readonly unit:    string;
	readonly issue:   IssueRef;
	readonly created: boolean;
}

export type IssueReadiness =
	| { readonly status: 'not-applicable'; readonly reason: 'no-team-policy' | 'no-claim-unit' }
	| { readonly status: 'ready';          readonly units: readonly ReadyUnit[] }
	| {
		readonly status:       'not-ready';
		readonly unit:         string;
		readonly kind:         PortFailureKind | 'policy-unreadable';
		/** False only when the create call failed: the issue may or may not exist. */
		readonly outcomeKnown: boolean;
		readonly reason:       string;
		/** What the author is told. */
		readonly message:      string;
		readonly readyUnits:   readonly ReadyUnit[];
	};

export interface DraftHookDeps {
	readonly readPolicy?:  PolicyReader | undefined;
	readonly loadTracker?: ((repo: string, needed: ReadonlySet<Capability>) => PortResult<TrackerPort>) | undefined;
	readonly ensure?:      EnsureIssueDeps | undefined;
}

interface DraftMeta {
	readonly workflow?: string | undefined;
	readonly repoPath?: string | undefined;
	readonly epicHash?: string | undefined;
	readonly storyId?:  string | undefined;
}

/** The units the draft covers, in the order they must exist. */
function unitsOf(meta: DraftMeta, tasksOf: () => readonly string[]): UnitRef[] | null {
	const { workflow, repoPath, epicHash, storyId } = meta;
	if (typeof repoPath !== 'string' || typeof epicHash !== 'string') return null;
	const epic: UnitRef = { unit: 'epic', repoPath, epicHash };
	if (workflow === 'define' || workflow === 'design.epic') return [epic];
	if (typeof storyId !== 'string') return null;
	const story: UnitRef = { unit: 'story', repoPath, epicHash, storyId };
	if (workflow === 'design.story') return [epic, story];
	if (workflow === 'plan') return [epic, story, ...tasksOf().map((taskId): UnitRef => ({ unit: 'task', repoPath, epicHash, storyId, taskId }))];
	return null;
}

const notReady = (unit: string, kind: PortFailureKind | 'policy-unreadable', outcomeKnown: boolean, reason: string, readyUnits: readonly ReadyUnit[], message?: string): IssueReadiness => ({
	status: 'not-ready', unit, kind, outcomeKnown, reason, readyUnits,
	message: message ?? (outcomeKnown
		? `cannot be claimed yet: no issue was created for ${unit} because ${reason}`
		: `readiness could not be confirmed for ${unit}: the issue may or may not exist; ${reason}`),
});

let hookOverride: ((jsonPath: string) => IssueReadiness) | undefined;

/** Test seam: replace the hook at the synthesize and workflow.run call sites; call with no argument to reset. */
export function _setDraftHookForTests(hook?: (jsonPath: string) => IssueReadiness): void { hookOverride = hook; }

export function ensureDraftIssues(jsonPath: string, deps: DraftHookDeps = {}): IssueReadiness {
	if (hookOverride !== undefined) return hookOverride(jsonPath);
	try {
		const doc = JSON.parse(readFileSync(jsonPath, 'utf8')) as { meta?: DraftMeta | undefined; body?: { tasks?: Array<{ id?: unknown; order?: unknown }> | undefined } | undefined };
		const meta = doc.meta ?? {};
		const tasksOf = (): string[] => [...(doc.body?.tasks ?? [])]
			.sort((a, b) => Number(a.order ?? 0) - Number(b.order ?? 0))
			.map(t => t.id).filter((id): id is string => typeof id === 'string');
		let units = unitsOf(meta, tasksOf);
		if (units === null) return { status: 'not-applicable', reason: 'no-claim-unit' };
		// A plan with no Tasks has no unit to claim: ready, with no units and no tracker call (policy permitting).
		const noTasks = meta.workflow === 'plan' && tasksOf().length === 0;

		const repoPath = meta.repoPath as string;
		const policy = (deps.readPolicy ?? policyReader)(repoPath);
		if (!policy.ok) return notReady(unitKey(units[0]!), 'policy-unreadable', true, `the team policy cannot be read: ${policy.reason}`, []);
		if (policy.value === 'none' || !policy.value.teamMode) return { status: 'not-applicable', reason: 'no-team-policy' };

		if (noTasks) return { status: 'ready', units: [] };
		// A plan whose Story already has its issue needs no Epic check: the Tasks hang under the Story (team repos only: this may reconcile records).
		if (meta.workflow === 'plan' && resolveUnitIssueLocal(units[1]!, deps.ensure?.now) !== null) units = units.slice(1);

		// Fast path: every unit is already recorded, so no tracker is loaded and no command runs.
		const ready: ReadyUnit[] = [];
		const local = units.map(u => resolveUnitIssueLocal(u, deps.ensure?.now));
		if (local.every(ref => ref !== null)) {
			return { status: 'ready', units: units.map((u, i) => ({ unit: unitKey(u), issue: local[i] as IssueRef, created: false })) };
		}
		if (units.length === 0) return { status: 'ready', units: [] };

		const loaded = (deps.loadTracker ?? loadTracker)(repoPath, new Set<Capability>(['issue-create']));
		if (!loaded.ok) {
			const firstMissing = units[local.findIndex(ref => ref === null)]!;
			return notReady(unitKey(firstMissing), loaded.kind, true, loaded.reason, ready);
		}
		for (const unit of units) {
			const r = ensureUnitIssueDetailed(unit, loaded.value, deps.ensure);
			if (!r.ok) return notReady(unitKey(unit), r.kind, r.phase === 'before-create', r.reason, ready);
			// The issue exists, but if its record could not be saved the next call would not find it locally: say so.
			if (resolveUnitIssueLocal(unit, deps.ensure?.now) === null) {
				return notReady(unitKey(unit), 'rejected', true, `the issue ${r.value.issue} exists but could not be recorded in the artifact`, ready,
					`${r.value.issue} exists for ${unitKey(unit)} but could not be recorded in the artifact, so it cannot be claimed yet; write the draft again`);
			}
			ready.push({ unit: unitKey(unit), issue: r.value.issue, created: r.value.created });
		}
		return { status: 'ready', units: ready };
	} catch (err) {
		log.warn({ jsonPath, err: (err as Error).message }, 'draft-issues: the draft hook failed unexpectedly');
		return notReady('the draft', 'rejected', true, (err as Error).message, []);
	}
}

/** The two fields carried on the step result, the run result and the done frame: none for a repo without a team policy. */
export function readinessFields(r: IssueReadiness): { issueReadiness?: IssueReadiness | undefined; notice?: string | undefined } {
	if (r.status === 'not-applicable') return {};
	return r.status === 'not-ready' ? { issueReadiness: r, notice: r.message } : { issueReadiness: r };
}
