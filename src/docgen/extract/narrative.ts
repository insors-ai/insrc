/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Procix Software India. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/**
 * docgen — narrative documents (Epic 870ed3dd, Story s4).
 *
 * A narrative document pairs a DERIVED diagram (reused from s2's
 * component-dependency for topology or s3's call-sequence for a flow — every
 * node graph-cited, k8/k11) with LLM-NARRATED prose sections that express the
 * parts a recorded relationship alone cannot. s4 is the FIRST story to populate
 * sc1's `narrated.sections`; provenance stays type-enforced by the structural
 * derived/narrated partition (k8).
 *
 * Grounding (ac1/k11) is GENERATION-TIME VALIDATION, not a stored citation:
 * every entity a narrated section NAMES must be present in the derived diagram's
 * vocabulary, and a section that names anything ungrounded is DROPPED whole
 * (fidelity over completeness, ac4). Narration is best-effort ADDITIVE — when no
 * provider is available or it fails, s4 returns the grounded derived diagram
 * alone rather than fabricating (ac2 fidelity).
 *
 * The LLM is reached ONLY through the injected NarrativeGenerator seam (k1-safe:
 * Ollama-local / CLI-OAuth, never a cloud REST call — see narrative-generator.ts).
 * The seam keeps makeExtract provider-agnostic + daemon-owned (k2), and every
 * pure fn here performs no I/O.
 */

import type { DocumentIR, IrSection, DocGenOutcome, DocTypeRegistration } from '../types.js';
import { ok, emptyScope } from '../outcome.js';
import { getLogger } from '../../shared/logger.js';

const log = getLogger('docgen-narrative');

export const NARRATIVE_DOCTYPE = 'narrative';

/** The base derived doc types a narrative may be built over. */
export const NARRATIVE_BASES = ['call-sequence', 'component-dependency'] as const;

/** One narrated section BEFORE grounding — the narrator's raw structured output.
 *  `citedNames` are the entity names the section claims to reference. */
export interface RawNarrativeSection {
	readonly title:      string;
	readonly text:       string;
	readonly citedNames: readonly string[];
}

/** The scaffold + question handed to the narrator seam. */
export interface NarrationRequest {
	readonly question:         string;
	readonly scopeDescription: string;
	readonly derived:          DocumentIR;
}

/** The injected narrator seam — the ONLY LLM touch-point in s4. `available()`
 *  gates on the provider's structured-output capability; `generate` runs one
 *  structured completion. A fake in tests; the graph-backed impl in production. */
export interface NarrativeGenerator {
	available(): boolean;
	generate(req: NarrationRequest): Promise<readonly RawNarrativeSection[]>;
}

/** A bound base extractor (an s2/s3 registration's `extract`). */
export type BaseExtract = (input: Record<string, unknown>) => Promise<DocGenOutcome<DocumentIR>>;

/** Case/whitespace-normalize a name so grounding is by identity, not exact bytes. */
function normalize(s: string): string {
	return s.toLowerCase().replace(/\s+/g, ' ').trim();
}

/**
 * The vocabulary a narration is allowed to name: the derived diagram's node
 * labels + every node/edge citation entityId, normalized. Pure + deterministic.
 */
export function buildAllowedEntitySet(derived: DocumentIR): ReadonlySet<string> {
	const allowed = new Set<string>();
	for (const n of derived.derived.nodes) {
		allowed.add(normalize(n.label));
		if (n.citation?.entityId !== undefined) allowed.add(normalize(n.citation.entityId));
	}
	for (const e of derived.derived.edges) {
		if (e.citation?.entityId !== undefined) allowed.add(normalize(e.citation.entityId));
	}
	return allowed;
}

/**
 * Validate raw narrated sections against the graph-present vocabulary: KEEP a
 * section only when EVERY name it cites is in `allowed`; DROP any section with an
 * ungrounded cited name (never rewrite it). The kept sections become plain sc1
 * IrSections (provenance is their placement under narrated.sections, k8).
 */
export function groundSections(
	raw:     readonly RawNarrativeSection[],
	allowed: ReadonlySet<string>,
): IrSection[] {
	const kept: IrSection[] = [];
	raw.forEach((s, i) => {
		const grounded = s.citedNames.every(name => allowed.has(normalize(name)));
		if (grounded) kept.push({ id: `narr:${i}`, title: s.title, narrativeText: s.text });
	});
	return kept;
}

/**
 * Assemble a narrative DocumentIR: the derived diagram is carried through from
 * the base VERBATIM (still graph-derived, k8), the grounded sections are attached
 * under narrated, and the docType is stamped 'narrative'. Pure.
 */
export function buildNarrativeDocument(base: DocumentIR, sections: readonly IrSection[]): DocumentIR {
	return {
		docType:             NARRATIVE_DOCTYPE,
		scopeDescription:    base.scopeDescription,
		derived:             base.derived,
		narrated:            { sections: [...sections] },
		generatedAtRevision: base.generatedAtRevision,
	};
}

interface NarrativeScope {
	readonly base:     string;
	readonly question: string;
}

function parseScope(input: Record<string, unknown>, bases: Record<string, BaseExtract>): NarrativeScope | undefined {
	const repo = input['repo'];
	const base = input['base'];
	const question = input['question'];
	if (typeof repo !== 'string' || repo.length === 0) return undefined;
	if (typeof base !== 'string' || bases[base] === undefined) return undefined;
	if (typeof question !== 'string' || question.length === 0) return undefined;
	return { base, question };
}

export const NARRATIVE_INPUT_SCHEMA: Record<string, unknown> = {
	type: 'object',
	additionalProperties: false,
	required: ['repo', 'base', 'question'],
	properties: {
		repo:     { type: 'string', description: 'Absolute repo root path (registered + indexed)' },
		base:     { type: 'string', enum: [...NARRATIVE_BASES], description: 'The derived diagram to narrate over: call-sequence (flow) or component-dependency (topology)' },
		question: { type: 'string', description: 'The use-case or topology question the narrative should answer' },
		symbol:   { type: 'string', description: 'Entry-point symbol (required when base=call-sequence)' },
		path:     { type: 'string', description: 'Repo-relative scope prefix (for base=component-dependency)' },
		maxDepth: { type: 'integer', minimum: 1, description: 'Traversal depth cap (base=call-sequence)' },
	},
};

export function makeExtract(bases: Record<string, BaseExtract>, generator: NarrativeGenerator) {
	return async function extract(input: Record<string, unknown>): Promise<DocGenOutcome<DocumentIR>> {
		const scope = parseScope(input, bases);
		if (scope === undefined) return emptyScope('narrative: needs a repo, a known base doc type, and a question');

		// The derived diagram (graph-backed) — the base extractor reads its own
		// scope params (symbol/path/maxDepth) from the same input. Its non-ok
		// outcome short-circuits verbatim (sc4).
		const baseOut = await bases[scope.base]!(input);
		if (baseOut.status !== 'ok') return baseOut;
		const base = baseOut.value;

		// No structured-output provider → the grounded diagram alone, no
		// narration (ac2 fidelity: never fabricate, never reach a cloud endpoint).
		if (!generator.available()) {
			log.info({ base: scope.base }, 'narrative: no structured-output provider; returning derived diagram alone');
			return ok(base);
		}

		const allowed = buildAllowedEntitySet(base);
		try {
			const raw = await generator.generate({ question: scope.question, scopeDescription: base.scopeDescription, derived: base });
			const sections = groundSections(raw, allowed);
			log.debug({ raw: raw.length, kept: sections.length }, 'narrative: grounded sections');
			return ok(buildNarrativeDocument(base, sections));
		} catch (err) {
			// A model hiccup degrades to the faithful diagram — best-effort narration.
			log.warn({ err: (err as Error).message }, 'narrative: generation failed; returning derived diagram alone');
			return ok(base);
		}
	};
}

export function narrativeRegistration(bases: Record<string, BaseExtract>, generator: NarrativeGenerator): DocTypeRegistration {
	return {
		docType:    NARRATIVE_DOCTYPE,
		capability: {
			id:      NARRATIVE_DOCTYPE,
			summary: 'Narrative document: a graph-derived diagram (call-sequence flow or component-dependency topology) paired with LLM-narrated prose that only names entities present in the indexed code; narration is generated via the local provider and grounded against the diagram.',
		},
		extractorInputSchema: NARRATIVE_INPUT_SCHEMA,
		extract: makeExtract(bases, generator),
	};
}
