/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Procix Software India. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/**
 * Code-review S007 — the Story-completion gate.
 *
 * `enforceCodeReviewGate` reads the sc4 `CodeReviewArtifact` for a Story and
 * returns a discriminated outcome the caller PRESENTS to the user before the
 * explicit approval act — it never approves on the user's behalf. It MIRRORS the
 * existing block-or-override enforcement (`ReviewBlockedError`/
 * `approveArtifactByJsonPath`) but on the CODE review's `body.verdict`, NEVER on
 * `meta.review` (the design-artifact review) — the two review kinds stay
 * distinct. The gate is strictly ADDITIVE + fail-open:
 *   - no CR record (a pre-existing Story, or one whose review never ran) ⇒
 *     `no-review` ⇒ completion behaves exactly as before this Story;
 *   - a malformed / unknown-verdict record ⇒ `no-review` (never a spurious block);
 *   - only a PRESENT, readable `block` verdict, with enforcement ON and no
 *     override, withholds completion (`blocked`);
 *   - enforcement OFF demotes a block to a NON-BLOCKING advisory `warn`
 *     (`advisory:true`, distinguishable from a genuine warn) so gating can be
 *     validated before it withholds a real completion.
 * Read-only: it never writes / mutates the CR record and reads no LLM provider.
 */

import { existsSync, readFileSync } from 'node:fs';

import { getLogger } from '../../shared/logger.js';
import { PATHS } from '../../shared/paths.js';
import { codeReviewArtifactPaths } from '../storage.js';
import type { ReviewVerdict } from '../review/types.js';

const log = getLogger('code-review:gate');

/** The severity totals the gate surfaces — mirrors the CR body.counts. */
export interface GateCounts {
	readonly high: number;
	readonly med:  number;
	readonly low:  number;
}

/** The gate's discriminated outcome. The caller presents it before approval and
 *  withholds completion ONLY on `blocked`. `overrideReview`-bearing options turn
 *  a would-be `blocked` into `overridden`; enforcement-off turns it into an
 *  advisory `warn` (`advisory:true`). */
export type CodeReviewGateResult =
	| { readonly status: 'no-review' }
	| { readonly status: 'pass';       readonly counts: GateCounts }
	| { readonly status: 'warn';       readonly counts: GateCounts; readonly message: string; readonly advisory?: boolean }
	| { readonly status: 'blocked';    readonly verdict: 'block'; readonly counts: GateCounts; readonly message: string }
	| { readonly status: 'overridden'; readonly verdict: 'block'; readonly counts: GateCounts; readonly overrideReason: string; readonly at: string };

export interface CodeReviewGateOpts {
	/** An explicit reason that bypasses a `block` verdict (records the override). */
	readonly overrideReview?: string | undefined;
	/** Overrides the `codeReview.enforce` config flag (defaults to the config
	 *  value; injected in tests). When false/absent-and-config-off the gate never blocks. */
	readonly enforce?: boolean | undefined;
}

/**
 * Enforce the code-review verdict for a Story's completion. Pure + read-only:
 * returns a {@link CodeReviewGateResult} for the caller to present; never writes.
 */
export function enforceCodeReviewGate(
	repoPath: string,
	epicHash: string,
	storyId:  string,
	opts?:    CodeReviewGateOpts,
): CodeReviewGateResult {
	const jsonPath = codeReviewArtifactPaths(repoPath, epicHash, storyId).json;

	// Absent record ⇒ no-review (strictly additive; completion unchanged).
	if (!existsSync(jsonPath)) return { status: 'no-review' };

	// Read + parse the record. A parse/shape failure fails OPEN to no-review —
	// the gate never manufactures a block from a record it cannot read.
	let verdict: ReviewVerdict | string;
	let counts: GateCounts;
	try {
		const parsed = JSON.parse(readFileSync(jsonPath, 'utf8')) as { body?: { verdict?: unknown; counts?: unknown } };
		const body = parsed.body;
		if (body === undefined || body === null) throw new Error('record has no body');
		verdict = typeof body.verdict === 'string' ? body.verdict : '<missing>';
		counts  = normalizeCounts(body.counts);
	} catch (err) {
		log.warn({ jsonPath, err: err instanceof Error ? err.message : String(err) }, 'code-review gate: unreadable CR record; treating as no-review (fail-open)');
		return { status: 'no-review' };
	}

	// An unrecognized verdict fails OPEN too — never a spurious block.
	if (verdict !== 'pass' && verdict !== 'warn' && verdict !== 'block') {
		log.warn({ jsonPath, verdict }, 'code-review gate: verdict outside the ReviewVerdict union; treating as no-review (fail-open)');
		return { status: 'no-review' };
	}

	if (verdict === 'pass') return { status: 'pass', counts };
	if (verdict === 'warn') return { status: 'warn', counts, message: `code review returned warn (${countsStr(counts)})` };

	// verdict === 'block' from here.
	const enforce = opts?.enforce ?? readEnforceFlag();
	if (!enforce) {
		// Advisory: distinguishable from a genuine warn via advisory:true + a
		// message naming the demoted block verdict. NEVER withholds completion.
		return {
			status:   'warn',
			advisory: true,
			counts,
			message:  `code review verdict is 'block' (${countsStr(counts)}) but codeReview.enforce is off — advisory only, completion is allowed`,
		};
	}

	const override = opts?.overrideReview;
	if (override !== undefined && override.length > 0) {
		return { status: 'overridden', verdict: 'block', counts, overrideReason: override, at: new Date().toISOString() };
	}

	return {
		status:  'blocked',
		verdict: 'block',
		counts,
		message: `code review BLOCKS completion (${countsStr(counts)}). Address the findings or approve with an override reason.`,
	};
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Read the `codeReview.enforce` flag from `~/.insrc/config.json`. Fail-safe:
 *  defaults to FALSE when the file is absent, unparseable, or the key is missing,
 *  and NEVER throws — a fresh install (no config) must not hard-fail the gate. */
function readEnforceFlag(): boolean {
	try {
		if (!existsSync(PATHS.config)) return false;
		const raw = JSON.parse(readFileSync(PATHS.config, 'utf8')) as { codeReview?: { enforce?: unknown } };
		return raw.codeReview?.enforce === true;
	} catch {
		return false;
	}
}

/** Coerce a parsed `counts` into a numeric GateCounts (defaulting each to 0). */
function normalizeCounts(raw: unknown): GateCounts {
	const c = (typeof raw === 'object' && raw !== null ? raw : {}) as { high?: unknown; med?: unknown; low?: unknown };
	const n = (v: unknown): number => (typeof v === 'number' && Number.isFinite(v) && v >= 0 ? v : 0);
	return { high: n(c.high), med: n(c.med), low: n(c.low) };
}

/** A compact `HIGH n · MED n · LOW n` rendering for the human message. */
function countsStr(c: GateCounts): string {
	return `HIGH ${c.high} · MED ${c.med} · LOW ${c.low}`;
}
