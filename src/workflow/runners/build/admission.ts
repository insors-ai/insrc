/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Procix Software India. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/**
 * `build` admission gate — the daemon's read-only start-turn verdict.
 *
 * In the controller-driven pivot this module is the whole of what the daemon
 * decides before handing an implement prompt to the controller: is the Story's
 * plan present, approved, and fresh? `admitBuild` composes the two private
 * halves below into the `BuildAdmissionResult` verdict; consumers
 * (`insrc_build_step`'s implement phase) see only that verdict, never HOW it is
 * reached.
 *
 *   1. `approvalVerdict` — a NON-THROWING wrapper over the existing
 *      throwing plan-approval accessor (`requireApprovedPlan`, the plan-
 *      artifact peer of `requireApprovedLld`). It converts the two typed
 *      gate errors into returned discriminants — `ArtifactMissingError`
 *      → `{ missing }` (→ `plan-missing`, ac4), `ArtifactNotApprovedError`
 *      → `{ unapproved }` (→ `plan-unapproved`, ac2) — and RE-THROWS any
 *      other error class (a store/IO failure or a corrupt-body parse error
 *      must not be swallowed into a misleading modeled reason). `gates.ts`
 *      is untouched: the non-throwing form is contained here.
 *
 *   2. `driftVerdict` — the plan-vs-design.story drift comparator. It
 *      compares the plan's RECORDED design basis hash
 *      (`plan.meta.lldEffectiveHash`, stamped at plan-authoring time from
 *      the LLD's effective hash — see orchestrator.finalizePlan) against
 *      the CURRENT design.story artifact hash (`readLldArtifact(...).meta
 *      .hldEffectiveHash`). It MIRRORS `scanLldStaleness`'s return-a-typed-
 *      verdict-don't-throw shape but does NOT call or generalize it (a3 was
 *      rejected as a boundary breach — `amendments/staleness.ts` and its
 *      callers stay untouched).
 *
 * NOTE (LLD divergence): the s2 LLD names `readPlanUpstream` as the source
 * of the plan's recorded design hash, but that accessor reads the CURRENT
 * approved LLD/HLD, not the plan's own record. The plan's recorded basis
 * is `plan.meta.lldEffectiveHash`, obtained via `readPlanArtifact` /
 * `requireApprovedPlan`. This module uses the accurate source.
 */

import { createHash } from 'node:crypto';

import { ArtifactMissingError, ArtifactNotApprovedError, readLldArtifact, requireApprovedLld, requireApprovedPlan } from '../../gates.js';
import { assertEpicHash } from '../../hash.js';
import { planArtifactId } from '../../storage.js';
import type { PlanArtifact } from '../../artifacts/plan.js';
import type { BuildAdmissionResult } from './schemas.js';

export type {
	BuildAdmissionAccepted,
	BuildAdmissionRefusal,
	BuildAdmissionResult,
	BuildRefusalReason,
} from './schemas.js';

// ---------------------------------------------------------------------------
// t2 — non-throwing approval wrapper (build-private)
// ---------------------------------------------------------------------------

/** Result of the non-throwing approval wrapper. `ok` carries the resolved,
 *  approved plan so the caller need not re-read it for the drift check. */
export type ApprovalVerdict =
	| { readonly ok: true; readonly plan: PlanArtifact }
	| { readonly missing: true }
	| { readonly unapproved: true };

/** Call the existing throwing `requireApprovedPlan` and convert its two
 *  typed gate errors into returned discriminants. Any OTHER error re-throws
 *  — an unrelated store/IO failure or a corrupt-plan-body parse error must
 *  never be reported as a modeled refusal reason. */
export function approvalVerdict(repoPath: string, epicHash: string, storyId: string): ApprovalVerdict {
	try {
		const plan = requireApprovedPlan(repoPath, epicHash, storyId);
		return { ok: true, plan };
	} catch (err) {
		if (err instanceof ArtifactMissingError)     return { missing: true };
		if (err instanceof ArtifactNotApprovedError) return { unapproved: true };
		throw err;   // unmodeled — propagate rather than swallow into a false reason
	}
}

// ---------------------------------------------------------------------------
// t3 — plan-vs-design.story drift comparator (build-private)
// ---------------------------------------------------------------------------

/** Result of the drift comparator. `stale` carries the two operands so the
 *  caller can surface them inline in the `plan-stale` refusal. */
export type DriftVerdict =
	| { readonly fresh: true }
	| { readonly stale: true; readonly planRecordedDesignHash: string; readonly currentDesignHash: string };

/** Compare the plan's recorded design basis hash against the current
 *  design.story artifact hash. Equal ⇒ fresh. Differing ⇒ stale. An
 *  empty/absent recorded hash ⇒ CONSERVATIVELY stale (freshness cannot be
 *  positively established, so the gate refuses rather than admits).
 *
 *  Reads the current LLD via `readLldArtifact`; a missing current LLD is an
 *  UPSTREAM-INTEGRITY failure (the drift comparison has no second operand),
 *  so its `ArtifactMissingError` is allowed to propagate — the comparator
 *  never fabricates a verdict when it cannot compare. Mirrors
 *  `scanLldStaleness`'s typed-verdict discipline for the modeled path;
 *  never calls it. */
export function driftVerdict(
	repoPath: string,
	epicHash: string,
	storyId:  string,
	plan:     PlanArtifact,
): DriftVerdict {
	const planRecordedDesignHash = plan.meta.lldEffectiveHash ?? '';
	const currentDesignHash = readLldArtifact(repoPath, epicHash, storyId).meta.hldEffectiveHash;
	if (planRecordedDesignHash.length === 0) {
		// Freshness cannot be positively established — refuse conservatively.
		return { stale: true, planRecordedDesignHash, currentDesignHash };
	}
	if (planRecordedDesignHash !== currentDesignHash) {
		return { stale: true, planRecordedDesignHash, currentDesignHash };
	}
	return { fresh: true };
}

// ---------------------------------------------------------------------------
// admitBuild — the start-turn admission gate (sc3)
// ---------------------------------------------------------------------------

/** A stable identity hash of the resolved plan version being admitted. Honest
 *  content hash of the on-disk plan JSON (the object came from `JSON.parse`,
 *  so re-stringify preserves key order deterministically). */
function planContentHash(plan: PlanArtifact): string {
	return createHash('sha256').update(JSON.stringify(plan)).digest('hex');
}

/** The `build` stage's read-only start-turn admission gate. Refuses to touch
 *  code when the Story's plan is missing, unapproved, or stale, and reports
 *  WHICH condition failed as a typed `BuildAdmissionResult` — never throwing
 *  for any of the four modeled conditions (accepted / plan-missing /
 *  plan-unapproved / plan-stale), so `treeUntouched` is structural, not
 *  asserted.
 *
 *  Fixed evaluation order — approval BEFORE staleness — so:
 *    - a missing plan short-circuits to `plan-missing`, never a staleness
 *      verdict and never an empty admitted run;
 *    - an unapproved (or rejected) plan short-circuits to `plan-unapproved`,
 *      so an unapproved-AND-drifted plan yields the single reason
 *      `plan-unapproved` and the drift comparison is never computed;
 *    - only an approved plan reaches the drift check, which yields
 *      `plan-stale` (with the inline drift hashes) or admits.
 *
 *  Unmodeled errors — a malformed `epicHash` (via `assertEpicHash`), a corrupt
 *  plan body, or a missing CURRENT design.story — propagate rather than being
 *  remapped to a modeled reason. */
export function admitBuild(repoPath: string, epicHash: string, storyId: string): BuildAdmissionResult {
	// Guard the hash up front so a malformed epicHash is a propagated internal
	// error, not a mis-reported `plan-missing`.
	assertEpicHash(epicHash, `admitBuild requires a well-formed epicHash`);

	const approval = approvalVerdict(repoPath, epicHash, storyId);
	if ('missing' in approval) {
		return {
			admitted: false,
			refusal: {
				reason:  'plan-missing',
				message:
					`Build refused for Story '${storyId}': no plan artifact exists (plan-missing). ` +
					`Run \`plan\` for Story '${storyId}' and approve it before build.`,
				treeUntouched: true,
			},
		};
	}
	if ('unapproved' in approval) {
		return {
			admitted: false,
			refusal: {
				reason:  'plan-unapproved',
				message:
					`Build refused for Story '${storyId}': the plan exists but is not approved ` +
					`(plan-unapproved). Approve the plan before build.`,
				treeUntouched: true,
			},
		};
	}

	// Approved — now the plan-vs-design.story drift check.
	const drift = driftVerdict(repoPath, epicHash, storyId, approval.plan);
	if ('stale' in drift) {
		return {
			admitted: false,
			refusal: {
				reason:  'plan-stale',
				message:
					`Build refused for Story '${storyId}': the plan is stale (plan-stale) — its recorded ` +
					`design.story basis (${short(drift.planRecordedDesignHash)}) differs from the current ` +
					`design.story (${short(drift.currentDesignHash)}). Re-run \`plan\` against the current LLD before build.`,
				staleness: {
					planRecordedDesignHash: drift.planRecordedDesignHash,
					currentDesignHash:      drift.currentDesignHash,
				},
				treeUntouched: true,
			},
		};
	}

	// Approved + fresh — admit with the THIN plan pointer.
	return {
		admitted: true,
		plan: {
			planArtifactId:   planArtifactId(epicHash, storyId),
			planArtifactHash: planContentHash(approval.plan),
			storyId,
		},
	};
}

/** Short display form for a hash inside a refusal message. */
function short(hash: string): string {
	return hash.length > 0 ? `${hash.slice(0, 12)}…` : '(empty)';
}

// ---------------------------------------------------------------------------
// Standalone build admission — the no-plan path for triage-routed tiers
// ---------------------------------------------------------------------------

/** Admit a STANDALONE build — a triage-routed Small (LLD → build, no plan) or
 *  Trivial (build only, no LLD) feature. There is no plan to gate on, so the
 *  gate instead requires:
 *    - Small (`producesLld` true): the standalone LLD exists AND is approved
 *      (the design IS the spec build implements). Reuses `requireApprovedLld`,
 *      which skips HLD-staleness for a standalone LLD.
 *    - Trivial (`producesLld` false): nothing upstream — admit directly; the
 *      scope statement is the spec, and the standalone BUILD record is the
 *      tracking artifact.
 *  Mirrors `admitBuild`'s never-throw-for-modeled-conditions discipline: a
 *  missing/unapproved LLD returns a typed refusal, not an exception. See
 *  `plans/feature-triage-router.md`. */
export function admitStandaloneBuild(
	repoPath:    string,
	epicHash:    string,
	storyId:     string,
	producesLld: boolean,
): BuildAdmissionResult {
	assertEpicHash(epicHash, `admitStandaloneBuild requires a well-formed epicHash`);

	if (!producesLld) {
		// Trivial — no upstream artifact to gate on. Admit; the scope statement
		// is the spec. `planArtifactHash` is empty (there is no plan).
		return { admitted: true, plan: { planArtifactId: '(standalone-trivial)', planArtifactHash: '', storyId } };
	}

	// Small — the standalone LLD must exist and be approved.
	try {
		requireApprovedLld(repoPath, epicHash, storyId);
	} catch (err) {
		if (err instanceof ArtifactMissingError) {
			return {
				admitted: false,
				refusal: {
					reason: 'plan-missing',
					message:
						`Build refused for standalone Story '${storyId}': no LLD exists. ` +
						`Run \`design.story\` (standalone) for this feature and approve it before build.`,
					treeUntouched: true,
				},
			};
		}
		if (err instanceof ArtifactNotApprovedError) {
			return {
				admitted: false,
				refusal: {
					reason: 'plan-unapproved',
					message:
						`Build refused for standalone Story '${storyId}': the LLD exists but is not approved. ` +
						`Approve the standalone LLD before build.`,
					treeUntouched: true,
				},
			};
		}
		throw err;   // unmodeled — propagate
	}

	return { admitted: true, plan: { planArtifactId: '(standalone-lld)', planArtifactHash: '', storyId } };
}
