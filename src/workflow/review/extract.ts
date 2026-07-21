/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Procix Software India. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/**
 * Claim extraction — the first pass of the review cycle.
 *
 * One `provider.completeStructured` call pulls EVERY load-bearing premise
 * out of an artifact and, for each, emits the deterministic probe (the
 * ripgrep pattern(s) / `path:line` reads) that would re-derive it. The
 * artifact markdown sits at the TAIL of the prompt — CLAUDE.md rule 7:
 * structural reference goes trailing, because recency-weighted attention
 * hallucinates against mid-prompt structural blocks.
 */

import { getLogger } from '../../shared/logger.js';
import type { LLMProvider, StructuredSchema } from '../../shared/types.js';
import type { Claim, ClaimKind } from './types.js';

const log = getLogger('review');

const CLAIM_KINDS: readonly ClaimKind[] = [
	'inventory', 'citation', 'closed-union', 'external-contract',
	'cross-artifact', 'semantic', 'ordering',
];

// ---------------------------------------------------------------------------
// Schema
// ---------------------------------------------------------------------------

/**
 * The JSON/ajv schema the claim-extraction turn must satisfy: `{ claims: Claim[] }`.
 * Exported so a controller-driven surface (`insrc_review_step`) can hand it to
 * the outer LLM turn instead of running the extraction through a provider here.
 */
export const EXTRACT_SCHEMA: StructuredSchema = {
	type: 'object',
	additionalProperties: false,
	required: ['claims'],
	properties: {
		claims: {
			type: 'array',
			items: {
				type: 'object',
				additionalProperties: false,
				required: ['id', 'kind', 'text', 'anchors', 'probe'],
				properties: {
					id:      { type: 'string', minLength: 1 },
					ref:     { type: 'string' },
					kind:    { type: 'string', enum: CLAIM_KINDS as unknown as string[] },
					text:    { type: 'string', minLength: 1 },
					anchors: { type: 'array', items: { type: 'string' } },
					probe: {
						type: 'object',
						additionalProperties: false,
						properties: {
							greps: { type: 'array', items: { type: 'string' } },
							reads: { type: 'array', items: { type: 'string' } },
						},
					},
				},
			},
		},
	},
};

interface RawClaim {
	readonly id: string;
	readonly ref?: string | undefined;
	readonly kind: ClaimKind;
	readonly text: string;
	readonly anchors?: readonly string[] | undefined;
	readonly probe?: { readonly greps?: readonly string[] | undefined; readonly reads?: readonly string[] | undefined } | undefined;
}

interface ClaimsEnvelope {
	readonly claims: readonly RawClaim[];
}

// ---------------------------------------------------------------------------
// Prompt
// ---------------------------------------------------------------------------

function systemPrompt(stage: string): string {
	const base = [
		'You audit a workflow artifact by extracting its LOAD-BEARING PREMISES —',
		'the assertions the artifact\'s correctness depends on — so a deterministic',
		'engine can re-verify each against the real source tree.',
		'',
		'Extract EVERY load-bearing premise. For each, classify its `kind`:',
		'  - inventory         : a count or a list of members ("the two producers", "all four types")',
		'  - citation          : a `file:line` or symbol reference the premise leans on',
		'  - closed-union      : an exhaustiveness / uniformity claim ("these are the only cases", "all are uniform")',
		'  - external-contract : an assumption about out-of-process behavior (an SDK / API / protocol contract)',
		'  - cross-artifact    : a trace that spans other artifacts (DEF ↔ LLD ↔ PLAN)',
		'  - semantic          : a "type X holds / carries the data" claim',
		'  - ordering          : a "depends on" / sequencing claim',
		'',
		'For each premise emit a `probe` — the DETERMINISTIC re-derivation:',
		'  - `greps`: ripgrep PATTERNS (regex, passed as argv — no shell) that, run over `src/`,',
		'    would re-derive the inventory / union / member list or locate the cited symbol.',
		'  - `reads`: `path:line` anchors (e.g. `src/foo.ts:42`) that would CONFIRM a citation verbatim.',
		'Prefer a grep that RE-DERIVES a count over one that merely restates it. A count/inventory',
		'premise MUST carry at least one `greps` pattern; a `file:line` citation MUST carry a `reads` anchor.',
		'List the premise\'s `anchors` (the file paths / symbols / `file:line`s it names).',
		'Set `ref` to the artifact-local reference the premise sits under (e.g. a task id like `s2/t6`) when present.',
		'Restate each premise in `text` as ONE self-contained verifiable assertion.',
	];
	if (stage === 'plan') {
		base.push(
			'',
			'STAGE = plan: this artifact enumerates concrete tasks. Demand a re-derivation grep for',
			'EVERY count and EVERY inventory/producer/member list — these are the premises that ship broken.',
		);
	} else {
		base.push(
			'',
			`STAGE = ${stage}: focus on citation accuracy and internal consistency —`,
			'verify `file:line`/symbol anchors resolve and cross-artifact traces hold.',
		);
	}
	return base.join('\n');
}

// ---------------------------------------------------------------------------
// Prompt builder (exposed for the controller-driven review surface)
// ---------------------------------------------------------------------------

/**
 * Build the system + user prompt for the claim-extraction turn. The artifact
 * markdown is placed at the TAIL of the `user` message (CLAUDE.md rule 7).
 * Exposed so `insrc_review_step` can hand it to the outer (controller) LLM
 * verbatim; the daemon path (`extractClaims`) uses the same builder.
 */
export function buildExtractPrompt(
	artifactMarkdown: string,
	stage:            string,
): { system: string; user: string } {
	return {
		system: systemPrompt(stage),
		user: [
			'Extract the load-bearing premises of the artifact below. Emit the claims JSON now.',
			'',
			'--- ARTIFACT MARKDOWN (stage: ' + stage + ') ---',
			artifactMarkdown,
		].join('\n'),
	};
}

/** Coerce a raw `{ claims }` envelope (however produced) into well-formed
 *  `Claim`s. Shared by the daemon path and the controller-driven surface. */
export function normalizeClaimsEnvelope(env: { claims?: readonly RawClaim[] | undefined }): Claim[] {
	return normalizeClaims(env.claims);
}

// ---------------------------------------------------------------------------
// Public entry
// ---------------------------------------------------------------------------

/**
 * Extract the load-bearing premises of `artifactMarkdown` as verifiable
 * `Claim`s with attached deterministic probes. One structured LLM call;
 * the artifact markdown is placed at the prompt tail.
 */
export async function extractClaims(
	artifactMarkdown: string,
	stage:            string,
	provider:         LLMProvider,
	signal?:          AbortSignal,
): Promise<Claim[]> {
	const { system, user } = buildExtractPrompt(artifactMarkdown, stage);
	const messages = [
		{ role: 'system' as const, content: system },
		{ role: 'user' as const, content: user },
	];

	const env = await provider.completeStructured<ClaimsEnvelope>(
		messages,
		EXTRACT_SCHEMA,
		signal !== undefined ? { signal } : {},
	);

	const claims = normalizeClaims(env.claims);
	log.info({ stage, count: claims.length }, 'review:extract: extracted load-bearing premises');
	return claims;
}

/** Coerce the raw LLM envelope into well-formed `Claim`s, dropping empties
 *  and honouring `exactOptionalPropertyTypes` (omit rather than `undefined`). */
function normalizeClaims(raw: readonly RawClaim[] | undefined): Claim[] {
	if (raw === undefined) return [];
	const out: Claim[] = [];
	for (let i = 0; i < raw.length; i++) {
		const c = raw[i];
		if (c === undefined) continue;
		const id = typeof c.id === 'string' && c.id.length > 0 ? c.id : `c${i + 1}`;
		const greps = (c.probe?.greps ?? []).filter(g => typeof g === 'string' && g.length > 0);
		const reads = (c.probe?.reads ?? []).filter(r => typeof r === 'string' && r.length > 0);
		out.push({
			id,
			...(c.ref !== undefined && c.ref.length > 0 ? { ref: c.ref } : {}),
			kind: CLAIM_KINDS.includes(c.kind) ? c.kind : 'semantic',
			text: c.text ?? '',
			anchors: (c.anchors ?? []).filter(a => typeof a === 'string'),
			probe: {
				...(greps.length > 0 ? { greps } : {}),
				...(reads.length > 0 ? { reads } : {}),
			},
		});
	}
	return out;
}
