/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Procix Software India. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/**
 * sc3 (S002) — shared section-binding helpers the four renderers reuse when
 * driving `renderFromFormat`. Kept separate so a renderer only supplies its
 * type-specific bindings.
 */

import type { Citation } from '../../types.js';
import type { FunctionalDefinition } from '../functional-definition.js';
import { renderFunctionalRequirementsSection } from '../functional-definition.js';
import type { CompanionArtifactRef } from '../companion/types.js';

/**
 * S001's FR section content WITHOUT its own '## Functional requirements' heading
 * (the engine supplies the numbered heading). `[]` when the record is
 * absent/empty (the renderer then omits the section — absent-safe).
 */
export function frBodyLines(fd: FunctionalDefinition | undefined): string[] {
	const raw = renderFunctionalRequirementsSection(fd);
	if (raw.length === 0) return [];
	// raw[0] === '## Functional requirements', raw[1] === ''
	const body = raw.slice(2);
	while (body.length > 0 && body[body.length - 1] === '') body.pop();
	return body;
}

/**
 * sc4 (S003): the Diagrams extension-slot body — each companion rendered as a
 * LINK line (never the companion's content, k1/ac2). `[]` when there are no
 * companions (the renderer then omits the extension section — absent-safe/
 * forward-only, k6). A diagram-* companion is rendered; non-diagram companions
 * (e.g. S004 ux-mock) are left for their own slot.
 */
export function companionBodyLines(companions: readonly CompanionArtifactRef[] | undefined): string[] {
	if (companions === undefined || companions.length === 0) return [];
	const diagrams = companions.filter(c => c.kind === 'diagram-mermaid' || c.kind === 'diagram-html');
	if (diagrams.length === 0) return [];
	return diagrams.map(c => {
		const suffix = c.ofSectionId !== undefined && c.ofSectionId.length > 0 ? ` (§ ${c.ofSectionId})` : '';
		return `- [${c.title}](${c.relPath})${suffix}`;
	});
}

/** Citation list lines (no heading) for the numbered References section — mirrors
 *  the historical `renderCitationBlock` list item shape. */
export function citationBodyLines(citations: readonly Citation[]): string[] {
	return citations.map(c => {
		const quoted = c.quotedText === undefined ? '' : ` — "${c.quotedText.slice(0, 200)}"`;
		return `- **[[${c.id}]]** \`${c.kind}\` \`${c.ref}\`${quoted}`;
	});
}
