/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Procix Software India. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/**
 * sc4 (S003) — the 'er' diagram adherence handler.
 *
 * Validates the AUTHORED erDefinition JSON element (via validateErDefinition — ajv
 * metamodel + referential integrity + FR-consistency), NEVER by parsing the
 * rendered companion (stakeholder direction; k2). It also flags a
 * referenced-but-absent companion file (a doc claiming an ER it does not ship).
 * Deterministic: it ignores the provider. Registered at module load as the ONLY
 * S003 member of the per-type registry.
 */

import { existsSync } from 'node:fs';
import { isAbsolute, join } from 'node:path';

import type { LLMProvider } from '../../../../../shared/types.js';
import type { CodeReviewGrounding, CodeReviewSubject, DimensionFinding } from '../../../types.js';
import type { CompanionArtifactRef } from '../../../../artifacts/companion/types.js';
import type { ErDefinition } from '../../../../artifacts/companion/er.js';
import { validateErDefinition } from '../../../../artifacts/companion/er.js';
import type { FunctionalDefinition } from '../../../../artifacts/functional-definition.js';
import { registerDiagramHandler, type DiagramAdherenceHandler } from '../registry.js';

/** The diagram type this handler owns. */
export const ER_HANDLER_TYPE = 'er';

/** Read the approved body carried on the subject (the code-review subject carries
 *  the approved LLD; the erDefinition/companions/functionalDefinition live on its
 *  body). Defensive casts mirror functional-coverage.ts. */
function subjectBody(subject: CodeReviewSubject): {
	readonly erDefinition?: ErDefinition;
	readonly companions?: readonly CompanionArtifactRef[];
	readonly functionalDefinition?: FunctionalDefinition;
} {
	const body = (subject.approvedLld as { body?: unknown } | null)?.body;
	return (typeof body === 'object' && body !== null ? body : {}) as {
		readonly erDefinition?: ErDefinition;
		readonly companions?: readonly CompanionArtifactRef[];
		readonly functionalDefinition?: FunctionalDefinition;
	};
}

/** Whether a companion ref is an ER diagram this handler owns. */
export function isErCompanion(ref: CompanionArtifactRef): boolean {
	return ref.kind === 'diagram-mermaid' || ref.kind === 'diagram-html';
}

/** The 'er' handler: validate the JSON element + flag an absent companion file. */
export const erDiagramHandler: DiagramAdherenceHandler = {
	type: ER_HANDLER_TYPE,
	appliesTo: isErCompanion,
	// eslint-disable-next-line @typescript-eslint/require-await
	async judge(subject: CodeReviewSubject, _grounding: CodeReviewGrounding, _provider: LLMProvider): Promise<readonly DimensionFinding[]> {
		const body = subjectBody(subject);
		const findings: DimensionFinding[] = [];

		// (1) Validate the authored erDefinition JSON element (never the rendered doc).
		if (body.erDefinition !== undefined) {
			findings.push(...validateErDefinition(body.erDefinition, body.functionalDefinition));
		}

		// (2) A referenced-but-absent companion file — a doc claiming an ER it does
		//     not ship. Checks existence only (not the file's content).
		for (const ref of body.companions ?? []) {
			if (!isErCompanion(ref)) continue;
			const abs = isAbsolute(ref.relPath) ? ref.relPath : join(subject.repoPath, ref.relPath);
			if (!existsSync(abs)) {
				findings.push({
					dimension: 'diagram',
					severity:  'HIGH',
					location:  ref.relPath,
					message:   `referenced ER companion '${ref.title}' is missing at ${ref.relPath} — the document references an ER diagram it does not ship`,
					confidence: 'breach',
				});
			}
		}

		return findings;
	},
};

// Register ONLY the 'er' handler at module load (S003). Peers (S004 UX, deferred
// sequence/component) register themselves the same way without editing this file.
registerDiagramHandler(erDiagramHandler);
