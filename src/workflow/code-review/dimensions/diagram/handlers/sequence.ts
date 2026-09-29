/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Procix Software India. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/**
 * sc3 (S003, artifact-companion-wiring) — the 'sequence' diagram adherence handler.
 *
 * Validates the AUTHORED sequenceDefinition JSON element (via
 * validateSequenceDefinition — light structural + referential integrity), NEVER by
 * parsing the rendered companion (stakeholder direction; k2). Deterministic: it
 * ignores the provider. Registered at module load as a PEER of the 'er' handler
 * WITHOUT editing handlers/er.ts (the registry's reserved extension point).
 *
 * Reached by the 'diagram' dimension via BODY-KEYED dispatch (the dimension runs it
 * when `body.sequenceDefinition` is present), not via companion-ref routing:
 * `appliesTo` returns false because a sequence companion ref shares the
 * `diagram-mermaid` kind with ER/component refs and the ref alone cannot
 * disambiguate them (the body element does). This mirrors how the ER handler is
 * also reached by a body-key branch for a companion-less erDefinition.
 */

import type { LLMProvider } from '../../../../../shared/types.js';
import type { CodeReviewGrounding, CodeReviewSubject, DimensionFinding } from '../../../types.js';
import type { CompanionArtifactRef } from '../../../../artifacts/companion/types.js';
import type { SequenceDefinition } from '../../../../artifacts/companion/sequence.js';
import { validateSequenceDefinition } from '../../../../artifacts/companion/sequence.js';
import { registerDiagramHandler, type DiagramAdherenceHandler } from '../registry.js';

/** The diagram type this handler owns. */
export const SEQUENCE_HANDLER_TYPE = 'sequence';

/** Read the approved body carried on the subject (the code-review subject carries
 *  the approved LLD; the sequenceDefinition lives on its body). Defensive casts
 *  mirror handlers/er.ts. */
function subjectBody(subject: CodeReviewSubject): { readonly sequenceDefinition?: SequenceDefinition } {
	const body = (subject.approvedLld as { body?: unknown } | null)?.body;
	return (typeof body === 'object' && body !== null ? body : {}) as { readonly sequenceDefinition?: SequenceDefinition };
}

/** The 'sequence' handler: validate the authored sequenceDefinition JSON element.
 *  Reached by the dimension's body-keyed branch; owns no companion ref kind
 *  (`appliesTo` is always false — see the module header). */
export const sequenceDiagramHandler: DiagramAdherenceHandler = {
	type: SEQUENCE_HANDLER_TYPE,
	appliesTo(_ref: CompanionArtifactRef): boolean {
		return false;
	},
	// eslint-disable-next-line @typescript-eslint/require-await
	async judge(subject: CodeReviewSubject, _grounding: CodeReviewGrounding, _provider: LLMProvider): Promise<readonly DimensionFinding[]> {
		const body = subjectBody(subject);
		if (body.sequenceDefinition === undefined) return [];
		return validateSequenceDefinition(body.sequenceDefinition);
	},
};

// Register the 'sequence' handler at module load as a peer of 'er' (S003).
registerDiagramHandler(sequenceDiagramHandler);
