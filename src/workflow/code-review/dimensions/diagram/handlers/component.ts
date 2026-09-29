/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Procix Software India. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/**
 * sc3 (S003, artifact-companion-wiring) — the 'component' diagram adherence handler.
 *
 * Validates the AUTHORED componentDependencyDefinition JSON element (via
 * validateComponentDependencyDefinition — light structural + referential
 * integrity), NEVER by parsing the rendered companion (stakeholder direction; k2).
 * Deterministic: it ignores the provider. Registered at module load as a PEER of
 * the 'er' handler WITHOUT editing handlers/er.ts (the registry's reserved
 * extension point).
 *
 * Reached by the 'diagram' dimension via BODY-KEYED dispatch (the dimension runs it
 * when `body.componentDependencyDefinition` is present), not via companion-ref
 * routing: `appliesTo` returns false because a component companion ref shares the
 * `diagram-mermaid` kind with ER/sequence refs and the ref alone cannot
 * disambiguate them (the body element does). Mirrors handlers/sequence.ts.
 */

import type { LLMProvider } from '../../../../../shared/types.js';
import type { CodeReviewGrounding, CodeReviewSubject, DimensionFinding } from '../../../types.js';
import type { CompanionArtifactRef } from '../../../../artifacts/companion/types.js';
import type { ComponentDependencyDefinition } from '../../../../artifacts/companion/component.js';
import { validateComponentDependencyDefinition } from '../../../../artifacts/companion/component.js';
import { registerDiagramHandler, type DiagramAdherenceHandler } from '../registry.js';

/** The diagram type this handler owns. */
export const COMPONENT_HANDLER_TYPE = 'component';

/** Read the approved body carried on the subject (the componentDependencyDefinition
 *  lives on its body). Defensive casts mirror handlers/er.ts. */
function subjectBody(subject: CodeReviewSubject): { readonly componentDependencyDefinition?: ComponentDependencyDefinition } {
	const body = (subject.approvedLld as { body?: unknown } | null)?.body;
	return (typeof body === 'object' && body !== null ? body : {}) as { readonly componentDependencyDefinition?: ComponentDependencyDefinition };
}

/** The 'component' handler: validate the authored componentDependencyDefinition JSON
 *  element. Reached by the dimension's body-keyed branch; owns no companion ref
 *  kind (`appliesTo` is always false — see the module header). */
export const componentDiagramHandler: DiagramAdherenceHandler = {
	type: COMPONENT_HANDLER_TYPE,
	appliesTo(_ref: CompanionArtifactRef): boolean {
		return false;
	},
	// eslint-disable-next-line @typescript-eslint/require-await
	async judge(subject: CodeReviewSubject, _grounding: CodeReviewGrounding, _provider: LLMProvider): Promise<readonly DimensionFinding[]> {
		const body = subjectBody(subject);
		if (body.componentDependencyDefinition === undefined) return [];
		return validateComponentDependencyDefinition(body.componentDependencyDefinition);
	},
};

// Register the 'component' handler at module load as a peer of 'er' (S003).
registerDiagramHandler(componentDiagramHandler);
