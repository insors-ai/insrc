/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Procix Software India. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/**
 * `build` admission internals — Story s2, Phase B.
 *
 * Two build-PRIVATE halves of the start-turn admission gate. Neither is
 * re-exported from `runners/build/index.ts`; siblings (s3, s5) see only
 * the composed `BuildAdmissionResult` verdict, never HOW it is reached.
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

import { ArtifactMissingError, ArtifactNotApprovedError, readLldArtifact, requireApprovedPlan } from '../../gates.js';
import type { PlanArtifact } from '../../artifacts/plan.js';

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
