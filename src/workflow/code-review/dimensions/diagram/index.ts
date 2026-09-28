/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Procix Software India. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/**
 * sc4 (S003) — the 'diagram' code-review dimension.
 *
 * `judgeDiagram` is a THIN DISPATCHER over the per-type diagram handler registry:
 * it resolves each diagram CompanionArtifactRef in the approved body to the
 * handler that owns it (via `appliesTo`) and delegates; a companion no registered
 * handler owns yields ONE LOW 'observation' (never a throw). It also runs the ER
 * handler when the body carries an erDefinition even without a companion ref, so a
 * validated-but-unrendered ER model is still judged. Handlers run SERIAL; a
 * handler that throws yields a LOW observation rather than aborting the dimension.
 * The findings ride the SAME computeReviewVerdict/foldVerdict + enforceCodeReviewGate
 * as the base dimensions — the verdict reducer is never forked (ac3/k4).
 *
 * `hasDiagramReferences` is the inclusion GATE (mirrors hasFunctionalDefinition):
 * the dimension runs only when the approved body carries an erDefinition and/or at
 * least one diagram-* companion, so work with no ER/diagram runs exactly the base
 * dimensions.
 */

import type { LLMMessage, LLMProvider } from '../../../../shared/types.js';
import { getLogger } from '../../../../shared/logger.js';
import type { CodeReviewGrounding, CodeReviewSubject, DimensionFinding, DimensionResult } from '../../types.js';
import type { CompanionArtifactRef } from '../../../artifacts/companion/types.js';
import type { ErDefinition } from '../../../artifacts/companion/er.js';
import { diagramHandlerFor, listDiagramHandlers, type DiagramAdherenceHandler } from './registry.js';
// Importing the ER handler module registers it into the registry at load (S003).
import { ER_HANDLER_TYPE } from './handlers/er.js';

const log = getLogger('code-review:dimensions:diagram');
const DIMENSION = 'diagram' as const;

/** The diagram-carrying view of the approved body. */
function bodyOf(subject: CodeReviewSubject): {
	readonly erDefinition?: ErDefinition;
	readonly companions?: readonly CompanionArtifactRef[];
} {
	const body = (subject.approvedLld as { body?: unknown } | null)?.body;
	return (typeof body === 'object' && body !== null ? body : {}) as {
		readonly erDefinition?: ErDefinition;
		readonly companions?: readonly CompanionArtifactRef[];
	};
}

/** True when the approved body carries an erDefinition and/or >= 1 diagram-*
 *  companion — the inclusion gate mirroring hasFunctionalDefinition. */
export function hasDiagramReferences(subject: CodeReviewSubject): boolean {
	const body = bodyOf(subject);
	if (body.erDefinition !== undefined) return true;
	return (body.companions ?? []).some(c => c.kind === 'diagram-mermaid' || c.kind === 'diagram-html' || c.kind === 'ux-mock');
}

/** A display type for a companion no registered handler owns (for the observation). */
function unknownTypeOf(ref: CompanionArtifactRef): string {
	return ref.kind === 'ux-mock' ? 'ux' : ref.kind;
}

/**
 * The 'diagram' judge — a thin dispatcher (no inline type switch). For each diagram
 * companion, delegate to the handler whose `appliesTo` selects it; a companion no
 * handler owns yields a LOW observation. The ER handler also runs for an
 * erDefinition present without a companion ref. Serial; per-handler isolation.
 */
export async function judgeDiagram(
	subject:   CodeReviewSubject,
	grounding: CodeReviewGrounding,
	provider:  LLMProvider,
): Promise<DimensionResult> {
	const body = bodyOf(subject);
	const findings: DimensionFinding[] = [];
	const handlersToRun = new Set<DiagramAdherenceHandler>();
	const handlers = listDiagramHandlers();

	for (const ref of body.companions ?? []) {
		const owner = handlers.find(h => h.appliesTo(ref));
		if (owner !== undefined) {
			handlersToRun.add(owner);
		} else {
			findings.push({
				dimension: DIMENSION,
				severity:  'LOW',
				location:  ref.relPath,
				message:   `no registered diagram handler for companion type '${unknownTypeOf(ref)}' ('${ref.title}') — not judged in this Story`,
				confidence: 'observation',
			});
		}
	}

	// A body carrying an erDefinition (even with no companion ref) is validated by
	// the ER handler.
	if (body.erDefinition !== undefined) {
		const er = diagramHandlerFor(ER_HANDLER_TYPE);
		if (er !== undefined) handlersToRun.add(er);
	}

	// Serial dispatch; a handler that throws yields a LOW observation (isolation).
	for (const handler of handlersToRun) {
		try {
			findings.push(...await handler.judge(subject, grounding, provider));
		} catch (err) {
			const msg = err instanceof Error ? err.message : String(err);
			log.warn({ type: handler.type, err: msg }, 'diagram handler threw; recording a LOW observation');
			findings.push({
				dimension: DIMENSION,
				severity:  'LOW',
				location:  `diagram:${handler.type}`,
				message:   `diagram handler '${handler.type}' failed: ${msg}`,
				confidence: 'observation',
			});
		}
	}

	return { dimension: DIMENSION, findings };
}

/**
 * Build the controller-path 'diagram' prompt (MCP handler parity with the other
 * dimensions). Hands the controller the AUTHORED erDefinition + companion refs and
 * charges it to report ER-model adherence findings. The daemon runner path judges
 * this dimension deterministically via {@link judgeDiagram}; this prompt exists so
 * the controller path's prompts/schema stay in lockstep with expectedDimensions.
 */
export function buildDiagramPrompt(
	subject:   CodeReviewSubject,
	_grounding: CodeReviewGrounding,
	extraNote: string | undefined,
): LLMMessage[] {
	const body = bodyOf(subject);
	const system = [
		'You are reviewing an authored ER (entity-relationship) data model for ADHERENCE. The erDefinition JSON element is the SOURCE OF TRUTH — judge it, never a rendered diagram.',
		'Report a HIGH finding (confidence:"breach") for a malformed model, a relationship whose range names an undefined entity, or an ER that contradicts the functional requirements.',
		'If the ER model is sound, return an EMPTY findings array. Never manufacture findings.',
		extraNote ? `\nCorrection from a previous attempt:\n${extraNote}` : '',
	].filter(s => s.length > 0).join('\n');
	const user = [
		'## The authored ER data model + companion references',
		'```json',
		JSON.stringify({ erDefinition: body.erDefinition, companions: body.companions ?? [] }, null, 2),
		'```',
		'## Output',
		'Return { "findings": [ { "dimension": "diagram", "severity": "HIGH|MED|LOW", "location": "file:line", "message": "...", "confidence": "breach|observation" } ] }.',
	].join('\n');
	return [
		{ role: 'system', content: system },
		{ role: 'user',   content: user },
	];
}
