/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Procix Software India. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/**
 * Premise judgment — the final pass of the review cycle.
 *
 * One `provider.completeStructured` call per claim: given the premise and
 * the REAL gathered evidence, judge whether the premise holds, assign a
 * severity, and classify how it can be fixed. The evidence sits at the
 * prompt TAIL (CLAUDE.md rule 7). The judge may only reason over the
 * evidence it was handed — it must not assert grounding it wasn't given.
 *
 * Severity:
 *   - HIGH : the premise is verifiably wrong / incomplete in a way that
 *            changes the artifact's output or acceptance.
 *   - MED  : unverifiable, a stale anchor, or non-material.
 *   - LOW  : verified sound.
 *
 * Fixability:
 *   - auto     : a mechanical, evidence-derived text correction (wrong
 *                count, stale `file:line`, mis-identified member). Emits
 *                `artifactEdits` whose `find` is a verbatim substring of
 *                the artifact and whose `replace` is derived from the
 *                real evidence.
 *   - assisted : proposable but needs a human OK — `options` (+ optional edits).
 *   - manual   : needs a design decision — `options` only, no edits.
 */

import { getLogger } from '../../shared/logger.js';
import type { LLMProvider, StructuredSchema } from '../../shared/types.js';
import type {
	ArtifactEdit, Claim, Evidence, Finding, Fixability, ProposedFix, Severity,
} from './types.js';

const log = getLogger('review');

const SEVERITIES: readonly Severity[] = ['HIGH', 'MED', 'LOW'];
const FIXABILITIES: readonly Fixability[] = ['auto', 'assisted', 'manual'];

// ---------------------------------------------------------------------------
// Schema
// ---------------------------------------------------------------------------

/**
 * The JSON/ajv schema one premise-judgment turn must satisfy — a Finding
 * WITHOUT its `claimId` (the caller keys it back to the claim): `{ severity,
 * evidence, action, fixability, proposedFix? }`. Exported so a controller-
 * driven surface (`insrc_review_step`) can hand it to the outer LLM turn.
 */
export const VERIFY_SCHEMA: StructuredSchema = {
	type: 'object',
	additionalProperties: false,
	required: ['severity', 'evidence', 'action', 'fixability'],
	properties: {
		severity:   { type: 'string', enum: SEVERITIES as unknown as string[] },
		evidence:   { type: 'string', minLength: 1 },
		action:     { type: 'string', minLength: 1 },
		fixability: { type: 'string', enum: FIXABILITIES as unknown as string[] },
		proposedFix: {
			type: 'object',
			additionalProperties: false,
			required: ['rationale'],
			properties: {
				rationale: { type: 'string' },
				artifactEdits: {
					type: 'array',
					items: {
						type: 'object',
						additionalProperties: false,
						required: ['find', 'replace'],
						properties: {
							find:    { type: 'string', minLength: 1 },
							replace: { type: 'string' },
						},
					},
				},
				options: { type: 'array', items: { type: 'string' } },
			},
		},
	},
};

export interface RawFinding {
	readonly severity: Severity;
	readonly evidence: string;
	readonly action: string;
	readonly fixability: Fixability;
	readonly proposedFix?: {
		readonly rationale?: string | undefined;
		readonly artifactEdits?: readonly { readonly find?: string | undefined; readonly replace?: string | undefined }[] | undefined;
		readonly options?: readonly string[] | undefined;
	} | undefined;
}

// ---------------------------------------------------------------------------
// Prompt
// ---------------------------------------------------------------------------

const SYSTEM = [
	'You are a grounded reviewer. You are given ONE load-bearing premise from a',
	'workflow artifact and the REAL evidence a deterministic engine gathered by',
	're-running the premise\'s probes (ripgrep matches + `path:line` reads) against',
	'the actual source tree. Judge ONLY against this evidence — do NOT invent',
	'matches, files, or grounding you were not handed. If the evidence is empty or',
	'does not address the premise, the premise is UNVERIFIABLE (severity MED).',
	'',
	'Assign `severity` by MATERIALITY — does the defect break the work, or is it mere',
	'imprecision? The test for HIGH is a statable failure, and it cuts BOTH ways: if you',
	'CAN state a concrete build-breaking failure you MUST assign HIGH (do not soften a real',
	'defect to MED out of caution); if you CANNOT, it is not HIGH.',
	'  - HIGH : the evidence CONTRADICTS the premise AND building the task as written would',
	'           produce wrong/broken code or fail an acceptance check — and you can name the',
	'           concrete failure ("built as-written → <specific wrong outcome>"). Examples',
	'           (all HIGH): a cited `file:line` resolves to a DIFFERENT entity the task then',
	'           builds on; a producer/API/handler the task targets does not exist or is never',
	'           reached; a closed union / exhaustiveness claim that is actually open; an',
	'           inbound value read from the wrong place so it is always absent.',
	'  - MED  : unverifiable from the evidence; a stale/mis-resolved anchor that still points',
	'           at the right concept; an imprecise or miscounted premise whose PRESCRIBED',
	'           change still holds (the missing/wrong fact does not alter what gets built); a',
	'           correct-but-dormant or over-cautious claim; any non-blocking concern.',
	'  - LOW  : verified sound — the evidence confirms the premise.',
	'A wrong count or stale anchor is HIGH only if the wrongness changes the outcome; if the',
	'prescribed change is still correct despite it, that is MED. But a defect that makes the',
	'task target something nonexistent, wrongly-located, or never-reached IS HIGH.',
	'',
	'Write `evidence` citing the REAL matches / read lines you were given.',
	'Write `action`: the concrete remediation, or "none — verified sound" for LOW.',
	'',
	'Classify `fixability`:',
	'  - auto     : a mechanical, evidence-derived text correction (a wrong count, a',
	'               stale/wrong-referent `file:line`, a mis-identified inventory member).',
	'               Provide `proposedFix.artifactEdits`: exact find/replace on the',
	'               artifact markdown. `find` MUST be a verbatim, unique substring of the',
	'               artifact; `replace` MUST be derived from the REAL evidence — never',
	'               invent a value the evidence does not support.',
	'  - assisted : proposable but needs a human OK (reword a premise, pick among verified',
	'               alternatives). Provide `proposedFix.options` (2–4 choices) and, only if',
	'               safe, candidate `artifactEdits`.',
	'  - manual   : needs a design decision (re-scope, change the type model, resolve a',
	'               semantic gap) with NO safe auto-edit. Provide `proposedFix.options` only;',
	'               do NOT emit `artifactEdits`.',
	'A LOW/verified finding is `manual` with no edits and no options unless a cleanup is genuinely useful.',
].join('\n');

function renderEvidence(claim: Claim, evidence: Evidence): string {
	const lines: string[] = [];
	lines.push('--- PREMISE ---');
	lines.push(`kind: ${claim.kind}`);
	if (claim.ref !== undefined) lines.push(`ref: ${claim.ref}`);
	lines.push(`text: ${claim.text}`);
	if (claim.anchors.length > 0) lines.push(`anchors: ${claim.anchors.join(', ')}`);
	lines.push('');
	lines.push('--- GATHERED EVIDENCE (ground truth) ---');
	if (evidence.grepResults.length === 0 && evidence.reads.length === 0) {
		lines.push('(no probes were run for this premise — treat as UNVERIFIABLE)');
	}
	for (const g of evidence.grepResults) {
		lines.push(`grep /${g.pattern}/ → ${g.matches.length} match(es)${g.truncated ? ' [TRUNCATED at cap]' : ''}`);
		for (const m of g.matches) lines.push(`    ${m}`);
	}
	for (const r of evidence.reads) {
		lines.push(r.found ? `read ${r.anchor} → FOUND: ${r.line ?? ''}` : `read ${r.anchor} → NOT FOUND`);
	}
	return lines.join('\n');
}

// ---------------------------------------------------------------------------
// Prompt builder (exposed for the controller-driven review surface)
// ---------------------------------------------------------------------------

/**
 * Build the system + user prompt for ONE premise-judgment turn. The gathered
 * evidence is placed at the TAIL of the `user` message (CLAUDE.md rule 7).
 * Exposed so `insrc_review_step` can compose the per-claim premise+evidence
 * blocks itself; the daemon path (`verifyClaim`) uses the same builder.
 */
export function buildVerifyPrompt(
	claim:    Claim,
	evidence: Evidence,
): { system: string; user: string } {
	return {
		system: SYSTEM,
		user: [
			'Judge the premise below against the gathered evidence. Emit the finding JSON now.',
			'',
			renderEvidence(claim, evidence),
		].join('\n'),
	};
}

/** The evidence block for one claim (premise header + ground-truth matches),
 *  exposed so a controller-driven surface can compose a batched judge prompt. */
export { renderEvidence };

// ---------------------------------------------------------------------------
// Public entry
// ---------------------------------------------------------------------------

/**
 * Judge one claim against its gathered evidence. One structured LLM call;
 * evidence is placed at the prompt tail.
 */
export async function verifyClaim(
	claim:    Claim,
	evidence: Evidence,
	provider: LLMProvider,
	signal?:  AbortSignal,
): Promise<Finding> {
	const { system, user } = buildVerifyPrompt(claim, evidence);
	const messages = [
		{ role: 'system' as const, content: system },
		{ role: 'user' as const, content: user },
	];

	const raw = await provider.completeStructured<RawFinding>(
		messages,
		VERIFY_SCHEMA,
		signal !== undefined ? { signal } : {},
	);

	const finding = normalizeFinding(claim, raw);
	log.info({ claimId: claim.id, severity: finding.severity, fixability: finding.fixability }, 'review:verify: judged premise');
	return finding;
}

/** Coerce a raw judgment payload into a `Finding` keyed to `claim`. Shared by
 *  the daemon path and the controller-driven surface (`insrc_review_step`). */
export function normalizeFinding(claim: Claim, raw: RawFinding): Finding {
	const severity: Severity = SEVERITIES.includes(raw.severity) ? raw.severity : 'MED';
	const fixability: Fixability = FIXABILITIES.includes(raw.fixability) ? raw.fixability : 'manual';
	const proposedFix = normalizeFix(fixability, raw.proposedFix);
	return {
		claimId: claim.id,
		...(claim.ref !== undefined ? { ref: claim.ref } : {}),
		kind: claim.kind,
		severity,
		premise: claim.text,
		evidence: raw.evidence ?? '',
		action: raw.action ?? '',
		fixability,
		...(proposedFix !== undefined ? { proposedFix } : {}),
	};
}

/** Coerce the raw fix. `manual` never carries `artifactEdits`. */
function normalizeFix(
	fixability: Fixability,
	raw: RawFinding['proposedFix'],
): ProposedFix | undefined {
	if (raw === undefined) return undefined;
	const edits: ArtifactEdit[] = [];
	if (fixability !== 'manual') {
		for (const e of raw.artifactEdits ?? []) {
			if (typeof e?.find === 'string' && e.find.length > 0 && typeof e.replace === 'string') {
				edits.push({ find: e.find, replace: e.replace });
			}
		}
	}
	const options = (raw.options ?? []).filter(o => typeof o === 'string' && o.length > 0);
	const rationale = raw.rationale ?? '';
	if (edits.length === 0 && options.length === 0 && rationale.length === 0) return undefined;
	return {
		rationale,
		...(edits.length > 0 ? { artifactEdits: edits } : {}),
		...(options.length > 0 ? { options } : {}),
	};
}
