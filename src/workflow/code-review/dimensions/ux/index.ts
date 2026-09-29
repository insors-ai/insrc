/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Procix Software India. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/**
 * sc4 (S004) — the first-class 'ux' code-review dimension.
 *
 * `judgeUx` judges the built experience against the AUTHORED uxDefinition (an
 * Adaptive Cards card subset) + the referenced ux-mock companion, reporting
 * DimensionFinding{ dimension:'ux' }. It is a first-class dimension judge (modelled
 * on the functional-coverage dimension), NOT a diagram-registry handler:
 *
 *   1. It validates the authored uxDefinition JSON element (via validateUxDefinition
 *      — ajv against the vendored Adaptive Cards schema), NEVER by parsing a rendered
 *      mock (k2).
 *   2. It emits a HIGH 'breach' when the recorded adherence selection REQUIRES 'ux'
 *      but there is no uxDefinition and no ux-mock companion to judge against — a
 *      work item declared to have a user-facing experience that never captured it
 *      (ac2/ac3).
 *   3. It flags a referenced-but-absent ux-mock companion file (a doc claiming a UX
 *      mock it does not ship), and rejects an unknown recorded adherence member.
 *
 * Deterministic + provider-free: the findings fold through the SAME
 * computeReviewVerdict + codeReview.enforce gate as the base dimensions — the
 * verdict reducer is never forked (k4). `hasUxAcceptance` is the inclusion GATE
 * (mirrors hasFunctionalDefinition/hasDiagramReferences).
 */

import { existsSync } from 'node:fs';
import { isAbsolute, join } from 'node:path';

import type { LLMMessage, LLMProvider } from '../../../../shared/types.js';
import type { CodeReviewGrounding, CodeReviewSubject, DimensionFinding, DimensionResult } from '../../types.js';
import type { CompanionArtifactRef } from '../../../artifacts/companion/types.js';
import type { UxDefinition } from '../../../artifacts/companion/ux.js';
import { validateUxDefinition } from '../../../artifacts/companion/ux.js';
import type { AdherenceSelection } from '../../../artifacts/companion/adherence.js';
import { unknownAdherenceMembers } from '../../../artifacts/companion/adherence.js';
import type { FunctionalDefinition } from '../../../artifacts/functional-definition.js';

const DIMENSION = 'ux' as const;

/** The UX-carrying view of the approved body (mirrors the diagram dimension's
 *  bodyOf; the code-review subject carries the approved LLD). */
function bodyOf(subject: CodeReviewSubject): {
	readonly uxDefinition?: UxDefinition;
	readonly adherence?: AdherenceSelection;
	readonly companions?: readonly CompanionArtifactRef[];
	readonly functionalDefinition?: FunctionalDefinition;
} {
	const body = (subject.approvedLld as { body?: unknown } | null)?.body;
	return (typeof body === 'object' && body !== null ? body : {}) as {
		readonly uxDefinition?: UxDefinition;
		readonly adherence?: AdherenceSelection;
		readonly companions?: readonly CompanionArtifactRef[];
		readonly functionalDefinition?: FunctionalDefinition;
	};
}

/** The recorded adherence selection on the subject's approved body ([] when none). */
export function adherenceSelectionOf(subject: CodeReviewSubject): readonly string[] {
	return bodyOf(subject).adherence?.dimensions ?? [];
}

/** The ux-mock companions referenced by the approved body. */
function uxMockRefs(subject: CodeReviewSubject): readonly CompanionArtifactRef[] {
	return (bodyOf(subject).companions ?? []).filter(c => c.kind === 'ux-mock');
}

/** True when the subject requires a UX check: the recorded adherence selection
 *  includes 'ux', OR the body carries a uxDefinition, OR a ux-mock companion is
 *  present — the inclusion gate mirroring hasFunctionalDefinition/hasDiagramReferences. */
export function hasUxAcceptance(subject: CodeReviewSubject): boolean {
	const body = bodyOf(subject);
	if (body.uxDefinition !== undefined) return true;
	if ((body.adherence?.dimensions ?? []).includes('ux')) return true;
	return (body.companions ?? []).some(c => c.kind === 'ux-mock');
}

/** A HIGH 'breach' ux finding. */
function breach(location: string, message: string): DimensionFinding {
	return { dimension: DIMENSION, severity: 'HIGH', location, message, confidence: 'breach' };
}

/**
 * The 'ux' judge — deterministic + provider-free (it ignores the provider, like the
 * ER handler). Validates the authored uxDefinition JSON element, emits a HIGH when
 * UX acceptance is required but no UX design/mock evidence is present, flags a
 * referenced-but-absent ux-mock file, and rejects an unknown recorded adherence
 * member. The findings ride the un-forked verdict reducer (k4).
 */
// eslint-disable-next-line @typescript-eslint/require-await
export async function judgeUx(
	subject:    CodeReviewSubject,
	_grounding: CodeReviewGrounding,
	_provider:  LLMProvider,
): Promise<DimensionResult> {
	const body = bodyOf(subject);
	const findings: DimensionFinding[] = [];

	// (0) Reject an unknown recorded adherence member (never silently accepted).
	const unknown = unknownAdherenceMembers(body.adherence?.dimensions ?? []);
	for (const u of unknown) {
		findings.push(breach('adherence:dimensions', `unknown adherence dimension '${u}' — not one of the selectable AdherenceDimension set`));
	}

	const hasUxDef = body.uxDefinition !== undefined;
	const mocks = uxMockRefs(subject);
	const requiredBySelection = (body.adherence?.dimensions ?? []).includes('ux');

	// (1) UX required by the recorded selection but nothing to judge against.
	if (requiredBySelection && !hasUxDef && mocks.length === 0) {
		findings.push(breach('uxAcceptance', 'UX acceptance required (adherence selection includes \'ux\') but no uxDefinition and no ux-mock companion is present to judge against'));
	}

	// (2) Validate the authored uxDefinition JSON element (never the rendered mock).
	if (hasUxDef) {
		findings.push(...validateUxDefinition(body.uxDefinition, body.functionalDefinition));
	}

	// (3) A referenced-but-absent ux-mock companion file — a doc claiming a UX mock
	//     it does not ship. Checks existence only (not the file's content).
	for (const ref of mocks) {
		const abs = isAbsolute(ref.relPath) ? ref.relPath : join(subject.repoPath, ref.relPath);
		if (!existsSync(abs)) {
			findings.push(breach(
				ref.relPath,
				`referenced UX mock '${ref.title}' is missing at ${ref.relPath} — the document references a UX mock it does not ship`,
			));
		}
	}

	return { dimension: DIMENSION, findings };
}

/**
 * Build the controller-path 'ux' prompt (MCP handler parity with the other
 * dimensions). Hands the controller the authored uxDefinition + companion refs +
 * recorded adherence and charges it to report UX-adherence findings. The daemon
 * runner path judges this dimension deterministically via {@link judgeUx}; this
 * prompt exists so the controller path's prompts/schema stay in lockstep with
 * expectedDimensions.
 */
export function buildUxPrompt(
	subject:    CodeReviewSubject,
	_grounding: CodeReviewGrounding,
	extraNote:  string | undefined,
): LLMMessage[] {
	const body = bodyOf(subject);
	const system = [
		'You are reviewing an authored UX design (an Adaptive Cards card subset) for ADHERENCE. The uxDefinition JSON element is the SOURCE OF TRUTH — judge it, never a rendered mock.',
		'Report a HIGH finding (confidence:"breach") when UX acceptance is required but no UX design/mock is present, when the uxDefinition is malformed, or when a referenced ux-mock companion is missing.',
		'If the UX design is sound, return an EMPTY findings array. Never manufacture findings.',
		extraNote ? `\nCorrection from a previous attempt:\n${extraNote}` : '',
	].filter(s => s.length > 0).join('\n');
	const user = [
		'## The authored UX design + companion references + recorded adherence',
		'```json',
		JSON.stringify({ uxDefinition: body.uxDefinition, companions: body.companions ?? [], adherence: body.adherence }, null, 2),
		'```',
		'## Output',
		'Return { "findings": [ { "dimension": "ux", "severity": "HIGH|MED|LOW", "location": "file:line", "message": "...", "confidence": "breach|observation" } ] }.',
	].join('\n');
	return [
		{ role: 'system', content: system },
		{ role: 'user',   content: user },
	];
}
