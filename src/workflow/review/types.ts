/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Procix Software India. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/**
 * Review-cycle engine types.
 *
 * The workflow chain (define → design.epic → design.story → plan) emits
 * artifacts whose load-bearing premises — counts, inventories, closed
 * unions, `file:line` citations, external-contract assumptions,
 * cross-artifact traces, ordering claims — are LLM-authored and can rest
 * on truncated / mis-scoped source sweeps: plausible but wrong. A manual
 * audit of a 37-task plan turned up four HIGH defects this way
 * (`docs/reviews/2026-07-20-plan-audit-streaming.md`).
 *
 * The engine mirrors the analyze framework's split: gather EVIDENCE
 * deterministically (re-run the cited greps / reads against the real
 * repo), then let an LLM JUDGE the premise against that evidence. The
 * LLM never asserts grounding it wasn't handed.
 *
 * `ClaimKind` maps 1:1 onto the audit's root-cause taxonomy:
 *   - `inventory`          — counts + producer/member lists (stale/truncated sweeps)
 *   - `citation`           — `file:line` / symbol anchors (wrong-referent citations)
 *   - `closed-union`       — exhaustiveness / uniformity claims
 *   - `external-contract`  — out-of-process SDK / API assumptions
 *   - `cross-artifact`     — traces that span DEF / LLD / PLAN
 *   - `semantic`           — "type X holds the data" claims (semantic gap)
 *   - `ordering`           — "depends on" / sequencing claims
 */

export type ClaimKind =
	| 'inventory'
	| 'citation'
	| 'closed-union'
	| 'external-contract'
	| 'cross-artifact'
	| 'semantic'
	| 'ordering';

export type Severity = 'HIGH' | 'MED' | 'LOW';

export type ReviewVerdict = 'pass' | 'warn' | 'block';

/**
 * How a finding can be remediated, so a downstream layer can auto-apply
 * the safe corrections and route the rest to a user gate.
 *   - `auto`     — a mechanical, evidence-derived text correction the
 *                  engine can apply with high confidence.
 *   - `assisted` — a fix is proposable but needs a human OK.
 *   - `manual`   — needs a design decision; no safe auto-edit.
 */
export type Fixability = 'auto' | 'assisted' | 'manual';

/** An exact-string edit to the artifact markdown. `find` MUST be a
 *  verbatim, unique substring of the artifact. */
export interface ArtifactEdit {
	readonly find: string;
	readonly replace: string;
}

export interface ProposedFix {
	readonly rationale: string;
	/**
	 * Exact-string edits to the ARTIFACT markdown (each `find` must be a
	 * unique literal substring of the artifact). Present ONLY for `auto`
	 * (and optionally `assisted`).
	 */
	readonly artifactEdits?: readonly ArtifactEdit[] | undefined;
	/** For `assisted` / `manual`: 2–4 concrete choices to present to the user. */
	readonly options?: readonly string[] | undefined;
}

/**
 * A deterministic probe attached to a claim: the ripgrep patterns that
 * would re-derive an inventory / union, and the `path:line` anchors that
 * would confirm a citation. Both optional — a semantic claim may carry
 * only reads, an inventory claim only greps.
 */
export interface Probe {
	/** ripgrep patterns (argv-safe; NEVER shell-interpolated). */
	readonly greps?: readonly string[] | undefined;
	/** `path:line` anchors to confirm verbatim. */
	readonly reads?: readonly string[] | undefined;
}

export interface Claim {
	readonly id: string;
	/** The artifact-local reference this premise sits under (e.g. `s2/t6`). */
	readonly ref?: string | undefined;
	readonly kind: ClaimKind;
	/** The premise, restated as a single verifiable assertion. */
	readonly text: string;
	/** The anchors the premise leans on (file paths, symbols, `file:line`). */
	readonly anchors: readonly string[];
	readonly probe: Probe;
}

export interface GrepResult {
	readonly pattern: string;
	readonly matches: readonly string[];
	/** Set when the match set was capped at the cap limit. */
	readonly truncated: boolean;
}

export interface ReadResult {
	readonly anchor: string;
	readonly found: boolean;
	/** The actual line at the anchor, when found. */
	readonly line?: string | undefined;
}

export interface Evidence {
	readonly claimId: string;
	readonly grepResults: readonly GrepResult[];
	readonly reads: readonly ReadResult[];
}

export interface Finding {
	readonly claimId: string;
	readonly ref?: string | undefined;
	readonly kind: ClaimKind;
	readonly severity: Severity;
	/** The premise as evaluated. */
	readonly premise: string;
	/** What the real gathered evidence showed, citing actual matches. */
	readonly evidence: string;
	/** The concrete remediation (or "none — verified sound" for LOW). */
	readonly action: string;
	readonly fixability: Fixability;
	readonly proposedFix?: ProposedFix | undefined;
}

export interface ReviewReport {
	/** A short label for the reviewed artifact. */
	readonly artifact: string;
	readonly stage: string;
	readonly verdict: ReviewVerdict;
	readonly findings: readonly Finding[];
	readonly counts: { readonly high: number; readonly med: number; readonly low: number };
	readonly reviewedAt: string;
	readonly model: string;
}
