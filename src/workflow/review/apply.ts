/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Procix Software India. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/**
 * Auto-fix application — the "fix the fixable" pass of the review loop.
 *
 * A review produces findings tagged `auto` | `assisted` | `manual`. This
 * module applies ONLY the `auto` ones: mechanical, evidence-derived
 * find/replace edits. `assisted` / `manual` findings are routed to the
 * interactive user-review gate instead (see `pendingUserFindings`).
 *
 * The apply is a PURE transform — (markdown, body) in, amended copies +
 * a fix-log out — so it is fully testable and the caller owns persistence
 * (rewrite the `.json` body + re-render the `.md`). Artifacts are stored as
 * a structured `body` (the source of truth) plus a rendered markdown; an
 * `auto` edit's `find` is a substring the review saw in the markdown, so we
 * apply it to the markdown AND deep-replace it across the body's string
 * leaves, keeping the two in sync for text corrections. An edit whose `find`
 * is absent everywhere is SKIPPED, never force-applied — a stale edit must
 * not silently corrupt the artifact.
 */

import { getLogger } from '../../shared/logger.js';
import type { Finding, ReviewReport } from './types.js';

const log = getLogger('review');

export interface AppliedFix {
	readonly claimId: string;
	readonly ref?: string | undefined;
	readonly edits: readonly { readonly find: string; readonly replace: string }[];
}

export interface SkippedFix {
	readonly claimId: string;
	readonly ref?: string | undefined;
	readonly find: string;
	readonly reason: 'find-not-present';
}

export interface AutoFixResult {
	readonly markdown: string;
	readonly body: unknown;
	readonly applied: readonly AppliedFix[];
	readonly skipped: readonly SkippedFix[];
}

/** Literal (non-regex) replace-all. `find` is treated as an exact string;
 *  since the review guarantees `find` is unique this equals a single swap,
 *  but split/join is safe if it recurs. */
function replaceAllLiteral(text: string, find: string, replace: string): string {
	if (find.length === 0) return text;
	return text.split(find).join(replace);
}

/** Recursively replace `find`→`replace` in every string leaf of a JSON-ish
 *  value, returning a new value (never mutates the input). Reports whether
 *  any replacement happened. */
function deepReplace(value: unknown, find: string, replace: string): { value: unknown; changed: boolean } {
	if (typeof value === 'string') {
		if (value.includes(find)) return { value: replaceAllLiteral(value, find, replace), changed: true };
		return { value, changed: false };
	}
	if (Array.isArray(value)) {
		let changed = false;
		const out = value.map(v => { const r = deepReplace(v, find, replace); if (r.changed) changed = true; return r.value; });
		return { value: changed ? out : value, changed };
	}
	if (value !== null && typeof value === 'object') {
		let changed = false;
		const out: Record<string, unknown> = {};
		for (const [k, v] of Object.entries(value)) {
			const r = deepReplace(v, find, replace);
			if (r.changed) changed = true;
			out[k] = r.value;
		}
		return { value: changed ? out : value, changed };
	}
	return { value, changed: false };
}

/** The findings that need a human — the interactive gate iterates these
 *  (`assisted` first: proposable with options; then `manual`: decision-only). */
export function pendingUserFindings(report: ReviewReport): readonly Finding[] {
	const rank = (f: Finding): number => (f.fixability === 'assisted' ? 0 : 1);
	return report.findings
		.filter(f => f.fixability === 'assisted' || f.fixability === 'manual')
		.slice()
		.sort((a, b) => rank(a) - rank(b));
}

/**
 * Apply every `auto` finding's edits to `markdown` + `body`. An edit whose
 * `find` is present in neither is skipped (never applied blind). Pure: the
 * inputs are not mutated.
 */
export function applyAutoFixes(markdown: string, body: unknown, report: ReviewReport): AutoFixResult {
	let md = markdown;
	let curBody = body;
	const applied: AppliedFix[] = [];
	const skipped: SkippedFix[] = [];

	for (const f of report.findings) {
		if (f.fixability !== 'auto') continue;
		const one = applyOneFinding(md, curBody, f.claimId, f.ref, f.proposedFix?.artifactEdits ?? []);
		md = one.markdown;
		curBody = one.body;
		if (one.applied !== undefined) applied.push(one.applied);
		skipped.push(...one.skipped);
	}

	log.info({ applied: applied.length, skipped: skipped.length }, 'review:apply: applied auto-fixes');
	return { markdown: md, body: curBody, applied, skipped };
}

/** Apply ONE finding's edits to (markdown, body). Shared by `applyAutoFixes`
 *  and the interactive resolver (R3, `apply` action). Skips any edit whose
 *  `find` is absent in both. Pure — inputs are not mutated. */
export function applyOneFinding(
	markdown: string,
	body: unknown,
	claimId: string,
	ref: string | undefined,
	edits: readonly { readonly find: string; readonly replace: string }[],
): { markdown: string; body: unknown; applied?: AppliedFix; skipped: SkippedFix[] } {
	let md = markdown;
	let curBody = body;
	const done: { find: string; replace: string }[] = [];
	const skipped: SkippedFix[] = [];
	for (const e of edits) {
		const inMd = md.includes(e.find);
		const bodyRes = deepReplace(curBody, e.find, e.replace);
		if (!inMd && !bodyRes.changed) {
			skipped.push({ claimId, ref, find: e.find, reason: 'find-not-present' });
			continue;
		}
		if (inMd) md = replaceAllLiteral(md, e.find, e.replace);
		if (bodyRes.changed) curBody = bodyRes.value;
		done.push({ find: e.find, replace: e.replace });
	}
	return { markdown: md, body: curBody, ...(done.length > 0 ? { applied: { claimId, ref, edits: done } } : {}), skipped };
}
